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

    const { latitude, longitude, selectedRoute } = await request.json();

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: "Missing location data" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { emergencyContacts: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.emergencyContacts.length === 0) {
      return NextResponse.json(
        { error: "No emergency contacts configured" },
        { status: 400 }
      );
    }

    // Prepare emergency alert data
    const emergencyData = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      location: { lat: latitude, lon: longitude },
      route: selectedRoute,
      timestamp: new Date().toISOString(),
      emergencyContacts: user.emergencyContacts,
    };

    // Send emails to emergency contacts
    const emergencyContactEmails = user.emergencyContacts
      .filter((contact) => contact.email)
      .map((contact) => contact.email);

    if (emergencyContactEmails.length > 0) {
      // Send SOS emails to emergency contacts
      for (const contactEmail of emergencyContactEmails) {
        await sendSOSEmail(contactEmail, emergencyData);
      }
    }

    return NextResponse.json({
      success: true,
      message: "SOS alert sent successfully",
      contactsNotified: emergencyContactEmails.length,
    });
  } catch (error) {
    console.error("SOS error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

async function sendSOSEmail(
  recipientEmail: string,
  emergencyData: any
) {
  try {
    const htmlBody = generateContactEmailHTML(emergencyData);

    const appUrl = process.env.NEXTAUTH_URL || "https://herway.abacusai.app";
    const senderEmail = `noreply@${new URL(appUrl).hostname}`;

    const response = await fetch(
      "https://apps.abacus.ai/api/sendNotificationEmail",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_EMERGENCY_SOS_ALERT,
          subject: `🚨 EMERGENCY SOS: Your contact needs help`,
          body: htmlBody,
          is_html: true,
          recipient_email: recipientEmail,
          sender_email: senderEmail,
          sender_alias: "HerWay Emergency",
        }),
      }
    );

    const result = await response.json();
    if (!result.success) {
      console.error(`Failed to send SOS email to ${recipientEmail}:`, result);
    }
  } catch (error) {
    console.error(`Error sending SOS email:`, error);
  }
}

function generateContactEmailHTML(emergencyData: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
      <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">🚨 EMERGENCY ALERT</h1>
      </div>
      <div style="padding: 30px; background: white;">
        <p style="font-size: 16px; color: #1f2937; margin-bottom: 20px;">
          <strong>${emergencyData.userName}</strong> has triggered an emergency SOS alert.
        </p>
        <div style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #991B1B;"><strong>📍 Last Known Location:</strong></p>
          <p style="margin: 5px 0 0 0; color: #991B1B;">Latitude: ${emergencyData.location.lat.toFixed(4)}, Longitude: ${emergencyData.location.lon.toFixed(4)}</p>
        </div>
        <div style="background: #F3F4F6; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #374151;"><strong>⏰ Time:</strong> ${new Date(emergencyData.timestamp).toLocaleString()}</p>
          <p style="margin: 10px 0 0 0; color: #374151;"><strong>📧 Contact Email:</strong> ${emergencyData.userEmail}</p>
        </div>
        <p style="font-size: 12px; color: #6B7280; margin-top: 20px; text-align: center;">
          This is an automated emergency alert from HerWay Safety System.
        </p>
      </div>
    </div>
  `;
}


