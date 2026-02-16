const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CSV_PATH = path.join(__dirname, "..", "server", "cleaned_solar_data.csv");
const SITE_ID = "hit";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",").map((s) => s.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());
    if (parts.length !== header.length) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = parts[c];
    rows.push(obj);
  }
  return rows;
}

function parseDate(s) {
  const [d, t] = String(s).split(" ");
  if (!d || !t) return null;
  const [Y, M, D] = d.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map(Number);
  if (![Y, M, D, hh, mm].every(Number.isFinite)) return null;
  return new Date(Y, (M || 1) - 1, D || 1, hh || 0, mm || 0, ss || 0);
}

function dayKeyFromDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log("❌ CSV not found at:", CSV_PATH);
    process.exit(1);
  }

  const rows = parseCSV(CSV_PATH);
  console.log("✅ CSV rows:", rows.length);

  const keys = Object.keys(rows[0] || {});
  const timeKey = keys.includes("DATE_TIME") ? "DATE_TIME" : null;
  const acKey = keys.includes("AC_POWER") ? "AC_POWER" : null;
  const dcKey = keys.includes("DC_POWER") ? "DC_POWER" : null;
  const irrKey = keys.includes("IRRADIATION") ? "IRRADIATION" : null;

  if (!timeKey) {
    console.log("❌ DATE_TIME not found in CSV header");
    process.exit(1);
  }
  if (!acKey && !dcKey) {
    console.log("❌ AC_POWER or DC_POWER not found in CSV header");
    process.exit(1);
  }

  console.log("🔎 Detected keys:", { timeKey, acKey, dcKey, irrKey });

  const dayMap = new Map();

  for (const r of rows) {
    const dt = parseDate(r[timeKey]);
    if (!dt) continue;

    const dk = dayKeyFromDate(dt);
    const minutes = dt.getHours() * 60 + dt.getMinutes();
    const slot = Math.floor(minutes / 15);

    if (!dayMap.has(dk)) dayMap.set(dk, new Array(96).fill(null));
    dayMap.get(dk)[slot] = r;
  }

  for (const [dk, arr] of dayMap.entries()) {
    let last = null;
    for (let i = 0; i < 96; i++) {
      if (arr[i]) last = arr[i];
      else if (last) arr[i] = last;
    }
    last = null;
    for (let i = 95; i >= 0; i--) {
      if (arr[i]) last = arr[i];
      else if (last) arr[i] = last;
    }
  }

  const dayKeys = Array.from(dayMap.keys()).sort();
  console.log("✅ Days found:", dayKeys.length);

  let globalPeak = 0;
  const dailyTotals = [];

  for (const dk of dayKeys) {
    const arr = dayMap.get(dk);

    let totalKWh = 0;
    let peakKW = 0;

    for (let slot = 0; slot < 96; slot++) {
      const row = arr[slot] || {};
      const solarKW = toNumber(row[acKey] ?? row[dcKey] ?? 0);
      totalKWh += solarKW * 0.25;
      peakKW = Math.max(peakKW, solarKW);
      globalPeak = Math.max(globalPeak, solarKW);
    }

    dailyTotals.push(totalKWh);

    await db.collection("sites").doc(SITE_ID).collection("days").doc(dk).set(
      {
        dayKey: dk,
        totalKWh: Number(totalKWh.toFixed(3)),
        peakKW: Number(peakKW.toFixed(3)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const avgDailyKWh =
    dailyTotals.length > 0
      ? dailyTotals.reduce((s, x) => s + x, 0) / dailyTotals.length
      : 0;

  const capacityKW = Math.max(1, Math.round(globalPeak || 1));

  await db.collection("sites").doc(SITE_ID).collection("stats").doc("main").set({
    siteId: SITE_ID,
    dayKeys,
    avgDailyKWh: Number(avgDailyKWh.toFixed(3)),
    capacityKW,
    detected: { timeKey, acKey, dcKey, irrKey },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("sites").doc(SITE_ID).collection("stats").doc("stream").set({
    dayKey: dayKeys[0],
    pointer: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("🚀 Importing samples...");

  let batch = db.batch();
  let batchCount = 0;
  let writeCount = 0;

  for (const dk of dayKeys) {
    const arr = dayMap.get(dk);

    for (let slot = 0; slot < 96; slot++) {
      const row = arr[slot] || {};
      const ac = toNumber(row[acKey] ?? 0);
      const dc = toNumber(row[dcKey] ?? 0);
      const irr = irrKey ? toNumber(row[irrKey]) : 0;

      const ref = db
        .collection("sites")
        .doc(SITE_ID)
        .collection("days")
        .doc(dk)
        .collection("samples")
        .doc(String(slot));

      batch.set(ref, { slot, ac, dc, irr });

      batchCount++;
      writeCount++;

      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        process.stdout.write(`\r✅ Written docs: ${writeCount}`);
      }
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(`\n✅ Import complete. Total docs written: ${writeCount}`);
  console.log("✅ Stats:", { avgDailyKWh: avgDailyKWh.toFixed(2), capacityKW });
}

main().catch((e) => {
  console.error("❌ Import failed:", e);
  process.exit(1);
});
