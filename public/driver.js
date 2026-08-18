const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "driver") {
    alert("Access Denied");
    window.location.href = "/login.html";
}


// ==========================================
// DOM ELEMENTS
// ==========================================

const sheetTitleEl = document.getElementById("sheet-title");
const sheetBodyEl = document.getElementById("sheet-body");
const availableCountEl = document.getElementById("available-count");

const driverAvatar = document.getElementById("driver-avatar");
const driverName = document.getElementById("driver-name");
const driverMeta = document.getElementById("driver-meta");

const earningsToday = document.getElementById("earnings-today");

const onlineToggle = document.getElementById("online-toggle");
const onlineLabel = document.getElementById("online-label");

const driverLocationLabel = document.getElementById("driver-location-label");

const historySummary = document.getElementById("history-summary");

const openHistoryBtn = document.getElementById("open-history-btn");
const closeHistoryBtn = document.getElementById("close-history-btn");
const historyOverlay = document.getElementById("history-overlay");
const historyPanelSubtitle = document.getElementById("history-panel-subtitle");
const statEarnedToday = document.getElementById("stat-earned-today");
const statTripsToday = document.getElementById("stat-trips-today");
const historyListEl = document.getElementById("history-list");

const toastEl = document.getElementById("drv-toast");

document.querySelectorAll(".drv-go-online-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        onlineToggle.checked = true;
        onlineToggle.dispatchEvent(new Event("change"));
    });
});


// ==========================================
// TOAST
// ==========================================

let toastTimer = null;

function showToast(message) {

    toastEl.textContent = message;
    toastEl.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toastEl.hidden = true;
    }, 2600);

}


// ==========================================
// FARE ESTIMATE
// Your ride objects don't carry a stored price, so this
// estimates one from the pickup/dropoff coordinates using
// the same base + per-km rate as the passenger fare estimate.
// Adjust FARE_BASE / FARE_PER_KM if your real pricing differs.
// ==========================================

const FARE_BASE = 15;
const FARE_PER_KM = 8.5;

function haversineKm(a, b) {

    if (!a || !b) return 0;

    const toRad = deg => (deg * Math.PI) / 180;

    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.asin(Math.sqrt(h));

}

function estimateFare(ride) {

    const km = haversineKm(ride.pickup, ride.dropoff);

    return {
        km,
        fare: FARE_BASE + km * FARE_PER_KM
    };

}

function formatRand(amount) {
    return `R${amount.toFixed(2)}`;
}


// ==========================================
// DETERMINISTIC "RATING" DISPLAY
// The backend doesn't store ratings for users, so this
// derives a stable-looking 4.3–5.0 rating from the
// person's id/email purely for display — it's cosmetic
// only, same spirit as the fare estimate above.
// ==========================================

function pseudoRating(seed) {

    if (!seed) return "4.8";

    let hash = 0;

    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }

    const rating = 4.3 + (hash % 71) / 100; // 4.30 – 5.00

    return rating.toFixed(1);

}


// ==========================================
// ONLINE / OFFLINE (local UI state only —
// there's no backend "online status" endpoint,
// so this just controls whether we poll/show
// available trips.)
// ==========================================

let isOnline = localStorage.getItem("drv_isOnline") !== "false";

function applyOnlineState() {

    onlineToggle.checked = isOnline;
    onlineLabel.textContent = isOnline ? "Online" : "Offline";

    document.body.classList.toggle("is-offline", !isOnline);

    render();

}

onlineToggle.addEventListener("change", () => {

    isOnline = onlineToggle.checked;
    localStorage.setItem("drv_isOnline", String(isOnline));

    onlineLabel.textContent = isOnline ? "Online" : "Offline";
    document.body.classList.toggle("is-offline", !isOnline);

    if (isOnline) {
        loadAvailableRides();
    } else {
        availableRides = [];
        render();
    }

});


// ==========================================
// PROFILE
// ==========================================

async function loadProfile() {

    try {

        const response = await fetch("/api/me", {
            headers: {
                "Authorization": token
            }
        });

        if (!response.ok) {
            throw new Error("Could not load profile");
        }

        const user = await response.json();

        const name = user.name || "Driver";

        driverName.textContent = name;
        driverAvatar.textContent = name.charAt(0).toUpperCase();

        driverMeta.textContent = `${pseudoRating(user.email || name)} ★`;

    } catch (error) {

        console.error("Profile load error:", error);

        driverName.textContent = "Driver";
        driverAvatar.textContent = "D";

    }

}

