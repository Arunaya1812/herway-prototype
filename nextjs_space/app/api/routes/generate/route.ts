export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { calculateRouteSafetyScore } from "@/lib/safety-zones";
import { findSafeWaypoint } from "@/lib/safety-waypoints";

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoord(lat: number, lon: number): boolean {
  return typeof lat === "number" && typeof lon === "number" && !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

const MAX_ROUTE_DISTANCE_KM = 500;

async function fetchOSRMRoute(...coords: [number, number][]): Promise<any | null> {
  // coords = array of [lon, lat] pairs
  const waypoints = coords.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&alternatives=true`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "HerWay/1.0" } });
    if (res.ok) return await res.json();
    console.error("[OSRM] HTTP", res.status);
  } catch (err) {
    console.error("[OSRM] Error:", err);
  }
  return null;
}

function parseOSRMRoute(r: any): { geometry: [number, number][]; distance_km: number; duration_min: number } | null {
  const coords: [number, number][] = (r.geometry?.coordinates || []).map((c: number[]) => {
    return [c[1], c[0]] as [number, number];
  }).filter(([lat, lon]: [number, number]) => isValidCoord(lat, lon));
  if (coords.length < 2) return null;
  return {
    geometry: coords,
    distance_km: Math.round((r.distance / 1000) * 10) / 10,
    duration_min: Math.round((r.duration / 60) * 10) / 10,
  };
}

/** Check if two routes are substantially different by comparing their geometries */
function routesAreDifferent(
  a: { geometry: [number, number][] },
  b: { geometry: [number, number][] },
): boolean {
  // Sample 10 points from each and check average distance between closest points
  const sampleA = samplePoints(a.geometry, 10);
  const sampleB = samplePoints(b.geometry, 10);
  let totalDist = 0;
  for (const pa of sampleA) {
    let minD = Infinity;
    for (const pb of sampleB) {
      const d = haversine(pa[0], pa[1], pb[0], pb[1]);
      if (d < minD) minD = d;
    }
    totalDist += minD;
  }
  const avgDist = totalDist / sampleA.length;
  // Routes are "different" if avg distance between sampled points > 200m
  return avgDist > 0.2;
}

function samplePoints(geom: [number, number][], n: number): [number, number][] {
  if (geom.length <= n) return geom;
  const step = (geom.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => geom[Math.round(i * step)]);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const startLat = Number(body.startLat);
    const startLon = Number(body.startLon);
    const endLat = Number(body.endLat);
    const endLon = Number(body.endLon);
    const startName: string = body.startName || "Origin";
    const endName: string = body.endName || "Destination";

    if (!isValidCoord(startLat, startLon) || !isValidCoord(endLat, endLon)) {
      return NextResponse.json({ error: "Invalid coordinates. Please select locations from the search suggestions." }, { status: 400 });
    }

    const straightLineDist = haversine(startLat, startLon, endLat, endLon);
    if (straightLineDist > MAX_ROUTE_DISTANCE_KM) {
      return NextResponse.json({
        error: `The distance between these locations is approximately ${Math.round(straightLineDist)}km. HerWay is designed for city navigation (up to ${MAX_ROUTE_DISTANCE_KM}km).`
      }, { status: 400 });
    }

    console.log("[Route] Start:", startLat, startLon, "End:", endLat, endLon);

    // Step 1: Get direct routes with alternatives from OSRM
    const osrmData = await fetchOSRMRoute([startLon, startLat], [endLon, endLat]);

    if (!osrmData || osrmData.code !== "Ok" || !osrmData.routes?.length) {
      return NextResponse.json({ error: "Could not find a driving route between these locations." }, { status: 400 });
    }

    // Parse all OSRM alternatives
    const parsedRoutes: { geometry: [number, number][]; distance_km: number; duration_min: number }[] = [];
    for (const r of osrmData.routes.slice(0, 3)) {
      const parsed = parseOSRMRoute(r);
      if (parsed) parsedRoutes.push(parsed);
    }

    // Step 2: If OSRM didn't give us different routes, use XGBoost safety grid
    // to find a safe waypoint and request a detour route through it
    let needsSafeDetour = parsedRoutes.length < 2;
    if (parsedRoutes.length >= 2 && !routesAreDifferent(parsedRoutes[0], parsedRoutes[1])) {
      needsSafeDetour = true;
    }

    if (needsSafeDetour) {
      console.log("[Route] OSRM returned similar routes — finding safe waypoint via XGBoost grid");
      const waypoint = await findSafeWaypoint(startLat, startLon, endLat, endLon);

      if (waypoint) {
        console.log(`[Route] Safe waypoint found: ${waypoint.lat.toFixed(4)},${waypoint.lon.toFixed(4)} (safety=${waypoint.safety})`);
        // Request route through the safe waypoint
        const safeOsrm = await fetchOSRMRoute(
          [startLon, startLat],
          [waypoint.lon, waypoint.lat],
          [endLon, endLat]
        );

        if (safeOsrm?.code === "Ok" && safeOsrm.routes?.length) {
          const safeRoute = parseOSRMRoute(safeOsrm.routes[0]);
          if (safeRoute) {
            // Only add if it's actually different from the direct route
            if (parsedRoutes.length === 0 || routesAreDifferent(parsedRoutes[0], safeRoute)) {
              parsedRoutes.push(safeRoute);
              console.log("[Route] Added safe detour route");
            }
          }
        }
      }
    }

    if (parsedRoutes.length === 0) {
      return NextResponse.json({ error: "Could not find a driving route between these locations." }, { status: 400 });
    }

    // Step 3: Score all candidate routes using the XGBoost-backed safety model
    const scoredRoutes = await Promise.all(
      parsedRoutes.map(async (r) => ({
        ...r,
        safety_score: await calculateRouteSafetyScore(r.geometry, r.distance_km),
      }))
    );

    // Step 4: Select safest and fastest
    const safestRoute = [...scoredRoutes].sort((a, b) => b.safety_score - a.safety_score)[0];
    const fastestRoute = [...scoredRoutes].sort((a, b) => a.duration_min - b.duration_min)[0];

    const finalRoutes: any[] = [];
    const makeRouteObj = (route: typeof scoredRoutes[0], type: string) => ({
      route_type: type,
      geometry: route.geometry,
      total_distance_km: route.distance_km,
      total_duration_min: route.duration_min,
      average_safety_score: route.safety_score,
      startPoint: { lat: startLat, lon: startLon, name: startName },
      endPoint: { lat: endLat, lon: endLon, name: endName },
    });

    // Always add safest
    finalRoutes.push(makeRouteObj(safestRoute, "safest"));

    // Add fastest — ensure it's different from safest
    if (safestRoute !== fastestRoute && routesAreDifferent(safestRoute, fastestRoute)) {
      finalRoutes.push(makeRouteObj(fastestRoute, "fastest"));
    } else {
      // Pick the next best alternative that is actually different
      const sortedByTime = [...scoredRoutes].sort((a, b) => a.duration_min - b.duration_min);
      let addedFastest = false;
      for (const candidate of sortedByTime) {
        if (candidate === safestRoute) continue;
        if (routesAreDifferent(safestRoute, candidate)) {
          finalRoutes.push(makeRouteObj(candidate, "fastest"));
          addedFastest = true;
          break;
        }
      }
      // Fallback: show the fastest even if same path (at least scores may differ)
      if (!addedFastest) {
        finalRoutes.push(makeRouteObj(fastestRoute, "fastest"));
      }
    }

    console.log("[Route] Generated", finalRoutes.length, "routes:",
      finalRoutes.map((r) => `${r.route_type}=${r.average_safety_score}pts/${r.total_distance_km}km/${r.total_duration_min}min`));

    return NextResponse.json({ routes: finalRoutes, startName, endName });
  } catch (error) {
    console.error("Route generation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
