const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --------------------
// CSV LOADING
// --------------------
let rows = [];
let pointer = 0;

// detected keys
let detectedTimeKey = null;
let detectedACKey = null;
let detectedDCKey = null;
let detectedIrrKey = null;
let detectedDailyYieldKey = null;

// scaling
let acScale = 1;
let dcScale = 1;

function hhmmFromDateTime(dtStr) {
  if (!dtStr) return "00:00";
  const parts = String(dtStr).split(" ");
  if (parts.length < 2) return "00:00";
  return String(parts[1]).slice(0, 5);
}

function getNowHarareHHMM() {
  const s = new Date().toLocaleString("en-GB", { timeZone: "Africa/Harare" });
  const timePart = s.split(",")[1]?.trim() || "00:00:00";
  return timePart.slice(0, 5);
}

function setPointerNearNow() {
  const nowHHMM = getNowHarareHHMM();
  const [h, m] = nowHHMM.split(":").map(Number);
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

  pointer = bestIdx;
}

function toDashboardRow(r) {
  const acRaw = detectedACKey ? Number(r[detectedACKey] || 0) : 0;
  const solarKW = (acRaw / acScale) || 0; // ✅ inverter output in kW

  const inv1 = solarKW * 0.40;
  const inv2 = solarKW * 0.35;
  const inv3 = solarKW * 0.25;

  const irr = detectedIrrKey ? Number(r[detectedIrrKey] || 0) : 0;

  // simulated battery (CSV typically has no battery column)
  const noise = Math.random() * 4 - 2;
  const battery = Math.max(20, Math.min(100, 55 + irr * 35 + noise));

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

function buildMeta(windowRows) {
  const nowHHMM = getNowHarareHHMM();

  let energyTodayKWh = 0;
  if (detectedDailyYieldKey && windowRows.length) {
    const first = Number(windowRows[0].__dailyYield || 0);
    const last = Number(windowRows[windowRows.length - 1].__dailyYield || 0);
    energyTodayKWh = Math.max(0, last - first);
  } else {
    // fallback: integrate solar assuming each row ~2 minutes
    energyTodayKWh = windowRows.reduce((s, d) => s + (Number(d.solar || 0) * (2 / 60)), 0);
  }

  const peakTodayKW = Math.max(...windowRows.map((d) => Number(d.solar || 0)), 0);
  const avgIrrToday =
    windowRows.reduce((s, d) => s + Number(d.irradiance || 0), 0) /
    Math.max(1, windowRows.length);

  return {
    nowHHMM,
    source: "render",
    streamTick: pointer,
    powerUnit: "kW AC",
    energyTodayKWh: Number(energyTodayKWh.toFixed(3)),
    peakTodayKW: Number(peakTodayKW.toFixed(3)),
    avgIrrToday: Number(avgIrrToday.toFixed(3)),
  };
}

function findCSVPath() {
  const candidates = [
    path.join(__dirname, "cleaned_solar_data.csv"),
    path.join(__dirname, "server", "cleaned_solar_data.csv"),
    path.join(process.cwd(), "cleaned_solar_data.csv"),
    path.join(process.cwd(), "server", "cleaned_solar_data.csv"),
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
        new Error("CSV file not found. Put cleaned_solar_data.csv in repo root or /server/")
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

        // if it looks like watts, convert to kW
        acScale = maxAC > 2000 ? 1000 : 1;
        dcScale = maxDC > 2000 ? 1000 : 1;

        setPointerNearNow();

        console.log(`✅ CSV Loaded: ${rows.length} rows`);
        console.log(
          `✅ Keys: time=${detectedTimeKey}, AC=${detectedACKey}, DC=${detectedDCKey}, IRR=${detectedIrrKey}, YIELD=${detectedDailyYieldKey}`
        );
        console.log(`✅ AC scale divide by ${acScale} | maxAC=${maxAC}`);
        console.log(`📍 Start pointer: ${pointer} | First time: ${rows[pointer]?.timeHHMM}`);

        resolve();
      })
      .on("error", reject);
  });
}

// --------------------
// ROUTES
// --------------------
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
    detectedDCKey,
    detectedIrrKey,
    detectedDailyYieldKey,
    acScale,
    dcScale,
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

  // remove internal field before sending
  const cleaned = data.map(({ __dailyYield, ...rest }) => rest);

  res.json({ data: cleaned, meta });
});

// --------------------
loadCSV()
  .then(() => app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`)))
  .catch((err) => {
    console.error("❌ Failed to load CSV:", err.message);
    process.exit(1);
  });