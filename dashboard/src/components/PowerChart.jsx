import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const PowerChart = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/power")
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch((err) => console.error("Error fetching data:", err));
  }, []);

  return (
    <div className="w-full h-[400px] bg-white rounded-2xl shadow p-4">
      <h2 className="text-xl font-semibold mb-4">
        Solar Power Generation (Live)
      </h2>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="power" stroke="#f59e0b" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PowerChart;
