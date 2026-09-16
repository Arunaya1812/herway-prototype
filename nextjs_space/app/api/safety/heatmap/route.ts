export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city")?.toLowerCase() || "delhi";

    const cells = await prisma.safetyGridCell.findMany({
      where: { city },
      select: {
        latitude: true, longitude: true, baseSafetyScore: true,
        crimeRateWomen: true, streetLightDensity: true,
        policeProximityScore: true, wineShopProximityScore: true,
        cctvCoverage: true, trafficDensity: true,
        nightRiskFactor: true, areaType: true,
      },
    });

    if (!cells.length) {
      return NextResponse.json({ error: "Heatmap data not found" }, { status: 404 });
    }

    return NextResponse.json(cells.map(c => ({
      lat: c.latitude, lon: c.longitude, safety_score: c.baseSafetyScore,
      crime_rate_women: c.crimeRateWomen, street_light: c.streetLightDensity,
      police_proximity: c.policeProximityScore, wine_shop_proximity: c.wineShopProximityScore,
      cctv: c.cctvCoverage, traffic: c.trafficDensity,
      night_risk: c.nightRiskFactor, area_type: c.areaType,
    })));
  } catch (error) {
    console.error("Heatmap fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
