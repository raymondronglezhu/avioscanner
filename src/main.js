/* =============================================
   AEROSCAN — Main Application Logic
   ============================================= */

// ---- Mileage Programs Reference ----
const MILEAGE_PROGRAMS = [
    { id: 'united', name: 'United MileagePlus' },
    { id: 'aeroplan', name: 'Air Canada Aeroplan' },
    { id: 'americanAirlines', name: 'American AAdvantage' },
    { id: 'delta', name: 'Delta SkyMiles' },
    { id: 'alaska', name: 'Alaska Mileage Plan' },
    { id: 'virginatlantic', name: 'Virgin Atlantic' },
    { id: 'jetblue', name: 'JetBlue TrueBlue' },
    { id: 'southwest', name: 'Southwest Rapid Rewards' },
    { id: 'flyingblue', name: 'Air France / KLM' },
    { id: 'emirates', name: 'Emirates Skywards' },
    { id: 'qantas', name: 'Qantas Frequent Flyer' },
    { id: 'velocity', name: 'Virgin Australia' },
    { id: 'asiamiles', name: 'Cathay Pacific Asia Miles' },
    { id: 'smiles', name: 'GOL Smiles' },
    { id: 'aeromexico', name: 'Aeromexico Rewards' },
    { id: 'copaairlines', name: 'Copa ConnectMiles' },
    { id: 'etihad', name: 'Etihad Guest' },
    { id: 'turkish', name: 'Turkish Miles&Smiles' },
    { id: 'lifemiles', name: 'Avianca LifeMiles' },
    { id: 'eurobonus', name: 'SAS EuroBonus' },
];

// ---- State ----
let trips = [];
let settings = {
    cabin: 'business',
    seats: 1,
    programs: ['united', 'aeroplan', 'americanAirlines'],
};
let availabilityCache = {}; // tripId -> { status, data, lastFetched }

// ---- Persistence ----
function loadState() {
    try {
        const savedTrips = localStorage.getItem('aeroscan_trips');
        if (savedTrips) trips = JSON.parse(savedTrips);
        const savedSettings = localStorage.getItem('aeroscan_settings');
        if (savedSettings) settings = JSON.parse(savedSettings);
        const savedCache = localStorage.getItem('aeroscan_cache');
        if (savedCache) availabilityCache = JSON.parse(savedCache);
    } catch (e) {
        console.warn('Failed to load state:', e);
    }
}

function saveTrips() {
    localStorage.setItem('aeroscan_trips', JSON.stringify(trips));
}

function saveSettings() {
    localStorage.setItem('aeroscan_settings', JSON.stringify(settings));
}

function saveCache() {
    localStorage.setItem('aeroscan_cache', JSON.stringify(availabilityCache));
}

// ---- API ----
async function checkHealth() {
    try {
        const res = await fetch('/api/health');
        const data = await res.json();
        return data.hasApiKey;
    } catch {
        return false;
    }
}

async function searchAvailability(origin, destination, startDate, endDate) {
    const params = new URLSearchParams({
        origin_airport: origin.toUpperCase(),
        destination_airport: destination.toUpperCase(),
        start_date: startDate,
        end_date: endDate,
        cabin: settings.cabin,
        take: '50',
    });

    // Add selected programs
    if (settings.programs.length > 0) {
        params.set('source', settings.programs.join(','));
    }

    try {
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Search failed:', error);
        return null;
    }
}

// ---- Rendering ----
function renderDashboard() {
    const emptyState = document.getElementById('empty-state');
    const tripsContainer = document.getElementById('trips-container');

    if (trips.length === 0) {
        emptyState.classList.remove('hidden');
        tripsContainer.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        tripsContainer.classList.remove('hidden');
        renderTrips();
    }
}

function renderTrips() {
    const grid = document.getElementById('trips-grid');
    grid.innerHTML = trips.map((trip, index) => {
        const cache = availabilityCache[trip.id];
        const statusClass = cache ? `status-${cache.status}` : 'status-idle';
        const statusText = getStatusText(cache);
        const count = cache?.data?.length ?? null;

        return `
      <div class="trip-card" data-id="${trip.id}" style="animation-delay: ${index * 0.05}s">
        <div class="card-top">
          <div class="card-name">${escapeHtml(trip.name)}</div>
          <div class="card-actions">
            <button class="card-action-btn edit-btn" data-id="${trip.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="card-action-btn delete" data-id="${trip.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="card-route">
          <span class="airport-code">${escapeHtml(trip.origin)}</span>
          <div class="route-line">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
          </div>
          <span class="airport-code">${escapeHtml(trip.destination)}</span>
        </div>
        <div class="card-dates">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}
        </div>
        <div class="card-availability ${statusClass}">
          <span class="status-icon"></span>
          <span>${statusText}</span>
          ${count !== null && count > 0 ? `<span class="availability-count">${count}</span>` : ''}
        </div>
      </div>
    `;
    }).join('');

    // Attach event listeners
    grid.querySelectorAll('.trip-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-action-btn')) return;
            const id = card.dataset.id;
            openDetailModal(id);
        });
    });

    grid.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(btn.dataset.id);
        });
    });

    grid.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTrip(btn.dataset.id);
        });
    });
}

