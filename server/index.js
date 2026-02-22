import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const PARTNER_API_URL = 'https://seats.aero/partnerapi';
const OAUTH_API_URL = 'https://seats.aero/oauth2';
const OAUTH_SCOPE = 'openid';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_RESULT_TTL_MS = 10 * 60 * 1000;

const OAUTH_CLIENT_ID = process.env.SEATS_AERO_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.SEATS_AERO_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI = process.env.SEATS_AERO_REDIRECT_URI || '';

const oauthStateStore = new Map();
const oauthResultStore = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load airports into memory
const airportsPath = path.join(__dirname, 'data', 'airports.json');
const profileTripsPath = path.join(__dirname, 'data', 'profile-trips.json');
const MAX_PROFILE_TRIPS = 100;
let AIRPORTS_DATA = [];
let PROFILE_TRIPS_STORE = { owners: {} };
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

function loadProfileTripsStore() {
    try {
        const dataDir = path.dirname(profileTripsPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(profileTripsPath)) {
            PROFILE_TRIPS_STORE = { owners: {} };
            return;
        }

        const raw = fs.readFileSync(profileTripsPath, 'utf8');
        const parsed = JSON.parse(raw);
        PROFILE_TRIPS_STORE = parsed && typeof parsed === 'object'
            ? { owners: parsed.owners || {} }
            : { owners: {} };
    } catch (error) {
        console.error('❌ Failed to load profile trips store:', error);
        PROFILE_TRIPS_STORE = { owners: {} };
    }
}

