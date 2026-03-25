const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

let db;
const client = new MongoClient(process.env.MONGODB_URI);

client.connect().then(() => {
    db = client.db('seraph_licenses');
    console.log('✅ MongoDB connected');
}).catch(err => console.error('MongoDB connection error:', err));

const getLicensesCollection = () => db.collection('licenses');

app.post('/api/auth', async (req, res) => {
    const { hwid, key } = req.body;
    if (!hwid || !key) {
        return res.status(400).json({ error: 'Missing hwid or key' });
    }

    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not ready' });
        }

        const collection = getLicensesCollection();
        const license = await collection.findOne({ key });

        if (!license) {
            return res.status(403).json({ error: 'Invalid key' });
        }

        if (!license.hwid) {
            await collection.updateOne(
                { key },
                { $set: { hwid, usedAt: new Date() } }
            );
        } else if (license.hwid !== hwid) {
            return res.status(403).json({ error: 'Key already used on another machine' });
        }

        const now = new Date();
        const expiresAt = new Date(license.expiresAt);
        if (expiresAt < now) {
            return res.status(403).json({ error: 'Key expired' });
        }

        const token = jwt.sign({ hwid, key }, process.env.JWT_SECRET, { expiresIn: '10m' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Vercel potřebuje export app jako handler
module.exports = app;