function getStatusText(cache) {
    if (!cache) return 'Click refresh to scan';
    switch (cache.status) {
        case 'loading': return 'Scanning...';
        case 'available': return 'Seats available!';
        case 'limited': return 'Limited availability';
        case 'unavailable': return 'No seats found';
        default: return 'Click refresh to scan';
    }
}

// ---- Settings Panel ----
function renderProgramsList() {
    const container = document.getElementById('programs-list');
    container.innerHTML = MILEAGE_PROGRAMS.map(prog => `
    <button class="program-chip ${settings.programs.includes(prog.id) ? 'active' : ''}" data-id="${prog.id}">
      <span class="check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      ${prog.name}
    </button>
  `).join('');

    container.querySelectorAll('.program-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.id;
            if (settings.programs.includes(id)) {
                settings.programs = settings.programs.filter(p => p !== id);
                chip.classList.remove('active');
            } else {
                settings.programs.push(id);
                chip.classList.add('active');
            }
        });
    });
}

function openSettings() {
    document.getElementById('setting-cabin').value = settings.cabin;
    document.getElementById('setting-seats').value = settings.seats;
    renderProgramsList();
    document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-panel').classList.add('hidden');
}

function saveSettingsForm() {
    settings.cabin = document.getElementById('setting-cabin').value;
    settings.seats = parseInt(document.getElementById('setting-seats').value, 10);
    saveSettings();
    closeSettings();
    // Clear cache since settings changed
    availabilityCache = {};
    saveCache();
    renderDashboard();
}

