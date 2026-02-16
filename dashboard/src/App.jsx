import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import KPICard from "./components/KPICard";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function App() {
  const ZESA_TARIFF_USD_PER_KWH = 0.1;
  const PLANTS_COUNT = 1;
  const SITE_NAME = "HIT Project";

  // ✅ IMPORTANT: use Render backend
  const API_BASE = "https://hit-solar-backend.onrender.com";

  const [powerData, setPowerData] = useState([]);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let interval;

    const fetchLive = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/power?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (Array.isArray(json?.data)) setPowerData(json.data);
        if (json?.meta) setMeta(json.meta);
      } catch (err) {
        console.error("Live fetch failed:", err);
      }
    };

    fetchLive();
    interval = setInterval(fetchLive, 2000);

    return () => clearInterval(interval);
  }, []);

  const safePowerData =
    powerData.length > 0
      ? powerData
      : [
          {
            time: "00:00",
            solar: 0,
            battery: 50,
            inv1: 0,
            inv2: 0,
            inv3: 0,
            irradiance: 0,
          },
        ];

  const latest = safePowerData[safePowerData.length - 1];

  // ---- KPIs ----
  // Approx energy today from streamed samples (kW sampled every 2 minutes)
  const totalEnergyKWh = useMemo(() => {
    // each sample is 2 minutes = 2/60 hours
    const kWh = safePowerData.reduce((s, r) => s + Number(r.solar || 0) * (2 / 60), 0);
    return kWh;
  }, [safePowerData]);

  const totalEnergyMWh = totalEnergyKWh / 1000;

  const peakSolar = useMemo(() => {
    return Math.max(...safePowerData.map((d) => Number(d.solar || 0)), 0);
  }, [safePowerData]);

  const averageBattery = useMemo(() => {
    const sum = safePowerData.reduce((s, d) => s + Number(d.battery || 0), 0);
    return safePowerData.length ? sum / safePowerData.length : 0;
  }, [safePowerData]);

  const averageIrradiance = useMemo(() => {
    const sum = safePowerData.reduce((s, d) => s + Number(d.irradiance || 0), 0);
    return safePowerData.length ? sum / safePowerData.length : 0;
  }, [safePowerData]);

  // ---- Health ----
  const isDaytime = useMemo(() => {
    const t = meta?.nowHHMM || latest.time || "00:00";
    const hour = Number(String(t).split(":")[0]);
    return hour >= 6 && hour <= 18;
  }, [meta?.nowHHMM, latest.time]);

  const latestSolar = Number(latest.solar || 0);
  const latestBattery = Number(latest.battery || 0);
  const latestIrr = Number(latest.irradiance || 0);

  let systemHealth = "Healthy";
  let healthColor = "bg-green-500";

  const critical =
    latestBattery < 20 ||
    (isDaytime && latestSolar < 0.05 && latestIrr < 0.05);

  const warning =
    latestBattery < 40 ||
    (isDaytime && latestSolar < 0.2);

  if (critical) {
    systemHealth = "Critical";
    healthColor = "bg-red-500";
  } else if (warning) {
    systemHealth = "Warning";
    healthColor = "bg-yellow-500";
  }

  // Derived alarm shown only when CRITICAL
  const showActiveAlarmBanner = systemHealth === "Critical";

  // ---- Efficiency / PR ----
  const SYSTEM_CAPACITY_KW = Math.max(1, peakSolar); // avoid divide by zero
  const efficiency = (latestSolar / SYSTEM_CAPACITY_KW) * 100;
  const efficiencyClamped = Math.min(100, Math.max(0, efficiency));

  // ---- Revenue ----
  const revenueTodayUSD = totalEnergyKWh * ZESA_TARIFF_USD_PER_KWH;
  const predictedNext30DaysUSD = revenueTodayUSD * 30; // simple projection (keeps changing as power changes)

  // ---- Monthly generation rules (Jan fixed, Feb live, Mar/Apr zero) ----
  const monthlyGeneration = useMemo(() => {
    const now = new Date();
    const monthIdx = now.getMonth(); // Jan=0, Feb=1
    const dayOfMonth = now.getDate();

    // We only have “live” energy from stream; treat it as “today so far”
    const todayKWh = totalEnergyKWh;

    const janFixed = monthIdx >= 1 ? todayKWh * 31 : todayKWh * dayOfMonth;
    const febLive = monthIdx === 1 ? todayKWh * Math.max(1, dayOfMonth) : 0;

    return [
      { month: "Jan", value: monthIdx >= 1 ? janFixed : todayKWh, active: monthIdx === 0, icon: "☀️" },
      { month: "Feb", value: febLive, active: monthIdx === 1, icon: "⛅" },
      { month: "Mar", value: 0, active: monthIdx === 2, icon: "🌧️" },
      { month: "Apr", value: 0, active: monthIdx === 3, icon: "🌦️" },
    ];
  }, [totalEnergyKWh]);

  // ---- Info table ----
  const infoRows = useMemo(
    () => [
      {
        name: SITE_NAME,
        status: systemHealth,
        engineers: "HIT Solar Team",
        irradiance: Number(averageIrradiance || 0).toFixed(2),
        energy: `${totalEnergyMWh.toFixed(3)} MWh`,
        battery: `${averageBattery.toFixed(0)}%`,
        temp: "—",
      },
    ],
    [SITE_NAME, systemHealth, averageIrradiance, totalEnergyMWh, averageBattery]
  );

  // ---- Fault chart derived from live ----
  const faultDataDerived = useMemo(() => {
    const isLowSolar = isDaytime && latestSolar < 0.05;
    const isLowIrr = isDaytime && latestIrr < 0.05;
    const isLowBattery = latestBattery < 20;

    return [
      { name: "Low Solar", faults: isLowSolar ? 1 : 0 },
      { name: "Low Irradiance", faults: isLowIrr ? 1 : 0 },
      { name: "Low Battery", faults: isLowBattery ? 1 : 0 },
      { name: "OK", faults: !isLowSolar && !isLowIrr && !isLowBattery ? 1 : 0 },
    ];
  }, [isDaytime, latestSolar, latestIrr, latestBattery]);

  return (
    <div className="flex h-screen bg-[#eef2f7]">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />

        <main className="p-6 space-y-6 overflow-y-auto">
          <div className={`rounded-2xl p-4 text-white shadow ${healthColor}`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">System Health Status</h2>
              <span className="text-2xl font-bold">{systemHealth}</span>
            </div>
          </div>

          {showActiveAlarmBanner && (
            <div className="bg-red-600 text-white p-3 rounded-2xl shadow animate-pulse">
              ⚠ Active Alarm Detected (Derived from Live Data)
            </div>
          )}

          {/* TOP SUMMARY CARD */}
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
              <div className="flex items-start gap-6">
                <div className="w-36 h-24 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-inner">
                  <span className="text-5xl">🔆</span>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Solar Site</p>
                  <h2 className="text-2xl font-bold text-gray-800">{SITE_NAME}</h2>

                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>🏭 Plants: {PLANTS_COUNT}</span>
                    <span>⚡ Capacity: {SYSTEM_CAPACITY_KW.toFixed(2)} kW</span>
                    <span>⚡ Generation: {totalEnergyMWh.toFixed(3)} MWh</span>
                    <span>🌍 CO₂ Saved: {Math.max(0, totalEnergyKWh * 0.7).toFixed(0)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 border rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">Total Yield (Today)</p>
                  <p className="text-lg font-bold text-gray-800">{Number(totalEnergyKWh).toFixed(2)} kWh</p>
                </div>

                <div className="bg-gray-50 border rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">Efficiency (PR)</p>
                  <p className="text-lg font-bold text-gray-800">{efficiencyClamped.toFixed(0)}%</p>
                </div>

                <div className="bg-gray-50 border rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">Fault Events (Derived)</p>
                  <p className="text-lg font-bold text-gray-800">{faultDataDerived.reduce((s, x) => s + x.faults, 0)}</p>
                </div>

                <div className="bg-gray-50 border rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">Availability</p>
                  <p className="text-lg font-bold text-gray-800">100%</p>
                </div>
              </div>
            </div>

            {/* Revenue row */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 border rounded-2xl p-4">
                <p className="text-xs text-gray-500">
                  Revenue Today (ZESA buys energy kWh @ ${ZESA_TARIFF_USD_PER_KWH.toFixed(2)}/kWh)
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-800">${Number(revenueTodayUSD).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Today (so far)</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-800">{Number(totalEnergyKWh).toFixed(2)} kWh</p>
                    <p className="text-xs text-gray-500">Energy generated</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border rounded-2xl p-4">
                <p className="text-xs text-gray-500">Estimated Revenue (Next 30 days forecast)</p>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-800">${Number(predictedNext30DaysUSD).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Next 30 days</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-800">{meta?.nowHHMM || latest.time}</p>
                    <p className="text-xs text-gray-500">Live updates</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* KPI GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard title="Total Energy Generated" value={totalEnergyMWh.toFixed(3)} unit="MWh" trend="Live" trendPositive />
            <KPICard title="Peak Solar Output" value={Number(peakSolar || 0).toFixed(2)} unit="kW" trend="Live" trendPositive />
            <KPICard title="Average Irradiation" value={Number(averageIrradiance || 0).toFixed(2)} unit="—" trend="Live" trendPositive />
            <KPICard title="Total Fault Events" value={faultDataDerived.reduce((s, x) => s + x.faults, 0)} unit="events" trend="Derived" trendPositive />
            <KPICard title="System Efficiency (PR)" value={efficiencyClamped.toFixed(1)} unit="%" trend="PR" trendPositive={efficiencyClamped > 75} />
            <KPICard title="Revenue Today" value={Number(revenueTodayUSD).toFixed(2)} unit="$" trend="ZESA" trendPositive />
          </div>

          {/* PERFORMANCE + MONTHLY */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-2xl shadow p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Performance Monitoring</h2>
                <button className="text-xs px-3 py-1 rounded-lg border bg-gray-50 hover:bg-gray-100">Live</button>
              </div>

              <div style={{ width: "100%", height: 320, minHeight: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={safePowerData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="solar" stroke="#2563eb" strokeWidth={3} dot={false} name="Solar (kW)" />
                    <Line type="monotone" dataKey="battery" stroke="#ef4444" strokeWidth={3} dot={false} name="Battery (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Monthly Generation</h2>
                <span className="text-xs text-gray-500">⚡ Live</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {monthlyGeneration.map((m) => (
                  <div
                    key={m.month}
                    className={`rounded-2xl p-4 border shadow-sm transition ${
                      m.active ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    <div className="text-2xl">{m.icon}</div>
                    <p className="text-sm font-semibold mt-2">{m.month}</p>
                    <p className="text-xs opacity-80 mt-1">{Number(m.value).toFixed(0)} kWh</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* INFORMATION + MAP */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-2xl shadow p-5 min-w-0">
              <h2 className="text-lg font-semibold mb-4">Information</h2>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-3">Name</th>
                      <th>Status</th>
                      <th>Engineers</th>
                      <th>Irradiance</th>
                      <th>Energy</th>
                      <th>Battery</th>
                      <th>Temperature</th>
                    </tr>
                  </thead>

                  <tbody>
                    {infoRows.map((row) => (
                      <tr key={row.name} className="border-b">
                        <td className="py-3 font-semibold text-gray-800">{row.name}</td>
                        <td>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              row.status === "Healthy"
                                ? "bg-green-100 text-green-700"
                                : row.status === "Warning"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="text-gray-700">{row.engineers}</td>
                        <td className="text-gray-700">{row.irradiance}</td>
                        <td className="text-gray-700">{row.energy}</td>
                        <td className="text-gray-700">{row.battery}</td>
                        <td className="text-gray-700">{row.temp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow overflow-hidden min-w-0">
              <div className="p-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Harare, Zimbabwe</h2>
                <span className="text-xs text-gray-500">📍 Site View</span>
              </div>

              <div className="h-56">
                <iframe
                  title="Harare Map"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src="https://www.google.com/maps?q=-17.8252,31.0335&z=13&output=embed"
                ></iframe>
              </div>

              <div className="p-4">
                <p className="text-sm text-gray-700">Live monitoring location card (Google Maps Embed).</p>
              </div>
            </div>
          </div>

          {/* INVERTER + FAULTS */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow p-5 min-w-0">
              <h2 className="text-lg font-semibold mb-4">Inverter Output Breakdown</h2>

              <div style={{ width: "100%", height: 350, minHeight: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={safePowerData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="inv1" stackId="a" fill="#2563eb" />
                    <Bar dataKey="inv2" stackId="a" fill="#16a34a" />
                    <Bar dataKey="inv3" stackId="a" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-5 min-w-0">
              <h2 className="text-lg font-semibold mb-4">Fault Analytics</h2>

              <div style={{ width: "100%", height: 350, minHeight: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={faultDataDerived}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="faults" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}