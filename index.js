import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cron from "node-cron";
import axios from "axios";

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 8000;
const mongoUri = process.env.MONGO_URI;

// Middleware to parse JSON bodies
app.use(express.json());

// Connect to MongoDB
let db;
MongoClient.connect(mongoUri)
    .then((client) => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1);
    });

// Route to add URLs to the database
app.post("/add-url", async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).send("URL is required");
    }

    try {
        const collection = db.collection("urls");
        await collection.insertOne({ url, createdAt: new Date() });
        res.status(201).send("URL added successfully");
    } catch (error) {
        console.error("Error adding URL:", error);
        res.status(500).send("Error adding URL");
    }
});

// Route to list all URLs
app.get("/list-urls", async (req, res) => {
    try {
        const collection = db.collection("urls");
        const urls = await collection.find().toArray();
        res.status(200).json(urls);
    } catch (error) {
        console.error("Error listing URLs:", error);
        res.status(500).send("Error listing URLs");
    }
});

// Route to remove a URL by ID
app.delete("/remove-url/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const collection = db.collection("urls");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).send("URL not found");
        }

        res.status(200).send("URL removed successfully");
    } catch (error) {
        console.error("Error removing URL:", error);
        res.status(500).send("Error removing URL");
    }
});

// Cron job to ping URLs in the database every minute
cron.schedule("*/1 * * * *", async () => {
    console.log("Pinging URLs...");
    try {
        const collection = db.collection("urls");
        const urls = await collection.find().toArray();
        console.log(urls);
        for (const { url } of urls) {
            try {
                const response = await axios.get(url);
                console.log(`Pinged ${url} - Status: ${response.status}`);
            } catch (error) {
                console.error(`Failed to ping ${url}:`, error.message);
            }
        }
    } catch (error) {
        console.error("Error during cron job execution:", error);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
