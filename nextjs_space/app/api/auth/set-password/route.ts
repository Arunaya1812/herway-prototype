export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Verify OTP was verified for this email
    const otpRecord = await prisma.otpToken.findUnique({ where: { email: emailLower } });
    if (!otpRecord || !otpRecord.verified) {
      return NextResponse.json({ error: "Email not verified. Please complete OTP verification first." }, { status: 403 });
    }

    // Hash password and update user
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { email: emailLower },
      data: { password: hashedPassword },
    });

    // Clean up OTP
    await prisma.otpToken.delete({ where: { email: emailLower } }).catch(() => {});

    return NextResponse.json({ success: true, message: "Password set successfully" });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
