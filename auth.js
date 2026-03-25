const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

let db;
let client;

const connectDb = async () => {
    if (db) return db;
    try {
        client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        db = client.db('seraph_licenses');
        console.log('✅ MongoDB connected');
        return db;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
};

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { hwid, key } = req.body;
    if (!hwid || !key) return res.status(400).json({ error: 'Missing hwid or key' });

    try {
        const db = await connectDb();
        const collection = db.collection('licenses');
        const license = await collection.findOne({ key });

        if (!license) return res.status(403).json({ error: 'Invalid key' });

        // Bind HWID if first use
        if (!license.hwid) {
            await collection.updateOne({ key }, { $set: { hwid, usedAt: new Date() } });
        } else if (license.hwid !== hwid) {
            return res.status(403).json({ error: 'Key already used on another machine' });
        }

        if (new Date(license.expiresAt) < new Date()) {
            return res.status(403).json({ error: 'Key expired' });
        }

        const token = jwt.sign({ hwid, key }, process.env.JWT_SECRET, { expiresIn: '10m' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