loadProfile();


// ==========================================
// MAP + GEOLOCATION
// ==========================================

const map = L.map("map", { zoomControl: true, attributionControl: true }).setView(
    [-26.2041, 28.0473], // Johannesburg — replaced once geolocation resolves
    12
);

L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
).addTo(map);

setTimeout(() => {
    map.invalidateSize();
}, 300);

let driverLocation = null;
let driverMarker = null;
let lastGeocodedAt = null;

const driverIcon = L.divIcon({
    className: "drv-driver-marker-icon",
    html: '<div class="drv-driver-marker-dot"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

const pickupIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const dropoffIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

async function reverseGeocode(lat, lng) {

    try {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
            { headers: { "Accept": "application/json" } }
        );

        if (!response.ok) throw new Error("reverse geocode failed");

        const data = await response.json();

        const addr = data.address || {};

        return (
            addr.suburb ||
            addr.neighbourhood ||
            addr.city_district ||
            addr.city ||
            data.display_name ||
            `${lat.toFixed(3)}, ${lng.toFixed(3)}`
        );

    } catch (error) {

        console.error("Reverse geocode error:", error);
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;

    }

}

function onLocationUpdate(position) {

    const prev = driverLocation;

    driverLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    if (driverMarker) {
        driverMarker.setLatLng([driverLocation.lat, driverLocation.lng]);
    } else {
        driverMarker = L.marker(
            [driverLocation.lat, driverLocation.lng],
            { icon: driverIcon }
        ).addTo(map);

        map.setView([driverLocation.lat, driverLocation.lng], 13);
    }

    // Only reverse-geocode on the first fix, or once we've moved
    // a meaningful distance — keeps this from hammering Nominatim.
    const movedFar = prev && haversineKm(prev, driverLocation) > 0.3;

    if (!lastGeocodedAt || movedFar) {

        lastGeocodedAt = Date.now();

        reverseGeocode(driverLocation.lat, driverLocation.lng).then(label => {
            driverLocationLabel.textContent = label;
        });

    }

    // While a trip is under way, use real movement to drive the
    // live meter / progress bar.
    if (currentRide && tripPhase === "onTrip") {
        render();
    }

    if (!prev && isOnline) {
        loadAvailableRides();
    }

}

function locateDriver() {

    if (!navigator.geolocation) {

        driverLocationLabel.textContent = "Location unavailable";
        return;

    }

    navigator.geolocation.getCurrentPosition(
        onLocationUpdate,
        (error) => {
            console.error("Geolocation error:", error);
            driverLocationLabel.textContent = "Location unavailable";
        }
    );

    navigator.geolocation.watchPosition(
        onLocationUpdate,
        (error) => console.error("Geolocation watch error:", error),
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );

}

locateDriver();


// ==========================================
// TRIP MARKERS ON MAP
// ==========================================

let tripMarkers = [];

function clearTripMarkers() {

    tripMarkers.forEach(marker => map.removeLayer(marker));
    tripMarkers = [];

}

function plotTrip(ride) {

    if (ride.pickup) {

        const marker = L.marker(
            [ride.pickup.lat, ride.pickup.lng],
            { icon: pickupIcon }
        )
            .addTo(map)
            .bindPopup(`<strong>Pickup</strong><br>${ride.pickupAddress || "Address unavailable"}`);

        tripMarkers.push(marker);

    }

    if (ride.dropoff) {

        const marker = L.marker(
            [ride.dropoff.lat, ride.dropoff.lng],
            { icon: dropoffIcon }
        )
            .addTo(map)
            .bindPopup(`<strong>Drop-off</strong><br>${ride.dropoffAddress || "Address unavailable"}`);

        tripMarkers.push(marker);

    }

}


// ==========================================
// LOCAL TRIP-PHASE STATE MACHINE
// The backend only knows "accepted" / "completed" — the
// heading-to-pickup vs. on-trip distinction, and the live
// meter, are tracked locally (and persisted per ride id so
// a refresh doesn't lose them).
// ==========================================

function getPhase(rideId) {
    return localStorage.getItem(`drv_phase_${rideId}`) || "heading";
}

function setPhase(rideId, phase) {
    localStorage.setItem(`drv_phase_${rideId}`, phase);
}

function getTripStart(rideId) {
    const raw = localStorage.getItem(`drv_tripstart_${rideId}`);
    return raw ? JSON.parse(raw) : null;
}

function setTripStart(rideId, loc) {
    localStorage.setItem(`drv_tripstart_${rideId}`, JSON.stringify(loc));
}

function clearTripState(rideId) {
    localStorage.removeItem(`drv_phase_${rideId}`);
    localStorage.removeItem(`drv_tripstart_${rideId}`);
}

let tripPhase = "heading";


// ==========================================
// PASSENGER PROFILE SNIPPET
// ==========================================

function passengerAvatarLetter(ride) {
    return ride.passenger?.name
        ? ride.passenger.name.charAt(0).toUpperCase()
        : "P";
}

function passengerRow(ride, { withActions } = {}) {

    return `
        <div class="drv-passenger-row">

            <div class="drv-passenger-avatar">${passengerAvatarLetter(ride)}</div>

            <div class="drv-passenger-info">
                <strong>${ride.passenger?.name || "Passenger"}</strong>
                <small>${pseudoRating(ride.passenger?.email || ride.passenger?.name)} ★</small>
            </div>

            ${withActions ? `
                <div class="drv-passenger-actions">
                    <button type="button" title="Call passenger">📞</button>
                    <button type="button" title="Message passenger">💬</button>
                </div>
            ` : ""}

        </div>
    `;

}

function routeRows(ride, { pickedUp } = {}) {

    return `
        <div class="drv-route">

            <div class="drv-route-row">
                <span class="drv-route-dot pickup${pickedUp ? " done" : ""}">${pickedUp ? "✓" : ""}</span>
                <span class="drv-route-text">
                    <strong>${addressTitle(ride.pickupAddress)}</strong>
                    <small>${ride.pickupAddress || "Address unavailable"}</small>
                </span>
            </div>

            <div class="drv-route-row">
                <span class="drv-route-dot dropoff"></span>
                <span class="drv-route-text">
                    <strong>${addressTitle(ride.dropoffAddress)}</strong>
                    <small>${ride.dropoffAddress || "Address unavailable"}</small>
                </span>
            </div>

        </div>
    `;

}

// The address strings we store are full addresses (e.g. "Mary
// Fitzgerald Square, Newtown") — use the first comma-separated
// segment as a short "place name" heading, matching the video's
// two-line pickup/dropoff rows.
function addressTitle(address) {

    if (!address) return "Pickup";

    return address.split(",")[0].trim();

}


// ==========================================
// AVAILABLE TRIPS (locally dismissible — there's
// no backend "decline" concept, so the X button
// just hides a card until the next refresh)
// ==========================================

const dismissedRides = new Set();
const seenRideIds = new Set();

let availableRides = [];
let currentRide = null;

function dismissRide(id) {

    dismissedRides.add(id);
    availableRides = availableRides.filter(r => r._id !== id);
    render();

}

async function loadAvailableRides() {

    if (!isOnline) {
        return;
    }

    try {

        const response = await fetch("/api/available-rides", {
            headers: { "Authorization": token }
        });

        if (!response.ok) {
            throw new Error("Failed to load available rides");
        }

        const allRides = await response.json();

        availableRides = allRides.filter(ride => !dismissedRides.has(ride._id));

        render();

    } catch (err) {

        console.error("Error loading available rides:", err);

    }
}


// ==========================================
// MY ACCEPTED (ACTIVE) RIDE
// ==========================================

async function loadMyRides() {

    try {

        const response = await fetch("/api/my-driver-rides", {
            headers: { "Authorization": token }
        });

        if (!response.ok) {
            throw new Error("Failed to load accepted rides");
        }

        const rides = await response.json();

        currentRide = rides[0] || null;

        if (currentRide) {
            tripPhase = getPhase(currentRide._id);
        }

        render();

    } catch (err) {

        console.error("Error loading accepted rides:", err);

    }
}


// ==========================================
// TODAY'S EARNINGS (estimated — see note above
// FARE_BASE/FARE_PER_KM)
// ==========================================

let completedRidesCache = [];

async function loadEarnings() {

    try {

        const response = await fetch("/api/completed-rides", {
            headers: { "Authorization": token }
        });

        if (!response.ok) {
            throw new Error("Failed to load completed rides");
        }

        const rides = await response.json();
        completedRidesCache = rides;

        const todayStr = new Date().toDateString();

        // Only rides with a usable timestamp can be checked
        // against "today" — rides without one are still
        // counted in, since we can't otherwise tell.
        const todaysRides = rides.filter(ride => {

            const ts = ride.updatedAt || ride.createdAt;
            if (!ts) return true;

            return new Date(ts).toDateString() === todayStr;

        });

        const total = todaysRides.reduce((sum, ride) => {
            return sum + estimateFare(ride).fare;
        }, 0);

        earningsToday.textContent = formatRand(total);

        historySummary.textContent =
            `${rides.length} trip${rides.length === 1 ? "" : "s"} · ${formatRand(total)}`;

        if (!historyOverlay.hidden) {
            renderHistoryPanel();
        }

    } catch (err) {

        console.error("Error loading earnings:", err);

    }

}


// ==========================================
// ACCEPT / COMPLETE / CANCEL RIDE
// ==========================================

async function updateRide(id, status) {

    try {

        const response = await fetch(`/api/rides/${id}`, {

            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                "Authorization": token
            },

            body: JSON.stringify({ status })

        });

        if (!response.ok) {

            const error = await response.json();
            alert(error.message || error.error);
            return;

        }

        if (status === "accepted") {
            setPhase(id, "heading");
            tripPhase = "heading";
        }

        if (status === "completed") {
            clearTripState(id);
            showToast("Trip completed");
        }

        clearTripMarkers();
        currentRide = null;

        await Promise.all([
            loadAvailableRides(),
            loadMyRides(),
            loadEarnings()
        ]);

    } catch (err) {

        console.error("Error updating ride:", err);

    }
}

