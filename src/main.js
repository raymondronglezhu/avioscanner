/* =============================================
   AVIOSCANNER — Main Application Logic
   ============================================= */

// ---- Avios Programs (Finnair + Qatar) ----
const AVIOS_PROGRAMS = ['finnair', 'qatar'];

// ---- State ----
let trips = [];
let settings = {
    programs: AVIOS_PROGRAMS,
};
let tripDefaults = {
    cabin: 'business',
    seats: 1,
};
let availabilityCache = {}; // tripId -> { status, data, lastFetched }
let currentDetailTripId = null;
let userApiKey = localStorage.getItem('seats_aero_api_key') || '';
let apiVerified = localStorage.getItem('seats_aero_api_verified') === userApiKey && !!userApiKey;

// ---- Airport Database (Dynamic) ----
let AIRPORTS = [];

async function loadAirports() {
    if (!userApiKey) {
        console.warn('Skipping airport load: No API key set.');
        return;
    }
    try {
        const headers = { 'x-api-key': userApiKey };
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
    input.addEventListener('focus', () => {
        input.select();
        const query = input.value.trim().toUpperCase();
        if (query.length >= 1) {
            handleAutocompleteInput(null, input);
        }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (activeAutocomplete && activeAutocomplete.input === input) {
                closeAutocomplete();
            }
        }, 200);
    });
}

function handleAutocompleteInput(e, input) {
    const query = input.value.trim().toUpperCase();

    if (query.length < 1) {
        closeAutocomplete();
        return;
    }

    // Filter and score matches
    const matches = AIRPORTS.map(a => {
        let score = 0;
        const iata = (a.iata || '').toUpperCase();
        const name = (a.name || '').toUpperCase();
        const city = (a.city || '').toUpperCase();

        if (iata === query) score = 100;
        else if (iata.startsWith(query)) score = 80;
        else if (name.startsWith(query)) score = 60;
        else if (city.startsWith(query)) score = 50;
        else if (iata.includes(query) || name.includes(query) || city.includes(query)) score = 10;

        return score > 0 ? { ...a, score } : null;
    }).filter(a => a !== null);

    if (matches.length === 0) {
        closeAutocomplete();
        return;
    }

    // Sort by score descending, then by name
    matches.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
    });

    renderAutocompleteDropdown(input, matches);
}

