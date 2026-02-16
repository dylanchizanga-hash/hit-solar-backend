import Sidebar from "../components/Sidebar"
import TopBar from "../components/TopBar"
import KPICard from "../components/KPICard"

export default function Dashboard() {
  return (
    <div className="flex">
      <Sidebar />

      <div className="flex-1 bg-gray-100 min-h-screen">
        <TopBar />

        <div className="p-6">
          {/* KPI ROW */}
          <div className="grid grid-cols-4 gap-6 mb-6">
            <KPICard title="Total Energy" value="6.25" unit="MWh" />
            <KPICard title="Daily Yield" value="32.5" unit="kWh" />
            <KPICard title="Fault Rate" value="7.73" unit="%" />
            <KPICard title="Active Inverters" value="1" unit="" />
          </div>

          {/* PLACEHOLDERS FOR CHARTS */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white h-80 rounded-xl shadow flex items-center justify-center">
              Power vs Time (Chart)
            </div>

            <div className="bg-white h-80 rounded-xl shadow flex items-center justify-center">
              Fault Trend (Chart)
            </div>
          </div>

          {/* TABLE PLACEHOLDER */}
          <div className="bg-white mt-6 rounded-xl shadow p-4">
            Inverter Fault Ranking Table
          </div>
        </div>
      </div>
    </div>
  )
}