function persistProfileTripsStore() {
    try {
        fs.writeFileSync(profileTripsPath, JSON.stringify(PROFILE_TRIPS_STORE, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Failed to persist profile trips store:', error);
        throw error;
    }
}

function normalizeTripIdea(input) {
    if (!input || typeof input !== 'object') return null;
    const origin = String(input.origin || '').trim().toUpperCase();
    const destination = String(input.destination || '').trim().toUpperCase();
    const startDate = String(input.startDate || '').trim();
    const endDate = String(input.endDate || '').trim();
    const cabin = String(input.cabin || '').trim().toLowerCase();
    const seats = Number(input.seats);
    const id = String(input.id || '').trim();

    const allowedCabins = new Set(['economy', 'premium', 'business', 'first']);
    if (!id || !origin || !destination || !startDate || !endDate || !allowedCabins.has(cabin)) {
        return null;
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 9) {
        return null;
    }

    return {
        id,
        origin,
        destination,
        startDate,
        endDate,
        cabin,
        seats,
        createdAt: Number(input.createdAt) || Date.now(),
    };
}

function normalizeTripDefaults(input) {
    if (!input || typeof input !== 'object') return null;
    const cabin = String(input.cabin || '').trim().toLowerCase();
    const seats = Number(input.seats);
    const allowedCabins = new Set(['economy', 'premium', 'business', 'first']);
    if (!allowedCabins.has(cabin)) return null;
    if (!Number.isInteger(seats) || seats < 1 || seats > 9) return null;
    return { cabin, seats };
}

async function resolveProfileOwner(req, res, { silent = false } = {}) {
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers.authorization || '';
    const hasApiKey = Boolean(apiKeyHeader);
    const hasBearer = authHeader.startsWith('Bearer ');

    if (hasApiKey && hasBearer) {
        if (silent) return null;
        res.status(400).json({
            error: 'Provide exactly one auth mode: API key or OAuth bearer token.',
        });
        return null;
    }

    if (!hasApiKey && !hasBearer) {
        if (silent) return null;
        res.status(401).json({ error: 'No credentials provided.' });
        return null;
    }

    if (hasApiKey) {
        const apiKeyHash = crypto.createHash('sha256').update(String(apiKeyHeader)).digest('hex');
        return {
            ownerId: `api_key:${apiKeyHash}`,
            identityType: 'api_key',
            displayName: `API key ${apiKeyHash.slice(0, 8)}`,
        };
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
        if (silent) return null;
        res.status(401).json({ error: 'Invalid OAuth token.' });
        return null;
    }

    try {
        const userResponse = await fetch(`${OAUTH_API_URL}/userinfo`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!userResponse.ok) {
            if (silent) return null;
            res.status(401).json({ error: 'Unable to resolve OAuth user identity.' });
            return null;
        }

        const user = await userResponse.json();
        const subject = user?.sub || user?.id || user?.email;
        if (!subject) {
            if (silent) return null;
            res.status(401).json({ error: 'OAuth userinfo missing subject.' });
            return null;
        }

        const subjectHash = crypto.createHash('sha256').update(String(subject)).digest('hex');
        return {
            ownerId: `oauth:${subjectHash}`,
            identityType: 'oauth',
            displayName: user?.email || user?.name || 'OAuth user',
        };
    } catch (error) {
        console.error('Failed to resolve OAuth user identity:', error);
        if (silent) return null;
        res.status(500).json({ error: 'Failed to resolve OAuth identity.' });
        return null;
    }
}

loadProfileTripsStore();

// Helper: Build upstream Seats auth headers from frontend credentials.
// API key -> Partner-Authorization
// OAuth token -> Authorization: Bearer ...
function getSeatsAuthHeaders(req, res, { silent = false } = {}) {
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers.authorization || '';

    const hasApiKey = Boolean(apiKeyHeader);
    const hasBearer = authHeader.startsWith('Bearer ');

    // Enforce mutually exclusive auth modes.
    if (hasApiKey && hasBearer) {
        if (silent) return null;
        res.status(400).json({
            error: 'Provide exactly one auth mode: API key or OAuth bearer token.',
        });
        return null;
    }

    if (hasBearer) {
        const token = authHeader.slice('Bearer '.length).trim();
        return { 'Partner-Authorization': token };
    }

    if (hasApiKey) {
        return { 'Partner-Authorization': apiKeyHeader };
    }

    if (silent) return null;
    res.status(401).json({ error: 'No credentials provided. Connect OAuth or set API key in Settings.' });
    return null;
}

async function fetchPartnerApiWithFallback(req, url, authHeaders) {
    const incomingAuth = req.headers.authorization || '';
    const hasBearer = incomingAuth.startsWith('Bearer ');
    const bearerToken = hasBearer ? incomingAuth.slice('Bearer '.length).trim() : '';

    const attempts = [{ headers: authHeaders, label: 'primary' }];

    // OAuth fallback strategies: Seats docs are explicit for Partner-Authorization,
    // but this keeps compatibility if token format expectations differ.
    if (hasBearer) {
        attempts.push({
            headers: { 'Partner-Authorization': `Bearer ${bearerToken}` },
            label: 'partner-bearer',
        });
        attempts.push({
            headers: { Authorization: incomingAuth },
            label: 'authorization-bearer',
        });
    }

    let lastResponse = null;
    for (const attempt of attempts) {
        const response = await fetch(url, { headers: attempt.headers });
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 401 && response.status !== 403) return response;
    }

    return lastResponse;
}

function isOAuthConfigured() {
    return Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET && OAUTH_REDIRECT_URI);
}

function cleanupOAuthStates() {
    const now = Date.now();
    for (const [state, data] of oauthStateStore.entries()) {
        if (now - data.createdAt > OAUTH_STATE_TTL_MS) {
            oauthStateStore.delete(state);
        }
    }

    for (const [resultId, data] of oauthResultStore.entries()) {
        if (now - data.createdAt > OAUTH_RESULT_TTL_MS) {
            oauthResultStore.delete(resultId);
        }
    }
}

function storeOAuthResult(payload, origin = null) {
    cleanupOAuthStates();
    const resultId = crypto.randomBytes(24).toString('base64url');
    oauthResultStore.set(resultId, {
        createdAt: Date.now(),
        origin,
        payload,
    });
    return resultId;
}

function sanitizeOrigin(origin) {
    if (!origin || typeof origin !== 'string') return null;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null;
    }
}

