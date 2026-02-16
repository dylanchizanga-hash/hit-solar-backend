import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const data = [
  { day: "Mon", energy: 120 },
  { day: "Tue", energy: 210 },
  { day: "Wed", energy: 180 },
  { day: "Thu", energy: 260 },
  { day: "Fri", energy: 300 },
  { day: "Sat", energy: 280 },
  { day: "Sun", energy: 320 },
];

export default function EnergyChart() {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="energy"
            stroke="#16a34a"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