async function cancelCurrentRide(id) {

    if (!confirm("Cancel this trip? It will go back to other nearby drivers.")) {
        return;
    }

    try {

        const response = await fetch(`/api/rides/${id}/cancel`, {

            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                "Authorization": token
            }

        });

        if (!response.ok) {

            const error = await response.json();
            alert(error.message || error.error);
            return;

        }

        clearTripState(id);
        clearTripMarkers();
        currentRide = null;

        showToast("Trip cancelled");

        await Promise.all([
            loadAvailableRides(),
            loadMyRides(),
            loadEarnings()
        ]);

    } catch (err) {

        console.error("Error cancelling ride:", err);

    }

}

function startTrip(id) {

    setPhase(id, "onTrip");
    tripPhase = "onTrip";

    setTripStart(id, driverLocation || currentRide?.pickup || null);

    render();

}


// ==========================================
// RENDER — SHEET BODY
// ==========================================

function render() {

    clearTripMarkers();

    if (currentRide) {

        sheetTitleEl.textContent = "Current trip";
        availableCountEl.hidden = true;

        sheetBodyEl.innerHTML = renderCurrentTripCard(currentRide);
        plotTrip(currentRide);

        return;

    }

    if (!isOnline) {

        sheetTitleEl.textContent = "Offline";
        availableCountEl.hidden = true;

        sheetBodyEl.innerHTML = `
            <div class="drv-empty">
                <div class="drv-offline-icon">⏻</div>
                <strong>You're not receiving trips</strong>
                <span>Go online and new requests near you will appear here.</span>
                <button class="drv-btn-primary drv-go-online-btn">Go online</button>
            </div>
        `;

        sheetBodyEl.querySelector(".drv-go-online-btn").addEventListener("click", () => {
            onlineToggle.checked = true;
            onlineToggle.dispatchEvent(new Event("change"));
        });

        return;

    }

    sheetTitleEl.textContent = "Available trips";
    availableCountEl.hidden = false;
    availableCountEl.textContent = availableRides.length;

    if (availableRides.length === 0) {

        sheetBodyEl.innerHTML = `
            <div class="drv-empty">
                <div class="drv-offline-icon">🚗</div>
                <strong>No trips nearby right now</strong>
                <span>New requests near you will appear here.</span>
            </div>
        `;

        return;

    }

    sheetBodyEl.innerHTML = availableRides.map(ride => renderAvailableCard(ride)).join("");

    availableRides.forEach(ride => plotTrip(ride));

}

