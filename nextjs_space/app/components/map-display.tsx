"use client";

import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window { L: any; }
}

interface RouteData {
  route_type: string;
  geometry: [number, number][];
  total_distance_km: number;
  total_duration_min: number;
  average_safety_score: number;
}

interface MapDisplayProps {
  routes: RouteData[];
  selectedRouteIndex: number | null;
  startCoords: { lat: number; lon: number } | null;
  endCoords: { lat: number; lon: number } | null;
  startName?: string;
  endName?: string;
  navigating?: boolean;
  onNavigationUpdate?: (info: { distRemaining: number; etaMin: number; nearestPointIdx: number }) => void;
}

const ROUTE_COLORS: Record<string, string> = {
  safest: "#10B981",
  fastest: "#3B82F6",
};

function isValid(lat: number, lon: number): boolean {
  return typeof lat === "number" && typeof lon === "number" && !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapDisplay({ routes, selectedRouteIndex, startCoords, endCoords, startName, endName, navigating, onNavigationUpdate }: MapDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [gpsError, setGpsError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) { setLeafletLoaded(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapInstanceRef.current) return;
    const L = window.L;
    if (!L) return;
    const map = L.map(containerRef.current, { center: [22.5937, 78.9629], zoom: 5, zoomControl: true });
    const tParts = ["https://", "tile", ".openstreetmap", ".org/", "{z}", "/", "{x}", "/", "{y}", ".png"];
    L.tileLayer(tParts.join(""), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [leafletLoaded]);

  // Draw routes
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletLoaded) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    layersRef.current.forEach((l: any) => { try { map.removeLayer(l); } catch {} });
    layersRef.current = [];
    const allPts: [number, number][] = [];

    routes.forEach((route, idx) => {
      const pts = route.geometry.filter(([lat, lon]) => isValid(lat, lon));
      if (pts.length < 2) return;
      const isSel = selectedRouteIndex === idx;
      const color = ROUTE_COLORS[route.route_type] || "#6366F1";
      const line = L.polyline(pts, {
        color: isSel ? color : color + "60",
        weight: isSel ? 6 : 3,
        opacity: isSel ? 1 : 0.5,
        dashArray: isSel ? null : "8 6",
      }).addTo(map);
      if (isSel) line.bringToFront();
      layersRef.current.push(line);
      allPts.push(...pts);
    });

    if (startCoords && isValid(startCoords.lat, startCoords.lon)) {
      const m = L.circleMarker([startCoords.lat, startCoords.lon], {
        radius: 8, color: "#fff", weight: 3, fillColor: "#10B981", fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>Start:</b> ${startName || "Origin"}`);
      layersRef.current.push(m);
      allPts.push([startCoords.lat, startCoords.lon]);
    }

    if (endCoords && isValid(endCoords.lat, endCoords.lon)) {
      const m = L.circleMarker([endCoords.lat, endCoords.lon], {
        radius: 8, color: "#fff", weight: 3, fillColor: "#EF4444", fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>Destination:</b> ${endName || "Destination"}`);
      layersRef.current.push(m);
      allPts.push([endCoords.lat, endCoords.lon]);
    }

    if (allPts.length > 1) {
      const bounds = L.latLngBounds(allPts);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (allPts.length === 1) {
      map.setView(allPts[0], 14);
    }
  }, [routes, selectedRouteIndex, startCoords, endCoords, startName, endName, leafletLoaded]);

  // Real-time GPS tracking
  const updateUserPosition = useCallback((lat: number, lon: number, accuracy: number) => {
    if (!mapInstanceRef.current || !leafletLoaded) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Blue pulsing dot for user position
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lon]);
      userCircleRef.current?.setLatLng([lat, lon]);
      userCircleRef.current?.setRadius(accuracy);
    } else {
      // Create custom icon for user
      const icon = L.divIcon({
        className: "user-location-marker",
        html: '<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.6),0 0 20px rgba(59,130,246,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      userMarkerRef.current = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map);
      userCircleRef.current = L.circle([lat, lon], {
        radius: accuracy, color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: 0.1, weight: 1,
      }).addTo(map);
    }

    // If navigating, compute distance to destination along route
    if (navigating && selectedRouteIndex !== null && routes[selectedRouteIndex]) {
      const route = routes[selectedRouteIndex];
      const pts = route.geometry;
      // Find nearest point on route
      let minDist = Infinity, nearIdx = 0;
      for (let i = 0; i < pts.length; i++) {
        const d = haversine(lat, lon, pts[i][0], pts[i][1]);
        if (d < minDist) { minDist = d; nearIdx = i; }
      }
      // Calculate remaining distance from nearest point to end
      let distRemaining = 0;
      for (let i = nearIdx; i < pts.length - 1; i++) {
        distRemaining += haversine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      }
      const speedKmh = route.total_distance_km / (route.total_duration_min / 60);
      const etaMin = speedKmh > 0 ? (distRemaining / speedKmh) * 60 : 0;

      onNavigationUpdate?.({ distRemaining: Math.round(distRemaining * 10) / 10, etaMin: Math.round(etaMin), nearestPointIdx: nearIdx });

      // Pan map to follow user
      map.panTo([lat, lon], { animate: true, duration: 0.5 });
    }
  }, [navigating, selectedRouteIndex, routes, onNavigationUpdate, leafletLoaded]);

  useEffect(() => {
    if (!navigating || typeof window === "undefined" || !navigator.geolocation) return;

    setGpsError("");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        updateUserPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        setGpsError(err.code === 1 ? "Location permission denied" : "Unable to get GPS location");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Remove user marker
      if (userMarkerRef.current && mapInstanceRef.current) {
        try { mapInstanceRef.current.removeLayer(userMarkerRef.current); } catch {}
        try { mapInstanceRef.current.removeLayer(userCircleRef.current); } catch {}
        userMarkerRef.current = null;
        userCircleRef.current = null;
      }
    };
  }, [navigating, updateUserPosition]);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-slate-700">
      <div ref={containerRef} className="w-full h-[500px]" style={{ background: "#1e293b" }} />
      {!leafletLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
        </div>
      )}
      {gpsError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-full z-[1000]">
          {gpsError}
        </div>
      )}
      {navigating && (
        <div className="absolute top-4 right-4 bg-blue-500/90 text-white text-xs px-3 py-1.5 rounded-full z-[1000] flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Live Navigation
        </div>
      )}
      {routes.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700 z-[1000]">
          <p className="text-xs text-gray-400 mb-2 font-semibold">Route Legend</p>
          <div className="space-y-1">
            {[{c:"#10B981",l:"Safest"},{c:"#3B82F6",l:"Fastest"}].map(r=>(
              <div key={r.l} className="flex items-center gap-2">
                <div className="w-4 h-1 rounded" style={{background:r.c}}/>
                <span className="text-xs text-gray-300">{r.l}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-700">
              <div style={{background:"#10B981",width:8,height:8,borderRadius:"50%"}}/>
              <span className="text-xs text-gray-300">Start</span>
            </div>
            <div className="flex items-center gap-2">
              <div style={{background:"#EF4444",width:8,height:8,borderRadius:"50%"}}/>
              <span className="text-xs text-gray-300">Destination</span>
            </div>
            {navigating && (
              <div className="flex items-center gap-2">
                <div style={{background:"#3B82F6",width:8,height:8,borderRadius:"50%",boxShadow:"0 0 6px rgba(59,130,246,0.6)"}}/>
                <span className="text-xs text-gray-300">You</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