// ---- Trip Modal ----
function openAddModal() {
    document.getElementById('modal-title').textContent = 'New Trip Idea';
    document.getElementById('trip-form').reset();
    document.getElementById('trip-id').value = '';
    // Set default dates to next month
    const start = new Date();
    start.setMonth(start.getMonth() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    document.getElementById('trip-start-date').value = formatDateInput(start);
    document.getElementById('trip-end-date').value = formatDateInput(end);
    document.getElementById('trip-modal').classList.remove('hidden');
}

function openEditModal(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    document.getElementById('modal-title').textContent = 'Edit Trip Idea';
    document.getElementById('trip-id').value = trip.id;
    document.getElementById('trip-name').value = trip.name;
    document.getElementById('trip-origin').value = trip.origin;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start-date').value = trip.startDate;
    document.getElementById('trip-end-date').value = trip.endDate;
    document.getElementById('trip-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('trip-modal').classList.add('hidden');
}

function handleTripSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('trip-id').value;
    const name = document.getElementById('trip-name').value.trim();
    const origin = document.getElementById('trip-origin').value.trim().toUpperCase();
    const destination = document.getElementById('trip-destination').value.trim().toUpperCase();
    const startDate = document.getElementById('trip-start-date').value;
    const endDate = document.getElementById('trip-end-date').value;

    if (!name || !origin || !destination || !startDate || !endDate) return;

    if (id) {
        // Edit existing
        const trip = trips.find(t => t.id === id);
        if (trip) {
            trip.name = name;
            trip.origin = origin;
            trip.destination = destination;
            trip.startDate = startDate;
            trip.endDate = endDate;
            // Clear cache for this trip
            delete availabilityCache[trip.id];
        }
    } else {
        // Create new
        const newTrip = {
            id: generateId(),
            name,
            origin,
            destination,
            startDate,
            endDate,
            createdAt: Date.now(),
        };
        trips.push(newTrip);
    }

    saveTrips();
    saveCache();
    closeModal();
    renderDashboard();
}

function deleteTrip(id) {
    if (!confirm('Delete this trip idea?')) return;
    trips = trips.filter(t => t.id !== id);
    delete availabilityCache[id];
    saveTrips();
    saveCache();
    renderDashboard();
}

// ---- Detail Modal ----
function openDetailModal(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    const cache = availabilityCache[trip.id];

    document.getElementById('detail-title').textContent = trip.name;
    const body = document.getElementById('detail-body');

    if (!cache || !cache.data) {
        body.innerHTML = `
      <div class="no-results">
        <div class="nr-icon">🔍</div>
        <p>No availability data yet. Hit <strong>Refresh All</strong> to scan for seats.</p>
      </div>
    `;
    } else if (cache.data.length === 0) {
        body.innerHTML = `
      <div class="no-results">
        <div class="nr-icon">😕</div>
        <p>No award seats found for this route and date range.</p>
        <p style="color: var(--text-muted); font-size: var(--font-sm); margin-top: 8px;">Try adjusting your dates or global settings.</p>
      </div>
    `;
    } else {
        const totalResults = cache.data.length;
        const programs = [...new Set(cache.data.map(a => a.Source || a.source || 'Unknown'))];
        const minMiles = Math.min(...cache.data.map(a => a.MileageCost || a.mileage_cost || Infinity));

        body.innerHTML = `
      <div class="detail-summary">
        <div class="summary-card">
          <div class="value">${totalResults}</div>
          <div class="label">Results Found</div>
        </div>
        <div class="summary-card">
          <div class="value">${programs.length}</div>
          <div class="label">Programs</div>
        </div>
        <div class="summary-card">
          <div class="value">${minMiles === Infinity ? '—' : formatMiles(minMiles)}</div>
          <div class="label">Lowest Miles</div>
        </div>
      </div>
      <div class="availability-list">
        <div class="avail-row avail-header">
          <div>Date</div>
          <div>Route</div>
          <div>Program</div>
          <div style="text-align:right">Miles</div>
        </div>
        ${cache.data.slice(0, 50).map(a => {
            const date = a.Date || a.date || '—';
            const route = `${a.OriginAirport || a.origin_airport || trip.origin} → ${a.DestinationAirport || a.destination_airport || trip.destination}`;
            const program = a.Source || a.source || '—';
            const miles = a.MileageCost || a.mileage_cost || '—';
            return `
            <div class="avail-row">
              <div class="avail-date">${formatDate(date)}</div>
              <div class="avail-route">${route}</div>
              <div class="avail-program">${program}</div>
              <div class="avail-miles">${typeof miles === 'number' ? formatMiles(miles) : miles}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    }

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// ---- Availability Refresh ----
async function refreshAll() {
    const btn = document.getElementById('refresh-all-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Scanning...';

    for (const trip of trips) {
        availabilityCache[trip.id] = { status: 'loading', data: null, lastFetched: null };
        renderTrips();

        const result = await searchAvailability(trip.origin, trip.destination, trip.startDate, trip.endDate);

        if (result && result.data && result.data.length > 0) {
            const count = result.data.length;
            availabilityCache[trip.id] = {
                status: count > 5 ? 'available' : 'limited',
                data: result.data,
                lastFetched: Date.now(),
            };
        } else if (result) {
            availabilityCache[trip.id] = {
                status: 'unavailable',
                data: result.data || [],
                lastFetched: Date.now(),
            };
        } else {
            availabilityCache[trip.id] = {
                status: 'unavailable',
                data: [],
                lastFetched: Date.now(),
            };
        }

        saveCache();
        renderTrips();

        // Small delay between API calls to be kind to the API
        await sleep(300);
    }

    btn.disabled = false;
    btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    Refresh All
  `;
}

// ---- Utilities ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '—') return '—';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function formatDateInput(date) {
    return date.toISOString().split('T')[0];
}

function formatMiles(n) {
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return n.toLocaleString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Init ----
async function init() {
    loadState();
    renderDashboard();

    // Check API health
    const statusDot = document.getElementById('api-status');
    const healthy = await checkHealth();
    if (healthy) {
        statusDot.classList.add('connected');
        statusDot.title = 'API connected';
    } else {
        statusDot.classList.add('error');
        statusDot.title = 'API not connected — check server & .env';
    }

    // --- Event Listeners ---

    // Settings
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-overlay').addEventListener('click', closeSettings);
    document.getElementById('settings-save').addEventListener('click', saveSettingsForm);

    // Trip Modal
    document.getElementById('empty-add-btn').addEventListener('click', openAddModal);
    document.getElementById('add-trip-btn').addEventListener('click', openAddModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', closeModal);
    document.getElementById('trip-form').addEventListener('submit', handleTripSubmit);

    // Detail Modal
    document.getElementById('detail-close').addEventListener('click', closeDetailModal);
    document.getElementById('detail-overlay').addEventListener('click', closeDetailModal);

    // Refresh
    document.getElementById('refresh-all-btn').addEventListener('click', refreshAll);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeSettings();
            closeDetailModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