function renderAutocompleteDropdown(input, matches) {
    let dropdown;

    // Reuse existing dropdown if it belongs to the same input
    if (activeAutocomplete && activeAutocomplete.input === input) {
        dropdown = activeAutocomplete.dropdown;
        dropdown.innerHTML = ''; // Fast clear
    } else {
        closeAutocomplete();
        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        input.parentElement.appendChild(dropdown);
    }

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

function getAirportCity(iata) {
    const airport = AIRPORTS.find(a => a.iata === iata);
    return airport ? airport.city : null;
}

function selectAirport(input, code) {
    input.value = code;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    closeAutocomplete();
}

function closeAutocomplete() {
    if (activeAutocomplete) {
        activeAutocomplete.dropdown.remove();
        activeAutocomplete = null;
    }
}

// ---- Custom Select Dropdowns ----
function setupCustomSelect(triggerId, options, onSelect) {
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;

    // Prevent stacking duplicate listeners on repeated calls
    if (trigger._customSelectHandler) {
        trigger.removeEventListener('click', trigger._customSelectHandler);
    }

    const handler = (e) => {
        e.stopPropagation();

        // Close any existing custom dropdown
        const existing = document.querySelector('.custom-dropdown');
        if (existing) {
            const wasOwnDropdown = trigger.contains(existing);
            existing.remove();
            if (wasOwnDropdown) return;
        }

        const currentVal = trigger.dataset.value;
        const dropdown = document.createElement('div');
        dropdown.className = 'custom-dropdown';

        dropdown.innerHTML = options.map(opt => `
            <div class="custom-dropdown-item ${opt.value === currentVal ? 'active' : ''}" data-value="${opt.value}">
                ${opt.label}
            </div>
        `).join('');

        trigger.style.position = 'relative';
        trigger.appendChild(dropdown);

        const items = dropdown.querySelectorAll('.custom-dropdown-item');
        items.forEach(item => {
            item.addEventListener('mouseenter', () => {
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const val = item.dataset.value;
                const label = item.textContent.trim();
                trigger.dataset.value = val;
                onSelect(val, label);
                dropdown.remove();
            });
        });

        const closeDropdown = (ev) => {
            if (!trigger.contains(ev.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 0);
    };

    trigger._customSelectHandler = handler;
    trigger.addEventListener('click', handler);
}

// ---- Calendar Picker Component ----
let activeCalendar = null;

function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function setupDateRange(startId, endId, onChange) {
    const startEl = document.getElementById(startId);
    const endEl = document.getElementById(endId);
    if (!startEl || !endEl) return;

    const openCalendar = (targetEl, isStart) => {
        closeCalendar();
        const currentStart = startEl.value;
        const currentEnd = endEl.value;
        renderCalendar(targetEl, currentStart, currentEnd, isStart, (picked) => {
            if (isStart) {
                startEl.value = picked;
                // Auto-adjust end date if before start
                if (endEl.value && endEl.value < picked) {
                    endEl.value = picked;
                }
            } else {
                endEl.value = picked;
            }
            closeCalendar();
            if (onChange) onChange();
        }, () => startEl.value, () => endEl.value);
    };

    startEl.addEventListener('click', (e) => { e.stopPropagation(); openCalendar(startEl, true); });
    endEl.addEventListener('click', (e) => { e.stopPropagation(); openCalendar(endEl, false); });
}

function renderCalendar(anchorEl, startVal, endVal, isStart, onSelect, getStart, getEnd) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    const initial = parseDate(isStart ? startVal : endVal) || today;
    let viewYear = initial.getFullYear();
    let viewMonth = initial.getMonth();

    const wrapper = anchorEl.closest('.autocomplete-wrapper') || anchorEl.parentElement;
    wrapper.style.position = 'relative';

    const cal = document.createElement('div');
    cal.className = 'cal-dropdown';
    wrapper.appendChild(cal);

    const minDate = isStart ? todayStr : null;

    function render() {
        const curStart = getStart();
        const curEnd = getEnd();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

        const firstDay = new Date(viewYear, viewMonth, 1);
        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6;
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        let html = `
            <div class="cal-header">
                <button class="cal-nav" data-dir="-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span class="cal-title">${monthNames[viewMonth]} ${viewYear}</span>
                <button class="cal-nav" data-dir="1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
            <div class="cal-grid">
                ${dayNames.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        `;

        for (let i = 0; i < startDow; i++) {
            html += `<div class="cal-day cal-empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isPast = dateStr < todayStr;
            const isDisabled = isPast || (!isStart && curStart && dateStr < curStart);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === curStart || dateStr === curEnd;
            const isInRange = curStart && curEnd && dateStr > curStart && dateStr < curEnd;
            const isRangeStart = dateStr === curStart;
            const isRangeEnd = dateStr === curEnd;

            const classes = ['cal-day'];
            if (isDisabled) classes.push('cal-disabled');
            if (isToday) classes.push('cal-today');
            if (isSelected) classes.push('cal-selected');
            if (isInRange) classes.push('cal-in-range');
            if (isRangeStart && curEnd) classes.push('cal-range-start');
            if (isRangeEnd && curStart) classes.push('cal-range-end');

            html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`;
        }

        html += `</div>`;
        cal.innerHTML = html;

        // Navigation
        cal.querySelectorAll('.cal-nav').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dir = parseInt(btn.dataset.dir);
                viewMonth += dir;
                if (viewMonth > 11) { viewMonth = 0; viewYear++; }
                if (viewMonth < 0) { viewMonth = 11; viewYear--; }
                render();
            });
        });

        // Day selection
        cal.querySelectorAll('.cal-day:not(.cal-disabled):not(.cal-empty)').forEach(dayEl => {
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(dayEl.dataset.date);
            });

            // Hover preview for range
            dayEl.addEventListener('mouseenter', () => {
                if (!isStart && curStart) {
                    cal.querySelectorAll('.cal-day').forEach(d => {
                        d.classList.remove('cal-hover-range');
                        if (d.dataset.date && d.dataset.date > curStart && d.dataset.date <= dayEl.dataset.date) {
                            d.classList.add('cal-hover-range');
                        }
                    });
                }
            });
        });
    }

    render();

    activeCalendar = { el: cal, close: () => { cal.remove(); activeCalendar = null; } };

    const closeOnClickOutside = (e) => {
        if (!cal.contains(e.target) && e.target !== anchorEl) {
            closeCalendar();
            document.removeEventListener('click', closeOnClickOutside);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnClickOutside), 0);
}