function renderOAuthCallbackPage({ resultId, targetOrigin = null }) {
    const resultIdJson = JSON.stringify(resultId);
    const targetOriginJson = targetOrigin ? JSON.stringify(targetOrigin) : "'*'";
    const redirectHref = targetOrigin ? `${targetOrigin}/?oauth_result=${encodeURIComponent(resultId)}` : null;
    const redirectHrefJson = redirectHref ? JSON.stringify(redirectHref) : 'null';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Avioscanner OAuth</title>
  <style>
    body { font-family: Inter, -apple-system, system-ui, sans-serif; background: #0b1020; color: #dbe1f0; margin: 0; display: grid; place-items: center; min-height: 100vh; }
    .card { background: #121a2b; border: 1px solid #27324b; border-radius: 12px; padding: 20px; max-width: 520px; width: min(90vw, 520px); box-shadow: 0 12px 36px rgba(0,0,0,.35); }
    h1 { margin: 0 0 10px; font-size: 18px; }
    p { margin: 0; color: #a8b2cc; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Finalizing Seats.aero connection…</h1>
    <p>If this window does not close automatically, return to Avioscanner.</p>
  </div>
  <script>
    (() => {
      const resultId = ${resultIdJson};
      const targetOrigin = ${targetOriginJson};
      const redirectHref = ${redirectHrefJson};
      const message = { type: 'seats_oauth_result', resultId };

      if (window.opener) {
        window.opener.postMessage(message, targetOrigin);
        window.close();
      } else if (redirectHref) {
        window.location.replace(redirectHref);
      }
    })();
  </script>
</body>
</html>`;
}

app.use(cors());
app.use(express.json());

// Health check — validates the key against seats.aero
// Hits /availability with no params: valid key returns 400 (missing param), invalid key returns 401.
app.get('/api/health', async (req, res) => {
    const authHeaders = getSeatsAuthHeaders(req, res, { silent: true });
    if (!authHeaders) {
        return res.json({ status: 'ok', hasApiKey: false });
    }

    try {
        const response = await fetch(`${PARTNER_API_URL}/availability`, {
            headers: authHeaders,
        });

        // 401 = bad key, 400 = key accepted but missing params (i.e. valid key)
        const valid = response.status !== 401;
        return res.json({ status: 'ok', hasApiKey: valid });
    } catch {
        return res.json({ status: 'ok', hasApiKey: false });
    }
});

// OAuth status
app.get('/api/oauth/status', (req, res) => {
    res.json({
        enabled: isOAuthConfigured(),
        hasClientId: Boolean(OAUTH_CLIENT_ID),
        hasClientSecret: Boolean(OAUTH_CLIENT_SECRET),
        redirectUri: OAUTH_REDIRECT_URI || null,
    });
});

// OAuth start — redirect user to Seats consent screen
app.get('/api/oauth/start', (req, res) => {
    if (!isOAuthConfigured()) {
        return res.status(500).json({
            error: 'OAuth is not configured on the server.',
            missing: {
                SEATS_AERO_CLIENT_ID: !OAUTH_CLIENT_ID,
                SEATS_AERO_CLIENT_SECRET: !OAUTH_CLIENT_SECRET,
                SEATS_AERO_REDIRECT_URI: !OAUTH_REDIRECT_URI,
            },
        });
    }

    cleanupOAuthStates();
    const state = crypto.randomBytes(24).toString('base64url');
    const origin = sanitizeOrigin(req.query.origin);
    oauthStateStore.set(state, { createdAt: Date.now(), origin });

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
        state,
        scope: OAUTH_SCOPE,
    });

    return res.redirect(`${OAUTH_API_URL}/consent?${params.toString()}`);
});

// OAuth callback — exchange code for token and send result to popup opener
app.get('/api/oauth/callback', async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    let targetOrigin = null;
    if (typeof state === 'string') {
        cleanupOAuthStates();
        targetOrigin = oauthStateStore.get(state)?.origin || null;
    }

    if (error) {
        const message = errorDescription || String(error);
        const resultId = storeOAuthResult({ success: false, error: message }, targetOrigin);
        return res.send(renderOAuthCallbackPage({ resultId, targetOrigin }));
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        const resultId = storeOAuthResult({ success: false, error: 'Missing code or state in callback.' }, targetOrigin);
        return res.send(renderOAuthCallbackPage({ resultId, targetOrigin }));
    }

    cleanupOAuthStates();
    const stateData = oauthStateStore.get(state);
    oauthStateStore.delete(state);

    if (!stateData) {
        const resultId = storeOAuthResult({ success: false, error: 'Invalid or expired OAuth state.' }, targetOrigin);
        return res.send(renderOAuthCallbackPage({ resultId, targetOrigin }));
    }

    try {
        const tokenResponse = await fetch(`${OAUTH_API_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: OAUTH_CLIENT_ID,
                client_secret: OAUTH_CLIENT_SECRET,
                redirect_uri: OAUTH_REDIRECT_URI,
                grant_type: 'authorization_code',
                state,
                scope: OAUTH_SCOPE,
            }),
        });

        const tokenText = await tokenResponse.text();
        let tokenData;
        try {
            tokenData = JSON.parse(tokenText);
        } catch {
            tokenData = {};
        }

        if (!tokenResponse.ok) {
            const details = tokenData.error_description || tokenData.error || `Token exchange failed (${tokenResponse.status}).`;
            throw new Error(details);
        }

        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            tokenType: tokenData.token_type || 'Bearer',
            scope: tokenData.scope || OAUTH_SCOPE,
            expiresIn: tokenData.expires_in || null,
            obtainedAt: Date.now(),
            expiresAt: tokenData.expires_in ? Date.now() + (Number(tokenData.expires_in) * 1000) : null,
        };

        let user = null;
        try {
            const userResponse = await fetch(`${OAUTH_API_URL}/userinfo`, {
                headers: { Authorization: `Bearer ${token.accessToken}` },
            });
            if (userResponse.ok) {
                user = await userResponse.json();
            }
        } catch (userError) {
            console.warn('OAuth userinfo request failed:', userError);
        }

        const resultId = storeOAuthResult({
            success: true,
            token,
            user,
        }, stateData.origin);
        return res.send(renderOAuthCallbackPage({ resultId, targetOrigin: stateData.origin }));
    } catch (exchangeError) {
        console.error('OAuth callback error:', exchangeError);
        const resultId = storeOAuthResult({
            success: false,
            error: exchangeError.message || 'OAuth flow failed.',
        }, stateData.origin);
        return res.send(renderOAuthCallbackPage({ resultId, targetOrigin: stateData.origin }));
    }
});

