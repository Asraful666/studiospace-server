import "dotenv/config";
import { ObjectId } from "mongodb";
import { connectDB, closeDB } from "./config/db.js";

const demoStudios = [
  {
    id: "000000000000000000000101",
    title: "Daylight Creative Loft",
    category: "Photo Studio",
    hourlyRate: 45,
    securityDeposit: 100,
    maxCapacity: 12,
    location: "Dhanmondi, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Natural Light", "WiFi", "Air Conditioning", "Changing Room"],
    overview:
      "A bright creative loft for portraits, product photography, and small content teams. Large windows provide soft daylight, with flexible furniture for different setups.",
  },
  {
    id: "000000000000000000000102",
    title: "Framehouse Production Stage",
    category: "Film Stage",
    hourlyRate: 95,
    securityDeposit: 250,
    maxCapacity: 25,
    location: "Tejgaon, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Lighting Equipment", "Parking", "WiFi", "Changing Room"],
    overview:
      "A flexible production space for interviews, short films, and branded content. The open floor accommodates compact sets, lighting equipment, and a production crew.",
  },
  {
    id: "000000000000000000000103",
    title: "The Conversation Room",
    category: "Podcast Lounge",
    hourlyRate: 30,
    securityDeposit: 60,
    maxCapacity: 4,
    location: "Banani, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Microphones", "Headphones", "WiFi", "Air Conditioning"],
    overview:
      "An intimate recording room for conversations, interviews, and audio storytelling. A simple setup helps small teams focus on their discussion and recording.",
  },
  {
    id: "000000000000000000000104",
    title: "Echo Music Suite",
    category: "Music Suite",
    hourlyRate: 55,
    securityDeposit: 120,
    maxCapacity: 6,
    location: "Zindabazar, Sylhet",
    imageUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Microphones", "Headphones", "Audio Interface", "Air Conditioning"],
    overview:
      "A focused space for vocal sessions, instrumental demos, and songwriting. Suitable for solo artists and small groups developing their next recording.",
  },
  {
    id: "000000000000000000000105",
    title: "Clay & Canvas Workshop",
    category: "Workshop",
    hourlyRate: 25,
    securityDeposit: 50,
    maxCapacity: 15,
    location: "Uttara, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Work Tables", "Wash Area", "WiFi", "Natural Light"],
    overview:
      "A welcoming workshop space for illustration, craft sessions, and creative classes. Shared work tables support hands-on learning and small group activities.",
  },
  {
    id: "000000000000000000000106",
    title: "Minimal Product Studio",
    category: "Photo Studio",
    hourlyRate: 40,
    securityDeposit: 80,
    maxCapacity: 8,
    location: "Gulshan, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80",
    amenities: ["Backdrops", "Lighting Equipment", "WiFi", "Air Conditioning"],
    overview:
      "A compact studio for product launches, ecommerce photography, and tabletop content. Neutral backdrops and a practical layout keep the focus on your products.",
  },
];

async function seed() {
  try {
    const db = await connectDB();
    const collection = db.collection("studios");
    let inserted = 0;

    for (const studio of demoStudios) {
      const { id, ...details } = studio;

      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        {
          $setOnInsert: {
            ...details,
            gallery: [details.imageUrl],
            ownerName: "StudioSpace Demo Host",
            ownerEmail: "demo-host@example.com",
            rating: 0,
            reviewCount: 0,
            isDemo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      inserted += result.upsertedCount;
    }

    console.log(`Inserted ${inserted} new demo studios.`);
    console.log(`Total studios: ${await collection.countDocuments()}`);
  } catch (error) {
    console.error("Seed failed:", error.name);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

seed();