function closeCalendar() {
    if (activeCalendar) {
        activeCalendar.close();
    }
}

// ---- Persistence ----
function loadState() {
    try {
        const savedTrips = localStorage.getItem('avioscanner_trips');
        if (savedTrips) trips = JSON.parse(savedTrips);

        // Migrate old trips that lack cabin/seats (use old global settings as fallback)
        const savedSettings = localStorage.getItem('avioscanner_settings');
        let oldCabin = 'business';
        let oldSeats = 1;
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            oldCabin = parsed.cabin || 'business';
            oldSeats = parsed.seats || 1;
        }
        for (const trip of trips) {
            if (!trip.cabin) trip.cabin = oldCabin;
            if (!trip.seats) trip.seats = oldSeats;
        }

        // Load last-used defaults for new trips
        const savedDefaults = localStorage.getItem('avioscanner_defaults');
        if (savedDefaults) {
            const parsed = JSON.parse(savedDefaults);
            tripDefaults.cabin = parsed.cabin || 'business';
            tripDefaults.seats = parsed.seats || 1;
        }

        const savedCache = localStorage.getItem('avioscanner_cache');
        if (savedCache) availabilityCache = JSON.parse(savedCache);
    } catch (e) {
        console.warn('Failed to load state:', e);
    }
}

function saveTrips() {
    localStorage.setItem('avioscanner_trips', JSON.stringify(trips));
}

function saveDefaults() {
    localStorage.setItem('avioscanner_defaults', JSON.stringify(tripDefaults));
}

function saveCache() {
    localStorage.setItem('avioscanner_cache', JSON.stringify(availabilityCache));
}

// ---- API Helpers ----
// ---- Deep Linking Helpers ----
function generateQatarLink(item, cabin, tripOrigin, tripDest) {
    const baseUrl = 'https://www.qatarairways.com/app/booking/redemption';

    // Map internal cabin to Qatar bookingClass
    let bookingClass = 'E'; // Economy
    if (cabin === 'J' || cabin === 'business') bookingClass = 'B';
    if (cabin === 'F' || cabin === 'first') bookingClass = 'F';

    // Correction: Seats.aero API stores airport codes inside the Route object
    const from = item.Route?.OriginAirport || tripOrigin || '';
    const to = item.Route?.DestinationAirport || tripDest || '';

    const params = new URLSearchParams({
        widget: 'QR',
        searchType: 'F',
        addTaxToFare: 'Y',
        minPurTime: '0',
        selLang: 'en',
        tripType: 'O',
        fromStation: from,
        toStation: to,
        departing: item.Date,
        bookingClass: bookingClass,
        adults: '1',
        children: '0',
        infants: '0',
        ofw: '0',
        teenager: '0',
        flexibleDate: 'off',
        qmilesFlow: 'true',
        allowRedemption: 'Y'
    });

    return `${baseUrl}?${params.toString()}`;
}

