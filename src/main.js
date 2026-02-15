/* =============================================
   AEROSCAN — Main Application Logic
   ============================================= */

// ---- Mileage Programs Reference ----
const MILEAGE_PROGRAMS = {
    'Star Alliance': [
        { id: 'aeroplan', name: 'Air Canada Aeroplan' },
        { id: 'united', name: 'United MileagePlus' },
        { id: 'lifemiles', name: 'Avianca LifeMiles' },
        { id: 'turkish', name: 'Turkish Miles&Smiles' },
        { id: 'eurobonus', name: 'SAS EuroBonus' },
        { id: 'copa', name: 'Copa ConnectMiles' } // Verify if copa or copaairlines
    ],
    'OneWorld': [
        { id: 'american', name: 'American AAdvantage' },
        { id: 'alaska', name: 'Alaska Mileage Plan' },
        { id: 'qantas', name: 'Qantas Frequent Flyer' },
        { id: 'asiamiles', name: 'Cathay Pacific Asia Miles' },
        { id: 'british', name: 'British Airways Avios' }, // Likely 'british' based on patterns
        { id: 'qatar', name: 'Qatar Privilege Club' },
        { id: 'finnair', name: 'Finnair Plus' }
    ],
    'SkyTeam': [
        { id: 'delta', name: 'Delta SkyMiles' },
        { id: 'flyingblue', name: 'Air France / KLM' },
        { id: 'virginatlantic', name: 'Virgin Atlantic' },
        { id: 'aeromexico', name: 'Aeromexico Rewards' }
    ],
    'Others': [
        { id: 'emirates', name: 'Emirates Skywards' },
        { id: 'etihad', name: 'Etihad Guest' },
        { id: 'velocity', name: 'Virgin Australia' },
        { id: 'smiles', name: 'GOL Smiles' },
        { id: 'jetblue', name: 'jetBlue TrueBlue' },
        { id: 'southwest', name: 'Southwest Rapid Rewards' }
    ]
};

// ---- State ----
let trips = [];
let settings = {
    cabin: 'business',
    seats: 1,
    programs: ['united', 'aeroplan', 'americanAirlines'],
};
let availabilityCache = {}; // tripId -> { status, data, lastFetched }
let userApiKey = localStorage.getItem('seats_aero_api_key') || '';
let apiVerified = false;

// ---- Airport Database (Dynamic) ----
let AIRPORTS = [];

async function loadAirports() {
    try {
        const headers = {};
        if (userApiKey) headers['x-api-key'] = userApiKey;
        const res = await fetch('/api/airports', { headers });
        if (!res.ok) throw new Error('Failed to fetch');
        AIRPORTS = await res.json();
        console.log(`✈️  Loaded ${AIRPORTS.length} airports from API.`);
    } catch (e) {
        console.warn('Failed to load airport list.', e);
    }
}

// ---- Autocomplete Logic ----
let activeAutocomplete = null; // { input, dropdown, items, selectedIndex }

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Wrap the input for positioning if not already wrapped
    if (!input.parentElement.classList.contains('autocomplete-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
    }

    input.addEventListener('input', (e) => handleAutocompleteInput(e, input));
    input.addEventListener('keydown', (e) => handleAutocompleteKeydown(e, input));
    input.addEventListener('blur', () => {
        // Delay to allow click on dropdown item to register before removal
        setTimeout(closeAutocomplete, 200);
    });
}

function handleAutocompleteInput(e, input) {
    const query = input.value.trim().toUpperCase();
    closeAutocomplete();

    if (query.length < 1) return;

    const matches = AIRPORTS.filter(a =>
        (a.iata && a.iata.includes(query)) ||
        (a.name && a.name.toUpperCase().includes(query)) ||
        (a.city && a.city.toUpperCase().includes(query))
    );

    if (matches.length === 0) return;

    renderAutocompleteDropdown(input, matches);
}

