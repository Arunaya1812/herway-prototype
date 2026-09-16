// lib/safety-waypoints.ts
import { prisma } from "@/lib/prisma";
import { loadXGBoostModel, predictSafetyFromCell } from "@/lib/xgboost-inference";

interface SafeWaypoint {
  lat: number;
  lon: number;
  safety: number;
}

export async function findSafeWaypoint(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<SafeWaypoint | null> {
  const midLat = (startLat + endLat) / 2;
  const midLon = (startLon + endLon) / 2;

  const dLat = endLat - startLat;
  const dLon = endLon - startLon;
  const dist = Math.sqrt(dLat * dLat + dLon * dLon);
  if (dist < 0.005) return null;

  const perpLat = -dLon / dist;
  const perpLon = dLat / dist;
  const offsetMagnitude = dist * 0.25;

  const candidates = [
    { lat: midLat + perpLat * offsetMagnitude, lon: midLon + perpLon * offsetMagnitude },
    { lat: midLat - perpLat * offsetMagnitude, lon: midLon - perpLon * offsetMagnitude },
    { lat: startLat + dLat * 0.33 + perpLat * offsetMagnitude * 0.8, lon: startLon + dLon * 0.33 + perpLon * offsetMagnitude * 0.8 },
    { lat: startLat + dLat * 0.67 - perpLat * offsetMagnitude * 0.8, lon: startLon + dLon * 0.67 - perpLon * offsetMagnitude * 0.8 },
  ];

  const searchRadius = Math.max(0.015, Math.min(0.04, offsetMagnitude * 0.6));

  // ✅ Load XGBoost model once
  const model = loadXGBoostModel();

  let bestWaypoint: SafeWaypoint | null = null;

  for (const center of candidates) {
    try {
      const cells = await prisma.safetyGridCell.findMany({
        where: {
          city: "delhi",
          latitude: { gte: center.lat - searchRadius, lte: center.lat + searchRadius },
          longitude: { gte: center.lon - searchRadius, lte: center.lon + searchRadius },
        },
        select: {
          latitude: true,
          longitude: true,
          crimeRateWomen: true,
          streetLightDensity: true,
          policeProximityScore: true,
          wineShopProximityScore: true,
          cctvCoverage: true,
          trafficDensity: true,
        },
        take: 20, // fetch more candidates so XGBoost can rank them
      });

      for (const cell of cells) {
        const crossDist = pointToLineDist(
          cell.latitude, cell.longitude,
          startLat, startLon, endLat, endLon
        );
        if (crossDist < 0.005) continue;

        // ✅ Score with XGBoost instead of using raw baseSafetyScore
        const xgbSafety = predictSafetyFromCell(model, {
          crimeRateWomen: cell.crimeRateWomen,
          streetLightDensity: cell.streetLightDensity,
          policeProximityScore: cell.policeProximityScore,
          wineShopProximityScore: cell.wineShopProximityScore,
          cctvCoverage: cell.cctvCoverage,
          trafficDensity: cell.trafficDensity,
        });

        if (!bestWaypoint || xgbSafety > bestWaypoint.safety) {
          bestWaypoint = { lat: cell.latitude, lon: cell.longitude, safety: xgbSafety };
        }
      }
    } catch (err) {
      console.error("[SafeWaypoint] DB query error:", err);
    }
  }

  return bestWaypoint;
}

function pointToLineDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}