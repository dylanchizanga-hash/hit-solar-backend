import {
  LayoutDashboard,
  Factory,
  AlertTriangle,
  BarChart3,
  Settings,
} from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="h-screen w-64 bg-[#0B1220] text-gray-300 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-emerald-400">
          Solar Monitor
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        <NavItem
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          active
        />
        <NavItem
          icon={<Factory size={18} />}
          label="Plants"
        />
        <NavItem
          icon={<AlertTriangle size={18} />}
          label="Faults"
        />
        <NavItem
          icon={<BarChart3 size={18} />}
          label="Analytics"
        />
        <NavItem
          icon={<Settings size={18} />}
          label="Settings"
        />
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-800 text-xs text-gray-500">
        © 2026 Solar AI
      </div>
    </aside>
  );
}

/* ---------- Nav Item Component ---------- */
function NavItem({ icon, label, active = false }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition
        ${
          active
            ? "bg-emerald-500/10 text-emerald-400"
            : "hover:bg-gray-800 hover:text-white"
        }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