function renderAvailableCard(ride) {

    const { km, fare } = estimateFare(ride);

    const awayKm = driverLocation
        ? haversineKm(driverLocation, ride.pickup)
        : null;

    // Rough ETA assuming ~30km/h average city driving speed
    const awayMin = awayKm !== null
        ? Math.max(1, Math.round((awayKm / 30) * 60))
        : null;

    const isNew = !seenRideIds.has(ride._id);
    seenRideIds.add(ride._id);

    return `
        <div class="drv-trip-card" id="ride-${ride._id}">

            <div class="drv-fare-row">
                <span class="drv-fare">
                    ${formatRand(fare)}
                    ${isNew ? '<span class="drv-new-badge">NEW</span>' : ""}
                </span>
                <span class="drv-distance-badge">${km.toFixed(1)} km</span>
            </div>

            <p class="drv-fare-detail">
                ${formatRand(FARE_BASE)} base · ${km.toFixed(1)} km &times; ${formatRand(FARE_PER_KM)}/km
            </p>

            ${passengerRow(ride)}

            ${routeRows(ride)}

            <div class="drv-trip-meta-row">

                <span class="drv-trip-eta">
                    ${awayKm !== null ? `${awayKm.toFixed(1)} km · ${awayMin} min away` : ""}
                </span>

                <div class="drv-trip-actions">

                    <button class="drv-btn-decline" onclick="dismissRide('${ride._id}')">
                        ✕
                    </button>

                    <button class="drv-btn-accept" onclick="updateRide('${ride._id}', 'accepted')">
                        Accept
                    </button>

                </div>

            </div>

        </div>
    `;

}

