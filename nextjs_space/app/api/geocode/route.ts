export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    const isReverse = searchParams.get("reverse") === "1";

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Reverse geocoding: convert lat,lon to address
    if (isReverse) {
      const parts = query.split(",").map(s => s.trim());
      if (parts.length >= 2) {
        const [lat, lon] = parts;
        try {
          const revRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
            { headers: { "User-Agent": "HerWay-SafetyApp/1.0", "Accept-Language": "en" } }
          );
          if (revRes.ok) {
            const revData = await revRes.json();
            if (revData.display_name) {
              return NextResponse.json({ results: [{ name: revData.display_name, lat: parseFloat(lat), lon: parseFloat(lon), type: revData.type || "place", importance: 1 }] });
            }
          }
        } catch {}
      }
      return NextResponse.json({ results: [] });
    }

    // Use Nominatim for geocoding (free, no API key)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&addressdetails=1`,
      {
        headers: {
          "User-Agent": "HerWay-SafetyApp/1.0",
          "Accept-Language": "en",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = await response.json();
    const results = data.map((item: any) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Geocode error:", error);
    return NextResponse.json({ results: [] });
  }
}
