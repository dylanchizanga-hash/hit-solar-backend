const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Render sets PORT automatically
const PORT = process.env.PORT || 5000;

// ✅ Allow calls from anywhere (you can lock this later)
app.use(cors());
app.use(express.json());

// ✅ Root route so opening the link shows a message (not blank/loading confusion)
app.get("/", (req, res) => {
  res.status(200).send("✅ HIT Solar Backend is running. Try /api/power or /api/debug");
});

// ✅ Basic health check (Render likes this)
app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true });
});

// -----------------------------
// YOUR API ROUTES
// -----------------------------
app.get("/api/power", (req, res) => {
  // TEMP placeholder data (replace with your CSV streaming logic if already added)
  res.json({
    data: [
      { time: "08:00", power: 120 },
      { time: "09:00", power: 200 },
      { time: "10:00", power: 350 },
      { time: "11:00", power: 500 },
      { time: "12:00", power: 650 },
      { time: "13:00", power: 700 },
      { time: "14:00", power: 620 },
      { time: "15:00", power: 480 },
    ],
    meta: {
      nowHHMM: new Date().toISOString().slice(11, 16),
      source: "render",
    },
  });
});

// ✅ Debug endpoint so you can see server status quickly
app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    timeUTC: new Date().toISOString(),
    msg: "Backend alive",
  });
});

// ✅ IMPORTANT: listen on 0.0.0.0 for Render
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
