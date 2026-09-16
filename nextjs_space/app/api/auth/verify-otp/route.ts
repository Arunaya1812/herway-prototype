export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP are required" },
        { status: 400 }
      );
    }

    const otpRecord = await prisma.otpToken.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: "No OTP found. Please request a new one." },
        { status: 400 }
      );
    }

    // Check attempts (max 5)
    if (otpRecord.attempts >= 5) {
      await prisma.otpToken.delete({ where: { email: email.toLowerCase() } });
      return NextResponse.json(
        { error: "Too many attempts. Please request a new OTP." },
        { status: 429 }
      );
    }

    // Check expiry
    if (new Date() > otpRecord.expiresAt) {
      await prisma.otpToken.delete({ where: { email: email.toLowerCase() } });
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Increment attempts
    await prisma.otpToken.update({
      where: { email: email.toLowerCase() },
      data: { attempts: otpRecord.attempts + 1 },
    });

    // Hash the incoming OTP and compare with stored hash
    const hashedInput = crypto.createHash("sha256").update(otp.toString().trim()).digest("hex");
    if (otpRecord.code !== hashedInput) {
      return NextResponse.json(
        { error: `Invalid OTP. ${4 - otpRecord.attempts} attempts remaining.` },
        { status: 400 }
      );
    }

    // OTP is valid — create or find user
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Create new user (first-time login)
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: otpRecord.name || email.split("@")[0],
          emailVerified: new Date(),
        },
      });
    } else if (!user.emailVerified) {
      // Mark email as verified
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    // Mark OTP as verified and clear the code
    await prisma.otpToken.update({
      where: { email: email.toLowerCase() },
      data: { verified: true, code: "used" },
    });

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
