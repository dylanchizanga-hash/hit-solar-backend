export default function KPICard({
  title,
  value,
  unit,
  trend,
  trendPositive = false,
}) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col justify-between">
      <p className="text-sm text-gray-500">{title}</p>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-800">
            {value}
            <span className="text-base font-medium text-gray-500 ml-1">
              {unit}
            </span>
          </p>
        </div>

        {trend && (
          <span
            className={`text-sm font-semibold ${
              trendPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