function renderCurrentTripCard(ride) {

    const { km: totalKm, fare: estimatedFare } = estimateFare(ride);

    if (tripPhase === "onTrip") {

        const tripStart = getTripStart(ride._id) || ride.pickup;

        const drivenKmRaw = driverLocation
            ? haversineKm(tripStart, driverLocation)
            : 0;

        const drivenKm = Math.min(drivenKmRaw, totalKm || drivenKmRaw);
        const liveFare = FARE_BASE + drivenKm * FARE_PER_KM;
        const progressPct = totalKm > 0
            ? Math.min(100, (drivenKm / totalKm) * 100)
            : 0;

        return `
            <div class="drv-trip-card drv-current">

                <span class="drv-status-pill ontrip">
                    <span class="drv-status-dot"></span> On trip
                </span>

                <div class="drv-fare-row">
                    <span class="drv-fare">${formatRand(liveFare)}</span>
                    <span class="drv-distance-badge">Meter · ${formatRand(FARE_PER_KM)}/km</span>
                </div>

                ${passengerRow(ride, { withActions: true })}

                ${routeRows(ride, { pickedUp: true })}

                <div class="drv-progress-track">
                    <div class="drv-progress-fill" style="width:${progressPct}%"></div>
                </div>

                <div class="drv-progress-labels">
                    <span>${drivenKm.toFixed(1)} km driven</span>
                    <span>${totalKm.toFixed(1)} km total</span>
                </div>

                <button class="drv-btn-primary" onclick="updateRide('${ride._id}', 'completed')">
                    Complete trip · ${formatRand(estimatedFare)}
                </button>

                <button class="drv-cancel-link" onclick="cancelCurrentRide('${ride._id}')">
                    Cancel trip
                </button>

            </div>
        `;

    }

    // Heading to pickup
    const awayKm = driverLocation
        ? haversineKm(driverLocation, ride.pickup)
        : null;

    return `
        <div class="drv-trip-card drv-current">

            <span class="drv-status-pill heading">
                <span class="drv-status-dot"></span> Heading to pickup
            </span>

            <div class="drv-fare-row">
                <span class="drv-fare">${formatRand(estimatedFare)}</span>
                <span class="drv-fare-col">
                    <span class="drv-fare-sub">Estimated fare</span>
                </span>
            </div>

            ${passengerRow(ride, { withActions: true })}

            ${routeRows(ride)}

            ${awayKm !== null ? `
                <p class="drv-trip-eta" style="margin-bottom:10px;">
                    ${awayKm.toFixed(1)} km away
                </p>
            ` : ""}

            <button class="drv-btn-primary" onclick="startTrip('${ride._id}')">
                Arrived — start trip
            </button>

            <button class="drv-cancel-link" onclick="cancelCurrentRide('${ride._id}')">
                Cancel trip
            </button>

        </div>
    `;

}