function renderAutocompleteDropdown(input, matches) {
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';

    matches.slice(0, 10).forEach((match, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        const code = match.iata || match.code;
        item.dataset.code = code;
        item.innerHTML = `
            <span class="airport-code-badge">${code}</span>
            <div class="airport-info">
                <span class="airport-name">${match.name}</span>
                <span class="airport-city">${match.city || ''}</span>
            </div>
        `;

        item.addEventListener('mouseenter', () => {
            updateSelectedIndex(index);
        });

        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur before selection
            selectAirport(input, code);
        });

        dropdown.appendChild(item);
    });

    input.parentElement.appendChild(dropdown);
    activeAutocomplete = {
        input,
        dropdown,
        items: dropdown.querySelectorAll('.autocomplete-item'),
        selectedIndex: -1
    };

    // Auto-highlight the first result
    if (matches.length > 0) {
        updateSelectedIndex(0);
    }
}

function handleAutocompleteKeydown(e, input) {
    if (!activeAutocomplete) return;

    const { items, selectedIndex } = activeAutocomplete;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSelectedIndex(selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSelectedIndex(selectedIndex - 1);
    } else if (e.key === 'Enter') {
        if (selectedIndex >= 0) {
            e.preventDefault();
            selectAirport(input, items[selectedIndex].dataset.code);
        }
    } else if (e.key === 'Escape') {
        closeAutocomplete();
    }
}

function updateSelectedIndex(newIndex) {
    if (!activeAutocomplete) return;
    const { items, selectedIndex } = activeAutocomplete;

    // Remove active class from old
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].classList.remove('active');
    }

    // Wrap around
    let nextIndex = newIndex;
    if (nextIndex >= items.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = items.length - 1;

    items[nextIndex].classList.add('active');
    items[nextIndex].scrollIntoView({ block: 'nearest' });
    activeAutocomplete.selectedIndex = nextIndex;
}

function selectAirport(input, code) {
    input.value = code;
    input.dispatchEvent(new Event('input')); // Trigger any other listeners
    closeAutocomplete();
}

function closeAutocomplete() {
    if (activeAutocomplete) {
        activeAutocomplete.dropdown.remove();
        activeAutocomplete = null;
    }
}

