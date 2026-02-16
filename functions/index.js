const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getZimbabweNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 2 * 60 * 60_000);
}

function formatHHMM(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function slotToHHMM(slot) {
  const totalMins = slot * 15;
  const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
  const mm = String(totalMins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function batteryFromTimeAndPower(slot, solarKW) {
  const hour = (slot * 15) / 60;
  const dayFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  return Math.min(100, Math.max(20, 35 + dayFactor * 55 - (solarKW > 50 ? 0 : 5)));
}

// Debug endpoint
app.get("/api/debug", async (req, res) => {
  try {
    const siteId = String(req.query.site || "hit");
    const statsRef = db.collection("sites").doc(siteId).collection("stats").doc("main");
    const streamRef = db.collection("sites").doc(siteId).collection("stats").doc("stream");

    const [statsSnap, streamSnap] = await Promise.all([statsRef.get(), streamRef.get()]);

    res.json({
      siteId,
      stats: statsSnap.exists ? statsSnap.data() : null,
      stream: streamSnap.exists ? streamSnap.data() : null,
      zimNow: formatHHMM(getZimbabweNow()),
    });
  } catch (e) {
    res.status(500).json({ error: "debug error", detail: String(e.message || e) });
  }
});

// Live power endpoint
app.get("/api/power", async (req, res) => {
  try {
    const siteId = String(req.query.site || "hit");
    const zimNow = getZimbabweNow();

    const statsRef = db.collection("sites").doc(siteId).collection("stats").doc("main");
    const statsSnap = await statsRef.get();

    if (!statsSnap.exists) {
      return res.status(400).json({
        error: "No stats found. Run the CSV import script first.",
      });
    }

    const stats = statsSnap.data() || {};
    const dayKeys = Array.isArray(stats.dayKeys) ? stats.dayKeys : [];
    if (dayKeys.length === 0) {
      return res.status(400).json({
        error: "No dayKeys found in stats. Run the CSV import script first.",
      });
    }

    const todayIndex = dayOfYear(zimNow) % dayKeys.length;
    const dayKey = dayKeys[todayIndex];

    const streamRef = db.collection("sites").doc(siteId).collection("stats").doc("stream");
    const currentSlot = Math.floor((zimNow.getHours() * 60 + zimNow.getMinutes()) / 15);

    const streamResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(streamRef);
      let pointer = currentSlot;
      let storedDayKey = dayKey;

      if (snap.exists) {
        const d = snap.data() || {};
        storedDayKey = d.dayKey || dayKey;
        pointer = Number.isFinite(d.pointer) ? d.pointer : currentSlot;
      }

      if (storedDayKey !== dayKey) {
        pointer = currentSlot;
        storedDayKey = dayKey;
      } else {
        pointer = (pointer + 1) % 96;
      }

      tx.set(streamRef, { dayKey: storedDayKey, pointer }, { merge: true });
      return { dayKey: storedDayKey, pointer };
    });

    const pointer = streamResult.pointer;

    const WINDOW_POINTS = 12;
    const start = Math.max(0, pointer - (WINDOW_POINTS - 1));

    const samplesCol = db
      .collection("sites")
      .doc(siteId)
      .collection("days")
      .doc(dayKey)
      .collection("samples");

    const windowSnap = await samplesCol
      .where("slot", ">=", start)
      .where("slot", "<=", pointer)
      .orderBy("slot")
      .get();

    const data = [];
    windowSnap.forEach((doc) => {
      const s = doc.data() || {};
      const solarKW = toNumber(s.ac || s.dc || 0);
      const irr = toNumber(s.irr || 0);
      const slot = toNumber(s.slot);

      data.push({
        time: slotToHHMM(slot),
        solar: Number(solarKW.toFixed(2)),
        irradiance: Number(irr.toFixed(3)),
        battery: Number(batteryFromTimeAndPower(slot, solarKW).toFixed(0)),
        inv1: Number((solarKW * 0.35).toFixed(2)),
        inv2: Number((solarKW * 0.33).toFixed(2)),
        inv3: Number((solarKW * 0.32).toFixed(2)),
      });
    });

    const cumSnap = await samplesCol
      .where("slot", ">=", 0)
      .where("slot", "<=", pointer)
      .orderBy("slot")
      .get();

    let energyTodayKWh = 0;
    let peakTodayKW = 0;
    let irrSum = 0;
    let irrCount = 0;

    cumSnap.forEach((doc) => {
      const s = doc.data() || {};
      const solarKW = toNumber(s.ac || s.dc || 0);
      const irr = toNumber(s.irr || 0);

      energyTodayKWh += solarKW * 0.25;
      peakTodayKW = Math.max(peakTodayKW, solarKW);

      irrSum += irr;
      irrCount += 1;
    });

    const avgIrrToday = irrCount ? irrSum / irrCount : 0;

    const ZESA_TARIFF = 0.1;
    const todayRevenueUSD = energyTodayKWh * ZESA_TARIFF;

    const avgDailyKWh = toNumber(stats.avgDailyKWh || 0);
    const predictedNext30DaysKWh = avgDailyKWh * 30;
    const predictedNext30DaysUSD = predictedNext30DaysKWh * ZESA_TARIFF;

    const last = data[data.length - 1] || { time: "00:00", solar: 0, irradiance: 0, battery: 50 };
    const hour = Number(String(last.time).split(":")[0] || 0);
    const isDay = hour >= 6 && hour <= 18;
    const derivedFaultsToday = isDay && last.solar < 10 && last.irradiance < 0.02 ? 1 : 0;

    res.json({
      data,
      meta: {
        nowHHMM: formatHHMM(zimNow),
        dayKey,
        pointer,
        energyTodayKWh: Number(energyTodayKWh.toFixed(2)),
        peakTodayKW: Number(peakTodayKW.toFixed(2)),
        avgIrrToday: Number(avgIrrToday.toFixed(3)),
        derivedFaultsToday,
        todayRevenueUSD: Number(todayRevenueUSD.toFixed(2)),
        predictedNext30DaysKWh: Number(predictedNext30DaysKWh.toFixed(2)),
        predictedNext30DaysUSD: Number(predictedNext30DaysUSD.toFixed(2)),
        capacityKW: toNumber(stats.capacityKW || 1),
        avgDailyKWh: Number(avgDailyKWh.toFixed(2)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: String(err.message || err) });
  }
});

exports.api = functions.https.onRequest(app);
