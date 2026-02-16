const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// --------------------
// Health check
// --------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    port: String(process.env.PORT || "5000"),
    timeUTC: new Date().toISOString(),
    msg: "Backend alive",
  });
});

// --------------------
// LIVE STREAM (changes every request)
// --------------------
let tick = 0;

function hhmmFromNow(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  // Zimbabwe is UTC+2; this formats in local runtime timezone (Render is UTC),
  // so we force Africa/Harare.
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

app.get("/api/power", (req, res) => {
  tick++;

  // window size (how many points in the chart)
  const WINDOW = 12;

  // base solar changes over time
  const baseKW = 2.0 + Math.sin(tick / 6) * 1.2; // 0.8 .. 3.2
  const jitter = () => (Math.random() * 0.3 - 0.15); // -0.15..0.15

  const data = Array.from({ length: WINDOW }).map((_, i) => {
    // older points first
    const k = tick - (WINDOW - 1 - i);

    const solar = Math.max(0, baseKW + Math.sin(k / 3) * 0.6 + jitter());

    // split into 3 inverters
    const inv1 = solar * 0.4;
    const inv2 = solar * 0.35;
    const inv3 = solar * 0.25;

    // irradiance roughly follows solar (0..1.2)
    const irradiance = Math.max(0, Math.min(1.2, solar / 3.0 + jitter()));

    // battery moves slowly
    const battery = Math.max(
      15,
      Math.min(100, 55 + Math.sin(k / 12) * 10 + solar * 6)
    );

    return {
      time: hhmmFromNow(-(WINDOW - 1 - i) * 2), // 2-min spacing
      solar: Number(solar.toFixed(3)),
      inv1: Number(inv1.toFixed(3)),
      inv2: Number(inv2.toFixed(3)),
      inv3: Number(inv3.toFixed(3)),
      battery: Number(battery.toFixed(0)),
      irradiance: Number(irradiance.toFixed(3)),
    };
  });

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.json({
    data,
    meta: {
      nowHHMM: hhmmFromNow(0),
      source: "render",
      streamTick: tick,
    },
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));