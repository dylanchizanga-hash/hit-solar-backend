import { useEffect, useState } from "react";

export default function TopBar() {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");

  useEffect(() => {
    const API_KEY = "4799de7500a3491199c100127261102";
    const CITY = "Harare";

    const fetchWeather = async () => {
      try {
        setWeatherError("");

        const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${CITY}&aqi=no`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw new Error(data.error.message);

        setWeather({
          city: "Harare, Zimbabwe",
          temp: Math.round(data.current.temp_c),
          condition: data.current.condition.text,
          icon: data.current.condition.icon,
        });
      } catch (err) {
        console.log(err.message);
        setWeatherError("Failed to load weather");
      }
    };

    fetchWeather();

    const interval = setInterval(() => {
      fetchWeather();
    }, 60000); // every 60 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
      {/* Search */}
      <div className="flex items-center bg-gray-100 px-4 py-2 rounded-lg w-80">
        <input
          type="text"
          placeholder="Search"
          className="bg-transparent outline-none text-sm w-full"
        />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* WEATHER BOX (LIVE) */}
        <div className="bg-gray-50 border rounded-xl px-4 py-2 flex items-center gap-3 min-w-[210px]">
          <div>
            <p className="text-xs text-gray-500">Weather today</p>

            {weatherError && (
              <p className="text-sm font-semibold text-red-600">
                {weatherError}
              </p>
            )}

            {!weather && !weatherError && (
              <p className="text-sm font-semibold text-gray-700">
                Loading...
              </p>
            )}

            {weather && (
              <>
                <p className="text-sm font-bold text-gray-800">
                  {weather.temp}°C
                </p>
                <p className="text-xs text-gray-500">{weather.condition}</p>
              </>
            )}
          </div>

          {weather?.icon && (
            <img
              src={weather.icon}
              alt={weather.condition}
              className="w-10 h-10"
            />
          )}
        </div>

        {/* Icons */}
        <button className="p-2 rounded-full hover:bg-gray-100">🌙</button>
        <button className="p-2 rounded-full hover:bg-gray-100">🔔</button>
        <button className="p-2 rounded-full hover:bg-gray-100">🌐</button>

        {/* Profile */}
        <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
          D
        </div>
      </div>
    </div>
  );
}
