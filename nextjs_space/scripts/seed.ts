import { prisma } from "../lib/prisma";
import { POLICE_STATIONS } from "./police-stations-data";

async function main() {
  console.log("Starting database seed...");

  try {
    // Seed police stations for Delhi
    for (const station of POLICE_STATIONS.delhi) {
      await prisma.policeStation.upsert({
        where: {
          city_name: {
            city: "delhi",
            name: station.name,
          },
        },
        update: {},
        create: {
          city: "delhi",
          name: station.name,
          latitude: station.lat,
          longitude: station.lon,
          phoneNumber: station.contact,
          email: `${station.name.toLowerCase().replace(/\s+/g, "_")}@delhi.police.gov.in`,
          address: station.address,
        },
      });
    }

    // Seed police stations for Mumbai
    for (const station of POLICE_STATIONS.mumbai) {
      await prisma.policeStation.upsert({
        where: {
          city_name: {
            city: "mumbai",
            name: station.name,
          },
        },
        update: {},
        create: {
          city: "mumbai",
          name: station.name,
          latitude: station.lat,
          longitude: station.lon,
          phoneNumber: station.contact,
          email: `${station.name.toLowerCase().replace(/\s+/g, "_")}@mumbai.police.gov.in`,
          address: station.address,
        },
      });
    }

    console.log("✓ Police stations seeded successfully");
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