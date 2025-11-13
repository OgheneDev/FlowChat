import express from "express";
import mongoose from "mongoose";

export const devRouter = express.Router();

// 🔐 Only allow this in development mode
devRouter.delete("/clear-database", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Not allowed in production" });
    }

    const collections = mongoose.connection.collections;

    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    res.status(200).json({ message: "✅ All collections cleared successfully" });
  } catch (error) {
    console.error("Error clearing database:", error);
    res.status(500).json({ error: "Failed to clear database" });
  }
});

// 💣 Optional: Drop the whole DB
devRouter.delete("/drop-database", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Not allowed in production" });
    }

    await mongoose.connection.dropDatabase();
    res.status(200).json({ message: "💥 Database dropped successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to drop database" });
  }
});
