import "dotenv/config";
import { MongoClient } from "mongodb";

let client;
let database;

export async function connectDB() {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME;

  if (!uri || !databaseName) {
    throw new Error(
      "MONGODB_URI and MONGODB_DB_NAME are required in .env"
    );
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();

    const db = client.db(databaseName);

    await db.command({ ping: 1 });

    await db.collection("studios").createIndex({
      createdAt: -1,
      _id: -1,
    });

    database = db;

    console.log(`MongoDB connected: ${databaseName}`);

    return database;
  } catch (error) {
    await client.close();
    client = undefined;
    throw error;
  }
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
}