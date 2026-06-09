import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cron from "node-cron";
import axios from "axios";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8000;
const mongoUri = process.env.MONGO_URI;
const authPassword = process.env.AUTH_PASSWORD || "admin";
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";

// Middleware to parse JSON bodies
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

const requireAuth = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        jwt.verify(token, jwtSecret);
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};

const pingAllUrls = async () => {
    const collection = db.collection("urls");
    const urls = await collection.find({ enabled: { $ne: false } }).toArray();
    const results = [];
    for (const { url } of urls) {
        try {
            const response = await axios.get(url);
            console.log(`Pinged ${url} - Status: ${response.status}`);
            results.push({ url, status: response.status, ok: true });
        } catch (error) {
            console.error(`Failed to ping ${url}:`, error.message);
            results.push({ url, status: null, ok: false, error: error.message });
        }
    }
    return results;
};

app.post("/login", (req, res) => {
    const { password } = req.body;
    if (!password || password !== authPassword) {
        return res.status(401).json({ error: "Incorrect password" });
    }
    const token = jwt.sign({ user: "admin" }, jwtSecret, { expiresIn: "7d" });
    res.status(200).json({ token });
});

// Connect to MongoDB
let db;
MongoClient.connect(mongoUri)
    .then((client) => {
        console.log("Connected to MongoDB");
        db = client.db("website-auto-pinger");
    })
    .catch((err) => {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1);
    });

// Route to add URLs to the database
app.post("/add-url", requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).send("URL is required");
    }

    try {
        const collection = db.collection("urls");
        await collection.insertOne({ url, enabled: true, createdAt: new Date() });
        res.status(201).send("URL added successfully");
    } catch (error) {
        console.error("Error adding URL:", error);
        res.status(500).send("Error adding URL");
    }
});

// Route to list all URLs
app.get("/list-urls", requireAuth, async (req, res) => {
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
app.delete("/remove-url/:id", requireAuth, async (req, res) => {
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

app.patch("/toggle-url/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
        return res.status(400).send("enabled (boolean) is required");
    }

    try {
        const collection = db.collection("urls");
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { enabled } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send("URL not found");
        }

        res.status(200).send("URL updated successfully");
    } catch (error) {
        console.error("Error updating URL:", error);
        res.status(500).send("Error updating URL");
    }
});

app.post("/ping-now", requireAuth, async (req, res) => {
    try {
        const results = await pingAllUrls();
        res.status(200).json(results);
    } catch (error) {
        console.error("Error during manual ping:", error);
        res.status(500).send("Error pinging URLs");
    }
});

// Cron job to ping URLs in the database every minute
cron.schedule("*/1 * * * *", async () => {
    console.log("Pinging URLs...");
    try {
        await pingAllUrls();
    } catch (error) {
        console.error("Error during cron job execution:", error);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
