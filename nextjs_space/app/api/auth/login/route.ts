export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // This is handled by NextAuth credentials provider
  // Redirect to NextAuth signIn instead
  return NextResponse.json(
    { error: "Use NextAuth signIn instead" },
    { status: 400 }
  );
}