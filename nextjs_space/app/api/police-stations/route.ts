export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getPoliceStations, getNearestPoliceStations } from "@/lib/ml-data";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const city = searchParams.get("city");
    const count = parseInt(searchParams.get("count") || "3");

    if (!city) {
      return NextResponse.json(
        { error: "City parameter required" },
        { status: 400 }
      );
    }

    if (lat && lon) {
      // Get nearest police stations
      const nearest = getNearestPoliceStations(
        parseFloat(lat),
        parseFloat(lon),
        city,
        count
      );
      return NextResponse.json(nearest);
    }

    // Get all police stations for the city from database
    const stations = await prisma.policeStation.findMany({
      where: { city },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(stations);
  } catch (error) {
    console.error("Police stations fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
