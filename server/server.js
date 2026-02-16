const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// =====================
// CSV STATE
// =====================
let rows = [];
let pointer = 0;

let detectedTimeKey = null;
let detectedACKey = null;
let detectedDCKey = null;
let detectedIrrKey = null;
let detectedDailyYieldKey = null;

let acScale = 1; // divide by 1000 if AC_POWER is in W
let dcScale = 1;

// Precomputed "today energy" for each HH:MM across the dataset
// (so Energy Today is realistic and not tiny)
let dayStatsByTime = new Map();

function getNowHarareHHMM() {
  const s = new Date().toLocaleString("en-GB", { timeZone: "Africa/Harare" });
  const timePart = s.split(",")[1]?.trim() || "00:00:00";
  return timePart.slice(0, 5);
}

function hhmmFromDateTime(dtStr) {
  if (!dtStr) return "00:00";
  const parts = String(dtStr).split(" ");
  if (parts.length < 2) return "00:00";
  return String(parts[1]).slice(0, 5);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pickPointerNearHHMM(targetHHMM) {
  const [h, m] = String(targetHHMM || "00:00").split(":").map(Number);
  const targetMin = h * 60 + m;

  let bestIdx = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i].timeHHMM || "00:00";
    const [hh, mm] = String(t).split(":").map(Number);
    const mins = hh * 60 + mm;
    const diff = Math.abs(mins - targetMin);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function toDashboardRow(r) {
  const acRaw = detectedACKey ? Number(r[detectedACKey] || 0) : 0;
  const solarKW = (acRaw / acScale) || 0; // ✅ inverter output (AC) in kW

  // Inverter split is just distribution; total stays correct
  const inv1 = solarKW * 0.4;
  const inv2 = solarKW * 0.35;
  const inv3 = solarKW * 0.25;

  const irr = detectedIrrKey ? Number(r[detectedIrrKey] || 0) : 0;

  // Battery not in CSV → simulate from irradiance (stable + realistic)
  const noise = Math.random() * 1.5 - 0.75;
  const battery = clamp(55 + irr * 35 + noise, 20, 100);

  return {
    time: r.timeHHMM || "00:00",
    solar: Number(solarKW.toFixed(3)),
    inv1: Number(inv1.toFixed(3)),
    inv2: Number(inv2.toFixed(3)),
    inv3: Number(inv3.toFixed(3)),
    battery: Math.round(battery),
    irradiance: Number(irr.toFixed(3)),
    __dailyYield: detectedDailyYieldKey ? Number(r[detectedDailyYieldKey] || 0) : 0,
  };
}

// Build a map: HH:MM -> typical "energy so far today" using DAILY_YIELD curve
function buildDayStats() {
  dayStatsByTime = new Map();
  if (!detectedDailyYieldKey) return;

  // Group by DATE (from DATE_TIME)
  const byDate = new Map();
  for (const r of rows) {
    const dt = r[detectedTimeKey];
    if (!dt) continue;
    const date = String(dt).split(" ")[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(r);
  }

  // For each date, compute yield-from-midnight curve by HH:MM
  // Then average across days for each HH:MM
  const accum = new Map(); // HH:MM -> {sum, count}
  for (const [, dayRows] of byDate.entries()) {
    // sort in time order
    dayRows.sort((a, b) => String(a.timeHHMM).localeCompare(String(b.timeHHMM)));

    const base = Number(dayRows[0][detectedDailyYieldKey] || 0);
    for (const r of dayRows) {
      const t = r.timeHHMM;
      const y = Number(r[detectedDailyYieldKey] || 0);
      const soFar = Math.max(0, y - base);

      if (!accum.has(t)) accum.set(t, { sum: 0, count: 0 });
      accum.get(t).sum += soFar;
      accum.get(t).count += 1;
    }
  }

  for (const [t, v] of accum.entries()) {
    dayStatsByTime.set(t, v.count ? v.sum / v.count : 0);
  }
}

function buildMeta(windowRows) {
  const nowHHMM = getNowHarareHHMM();

  // ✅ REAL energy today from FULL CSV curve (not just last 12 points)
  const energyTodayKWh = dayStatsByTime.has(nowHHMM)
    ? dayStatsByTime.get(nowHHMM)
    : 0;

  const peakTodayKW = Math.max(...windowRows.map((d) => Number(d.solar || 0)), 0);
  const avgIrrToday =
    windowRows.reduce((s, d) => s + Number(d.irradiance || 0), 0) /
    Math.max(1, windowRows.length);

  return {
    nowHHMM,
    source: "render",
    streamTick: pointer,
    powerUnit: "kW (AC inverter output)",
    energyTodayKWh: Number(energyTodayKWh.toFixed(3)),
    peakTodayKW: Number(peakTodayKW.toFixed(3)),
    avgIrrToday: Number(avgIrrToday.toFixed(3)),
    detectedKeys: {
      time: detectedTimeKey,
      ac: detectedACKey,
      dc: detectedDCKey,
      irr: detectedIrrKey,
      dailyYield: detectedDailyYieldKey,
    },
  };
}

function findCSVPath() {
  const candidates = [
    path.join(__dirname, "cleaned_solar_data.csv"),
    path.join(process.cwd(), "cleaned_solar_data.csv"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadCSV() {
  return new Promise((resolve, reject) => {
    const csvPath = findCSVPath();
    if (!csvPath) {
      return reject(
        new Error("CSV file not found. Put cleaned_solar_data.csv in /server/")
      );
    }

    const temp = [];
    let maxAC = 0;
    let maxDC = 0;

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        if (!detectedTimeKey) {
          detectedTimeKey = row.DATE_TIME ? "DATE_TIME" : null;
          detectedACKey = row.AC_POWER ? "AC_POWER" : null;
          detectedDCKey = row.DC_POWER ? "DC_POWER" : null;
          detectedIrrKey = row.IRRADIATION ? "IRRADIATION" : null;
          detectedDailyYieldKey = row.DAILY_YIELD ? "DAILY_YIELD" : null;
        }

        const timeHHMM = detectedTimeKey ? hhmmFromDateTime(row[detectedTimeKey]) : "00:00";
        const ac = detectedACKey ? Number(row[detectedACKey] || 0) : 0;
        const dc = detectedDCKey ? Number(row[detectedDCKey] || 0) : 0;

        if (ac > maxAC) maxAC = ac;
        if (dc > maxDC) maxDC = dc;

        temp.push({ ...row, timeHHMM });
      })
      .on("end", () => {
        rows = temp;

        // If it looks like watts, convert to kW
        acScale = maxAC > 2000 ? 1000 : 1;
        dcScale = maxDC > 2000 ? 1000 : 1;

        // Start stream near current Harare time
        pointer = pickPointerNearHHMM(getNowHarareHHMM());

        // Build full-day energy curve
        buildDayStats();

        console.log(`✅ CSV Loaded: ${rows.length} rows`);
        console.log(`✅ Keys: time=${detectedTimeKey}, AC=${detectedACKey}, IRR=${detectedIrrKey}, YIELD=${detectedDailyYieldKey}`);
        console.log(`✅ AC scale divide by ${acScale} | maxAC=${maxAC}`);
        console.log(`📍 Start pointer: ${pointer} | First time: ${rows[pointer]?.timeHHMM}`);

        resolve();
      })
      .on("error", reject);
  });
}

// =====================
// ROUTES
// =====================
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Backend alive", timeUTC: new Date().toISOString() });
});

app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    rows: rows.length,
    pointer,
    detectedTimeKey,
    detectedACKey,
    detectedIrrKey,
    detectedDailyYieldKey,
    acScale,
    sampleRow0: rows[0] || null,
  });
});

app.get("/api/power", (req, res) => {
  if (!rows.length) return res.status(500).json({ error: "CSV not loaded yet" });

  pointer = (pointer + 1) % rows.length;

  const WINDOW = 12;
  const start = Math.max(0, pointer - (WINDOW - 1));
  const slice = rows.slice(start, pointer + 1);

  const data = slice.map(toDashboardRow);
  const meta = buildMeta(data);

  // remove internal
  const cleaned = data.map(({ __dailyYield, ...rest }) => rest);

  res.json({ data: cleaned, meta });
});

// =====================
loadCSV()
  .then(() => app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`)))
  .catch((err) => {
    console.error("❌ Failed to load CSV:", err.message);
    process.exit(1);
  });