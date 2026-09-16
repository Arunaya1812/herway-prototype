import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding test user...");

  try {
    // Hash the test password
    const hashedPassword = await bcrypt.hash("johndoe123", 10);

    // Create test user
    const user = await prisma.user.upsert({
      where: { email: "john@doe.com" },
      update: {},
      create: {
        email: "john@doe.com",
        name: "John Doe",
        password: hashedPassword,
        
      },
    });

    console.log("✓ Test user created:", user.email);
  } catch (error) {
    console.error("Seed error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
