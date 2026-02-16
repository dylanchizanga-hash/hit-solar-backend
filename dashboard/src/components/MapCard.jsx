import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Fix marker icons (Vite + React issue)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function MapCard() {
  const position = [-17.8252, 31.0335]; // Harare

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Site Location</h2>
        <span className="text-xs text-gray-500">Harare, Zimbabwe</span>
      </div>

      {/* IMPORTANT: fixed height */}
      <div className="h-[350px] w-full">
        <MapContainer
          center={position}
          zoom={12}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          <Marker position={position}>
            <Popup>
              <b>Solar Plant Site</b>
              <br />
              Harare, Zimbabwe
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-600">
          Live monitoring location for your solar system.
        </p>
      </div>
    </div>
  );
}
