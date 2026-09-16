export const dynamic = "force-dynamic";

import { sendEmail } from "@/lib/send-email";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email, name } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Check if user already exists with a password (they should use Sign In)
    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingUser && existingUser.password) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in with your password." },
        { status: 409 }
      );
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Hash OTP before storing
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // Create user if not exists (without password)
    if (!existingUser) {
      await prisma.user.create({
        data: {
          email: emailLower,
          name: name || email.split("@")[0],
          emailVerified: null,
        },
      });
    }

    // Clean up expired OTPs across the system
    await prisma.otpToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    // Store hashed OTP
    await prisma.otpToken.upsert({
      where: { email: emailLower },
      update: { code: hashedOtp, expiresAt, attempts: 0, verified: false, name: name || undefined },
      create: { email: emailLower, code: hashedOtp, expiresAt, attempts: 0, name: name || null },
    });

    // Send OTP email
    const appUrl = process.env.NEXTAUTH_URL || "";
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🛡️ HerWay</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">Your Safety, Our Priority</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">Your one-time verification code is:</p>
          <div style="background: #f0fdf4; border: 2px solid #10B981; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 20px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #065f46;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
      </div>
    `;

    try {
      await sendEmail(
        emailLower,
        `${otp} is your HerWay verification code`,
        htmlBody
      );
    } catch (err) {
      console.error("OTP email error:", err);
    }

    return NextResponse.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
