# HerWay — Local Setup Guide

This guide helps you run HerWay on your own machine, independent of any cloud services.

---

## Prerequisites

- **Node.js** 18+ → [nodejs.org](https://nodejs.org)
- **PostgreSQL** 14+ → [postgresql.org/download](https://postgresql.org/download)
- **Git** (to manage code)
- **yarn** (`npm install -g yarn`)

---

## Step 1: Download & Extract

Copy the `herway_local/` folder to your machine (the export zip you downloaded).

```bash
cd herway_local
```

---

## Step 2: Install Dependencies

```bash
yarn install
```

---

## Step 3: Set Up PostgreSQL

### Option A: Local PostgreSQL

1. Install PostgreSQL and start it.
2. Create a database:
   ```bash
   psql -U postgres
   CREATE DATABASE herway;
   \q
   ```
3. Note your connection string:
   ```
   postgresql://postgres:YOUR_PASSWORD@localhost:5432/herway
   ```

### Option B: Free Cloud PostgreSQL (if you don't want to install locally)

- **Neon.tech** — free tier, 0.5GB → [neon.tech](https://neon.tech)
- **Supabase** — free tier → [supabase.com](https://supabase.com)
- **Railway** — free tier → [railway.app](https://railway.app)

Just copy the connection string they give you.

---

## Step 4: Configure Environment

Rename `.env.local.example` to `.env` (or create `.env`):

```env
# DATABASE — replace with your PostgreSQL connection string
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/herway"

# AUTH — generate a random secret (run: openssl rand -base64 32)
NEXTAUTH_SECRET="paste-a-random-32-char-string-here"
NEXTAUTH_URL="http://localhost:3000"

# GOOGLE OAUTH (optional — remove if you don't need Google login)
# Create credentials at https://console.cloud.google.com/apis/credentials
# Add http://localhost:3000/api/auth/callback/google as authorized redirect URI
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

> **Note:** Google OAuth is optional. Email+password login works without it.

---

## Step 5: Fix Prisma for Local

The schema has a hardcoded output path. Fix it:

In `prisma/schema.prisma`, change:
```prisma
generator client {
    provider = "prisma-client-js"
    binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"]
    output = "/home/ubuntu/herway/nextjs_space/node_modules/.prisma/client"
}
```

To:
```prisma
generator client {
    provider = "prisma-client-js"
}
```

Then run:
```bash
npx prisma generate
npx prisma db push
```

This creates all database tables.

---

## Step 6: Seed the Database

The app needs safety grid data + police stations:

```bash
# Seed police stations
npx tsx scripts/seed.ts

# Seed the XGBoost safety grid (2,448 Delhi cells)
npx tsx scripts/seed-safety-grid.ts

# Seed test user (optional — creates john@doe.com / johndoe123)
npx tsx scripts/seed-test-user.ts
```

---

## Step 7: Email — What to Replace

The app uses a cloud email API for sending OTPs and SOS alerts.
Locally, you have 3 options:

### Option A: Use Nodemailer (free with Gmail)

Install:
```bash
yarn add nodemailer @types/nodemailer
```

Create `lib/send-email.ts`:
```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Use App Password, not real password
  },
});

export async function sendEmail(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: `"HerWay" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}
```

Add to `.env`:
```env
GMAIL_USER="your-gmail@gmail.com"
GMAIL_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

To get a Gmail App Password: Google Account → Security → 2-Step Verification → App Passwords.

Then replace the `fetch("https://apps.abacus.ai/api/sendNotificationEmail", ...)` calls in these 3 files:
- `app/api/auth/send-otp/route.ts`
- `app/api/auth/forgot-password/route.ts`
- `app/api/emergency/sos/route.ts`

With:
```typescript
import { sendEmail } from "@/lib/send-email";
await sendEmail(recipientEmail, subject, htmlBody);
```

### Option B: Console Log (simplest — for dev/demo)

Just replace the fetch calls with:
```typescript
console.log(`[EMAIL] To: ${emailLower}, OTP: ${otp}`);
```

The OTP will print in your terminal — copy it manually during demos.

### Option C: Skip emails entirely

Comment out the email sending blocks. The app still works — OTPs are stored in the database, you can read them with:
```bash
psql -U postgres -d herway -c "SELECT email, code FROM \"OtpToken\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```

> **Note:** If using Option B or C, the OTP is hashed in the DB. For dev convenience with Option C, you may temporarily remove the hashing in `send-otp/route.ts` so you can read the plaintext OTP from the DB.

---

## Step 8: Run the App

```bash
yarn dev
```

Open **http://localhost:3000** in your browser. That's it!

---

## Step 9: Build for Production (Optional)

```bash
yarn build
yarn start
```

---

## What Works Without Any Cloud

| Feature | Works Locally? | Notes |
|---------|---------------|-------|
| Login (email+password) | ✅ Yes | Fully local |
| Sign up (OTP) | ✅ With email setup | Or use console.log for OTP |
| Forgot password | ✅ With email setup | Or use console.log |
| Route planning | ✅ Yes | Uses OSRM (free, no API key) |
| Safety heatmap | ✅ Yes | Uses local DB data |
| XGBoost safety model | ✅ Yes | Model JSON is local |
| SOS alerts | ✅ With email setup | Or console.log |
| Google login | ⚠️ Needs Google OAuth credentials | Optional — skip if not needed |
| Map display | ✅ Yes | Uses OpenStreetMap (free) |
| Navigation | ✅ Yes | Uses browser GPS |
| Police station lookup | ✅ Yes | Uses local JSON data |

---

## ML Metrics (for Presentations)

Run the metrics script anytime:
```bash
npx tsx scripts/ml-metrics.ts
```

Key results: R²=0.96, Accuracy=97.18%, RMSE=3.07

---

## Folder Structure (Key Files)

```
herway_local/
├── app/                    # Pages & API routes
│   ├── api/auth/           # Login, signup, OTP, forgot-password
│   ├── api/emergency/      # SOS endpoint
│   ├── api/routes/         # Route generation with XGBoost
│   ├── components/         # UI components
│   ├── dashboard/          # Main dashboard
│   └── login/              # Auth pages
├── lib/                    # Utilities (auth, safety scoring, DB)
├── prisma/schema.prisma    # Database schema
├── public/data/            # XGBoost model JSON
├── scripts/                # Seeders & ML metrics
└── .env                    # Your local config
```

---

## Troubleshooting

**"Can't reach database"** → Check PostgreSQL is running and DATABASE_URL is correct.

**"prisma client not found"** → Run `npx prisma generate` again.

**"Module not found"** → Run `yarn install` again.

**Maps not loading** → Ensure you have internet (OpenStreetMap tiles need connectivity).

**Google login not working** → Make sure redirect URI in Google Console matches `http://localhost:3000/api/auth/callback/google`.
