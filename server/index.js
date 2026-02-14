import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SEATS_AERO_API_KEY;
const BASE_URL = 'https://seats.aero/partnerapi';

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasApiKey: !!API_KEY });
});

// Proxy: Cached Search
app.get('/api/search', async (req, res) => {
    try {
        const params = new URLSearchParams(req.query);
        const response = await fetch(`${BASE_URL}/search?${params.toString()}`, {
            headers: { 'Partner-Authorization': API_KEY },
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to fetch search results' });
    }
});

// Proxy: Get Availability
app.get('/api/availability', async (req, res) => {
    try {
        const params = new URLSearchParams(req.query);
        const response = await fetch(`${BASE_URL}/availability?${params.toString()}`, {
            headers: { 'Partner-Authorization': API_KEY },
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Availability error:', error);
        res.status(500).json({ error: 'Failed to fetch availability' });
    }
});

// Proxy: Get Trips
app.get('/api/trips/:id', async (req, res) => {
    try {
        const response = await fetch(`${BASE_URL}/trips/${req.params.id}`, {
            headers: { 'Partner-Authorization': API_KEY },
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Trips error:', error);
        res.status(500).json({ error: 'Failed to fetch trip details' });
    }
});

// Proxy: Get Routes
app.get('/api/routes', async (req, res) => {
    try {
        const params = new URLSearchParams(req.query);
        const response = await fetch(`${BASE_URL}/routes?${params.toString()}`, {
            headers: { 'Partner-Authorization': API_KEY },
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Routes error:', error);
        res.status(500).json({ error: 'Failed to fetch routes' });
    }
});

app.listen(PORT, () => {
    console.log(`✈️  Aeroscan API proxy running on http://localhost:${PORT}`);
    console.log(`   API Key: ${API_KEY ? '✅ loaded' : '❌ missing — check .env'}`);
});
