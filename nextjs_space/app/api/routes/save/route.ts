export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { startPoint, endPoint, routeType, safetyScore, distance, duration, routeData } = await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const savedRoute = await prisma.savedRoute.create({
      data: {
        userId: user.id,
        startPoint: JSON.stringify(startPoint),
        endPoint: JSON.stringify(endPoint),
        routeType,
        safetyScore,
        distance,
        duration,
        routeData: JSON.stringify(routeData),
      },
    });

    return NextResponse.json({
      success: true,
      route: savedRoute,
    });
  } catch (error) {
    console.error("Route save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
