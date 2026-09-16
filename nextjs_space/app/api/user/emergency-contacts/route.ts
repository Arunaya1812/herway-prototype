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

    const contacts = await prisma.emergencyContact.findMany({
      where: { userId: user.id },
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error("Emergency contacts fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, name, relationship, isPrimaryPoliceContact } =
      await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const contact = await prisma.emergencyContact.create({
      data: {
        userId: user.id,
        email,
        name,
        relationship,
        isPrimaryPoliceContact: isPrimaryPoliceContact || false,
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Emergency contact creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, email, name, relationship, isPrimaryPoliceContact } =
      await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify contact belongs to user
    const existingContact = await prisma.emergencyContact.findUnique({
      where: { id },
    });

    if (!existingContact || existingContact.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contact = await prisma.emergencyContact.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(name && { name }),
        ...(relationship && { relationship }),
        ...(isPrimaryPoliceContact !== undefined && {
          isPrimaryPoliceContact,
        }),
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Emergency contact update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify contact belongs to user
    const existingContact = await prisma.emergencyContact.findUnique({
      where: { id },
    });

    if (!existingContact || existingContact.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.emergencyContact.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Emergency contact deletion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}