// OAuth callback result retrieval (one-time read)
app.get('/api/oauth/result/:id', (req, res) => {
    cleanupOAuthStates();
    const resultId = req.params.id;
    const result = oauthResultStore.get(resultId);
    if (!result) {
        return res.status(404).json({ error: 'OAuth result not found or expired.' });
    }

    oauthResultStore.delete(resultId);
    return res.json(result.payload);
});

// OAuth refresh
app.post('/api/oauth/refresh', async (req, res) => {
    if (!isOAuthConfigured()) {
        return res.status(500).json({ error: 'OAuth is not configured on the server.' });
    }

    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(400).json({ error: 'refreshToken is required.' });
    }

    try {
        const tokenResponse = await fetch(`${OAUTH_API_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: OAUTH_CLIENT_ID,
                client_secret: OAUTH_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        const tokenText = await tokenResponse.text();
        let tokenData;
        try {
            tokenData = JSON.parse(tokenText);
        } catch {
            tokenData = {};
        }

        if (!tokenResponse.ok) {
            const details = tokenData.error_description || tokenData.error || `Refresh failed (${tokenResponse.status}).`;
            return res.status(tokenResponse.status).json({ error: details });
        }

        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || refreshToken,
            tokenType: tokenData.token_type || 'Bearer',
            scope: tokenData.scope || OAUTH_SCOPE,
            expiresIn: tokenData.expires_in || null,
            obtainedAt: Date.now(),
            expiresAt: tokenData.expires_in ? Date.now() + (Number(tokenData.expires_in) * 1000) : null,
        };

        return res.json({ success: true, token });
    } catch (refreshError) {
        console.error('OAuth refresh error:', refreshError);
        return res.status(500).json({ error: 'Failed to refresh token.' });
    }
});

// Proxy: Cached Search
app.get('/api/search', async (req, res) => {
    try {
        const params = new URLSearchParams(req.query);
        const apiUrl = `${PARTNER_API_URL}/search?${params.toString()}`;

        console.log(`🔍 [Search Request] ${apiUrl}`);
        console.log(`   Params:`, req.query);

        const authHeaders = getSeatsAuthHeaders(req, res);
        if (!authHeaders) return;
        const response = await fetchPartnerApiWithFallback(req, apiUrl, authHeaders);

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
        const authHeaders = getSeatsAuthHeaders(req, res);
        if (!authHeaders) return;
        const response = await fetchPartnerApiWithFallback(
            req,
            `${PARTNER_API_URL}/availability?${params.toString()}`,
            authHeaders
        );
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
        const authHeaders = getSeatsAuthHeaders(req, res);
        if (!authHeaders) return;
        const response = await fetchPartnerApiWithFallback(
            req,
            `${PARTNER_API_URL}/trips/${req.params.id}`,
            authHeaders
        );
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
        const authHeaders = getSeatsAuthHeaders(req, res);
        if (!authHeaders) return;
        const response = await fetchPartnerApiWithFallback(
            req,
            `${PARTNER_API_URL}/routes?${params.toString()}`,
            authHeaders
        );
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Routes error:', error);
        res.status(500).json({ error: 'Failed to fetch routes' });
    }
});

// Profile sync: load saved trip ideas for current identity.
app.get('/api/profile/trips', async (req, res) => {
    const owner = await resolveProfileOwner(req, res);
    if (!owner) return;

    const record = PROFILE_TRIPS_STORE.owners[owner.ownerId] || {
        trips: [],
        tripDefaults: null,
        updatedAt: 0,
    };

    res.json({
        ownerId: owner.ownerId,
        identityType: owner.identityType,
        displayName: owner.displayName,
        trips: Array.isArray(record.trips) ? record.trips : [],
        tripDefaults: record.tripDefaults || null,
        updatedAt: Number(record.updatedAt) || 0,
    });
});

// Profile sync: replace saved trip ideas for current identity.
app.put('/api/profile/trips', async (req, res) => {
    const owner = await resolveProfileOwner(req, res);
    if (!owner) return;

    const rawTrips = Array.isArray(req.body?.trips) ? req.body.trips : [];
    const normalizedTrips = rawTrips
        .map(normalizeTripIdea)
        .filter(Boolean)
        .slice(0, MAX_PROFILE_TRIPS);
    const tripDefaults = normalizeTripDefaults(req.body?.tripDefaults) || null;
    const updatedAt = Date.now();

    PROFILE_TRIPS_STORE.owners[owner.ownerId] = {
        trips: normalizedTrips,
        tripDefaults,
        updatedAt,
    };

    try {
        persistProfileTripsStore();
        res.json({
            success: true,
            ownerId: owner.ownerId,
            updatedAt,
            tripCount: normalizedTrips.length,
        });
    } catch {
        res.status(500).json({ error: 'Failed to persist profile trips.' });
    }
});

// Set of helper to fetch static airports
app.get('/api/airports', (req, res) => {
    res.json(AIRPORTS_DATA);
});

// Serve built frontend in production (Render).
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    console.warn(`⚠️  Frontend dist not found at ${distPath}. Run "npm run build" before starting in production.`);
}

app.listen(PORT, () => {
    console.log(`✈️  Avioscanner API proxy running on http://localhost:${PORT}`);
    console.log(`   API Key: managed via frontend Settings panel`);
    console.log(`   OAuth2: ${isOAuthConfigured() ? 'configured' : 'not configured'}`);
});
