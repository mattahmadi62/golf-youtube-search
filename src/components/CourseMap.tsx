"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export type MapCourse = {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  country: string | null;
  lat: number;
  lng: number;
  isCurated: boolean;
  videoCount: number;
};

// Leaflet's bundler-default icon path doesn't resolve under Next/webpack;
// build a minimal CDN-hosted icon so markers actually render.
const ICON_URL = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/";
const defaultIcon = L.icon({
  iconUrl: `${ICON_URL}marker-icon.png`,
  iconRetinaUrl: `${ICON_URL}marker-icon-2x.png`,
  shadowUrl: `${ICON_URL}marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Continental US bounds — fallback when no state is selected.
const US_BOUNDS: [[number, number], [number, number]] = [
  [24.396308, -125.0], // SW
  [49.384358, -66.93457], // NE
];

function FitBounds({ courses }: { courses: MapCourse[] }) {
  const map = useMap();
  // Refit whenever the visible set changes meaningfully.
  useMemo(() => {
    if (courses.length === 0) {
      map.fitBounds(US_BOUNDS, { padding: [20, 20] });
      return;
    }
    const bounds = L.latLngBounds(courses.map((c) => [c.lat, c.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [courses, map]);
  return null;
}

export function CourseMap({
  courses,
  hideFilter = false,
}: {
  courses: MapCourse[];
  hideFilter?: boolean;
}) {
  const [selectedState, setSelectedState] = useState<string>("");

  const states = useMemo(() => {
    const set = new Map<string, number>();
    for (const c of courses) {
      const s = c.state ?? "(no state)";
      set.set(s, (set.get(s) ?? 0) + 1);
    }
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([state, count]) => ({ state, count }));
  }, [courses]);

  const visible = useMemo(() => {
    if (!selectedState) return courses;
    return courses.filter(
      (c) => (c.state ?? "(no state)") === selectedState,
    );
  }, [courses, selectedState]);

  return (
    <div className="flex h-full flex-col">
      {!hideFilter && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="state-filter"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              Filter:
            </label>
            <select
              id="state-filter"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All states ({courses.length})</option>
              {states.map(({ state, count }) => (
                <option key={state} value={state}>
                  {state} ({count})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Showing {visible.length} of {courses.length}
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden rounded-lg border border-[#1F4D32]/20 dark:border-zinc-800">
        <MapContainer
          bounds={US_BOUNDS}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds courses={visible} />
          {visible.map((c) => (
            <Marker key={c.id} position={[c.lat, c.lng]} icon={defaultIcon}>
              <Popup>
                <div className="space-y-1">
                  <a
                    href={`/course/${c.slug}`}
                    className="block font-medium text-emerald-700 hover:underline"
                  >
                    {c.name}
                  </a>
                  <p className="text-xs text-zinc-500">
                    {[c.state, c.country].filter(Boolean).join(", ") || "—"}
                  </p>
                  <p className="text-xs text-zinc-700">
                    {c.videoCount} {c.videoCount === 1 ? "video" : "videos"}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
