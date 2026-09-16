export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Check if user exists with a password
    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!existingUser || !existingUser.password) {
      // Don't reveal whether account exists — always say "sent"
      return NextResponse.json({ success: true, message: "If an account exists, a reset code has been sent." });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    // Clean up expired OTPs
    await prisma.otpToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    // Store hashed OTP
    await prisma.otpToken.upsert({
      where: { email: emailLower },
      update: { code: hashedOtp, expiresAt, attempts: 0, verified: false },
      create: { email: emailLower, code: hashedOtp, expiresAt, attempts: 0 },
    });

    // Send reset email
    const appUrl = process.env.NEXTAUTH_URL || "";
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🛡️ HerWay</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">Password Reset</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">Your password reset code is:</p>
          <div style="background: #f0fdf4; border: 2px solid #10B981; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 20px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #065f46;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
        </div>
      </div>
    `;

    try {
      await fetch("https://apps.abacus.ai/api/sendNotificationEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_EMAIL_OTP_VERIFICATION,
          subject: `${otp} is your HerWay password reset code`,
          body: htmlBody,
          is_html: true,
          recipient_email: emailLower,
          sender_email: appUrl ? `noreply@${new URL(appUrl).hostname}` : "noreply@herway.app",
          sender_alias: "HerWay Safety",
        }),
      });
    } catch (err) {
      console.error("Reset email error:", err);
    }

    return NextResponse.json({ success: true, message: "Reset code sent to your email" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Failed to send reset code" }, { status: 500 });
  }
}