async function checkHealth(keyOverride = null) {
    const key = keyOverride || userApiKey;
    if (!key) return false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const headers = { 'x-api-key': key };
        const res = await fetch('/api/health', { headers, signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        return data.status === 'ok' && data.hasApiKey === true;
    } catch {
        return false;
    }
}

async function searchAvailability(origin, destination, startDate, endDate, cabin = 'business', seats = 1) {
    const baseParams = {
        origin_airport: origin.toUpperCase(),
        destination_airport: destination.toUpperCase(),
        start_date: startDate,
        end_date: endDate,
        cabin: cabin,
        seats: seats,
    };

    const headers = {};
    if (userApiKey) headers['x-api-key'] = userApiKey;
    else {
        // No key? Don't even try.
        return null;
    }

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

function buildCardInnerHtml(trip) {
    const cache = availabilityCache[trip.id];
    const statusClass = cache ? `status-${cache.status}` : 'status-idle';
    const statusText = getStatusText(cache);
    const count = cache?.data?.length ?? null;

    let summaryHtml = '';
    if (cache && cache.data && cache.data.length > 0) {
        const sorted = [...cache.data].sort((a, b) => (a.MileageCost || Infinity) - (b.MileageCost || Infinity));
        const top2 = sorted.slice(0, 2);
        const remaining = sorted.length - 2;

        const items = top2.map(item => {
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
        <div class="card-route">
          <span class="airport-code">${escapeHtml(trip.origin)}</span>
          <div class="route-line">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
          </div>
          <span class="airport-code">${escapeHtml(trip.destination)}</span>
        </div>
        <div class="card-meta">
          <span class="card-dates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}
          </span>
          <span class="card-cabin-tag">${getCabinLabel(trip.cabin)}${trip.seats > 1 ? ` · ${trip.seats} seats` : ''}</span>
        </div>
        <div class="card-availability ${statusClass}">
          <span class="status-icon"></span>
          <span>${statusText}</span>
          ${count !== null && count > 0 ? `<span class="availability-count">${count}</span>` : ''}
        </div>
        ${summaryHtml}
    `;
}

function renderTrips() {
    const grid = document.getElementById('trips-grid');
    grid.innerHTML = trips.map((trip, index) => {
        return `<div class="trip-card" data-id="${trip.id}" style="animation-delay: ${index * 0.05}s">
            ${buildCardInnerHtml(trip)}
        </div>`;
    }).join('');

    grid.querySelectorAll('.trip-card').forEach(card => {
        card.addEventListener('click', () => {
            openDetailModal(card.dataset.id);
        });
    });
}

function updateTripCard(tripId) {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const grid = document.getElementById('trips-grid');
    const card = grid.querySelector(`.trip-card[data-id="${tripId}"]`);
    if (!card) return;

    // Only fade the availability section, keep route/meta stable
    const avail = card.querySelector('.card-availability');
    const summary = card.querySelector('.trip-summary-list');
    const targets = [avail, summary].filter(Boolean);

    if (targets.length) {
        targets.forEach(el => el.style.opacity = '0.4');
        setTimeout(() => {
            card.innerHTML = buildCardInnerHtml(trip);
            // New elements start fully visible
        }, 150);
    } else {
        card.innerHTML = buildCardInnerHtml(trip);
    }
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
function openSettings() {
    document.getElementById('user-api-key').value = userApiKey;
    document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-panel').classList.add('hidden');
}

// ---- Trip Modal ----
const CABIN_OPTIONS = [
    { value: 'economy', label: 'Economy' },
    { value: 'premium', label: 'Premium Economy' },
    { value: 'business', label: 'Business' },
    { value: 'first', label: 'First' },
];
const SEATS_OPTIONS = [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
];

function setTripCustomSelect(triggerId, hiddenId, value, label) {
    const trigger = document.getElementById(triggerId);
    const hidden = document.getElementById(hiddenId);
    if (trigger) {
        trigger.dataset.value = value;
        trigger.querySelector('.custom-select-label').textContent = label;
    }
    if (hidden) hidden.value = value;
}

function setupTripCustomSelects(cabinVal, seatsVal) {
    const cabinLabel = CABIN_OPTIONS.find(o => o.value === cabinVal)?.label || 'Business';
    const seatsLabel = String(seatsVal);

    setTripCustomSelect('trip-cabin-select', 'trip-cabin', cabinVal, cabinLabel);
    setTripCustomSelect('trip-seats-select', 'trip-seats', String(seatsVal), seatsLabel);

    setupCustomSelect('trip-cabin-select', CABIN_OPTIONS, (val, label) => {
        setTripCustomSelect('trip-cabin-select', 'trip-cabin', val, label);
    });
    setupCustomSelect('trip-seats-select', SEATS_OPTIONS, (val, label) => {
        setTripCustomSelect('trip-seats-select', 'trip-seats', val, label);
    });
}

function openAddModal() {
    document.getElementById('modal-title').textContent = 'New Trip';
    document.getElementById('trip-form').reset();
    document.getElementById('trip-id').value = '';
    // Set default dates to next month
    const start = new Date();
    start.setMonth(start.getMonth() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    document.getElementById('trip-start-date').value = formatDateInput(start);
    document.getElementById('trip-end-date').value = formatDateInput(end);
    // Prefill with last-used defaults
    setupTripCustomSelects(tripDefaults.cabin, tripDefaults.seats);
    document.getElementById('trip-modal').classList.remove('hidden');
    setupAutocomplete('trip-origin');
    setupAutocomplete('trip-destination');
    setupDateRange('trip-start-date', 'trip-end-date');
}

function openEditModal(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    document.getElementById('modal-title').textContent = 'Edit Trip';
    document.getElementById('trip-id').value = trip.id;
    document.getElementById('trip-origin').value = trip.origin;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start-date').value = trip.startDate;
    document.getElementById('trip-end-date').value = trip.endDate;
    setupTripCustomSelects(trip.cabin || 'business', trip.seats || 1);
    document.getElementById('trip-modal').classList.remove('hidden');
    setupAutocomplete('trip-origin');
    setupAutocomplete('trip-destination');
    setupDateRange('trip-start-date', 'trip-end-date');
}

function closeModal() {
    closeCalendar();
    const openDropdown = document.querySelector('.custom-dropdown');
    if (openDropdown) openDropdown.remove();
    document.getElementById('trip-modal').classList.add('hidden');
}

function handleTripSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('trip-id').value;
    const origin = document.getElementById('trip-origin').value.trim().toUpperCase();
    const destination = document.getElementById('trip-destination').value.trim().toUpperCase();
    const startDate = document.getElementById('trip-start-date').value;
    const endDate = document.getElementById('trip-end-date').value;
    const cabin = document.getElementById('trip-cabin').value;
    const seats = parseInt(document.getElementById('trip-seats').value, 10);

    if (!origin || !destination || !startDate || !endDate) return;

    if (id) {
        const trip = trips.find(t => t.id === id);
        if (trip) {
            trip.origin = origin;
            trip.destination = destination;
            trip.startDate = startDate;
            trip.endDate = endDate;
            trip.cabin = cabin;
            trip.seats = seats;
            delete availabilityCache[trip.id];
        }
    } else {
        const newTrip = {
            id: generateId(),
            origin,
            destination,
            startDate,
            endDate,
            cabin,
            seats,
            createdAt: Date.now(),
        };
        trips.push(newTrip);
    }

    // Update defaults for next new trip
    tripDefaults.cabin = cabin;
    tripDefaults.seats = seats;
    saveDefaults();

    saveTrips();
    saveCache();
    closeModal();
    renderDashboard();
    refreshAll();
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

    currentDetailTripId = id;
    const cache = availabilityCache[trip.id];

    // Title shows city names (fallback to IATA codes)
    const titleEl = document.getElementById('detail-title');
    const originName = getAirportCity(trip.origin) || trip.origin;
    const destName = getAirportCity(trip.destination) || trip.destination;
    titleEl.textContent = `${originName} to ${destName}`;

    const body = document.getElementById('detail-body');

    const cabinLabel = getCabinLabel(trip.cabin);

    // Clear header selects (no longer used there)
    document.getElementById('detail-selects').innerHTML = '';

    const editControls = `
    <div class="trip-edit-controls">
      <div class="edit-row">
        <div class="edit-group">
            <label>Route</label>
            <div class="input-merged route-compact">
                <input type="text" id="edit-origin" class="input-uppercase" value="${escapeHtml(trip.origin)}" title="Origin">
                <span class="arrow">→</span>
                <input type="text" id="edit-dest" class="input-uppercase" value="${escapeHtml(trip.destination)}" title="Destination">
            </div>
        </div>
        <div class="edit-group">
            <label>Dates</label>
            <div class="input-merged dates dates-compact">
                <div class="autocomplete-wrapper"><input type="text" id="edit-start" class="date-text-input" value="${trip.startDate}" placeholder="YYYY-MM-DD" title="Start Date" readonly></div>
                <span class="sep">—</span>
                <div class="autocomplete-wrapper"><input type="text" id="edit-end" class="date-text-input" value="${trip.endDate}" placeholder="YYYY-MM-DD" title="End Date" readonly></div>
            </div>
        </div>
        <div class="edit-group">
            <label>Cabin</label>
            <div class="custom-select" id="cabin-select" data-value="${trip.cabin}">
                <span class="custom-select-label" id="cabin-label">${cabinLabel}</span>
                <svg class="custom-select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        </div>
        <div class="edit-group">
            <label>Seats</label>
            <div class="custom-select" id="seats-select" data-value="${trip.seats}">
                <span class="custom-select-label" id="seats-label">${trip.seats}</span>
                <svg class="custom-select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        </div>
        <input type="hidden" id="edit-cabin" value="${trip.cabin}" />
        <input type="hidden" id="edit-seats" value="${trip.seats}" />
      </div>
    </div>
  `;

    body.innerHTML = editControls + `<div id="detail-results"></div>`;
    document.getElementById('detail-modal').classList.remove('hidden');

    // Render results into the dedicated container
    updateDetailResults(trip, cache);

    // Attach Autocomplete for edit fields
    setupAutocomplete('edit-origin');
    setupAutocomplete('edit-dest');

    // Auto-refresh helper for any parameter change
    const autoRefresh = async () => {
        const newOrigin = document.getElementById('edit-origin').value.trim().toUpperCase();
        const newDest = document.getElementById('edit-dest').value.trim().toUpperCase();
        const newStart = document.getElementById('edit-start').value;
        const newEnd = document.getElementById('edit-end').value;
        const newCabin = document.getElementById('edit-cabin').value;
        const newSeats = parseInt(document.getElementById('edit-seats').value, 10);

        if (!newOrigin || !newDest || !newStart || !newEnd) return;

        trip.origin = newOrigin;
        trip.destination = newDest;
        trip.startDate = newStart;
        trip.endDate = newEnd;
        trip.cabin = newCabin;
        trip.seats = newSeats;

        // Update title
        const titleEl = document.getElementById('detail-title');
        const originName = getAirportCity(trip.origin) || trip.origin;
        const destName = getAirportCity(trip.destination) || trip.destination;
        titleEl.textContent = `${originName} to ${destName}`;

        tripDefaults.cabin = newCabin;
        tripDefaults.seats = newSeats;
        saveDefaults();
        saveTrips();
        updateTripCard(trip.id);

        // Show loading in results area, preserving current height
        const resultsEl = document.getElementById('detail-results');
        resultsEl.style.minHeight = resultsEl.offsetHeight + 'px';
        resultsEl.innerHTML = `<div class="no-results"><div class="nr-icon"><span class="spinner"></span></div><p>Scanning for availability...</p></div>`;

        await refreshSingleTrip(trip);

        // Re-render only results, then release height lock
        updateDetailResults(trip, availabilityCache[trip.id]);
        resultsEl.style.minHeight = '';
    };

    // Route fields: refresh only on explicit selection (not blur)
    ['edit-origin', 'edit-dest'].forEach(fieldId => {
        const el = document.getElementById(fieldId);
        let lastRefreshed = el.value;
        el.addEventListener('change', () => {
            const val = el.value.trim().toUpperCase();
            if (val && val !== lastRefreshed) {
                lastRefreshed = val;
                autoRefresh();
            }
        });
    });

    // Date fields: calendar picker with auto-refresh
    setupDateRange('edit-start', 'edit-end', autoRefresh);

    // Cabin & seats dropdowns
    setupCustomSelect('cabin-select', [
        { value: 'economy', label: 'Economy' },
        { value: 'premium', label: 'Premium Economy' },
        { value: 'business', label: 'Business' },
        { value: 'first', label: 'First' },
    ], (val, label) => {
        document.getElementById('edit-cabin').value = val;
        document.getElementById('cabin-label').textContent = label;
        autoRefresh();
    });

    setupCustomSelect('seats-select', [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
    ], (val, label) => {
        document.getElementById('edit-seats').value = val;
        document.getElementById('seats-label').textContent = label;
        autoRefresh();
    });
}

async function refreshSingleTrip(trip) {
    delete availabilityCache[trip.id];
    saveTrips();
    saveCache();
    updateTripCard(trip.id);

    const result = await searchAvailability(trip.origin, trip.destination, trip.startDate, trip.endDate, trip.cabin, trip.seats);

    if (result && result.data && result.data.length > 0) {
        const cabinPrefix = getCabinPrefix(trip.cabin);
        const relevantData = result.data.filter(item => {
            const available = item[`${cabinPrefix}Available`] || item[`${cabinPrefix}AvailableRaw`];
            const remaining = Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0);
            const sourceId = item.Source || item.source;
            return available === true &&
                remaining >= trip.seats &&
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
    updateTripCard(trip.id);
}

function updateDetailResults(trip, cache) {
    const resultsEl = document.getElementById('detail-results');
    if (!resultsEl) return;

    let html = '';

    if (!cache || !cache.data) {
        html = `
      <div class="no-results">
        <div class="nr-icon">🔍</div>
        <p>No availability data yet. Change a parameter to scan for seats.</p>
      </div>
    `;
    } else if (cache.data.length === 0) {
        html = `
      <div class="no-results">
        <div class="nr-icon">😕</div>
        <p>No award seats found for this route and date range.</p>
        <p style="color: var(--text-muted); font-size: var(--font-sm); margin-top: 8px;">Try adjusting your dates or cabin class.</p>
      </div>
    `;
    } else {
        const totalResults = cache.data.length;
        const programs = [...new Set(cache.data.map(a => a.Source || a.source || 'Unknown'))];
        const minMiles = Math.min(...cache.data.map(a => a.MileageCost || a.mileage_cost || Infinity));

        html = `
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
        ${cache.data.slice(0, 50).map((a, index) => {
            const date = a.Date || '—';
            const route = `${a.Route?.OriginAirport || trip.origin} → ${a.Route?.DestinationAirport || trip.destination}`;
            const program = String(a.Source).replace('Airlines', '').replace('Airways', '');
            const miles = a.MileageCost || '—';
            const seats = a.RemainingSeats > 0 ? a.RemainingSeats : '—';

            const isQatar = a.Source === 'qatar';
            const clickableClass = isQatar ? 'clickable' : '';
            const dataIndex = isQatar ? `data-index="${index}"` : '';

            return `
            <div class="avail-row ${clickableClass}" ${dataIndex} ${isQatar ? 'title="Click to view on Qatar Airways"' : ''}>
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

    resultsEl.innerHTML = html;

    // Attach click listeners for Qatar deep links
    resultsEl.querySelectorAll('.avail-row.clickable').forEach(row => {
        row.addEventListener('click', () => {
            const index = row.dataset.index;
            const item = cache.data[index];
            const url = generateQatarLink(item, trip.cabin, trip.origin, trip.destination);
            window.open(url, '_blank');
        });
    });
}

function closeDetailModal() {
    closeCalendar();
    document.getElementById('detail-modal').classList.add('hidden');
    document.getElementById('detail-selects').innerHTML = '';
    currentDetailTripId = null;
}

// ---- Availability Refresh ----
async function refreshAll() {
    const btn = document.getElementById('refresh-all-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Scanning...';

    // Ensure cards exist in the DOM (no-op if already rendered)
    const grid = document.getElementById('trips-grid');
    if (!grid.children.length || grid.children.length !== trips.length) {
        renderTrips();
    }

    for (const trip of trips) {
        // Update only this card to "loading" state
        availabilityCache[trip.id] = { status: 'loading', data: null, lastFetched: null };
        updateTripCard(trip.id);

        const result = await searchAvailability(trip.origin, trip.destination, trip.startDate, trip.endDate, trip.cabin, trip.seats);

        if (result && result.data && result.data.length > 0) {
            const cabinPrefix = getCabinPrefix(trip.cabin);
            const relevantData = result.data.filter(item => {
                const available = item[`${cabinPrefix}Available`] || item[`${cabinPrefix}AvailableRaw`];
                const remaining = Number(item[`${cabinPrefix}RemainingSeatsRaw`] || item[`${cabinPrefix}RemainingSeats`] || 0);
                const sourceId = item.Source || item.source;

                return available === true &&
                    remaining >= trip.seats &&
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
        // Update only this card with the result
        updateTripCard(trip.id);

        await sleep(300);
    }

    btn.disabled = false;
    btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    Refresh All
  `;
}

// ---- Utilities ----
function getCabinLabel(cabin) {
    switch (cabin) {
        case 'economy': return 'Economy';
        case 'premium': return 'Premium';
        case 'business': return 'Business';
        case 'first': return 'First';
        default: return 'Business';
    }
}

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
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
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
    loadState(); // Load settings first to get API Key
    userApiKey = localStorage.getItem('seats_aero_api_key') || ''; // Reload to be sure

    if (!userApiKey) {
        setTimeout(() => {
            alert('Welcome to Avioscanner! Please enter your Seats.aero API Key in Settings to get started.');
            openSettings();
        }, 500);
    } else {
        await loadAirports();
    }

    renderDashboard();

    // Set initial API key status based on stored key
    if (userApiKey && apiVerified) {
        setApiStatus('connected', 'Valid key');
    } else if (userApiKey) {
        setApiStatus('warning', 'Key not verified');
    } else {
        setApiStatus('error', 'Key required');
    }

    // --- Event Listeners ---

    // Settings
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-overlay').addEventListener('click', closeSettings);

    // API Key (inside settings)
    setupApiKeyInput();
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
    document.getElementById('detail-delete').addEventListener('click', () => {
        if (currentDetailTripId) {
            deleteTrip(currentDetailTripId);
            closeDetailModal();
        }
    });

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
function setApiStatus(state, text) {
    const dot = document.getElementById('api-status-dot');
    const label = document.getElementById('api-status-text');
    if (!dot || !label) return;
    dot.className = 'status-dot';
    if (state) dot.classList.add(state);
    label.textContent = text;
}

function setupApiKeyInput() {
    const keyInput = document.getElementById('user-api-key');
    if (!keyInput) return;

    keyInput.addEventListener('input', () => {
        setApiStatus('error', 'Unverified key');
        apiVerified = false;
        localStorage.removeItem('seats_aero_api_verified');
    });
}

async function handleKeySave() {
    const keyInput = document.getElementById('user-api-key');
    const saveBtn = document.getElementById('key-save-btn');
    const newKey = keyInput.value.trim();

    if (!newKey) {
        setApiStatus('error', 'Key required');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Verifying...';
    setApiStatus('warning', 'Verifying...');

    const isValid = await checkHealth(newKey);

    if (isValid) {
        userApiKey = newKey;
        apiVerified = true;
        localStorage.setItem('seats_aero_api_key', newKey);
        localStorage.setItem('seats_aero_api_verified', newKey);
        setApiStatus('connected', 'Valid key');
        loadAirports();
    } else {
        apiVerified = false;
        localStorage.removeItem('seats_aero_api_verified');
        setApiStatus('error', 'Invalid key');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Verify & Save';
}
