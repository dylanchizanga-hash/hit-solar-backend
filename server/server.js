const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();

// Allow all origins (simple + works for Firebase hosting)
app.use(cors());
app.use(express.json());

// --- Load CSV once on startup ---
const CSV_PATH = path.join(__dirname, "cleaned_solar_data.csv");

let rows = [];
let pointer = 0;

// Helpers
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Zimbabwe time (Africa/Harare is UTC+2, no DST)
function getZimbabweNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const zimMs = utcMs + 2 * 60 * 60000;
  return new Date(zimMs);
}

function getZimHHMM() {
  const d = getZimbabweNow();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// Detect keys from your CSV sample row
function detectKeys(sampleRow) {
  const keys = Object.keys(sampleRow || {});
  const timeKey =
    keys.find((k) => k.toUpperCase().includes("TIME")) ||
    keys.find((k) => k.toUpperCase().includes("DATE")) ||
    null;

  // Your CSV has DC_POWER, AC_POWER, IRRADIATION, etc.
  const powerKey =
    keys.find((k) => k.toUpperCase() === "DC_POWER") ||
    keys.find((k) => k.toUpperCase() === "AC_POWER") ||
    keys.find((k) => k.toUpperCase().includes("POWER")) ||
    null;

  const irradiationKey =
    keys.find((k) => k.toUpperCase().includes("IRR")) || null;

  const ambientTempKey =
    keys.find((k) => k.toUpperCase().includes("AMBIENT")) || null;

  const moduleTempKey =
    keys.find((k) => k.toUpperCase().includes("MODULE")) || null;

  const dailyYieldKey =
    keys.find((k) => k.toUpperCase().includes("DAILY_YIELD")) || null;

  return {
    timeKey,
    powerKey,
    irradiationKey,
    ambientTempKey,
    moduleTempKey,
    dailyYieldKey,
  };
}

let detected = {
  timeKey: null,
  powerKey: null,
  irradiationKey: null,
  ambientTempKey: null,
  moduleTempKey: null,
  dailyYieldKey: null,
};

// Convert a row from CSV into dashboard-friendly format
function convertRow(r) {
  // time in your CSV looks like "2020-05-15 00:00:00"
  // We'll convert it to HH:MM
  let timeHHMM = "00:00";
  if (detected.timeKey && r[detected.timeKey]) {
    const s = String(r[detected.timeKey]);
    // try split by space -> take time -> HH:MM
    const parts = s.split(" ");
    if (parts.length >= 2) {
      timeHHMM = parts[1].slice(0, 5);
    } else {
      // if already HH:MM
      timeHHMM = s.slice(0, 5);
    }
  }

  // solar in kW: CSV DC_POWER seems in Watts? in your sample it's "0.0"
  // Many solar datasets store power in W. We'll safely convert W->kW if large.
  const rawPower = detected.powerKey ? parseNumber(r[detected.powerKey], 0) : 0;

  // Heuristic: if > 50, likely watts -> convert to kW
  const solarKW = rawPower > 50 ? rawPower / 1000 : rawPower;

  const irr = detected.irradiationKey
    ? parseNumber(r[detected.irradiationKey], 0)
    : 0;

  // Battery is not in your CSV, so we create a stable derived % from irradiance + solar
  // This keeps your UI alive without hardcoding random numbers.
  const battery =
    Math.max(20, Math.min(100, 40 + solarKW * 5 + irr * 10)); // simple derived %

  // Inverters: split solar into 3 inverters (realistic)
  const inv1 = solarKW * 0.4;
  const inv2 = solarKW * 0.35;
  const inv3 = solarKW * 0.25;

  return {
    time: timeHHMM,
    solar: Number(solarKW.toFixed(3)),
    battery: Number(battery.toFixed(0)),
    inv1: Number(inv1.toFixed(3)),
    inv2: Number(inv2.toFixed(3)),
    inv3: Number(inv3.toFixed(3)),
    irradiance: Number(irr.toFixed(3)),
    ambientTemp: detected.ambientTempKey ? parseNumber(r[detected.ambientTempKey], 0) : null,
    moduleTemp: detected.moduleTempKey ? parseNumber(r[detected.moduleTempKey], 0) : null,
    dailyYield: detected.dailyYieldKey ? parseNumber(r[detected.dailyYieldKey], 0) : null
  };
}

// Start pointer aligned to current Zimbabwe time HH:MM if possible
function initPointerToZimbabweTime() {
  const target = getZimHHMM();

  // find nearest row with that HH:MM
  const idx = rows.findIndex((r) => {
    const converted = convertRow(r);
    return converted.time === target;
  });

  if (idx >= 0) pointer = idx;
  else pointer = 0;

  console.log("🕒 Zimbabwe now:", target);
  console.log("📍 Stream pointer start:", pointer);
}

// Load CSV
function loadCSV() {
  return new Promise((resolve, reject) => {
    const temp = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", (data) => temp.push(data))
      .on("end", () => {
        rows = temp;
        detected = detectKeys(rows[0] || {});
        console.log(`✅ CSV Loaded: ${rows.length} rows`);
        console.log("🔎 Detected keys:", detected);
        initPointerToZimbabweTime();
        resolve();
      })
      .on("error", reject);
  });
}

// --- API: Live window data ---
app.get("/api/power", (req, res) => {
  // window size: last 12 points
  const WINDOW = 12;

  if (!rows.length) {
    return res.json({ data: [], meta: { error: "CSV not loaded" } });
  }

  // advance pointer by 1 each request to simulate streaming
  pointer = (pointer + 1) % rows.length;

  // build window ending at pointer
  const start = Math.max(0, pointer - WINDOW + 1);
  const slice = rows.slice(start, pointer + 1).map(convertRow);

  // Meta summary (used by your App.jsx)
  const nowHHMM = getZimHHMM();

  // energyTodayKWh: use dailyYield if available, otherwise approximate from slice
  let energyTodayKWh = 0;
  const lastRow = slice[slice.length - 1];
  if (lastRow?.dailyYield != null) {
    // daily yield might be in kWh already
    energyTodayKWh = parseNumber(lastRow.dailyYield, 0);
  } else {
    // approximate energy: sum(kW) * (5min/60) if dataset 5-min intervals
    // Many solar datasets are 15-min; we use a conservative 5-min default.
    const intervalHours = 5 / 60;
    energyTodayKWh = slice.reduce((s, r) => s + parseNumber(r.solar, 0) * intervalHours, 0);
  }

  const peakTodayKW = slice.reduce((m, r) => Math.max(m, parseNumber(r.solar, 0)), 0);
  const avgIrrToday = slice.reduce((s, r) => s + parseNumber(r.irradiance, 0), 0) / (slice.length || 1);

  // a simple “avg daily kWh” for forecasting:
  // use energyTodayKWh scaled by daytime progress (if daytime)
  const z = getZimbabweNow();
  const hour = z.getHours();
  const isDay = hour >= 6 && hour <= 18;
  const progress = isDay ? Math.max(0.1, (hour - 6) / 12) : 0.1;
  const avgDailyKWh = energyTodayKWh / progress;

  const capacityKW = Math.max(1, peakTodayKW * 1.2); // conservative capacity estimation

  res.json({
    data: slice,
    meta: {
      nowHHMM,
      energyTodayKWh: Number(energyTodayKWh.toFixed(2)),
      peakTodayKW: Number(peakTodayKW.toFixed(2)),
      avgIrrToday: Number(avgIrrToday.toFixed(3)),
      avgDailyKWh: Number(avgDailyKWh.toFixed(2)),
      predictedNext30DaysKWh: Number((avgDailyKWh * 30).toFixed(0)),
      capacityKW: Number(capacityKW.toFixed(2)),
      derivedFaultsToday: 0
    },
  });
});

// Health check (Render uses this sometimes)
app.get("/", (req, res) => res.send("HIT Solar Backend is running ✅"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
