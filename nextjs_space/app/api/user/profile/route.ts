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
      include: {
        emergencyContacts: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city,
      preferredPhoneStations: user.preferredPhoneStations,
      emergencyContacts: user.emergencyContacts,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const email = session.user.email;

    // Delete all related records then the user
    await prisma.$transaction(async (tx) => {
      await tx.emergencyContact.deleteMany({ where: { user: { email } } });
      await tx.savedRoute.deleteMany({ where: { user: { email } } });
      await tx.safetyReport.deleteMany({ where: { user: { email } } });
      await tx.account.deleteMany({ where: { user: { email } } });
      await tx.session.deleteMany({ where: { user: { email } } });
      await tx.otpToken.deleteMany({ where: { email } });
      await tx.user.delete({ where: { email } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account delete error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, city, preferredPhoneStations } = await request.json();

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        ...(name && { name }),
        ...(city && { city }),
        ...(preferredPhoneStations && { preferredPhoneStations }),
      },
      include: {
        emergencyContacts: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city,
      preferredPhoneStations: user.preferredPhoneStations,
      emergencyContacts: user.emergencyContacts,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}