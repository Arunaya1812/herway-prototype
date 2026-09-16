"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MapPin, AlertCircle, Shield, Search, Navigation, Loader2, Clock, Play, Square, X, Crosshair, Smartphone } from "lucide-react";
import dynamic from "next/dynamic";
import Header from "@/app/components/header";
import RouteCard from "@/app/components/route-card";
import SOSButton from "@/app/components/sos-button";

const MapDisplay = dynamic(() => import("@/app/components/map-display"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-slate-800/50 rounded-xl flex items-center justify-center border border-slate-700">
      <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
    </div>
  ),
});

interface GeoResult { name: string; lat: number; lon: number; }
interface Route {
  route_type: string;
  geometry: [number, number][];
  total_distance_km: number;
  total_duration_min: number;
  average_safety_score: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [startResults, setStartResults] = useState<GeoResult[]>([]);
  const [endResults, setEndResults] = useState<GeoResult[]>([]);
  const [startCoords, setStartCoords] = useState<GeoResult | null>(null);
  const [endCoords, setEndCoords] = useState<GeoResult | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState("");
  const [checkingContacts, setCheckingContacts] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [navInfo, setNavInfo] = useState<{distRemaining:number;etaMin:number}|null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Search history - scoped per user
  const [searchHistory, setSearchHistory] = useState<{start:string;end:string;startCoord:{lat:number;lon:number};endCoord:{lat:number;lon:number}}[]>([]);
  const historyKey = session?.user?.email ? `herway_search_history_${session.user.email}` : null;
  useEffect(() => {
    if (!historyKey) return;
    try {
      const saved = localStorage.getItem(historyKey);
      if (saved) setSearchHistory(JSON.parse(saved));
      else setSearchHistory([]);
    } catch {}
  }, [historyKey]);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Check if user has emergency contacts — redirect to onboarding if not
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user/emergency-contacts")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const contacts = Array.isArray(data) ? data : data.contacts || [];
        if (contacts.length < 3) {
          router.replace("/onboarding");
        } else {
          setCheckingContacts(false);
        }
      })
      .catch(() => setCheckingContacts(false));
  }, [status, router]);

  const geocodeSearch = useCallback(async (query: string, type: "start" | "end") => {
    if (query.trim().length < 3) {
      if (type === "start") setStartResults([]); else setEndResults([]);
      return;
    }
    // Check localStorage cache first
    const cacheKey = `herway_geo_${query.trim().toLowerCase()}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { results, ts } = JSON.parse(cached);
        // Cache valid for 24 hours
        if (Date.now() - ts < 86400000 && results?.length) {
          if (type === "start") setStartResults(results); else setEndResults(results);
          return;
        }
      }
    } catch {}
    setSearching(type);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        if (type === "start") setStartResults(results); else setEndResults(results);
        // Cache the results
        try { localStorage.setItem(cacheKey, JSON.stringify({ results, ts: Date.now() })); } catch {}
      }
    } catch {} finally { setSearching(null); }
  }, []);

  const handleInputChange = (value: string, type: "start" | "end") => {
    if (type === "start") { setStartQuery(value); setStartCoords(null); }
    else { setEndQuery(value); setEndCoords(null); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => geocodeSearch(value, type), 400);
  };

  const selectLocation = (result: GeoResult, type: "start" | "end") => {
    const shortName = result.name.split(",").slice(0, 3).join(",").trim();
    if (type === "start") { setStartQuery(shortName); setStartCoords(result); setStartResults([]); }
    else { setEndQuery(shortName); setEndCoords(result); setEndResults([]); }
  };

  const generateRoutes = async () => {
    if (!startCoords || !endCoords) {
      setError("Please select valid locations from the dropdown suggestions.");
      return;
    }
    setLoading(true); setError(""); setRoutes([]); setSelectedRouteIndex(null);
    try {
      const response = await fetch("/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: startCoords.lat, startLon: startCoords.lon,
          endLat: endCoords.lat, endLon: endCoords.lon,
          startName: startQuery, endName: endQuery,
        }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Failed to generate routes"); return; }
      setRoutes(data.routes || []);
      if (data.routes?.length > 0) setSelectedRouteIndex(0);
      // Save to search history
      if (startCoords && endCoords) {
        const entry = { start: startQuery, end: endQuery, startCoord: startCoords, endCoord: endCoords };
        const hist = [entry, ...searchHistory.filter(h => !(h.start === entry.start && h.end === entry.end))].slice(0, 3);
        setSearchHistory(hist);
        if (historyKey) { try { localStorage.setItem(historyKey, JSON.stringify(hist)); } catch {} }
      }
    } catch {
      setError("An error occurred while generating routes. Please try again.");
    } finally { setLoading(false); }
  };

  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setGettingLocation(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Reverse geocode to get a readable name
        try {
          const res = await fetch(`/api/geocode?q=${latitude},${longitude}&reverse=1`);
          if (res.ok) {
            const data = await res.json();
            const results = data.results || [];
            if (results.length > 0) {
              const loc = results[0];
              const shortName = loc.name.split(",").slice(0, 3).join(",").trim();
              setStartQuery(shortName);
              setStartCoords({ name: shortName, lat: latitude, lon: longitude });
            } else {
              setStartQuery(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
              setStartCoords({ name: "Current Location", lat: latitude, lon: longitude });
            }
          } else {
            setStartQuery(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            setStartCoords({ name: "Current Location", lat: latitude, lon: longitude });
          }
        } catch {
          setStartQuery(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          setStartCoords({ name: "Current Location", lat: latitude, lon: longitude });
        }
        setStartResults([]);
        setGettingLocation(false);
      },
      () => {
        setError("Unable to get your location. Please allow location access.");
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadFromHistory = (h: typeof searchHistory[0]) => {
    setStartQuery(h.start); setStartCoords({ ...h.startCoord, name: h.start });
    setEndQuery(h.end); setEndCoords({ ...h.endCoord, name: h.end });
    setStartResults([]); setEndResults([]);
  };

  if (status === "loading" || checkingContacts) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Plan Your Safe Route</h1>
            <p className="text-gray-400 mb-4 text-sm">Find the safest route powered by AI safety analysis</p>
            {/* Search History */}
            {searchHistory.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <Clock className="w-4 h-4 text-gray-500 mt-1" />
                {searchHistory.map((h, i) => (
                  <button key={i} onClick={() => loadFromHistory(h)}
                    className="text-xs px-3 py-1.5 bg-slate-700/60 hover:bg-slate-600/60 text-gray-300 rounded-full border border-slate-600/50 transition truncate max-w-[200px]">
                    {h.start.split(",")[0]} → {h.end.split(",")[0]}
                  </button>
                ))}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {/* Start */}
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-green-400 z-10" />
                <input type="text" placeholder="Enter starting location..." value={startQuery}
                  onChange={(e) => handleInputChange(e.target.value, "start")}
                  className="w-full pl-10 pr-20 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 transition" />
                <div className="absolute right-2 top-1.5 flex items-center gap-1">
                  {searching === "start" && <Loader2 className="w-5 h-5 text-green-400 animate-spin" />}
                  {startCoords && !searching && <span className="w-5 h-5 text-green-400">✓</span>}
                  <button onClick={useCurrentLocation} disabled={gettingLocation} title="Use current location"
                    className="p-1.5 rounded-md hover:bg-slate-600/50 text-blue-400 hover:text-blue-300 transition disabled:opacity-50">
                    {gettingLocation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crosshair className="w-5 h-5" />}
                  </button>
                </div>
                {startResults.length > 0 && !startCoords && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {startResults.map((r, i) => (
                      <button key={i} onClick={() => selectLocation(r, "start")}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-slate-700 transition border-b border-slate-700/50 last:border-0">
                        <span className="line-clamp-1">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* End */}
              <div className="relative">
                <Navigation className="absolute left-3 top-3 w-5 h-5 text-red-400 z-10" />
                <input type="text" placeholder="Enter destination..." value={endQuery}
                  onChange={(e) => handleInputChange(e.target.value, "end")}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-400 transition" />
                {searching === "end" && <Loader2 className="absolute right-3 top-3 w-5 h-5 text-red-400 animate-spin" />}
                {endCoords && <div className="absolute right-3 top-3 w-5 h-5 text-green-400">✓</div>}
                {endResults.length > 0 && !endCoords && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {endResults.map((r, i) => (
                      <button key={i} onClick={() => selectLocation(r, "end")}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-slate-700 transition border-b border-slate-700/50 last:border-0">
                        <span className="line-clamp-1">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={generateRoutes} disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Routes...</> : <><Search className="w-5 h-5" /> Find Safest Routes</>}
            </button>
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Map + Routes */}
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <MapDisplay routes={routes} selectedRouteIndex={selectedRouteIndex}
              startCoords={startCoords} endCoords={endCoords}
              startName={startQuery} endName={endQuery}
              navigating={navigating}
              onNavigationUpdate={(info) => setNavInfo({ distRemaining: info.distRemaining, etaMin: info.etaMin })} />
            {/* Navigation controls */}
            {routes.length > 0 && selectedRouteIndex !== null && (
              <div className="mt-4 mb-4">
                {!navigating ? (
                  <button onClick={() => { setNavigating(true); setNavInfo(null); }}
                    className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition">
                    <Play className="w-4 h-4" /> Start Navigation
                  </button>
                ) : (
                  <div className="bg-slate-800/80 border border-blue-500/30 rounded-lg p-3 min-h-[64px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                        <div>
                          <p className="text-white text-sm font-semibold">Navigating{navInfo ? ` — ${navInfo.distRemaining} km left` : "..."}</p>
                          {navInfo && <p className="text-gray-400 text-xs">ETA: ~{navInfo.etaMin} min</p>}
                        </div>
                      </div>
                      <button onClick={() => { setNavigating(false); setNavInfo(null); }}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition">
                        <Square className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-4">
            {routes.length > 0 ? (
              <>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" /> Route Options
                </h2>
                {routes.map((route, idx) => (
                  <RouteCard key={idx} route={route} isSelected={selectedRouteIndex === idx} onSelect={() => setSelectedRouteIndex(idx)} />
                ))}
              </>
            ) : (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-6 text-center">
                <Shield className="w-12 h-12 text-green-400/40 mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-1">Find Your Safe Route</h3>
                <p className="text-gray-400 text-sm">Enter your start and destination above to see AI-analyzed safe routes.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer disclaimers */}
        <div className="mt-8 mb-24 text-center space-y-1.5 px-4">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
            <Smartphone className="h-3 w-3" />
            Adding HerWay to your home screen gives an app-like experience
          </p>
          <p className="text-[11px] text-slate-600">
            Demo project — not for real-world safety decisions
          </p>
        </div>
      </main>
      <SOSButton selectedRoute={routes[selectedRouteIndex ?? 0] || null}
        fallbackLocation={startCoords ? { lat: startCoords.lat, lon: startCoords.lon } : null} />
    </div>
  );
}