// ==========================================
// RIDE HISTORY PANEL
// ==========================================

function groupHistory(rides) {

    const todayStr = new Date().toDateString();

    const groups = { "TODAY": [], "EARLIER": [] };

    rides.forEach(ride => {

        const ts = ride.updatedAt || ride.createdAt;
        const isToday = ts && new Date(ts).toDateString() === todayStr;

        groups[isToday ? "TODAY" : "EARLIER"].push(ride);

    });

    return groups;

}

function renderHistoryPanel() {

    const rides = [...completedRidesCache].sort((a, b) => {

        const dateA = new Date(a.updatedAt || a.createdAt || 0);
        const dateB = new Date(b.updatedAt || b.createdAt || 0);

        return dateB - dateA;

    });

    const totalKm = rides.reduce((sum, ride) => sum + estimateFare(ride).km, 0);

    historyPanelSubtitle.textContent =
        `${rides.length} trip${rides.length === 1 ? "" : "s"} · ${totalKm.toFixed(1)} km driven`;

    const todayStr = new Date().toDateString();

    const todaysRides = rides.filter(ride => {
        const ts = ride.updatedAt || ride.createdAt;
        return ts && new Date(ts).toDateString() === todayStr;
    });

    const todaysTotal = todaysRides.reduce((sum, ride) => sum + estimateFare(ride).fare, 0);

    statEarnedToday.textContent = formatRand(todaysTotal);
    statTripsToday.textContent = todaysRides.length;

    if (rides.length === 0) {

        historyListEl.innerHTML = `<p class="drv-empty">No completed trips yet.</p>`;
        return;

    }

    const groups = groupHistory(rides);

    let html = "";

    Object.entries(groups).forEach(([label, groupRides]) => {

        if (groupRides.length === 0) return;

        html += `<div class="drv-history-group-label">${label}</div>`;

        groupRides.forEach(ride => {

            const { km, fare } = estimateFare(ride);

            const ts = ride.updatedAt || ride.createdAt;
            const timeLabel = ts
                ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";

            html += `
                <div class="drv-history-item">

                    <div class="drv-history-item-avatar">${passengerAvatarLetter(ride)}</div>

                    <div class="drv-history-item-info">
                        <strong>${addressTitle(ride.pickupAddress)} &rarr; ${addressTitle(ride.dropoffAddress)}</strong>
                        <small>${timeLabel ? `${timeLabel} · ` : ""}${ride.passenger?.name || "Passenger"} · ${km.toFixed(1)} km</small>
                    </div>

                    <span class="drv-history-item-fare">${formatRand(fare)}</span>

                </div>
            `;

        });

    });

    historyListEl.innerHTML = html;

}

openHistoryBtn.addEventListener("click", () => {

    historyOverlay.hidden = false;
    renderHistoryPanel();

});

closeHistoryBtn.addEventListener("click", () => {
    historyOverlay.hidden = true;
});

historyOverlay.addEventListener("click", (e) => {
    if (e.target === historyOverlay) {
        historyOverlay.hidden = true;
    }
});


// ==========================================
// INITIAL LOAD
// ==========================================

applyOnlineState();

loadAvailableRides();
loadMyRides();
loadEarnings();


// ==========================================
// AUTOMATIC REFRESH
// ==========================================

setInterval(() => {

    loadAvailableRides();
    loadMyRides();
    loadEarnings();

}, 5000);


// ==========================================
// LOGOUT
// ==========================================

document
    .getElementById("driver-logout-btn")
    .addEventListener("click", () => {

        localStorage.removeItem("token");
        localStorage.removeItem("role");

        window.location.href = "/login.html";

    });