// ---- Persistence ----
function loadState() {
    try {
        const savedTrips = localStorage.getItem('aeroscan_trips');
        if (savedTrips) trips = JSON.parse(savedTrips);

        const savedSettings = localStorage.getItem('aeroscan_settings');
        if (savedSettings) {
            settings = JSON.parse(savedSettings);

            // MIGRATION: Fix old IDs
            const idMap = {
                'americanAirlines': 'american',
                'britishairways': 'british',
                'copaairlines': 'copa'
            };

            settings.programs = settings.programs.map(id => idMap[id] || id);

            // Filter out any IDs that don't exist in our verified list to avoid errors
            const validIds = new Set();
            Object.values(MILEAGE_PROGRAMS).forEach(group => group.forEach(p => validIds.add(p.id)));

            settings.programs = settings.programs.filter(id => validIds.has(id));

            // Save the fixed settings immediately
            saveSettings();
        }

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

// ---- API Helpers ----
async function checkHealth(keyOverride = null) {
    try {
        const headers = {};
        if (keyOverride || userApiKey) {
            headers['x-api-key'] = keyOverride || userApiKey;
        }
        const res = await fetch('/api/health', { headers });
        const data = await res.json();
        return data.status === 'ok' && data.hasApiKey === true;
    } catch {
        return false;
    }
}

async function searchAvailability(origin, destination, startDate, endDate) {
    const baseParams = {
        origin_airport: origin.toUpperCase(),
        destination_airport: destination.toUpperCase(),
        start_date: startDate,
        end_date: endDate,
        cabin: settings.cabin,
        seats: settings.seats,
    };

    const headers = {};
    if (userApiKey) headers['x-api-key'] = userApiKey;

    try {
        let results = [];

        // HYBRID STRATEGY:
        // 1-2 Programs: Fetch them specifically (Parallel requests)
        // >2 Programs: Fetch "All" and let client filter (Single request)
        if (settings.programs.length > 0 && settings.programs.length <= 2) {
            console.log(`🔎 Strategy: Specific fetch for ${settings.programs.join(', ')}`);
            const promises = settings.programs.map(async (programId) => {
                const p = new URLSearchParams({
                    ...baseParams,
                    take: '500',
                    source: programId
                });
                const res = await fetch(`/api/search?${p.toString()}`, { headers });
                if (!res.ok) {
                    console.warn(`Failed to fetch ${programId}: ${res.status}`);
                    return { data: [] }; // Return empty on failure to keep Promise.all alive
                }
                return await res.json();
            });

            const responses = await Promise.all(promises);
            results = responses.flatMap(r => r.data || []);

        } else {
            console.log(`🔎 Strategy: Broad fetch (Client-side filter)`);
            const p = new URLSearchParams({
                ...baseParams,
                take: '500'
            });
            const res = await fetch(`/api/search?${p.toString()}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            results = data.data || [];
        }

        return { data: results };

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

        let summaryHtml = '';
        if (cache && cache.data && cache.data.length > 0) {
            // Sort by mileage cost
            const sorted = [...cache.data].sort((a, b) => (a.MileageCost || Infinity) - (b.MileageCost || Infinity));
            const top2 = sorted.slice(0, 2);
            const remaining = sorted.length - 2;

            const items = top2.map(item => {
                // Short date format (remove year)
                let dateStr = formatDate(item.Date || item.date);
                dateStr = dateStr.replace(/, \d{4}$/, '');

                const miles = formatMiles(item.MileageCost || 0);
                return `
                    <div class="summary-item">
                        <span class="sum-date">${dateStr}</span>
                        <div class="sum-miles">${miles}</div>
                    </div>
                `;
            }).join('');

            let remainingHtml = '';
            if (remaining > 0) {
                const minRemaining = Math.min(...sorted.slice(2).map(a => a.MileageCost || Infinity));
                remainingHtml = `
                    <div class="summary-item summary-more">
                        <span class="sum-count">+${remaining}</span>
                        <div class="sum-from">from ${formatMiles(minRemaining)}</div>
                    </div>
                `;
            }

            summaryHtml = `
                <div class="trip-summary-list">
                    ${items}
                    ${remainingHtml}
                </div>
            `;
        }

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
        ${summaryHtml}
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
    container.innerHTML = Object.entries(MILEAGE_PROGRAMS).map(([alliance, progs]) => {
        const allSelected = progs.every(p => settings.programs.includes(p.id));
        return `
      <div class="alliance-group">
        <div class="alliance-header">
          <h3>${alliance}</h3>
          <button class="select-all-btn" data-alliance="${alliance}">
            ${allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div class="alliance-programs">
          ${progs.map(prog => `
            <button class="program-chip ${settings.programs.includes(prog.id) ? 'active' : ''}" data-id="${prog.id}">
              <span class="check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              ${prog.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    }).join('');

    // Individual chip listeners
    container.querySelectorAll('.program-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.id;
            if (settings.programs.includes(id)) {
                settings.programs = settings.programs.filter(p => p !== id);
            } else {
                settings.programs.push(id);
            }
            renderProgramsList(); // Re-render to update "Select All" status
        });
    });

    // Select All listeners
    container.querySelectorAll('.select-all-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const alliance = btn.dataset.alliance;
            const progs = MILEAGE_PROGRAMS[alliance];
            const allSelected = progs.every(p => settings.programs.includes(p.id));

            if (allSelected) {
                // Deselect all in this alliance
                const idsToRemove = progs.map(p => p.id);
                settings.programs = settings.programs.filter(id => !idsToRemove.includes(id));
            } else {
                // Select all in this alliance
                progs.forEach(p => {
                    if (!settings.programs.includes(p.id)) {
                        settings.programs.push(p.id);
                    }
                });
            }
            renderProgramsList();
        });
    });
}

function openSettings() {
    document.getElementById('setting-cabin').value = settings.cabin;
    document.getElementById('setting-seats').value = settings.seats;
    document.getElementById('user-api-key').value = userApiKey;
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
    setupAutocomplete('trip-origin');
    setupAutocomplete('trip-destination');
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

    // Title as Editable Input
    const titleEl = document.getElementById('detail-title');
    titleEl.innerHTML = `<input type="text" id="edit-trip-name" value="${escapeHtml(trip.name)}" class="title-input">`;

    const body = document.getElementById('detail-body');

    // Edit Controls
    const editControls = `
    <div class="trip-edit-controls">
      <div class="edit-row">
        <div class="edit-group">
            <label>Route</label>
            <div class="input-merged">
                <input type="text" id="edit-origin" class="input-uppercase" value="${escapeHtml(trip.origin)}" maxlength="3" title="Origin">
                <span class="arrow">→</span>
                <input type="text" id="edit-dest" class="input-uppercase" value="${escapeHtml(trip.destination)}" maxlength="3" title="Destination">
            </div>
        </div>
        <div class="edit-group">
            <label>Dates</label>
            <div class="input-merged dates">
                <input type="date" id="edit-start" value="${trip.startDate}" title="Start Date">
                <span class="sep">—</span>
                <input type="date" id="edit-end" value="${trip.endDate}" title="End Date">
            </div>
        </div>
        <button id="btn-update-trip" class="btn-icon-square btn-primary" title="Refresh">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
    </div>
  `;

    let contentHtml = '';

    if (!cache || !cache.data) {
        contentHtml = `
      <div class="no-results">
        <div class="nr-icon">🔍</div>
        <p>No availability data yet. Hit <strong>Refresh</strong> to scan for seats.</p>
      </div>
    `;
    } else if (cache.data.length === 0) {
        contentHtml = `
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

        contentHtml = `
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
          <div>Seats</div>
          <div style="text-align:right">Miles</div>
        </div>
        ${cache.data.slice(0, 50).map(a => {
            const date = a.Date || '—';
            const route = `${a.Route?.OriginAirport || trip.origin} → ${a.Route?.DestinationAirport || trip.destination}`;
            const program = String(a.Source).replace('Airlines', '').replace('Airways', ''); // Shorten name
            const miles = a.MileageCost || '—';
            const seats = a.RemainingSeats > 0 ? a.RemainingSeats : '—';

            return `
            <div class="avail-row">
              <div class="avail-date">${formatDate(date)}</div>
              <div class="avail-route">${route}</div>
              <div class="avail-program">${program}</div>
              <div class="avail-seats">${seats} seat${seats !== 1 ? 's' : ''}</div>
              <div class="avail-miles">${typeof miles === 'number' ? formatMiles(miles) : miles}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    }

    body.innerHTML = editControls + contentHtml;
    document.getElementById('detail-modal').classList.remove('hidden');

    // Attach Autocomplete for edit fields
    setupAutocomplete('edit-origin');
    setupAutocomplete('edit-dest');

    // Attach Update Listener
    document.getElementById('btn-update-trip').addEventListener('click', () => updateTripDetails(id));
}

async function updateTripDetails(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    const newName = document.getElementById('edit-trip-name').value.trim();
    const newOrigin = document.getElementById('edit-origin').value.trim().toUpperCase();
    const newDest = document.getElementById('edit-dest').value.trim().toUpperCase();
    const newStart = document.getElementById('edit-start').value;
    const newEnd = document.getElementById('edit-end').value;

    if (!newName || !newOrigin || !newDest || !newStart || !newEnd) {
        alert('Please fill in all fields.');
        return;
    }

    // Update Trip
    trip.name = newName;
    trip.origin = newOrigin;
    trip.destination = newDest;
    trip.startDate = newStart;
    trip.endDate = newEnd;

    // Clear Cache
    delete availabilityCache[id];

    saveTrips();
    saveCache();
    renderDashboard(); // Update card in background

    // Show loading state in modal
    const btn = document.getElementById('btn-update-trip');
    btn.classList.add('is-loading');
    btn.disabled = true;

    // Refresh Data
    const result = await searchAvailability(trip.origin, trip.destination, trip.startDate, trip.endDate);

    // Reuse refreshAll logic for data processing is complicated here because we need to update cache manually
    // For simplicity, we'll replicate the filter logic or just call refreshAll?
    // Calling refreshAll scans ALL trips. We want just THIS trip.
    // So we replicate the filter logic.

    if (result && result.data && result.data.length > 0) {
        const cabinPrefix = getCabinPrefix(settings.cabin);
        const relevantData = result.data.filter(item => {
            const available = item[`${cabinPrefix}Available`] || item[`${cabinPrefix}AvailableRaw`];
            const remaining = Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0);
            const sourceId = item.Source || item.source;
            return available === true &&
                remaining >= settings.seats &&
                (settings.programs.includes(sourceId) || settings.programs.includes(sourceId?.toLowerCase()));
        }).map(item => ({
            ...item,
            MileageCost: Number(item[`${cabinPrefix}MileageCostRaw`] || item[`${cabinPrefix}MileageCost`] || 0),
            RemainingSeats: Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0),
            Source: item.Source || item.source || 'Unknown',
            Date: item.Date || item.date
        }));

        const count = relevantData.length;
        availabilityCache[trip.id] = {
            status: count > 0 ? (count > 5 ? 'available' : 'limited') : 'unavailable',
            data: relevantData,
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
    renderTrips(); // Update card status
    openDetailModal(trip.id); // Re-render modal with new data
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
            // Filter and map data based on selected cabin
            const cabinPrefix = getCabinPrefix(settings.cabin);
            const relevantData = result.data.filter(item => {
                const available = item[`${cabinPrefix}Available`] || item[`${cabinPrefix}AvailableRaw`];
                const remaining = Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0);
                const sourceId = item.Source || item.source;

                // Only include if:
                // 1. Available check passes
                // 2. Has enough seats
                // 3. Source is in user's selected programs
                return available === true &&
                    remaining >= settings.seats &&
                    (settings.programs.includes(sourceId) || settings.programs.includes(sourceId?.toLowerCase()));
            }).map(item => ({
                ...item,
                // Normalize fields for display
                MileageCost: Number(item[`${cabinPrefix}MileageCostRaw`] || item[`${cabinPrefix}MileageCost`] || 0),
                RemainingSeats: Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0),
                Source: item.Source || item.source || 'Unknown',
                Date: item.Date || item.date
            }));

            const count = relevantData.length;
            availabilityCache[trip.id] = {
                status: count > 0 ? (count > 5 ? 'available' : 'limited') : 'unavailable',
                data: relevantData,
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
function getCabinPrefix(cabin) {
    switch (cabin) {
        case 'economy': return 'Y';
        case 'premium': return 'W';
        case 'business': return 'J';
        case 'first': return 'F';
        default: return 'Y';
    }
}

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
    await loadAirports();
    loadState();
    renderDashboard();
    updateApiStatus();

    // --- Event Listeners ---

    // Settings
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-overlay').addEventListener('click', closeSettings);
    document.getElementById('settings-save').addEventListener('click', saveSettingsForm);

    // API Key (inside settings)
    document.getElementById('key-save-btn').addEventListener('click', handleKeySave);

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

    // API Key Management (removed separate modal)
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

// ---- API Key UI Handlers ----
async function updateApiStatus() {
    const statusDot = document.getElementById('api-status-dot');
    const statusText = document.getElementById('api-status-text');
    if (!statusDot || !statusText) return;

    statusDot.className = 'status-dot';
    statusText.textContent = 'Checking...';

    const healthy = await checkHealth();

    if (userApiKey) {
        if (healthy) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Verified Key';
            apiVerified = true;
        } else {
            statusDot.classList.add('error');
            statusText.textContent = 'Invalid / Expired';
            apiVerified = false;
        }
    } else {
        if (healthy) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Verified (Server)';
            apiVerified = true;
        } else {
            statusDot.classList.add('warning');
            statusText.textContent = 'No Key Provided';
            apiVerified = false;
        }
    }
}

// Removed openKeyModal and closeKeyModal

async function handleKeySave() {
    const keyInput = document.getElementById('user-api-key');
    const saveBtn = document.getElementById('key-save-btn');
    const newKey = keyInput.value.trim();

    saveBtn.disabled = true;
    saveBtn.textContent = 'Verifying...';

    const isValid = await checkHealth(newKey);

    if (isValid) {
        userApiKey = newKey;
        apiVerified = true;
        localStorage.setItem('seats_aero_api_key', newKey);
        updateApiStatus();
        closeKeyModal();
        loadAirports(); // Refresh airport list with new key
    } else {
        alert('Invalid API key. Please try again.');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Verify & Save';
}
