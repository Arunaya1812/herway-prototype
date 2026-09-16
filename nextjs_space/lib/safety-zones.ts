// lib/safety-zones.ts
import { prisma } from "@/lib/prisma";
import {
  loadXGBoostModel,
  predictSafetyFromCell,
  type XGBoostModel,
} from "@/lib/xgboost-inference";

interface GridCell {
  latitude: number;
  longitude: number;
  // raw features (what the model actually needs)
  crimeRateWomen: number;
  streetLightDensity: number;
  policeProximityScore: number;
  wineShopProximityScore: number;
  cctvCoverage: number;
  trafficDensity: number;
  // keep these for time-of-day adjustments
  nightRiskFactor: number;
  areaType: string;
  // cache the xgb score so we don't recompute per query
  xgbScore?: number;
}

let gridCache: GridCell[] | null = null;
let gridCacheExpiry = 0;
let modelCache: XGBoostModel | null = null;

async function loadGrid(): Promise<GridCell[]> {
  const now = Date.now();
  if (gridCache && now < gridCacheExpiry) return gridCache;

  try {
    const cells = await prisma.safetyGridCell.findMany({
      where: { city: "delhi" },
      select: {
        latitude: true,
        longitude: true,
        crimeRateWomen: true,
        streetLightDensity: true,
        policeProximityScore: true,
        wineShopProximityScore: true,
        cctvCoverage: true,
        trafficDensity: true,
        nightRiskFactor: true,
        areaType: true,
      },
    });

    if (cells.length > 0) {
      // Load model once and pre-score every cell
      if (!modelCache) {
        modelCache = loadXGBoostModel();
      }
      const model = modelCache;

      gridCache = cells.map((c) => ({
        ...c,
        xgbScore: predictSafetyFromCell(model, {
          crimeRateWomen: c.crimeRateWomen,
          streetLightDensity: c.streetLightDensity,
          policeProximityScore: c.policeProximityScore,
          wineShopProximityScore: c.wineShopProximityScore,
          cctvCoverage: c.cctvCoverage,
          trafficDensity: c.trafficDensity,
        }),
      }));

      gridCacheExpiry = now + 3_600_000;
      console.log(
        `[SafetyGrid] Loaded ${cells.length} cells, scored with XGBoost`
      );
      return gridCache;
    }
  } catch (err) {
    console.error("[SafetyGrid] DB error:", err);
  }
  return [];
}

function quickHaversine(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371,
    dLat = ((lat2 - lat1) * Math.PI) / 180,
    dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scorePoint(
  lat: number,
  lon: number,
  grid: GridCell[],
  isNight: boolean,
  isLateNight: boolean,
  isDayPeak: boolean
): number {
  const MAX_DIST = 2.0;
  let tw = 0,
    ws = 0,
    wNight = 0,
    wTraffic = 0,
    wLight = 0;
  let dominantArea = "residential";
  let maxW = 0;

  for (const c of grid) {
    if (
      Math.abs(c.latitude - lat) > 0.025 ||
      Math.abs(c.longitude - lon) > 0.03
    )
      continue;
    const d = quickHaversine(lat, lon, c.latitude, c.longitude);
    if (d > MAX_DIST) continue;
    const w = 1 / (d + 0.1);
    tw += w;
    // ✅ Use XGBoost score instead of raw baseSafetyScore
    ws += (c.xgbScore ?? 50) * w;
    wNight += c.nightRiskFactor * w;
    wTraffic += c.trafficDensity * w;
    wLight += c.streetLightDensity * w;
    if (w > maxW) {
      maxW = w;
      dominantArea = c.areaType;
    }
  }

  if (tw === 0) return 50;

  let score = ws / tw;
  const nightRisk = wNight / tw;
  const avgTraffic = wTraffic / tw;
  const avgLight = wLight / tw;

  if (isNight) {
    const areaMultiplier =
      dominantArea === "residential" || dominantArea === "govt" ? 0.6 : 1.0;
    const trafficPenalty = avgTraffic < 4 ? (4 - avgTraffic) * 2 : 0;
    const lightPenalty = avgLight < 5 ? (5 - avgLight) * 1.8 : 0;
    score -= (nightRisk * 22 + trafficPenalty + lightPenalty) * areaMultiplier;
  }
  if (isLateNight) {
    const lateMultiplier =
      dominantArea === "residential" || dominantArea === "govt" ? 0.5 : 1.0;
    score -= (nightRisk * 10 + 3) * lateMultiplier;
  }
  if (isDayPeak) score += 4;

  return Math.max(0, Math.min(100, score));
}

export async function calculateRouteSafetyScore(
  geometry: [number, number][],
  routeDistanceKm: number
): Promise<number> {
  if (geometry.length < 2) return 50;
  const grid = await loadGrid();

  const hour = new Date().getUTCHours() + 5;
  const adj = hour >= 24 ? hour - 24 : hour;
  const isNight = adj >= 20 || adj < 5;
  const isLateNight = adj >= 23 || adj < 4;
  const isDayPeak = adj >= 8 && adj <= 18;

  const step = Math.max(1, Math.floor(geometry.length / 60));
  const samples = geometry.filter((_, i) => i % step === 0);

  const scores = samples.map(([lat, lon]) =>
    scorePoint(lat, lon, grid, isNight, isLateNight, isDayPeak)
  );
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  const worst20 = sorted.slice(0, Math.max(1, Math.floor(n * 0.2)));
  const worst20avg = worst20.reduce((s, v) => s + v, 0) / worst20.length;
  const overallAvg = scores.reduce((s, v) => s + v, 0) / n;
  const absMin = sorted[0];

  const final = worst20avg * 0.5 + overallAvg * 0.3 + absMin * 0.2;
  let penalty = 0;
  if (routeDistanceKm > 15) penalty = 3;
  if (routeDistanceKm > 30) penalty = 6;

  return Math.max(5, Math.min(95, Math.round(final - penalty)));
}