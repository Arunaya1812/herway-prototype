export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const routes = await prisma.savedRoute.findMany({
      where: { userId: user.id },
      orderBy: { savedAt: "desc" },
      take: 50,
    });

    const formattedRoutes = routes.map((route) => ({
      ...route,
      startPoint: JSON.parse(route.startPoint),
      endPoint: JSON.parse(route.endPoint),
      routeData: JSON.parse(route.routeData),
    }));

    return NextResponse.json(formattedRoutes);
  } catch (error) {
    console.error("Route history fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
