import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SEATS_AERO_API_KEY;
const BASE_URL = 'https://seats.aero/partnerapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load airports into memory
const airportsPath = path.join(__dirname, 'data', 'airports.json');
let AIRPORTS_DATA = [];
try {
    if (fs.existsSync(airportsPath)) {
        AIRPORTS_DATA = JSON.parse(fs.readFileSync(airportsPath, 'utf8'));
        console.log(`✈️  Loaded ${AIRPORTS_DATA.length} airports into memory.`);
    } else {
        console.warn('⚠️  airports.json not found. Autocomplete will be empty.');
    }
} catch (error) {
    console.error('❌ Failed to load airports:', error);
}

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
        const apiUrl = `${BASE_URL}/search?${params.toString()}`;

        console.log(`🔍 [Search Request] ${apiUrl}`);
        console.log(`   Params:`, req.query);

        const response = await fetch(apiUrl, {
            headers: { 'Partner-Authorization': API_KEY },
        });

        if (!response.ok) {
            console.error(`❌ External API Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`   Body: ${text}`);
            return res.status(response.status).json({ error: 'External API error', details: text });
        }

        const data = await response.json();
        console.log(`✅ [Search Success] Got ${data.data ? data.data.length : 0} results`);

        if (data.data && data.data.length > 0) {
            console.log(`   First result sample:`, JSON.stringify(data.data[0], null, 2));
        } else {
            console.log(`   (No results found in data array)`);
        }

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

// Set of helper to fetch static airports
app.get('/api/airports', (req, res) => {
    res.json(AIRPORTS_DATA);
});

app.listen(PORT, () => {
    console.log(`✈️  Aeroscan API proxy running on http://localhost:${PORT}`);
    console.log(`   API Key: ${API_KEY ? '✅ loaded' : '❌ missing — check .env'}`);
});
