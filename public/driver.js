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
// FARE CONSTANTS
// ==========================================

const FARE_BASE = 15;
const FARE_PER_KM = 8.5;

function haversineKm(a, b) {
    if (!a || !b) return 0;
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(h));
}

async function estimateFare(ride) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${ride.pickup.lng},${ride.pickup.lat};${ride.dropoff.lng},${ride.dropoff.lat}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === "Ok" && data.routes.length > 0) {
            const distanceKm = data.routes[0].distance / 1000;
            return {
                km: distanceKm,
                fare: FARE_BASE + distanceKm * FARE_PER_KM
            };
        }
        
        const km = haversineKm(ride.pickup, ride.dropoff);
        return {
            km: km,
            fare: FARE_BASE + km * FARE_PER_KM
        };
        
    } catch (error) {
        console.error("OSRM route error, using fallback:", error);
        const km = haversineKm(ride.pickup, ride.dropoff);
        return {
            km: km,
            fare: FARE_BASE + km * FARE_PER_KM
        };
    }
}

function formatRand(amount) {
    return `R${amount.toFixed(2)}`;
}


// ==========================================
// DETERMINISTIC "RATING" DISPLAY
// ==========================================

function pseudoRating(seed) {
    if (!seed) return "4.8";
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const rating = 4.3 + (hash % 71) / 100;
    return rating.toFixed(1);
}


// ==========================================
// ONLINE / OFFLINE
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
            headers: { "Authorization": token }
        });
        if (!response.ok) throw new Error("Could not load profile");
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
    [-26.2041, 28.0473],
    12
);

L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
    const movedFar = prev && haversineKm(prev, driverLocation) > 0.3;
    if (!lastGeocodedAt || movedFar) {
        lastGeocodedAt = Date.now();
        reverseGeocode(driverLocation.lat, driverLocation.lng).then(label => {
            driverLocationLabel.textContent = label;
        });
    }
      if (currentRide && tripPhase === "heading") {

    const movedFarFromRouteFetch =
        !pickupRouteLastLoc ||
        haversineKm(pickupRouteLastLoc, driverLocation) > 0.15;

    if (movedFarFromRouteFetch) {
        drawRouteToPickup(currentRide);
    }

}

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
let pickupRouteLine = null;
let pickupRouteRideId = null;
let pickupRouteLastLoc = null;

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
// TRIP ROUTE (pickup -> drop-off) — drawn once
// the driver has arrived and started the trip
// ==========================================

let tripRouteLine = null;

function clearTripRoute() {

    if (tripRouteLine) {
        map.removeLayer(tripRouteLine);
        tripRouteLine = null;
    }

}

async function drawRouteToDropoff(pickup, dropoff) {

    try {

        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${pickup.lng},${pickup.lat};` +
            `${dropoff.lng},${dropoff.lat}` +
            `?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.code !== "Ok") {
            console.error("Could not find a route to the drop-off.");
            return;
        }

        const route = data.routes[0];

        const routeCoordinates = route.geometry.coordinates.map(
            coordinate => [coordinate[1], coordinate[0]]
        );

        clearTripRoute();

        tripRouteLine = L.polyline(routeCoordinates, {
            weight: 5,
            color: "#f4c430" // matches --drv-gold, same as the drop-off marker
        }).addTo(map);

        map.fitBounds(tripRouteLine.getBounds(), { padding: [40, 40] });

    } catch (error) {

        console.error("Trip route error:", error);

    }

}

// ==========================================
// ROUTE: DRIVER → PICKUP (heading-to-pickup phase)
// ==========================================

async function drawRouteToPickup(ride) {

    if (!driverLocation || !ride?.pickup) return;

    try {

        const url = `https://router.project-osrm.org/route/v1/driving/${driverLocation.lng},${driverLocation.lat};${ride.pickup.lng},${ride.pickup.lat}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.code !== "Ok") return;

        // Bail if things changed while this request was in flight
        // (ride completed/cancelled, or driver started the trip)
        if (!currentRide || currentRide._id !== ride._id || tripPhase !== "heading") return;

        const coords = data.routes[0].geometry.coordinates.map(
            c => [c[1], c[0]]
        );

        if (pickupRouteLine) {
            map.removeLayer(pickupRouteLine);
        }

        pickupRouteLine = L.polyline(coords, {
            color: "#22c55e",
            weight: 5,
            opacity: 0.85,
            dashArray: "1, 8",
            lineCap: "round"
        }).addTo(map);

        pickupRouteRideId = ride._id;
        pickupRouteLastLoc = driverLocation;

    } catch (err) {
        console.error("Route-to-pickup error:", err);
    }

}

function clearPickupRoute() {

    if (pickupRouteLine) {
        map.removeLayer(pickupRouteLine);
        pickupRouteLine = null;
    }

    pickupRouteRideId = null;
    pickupRouteLastLoc = null;

}

// ==========================================
// LOCAL TRIP-PHASE STATE MACHINE
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

function addressTitle(address) {
    if (!address) return "Pickup";
    return address.split(",")[0].trim();
}


// ==========================================
// AVAILABLE TRIPS
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
    if (!isOnline) return;
    try {
        const response = await fetch("/api/available-rides", {
            headers: { "Authorization": token }
        });
        if (!response.ok) throw new Error("Failed to load available rides");
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
        if (!response.ok) throw new Error("Failed to load accepted rides");
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
// TODAY'S EARNINGS
// ==========================================

let completedRidesCache = [];

async function loadEarnings() {
    try {
        const response = await fetch("/api/completed-rides", {
            headers: { "Authorization": token }
        });
        if (!response.ok) throw new Error("Failed to load completed rides");
        const rides = await response.json();
        completedRidesCache = rides;
        const todayStr = new Date().toDateString();
        const todaysRides = rides.filter(ride => {
            const ts = ride.updatedAt || ride.createdAt;
            if (!ts) return true;
            return new Date(ts).toDateString() === todayStr;
        });
        const farePromises = todaysRides.map(ride => estimateFare(ride));
        const fares = await Promise.all(farePromises);
        const total = fares.reduce((sum, f) => sum + f.fare, 0);
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
    if (!confirm("Cancel this trip? It will go back to other nearby drivers.")) return;
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

async function renderAvailableCard(ride) {
    const { km, fare } = await estimateFare(ride);
    const awayKm = driverLocation
        ? haversineKm(driverLocation, ride.pickup)
        : null;
    const awayMin = awayKm !== null
        ? Math.max(1, Math.round((awayKm / 30) * 60))
        : null;
    const isNew = !seenRideIds.has(ride._id);
    seenRideIds.add(ride._id);
    return `
    <div class="drv-trip-card" id="ride-${ride._id}"
        onmouseenter="previewRoute('${ride._id}')"
        onmouseleave="clearRoutePreview()"
        onclick="previewRoute('${ride._id}')">

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
                <button class="drv-btn-decline" onclick="event.stopPropagation(); dismissRide('${ride._id}')">
                    ✕
                </button>
                <button class="drv-btn-accept" onclick="event.stopPropagation(); updateRide('${ride._id}', 'accepted')">
                    Accept
                </button>
            </div>
        </div>

    </div>
`;
}

async function renderCurrentTripCard(ride) {
    const { km: totalKm, fare: estimatedFare } = await estimateFare(ride);
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

async function render() {
    clearTripMarkers();
    clearRoutePreview(); 
    if (currentRide) {
        sheetTitleEl.textContent = "Current trip";
        availableCountEl.hidden = true;
        sheetBodyEl.innerHTML = await renderCurrentTripCard(currentRide);
        plotTrip(currentRide);
        
        if (tripPhase === "heading") {

            if (pickupRouteRideId !== currentRide._id) {
                drawRouteToPickup(currentRide);
            }

        }
        if (tripPhase === "onTrip") {
            drawRouteToDropoff(currentRide.pickup, currentRide.dropoff);
        }
        else {
            clearPickupRoute();
        }

        return;

    }

    clearPickupRoute();
    
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
    const cardHTML = await Promise.all(
        availableRides.map(ride => renderAvailableCard(ride))
    );
    sheetBodyEl.innerHTML = cardHTML.join("");
    availableRides.forEach(ride => plotTrip(ride));
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

async function renderHistoryPanel() {
    const rides = [...completedRidesCache].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0);
        const dateB = new Date(b.updatedAt || b.createdAt || 0);
        return dateB - dateA;
    });
    const farePromises = rides.map(ride => estimateFare(ride));
    const fares = await Promise.all(farePromises);
    const totalKm = fares.reduce((sum, f) => sum + f.km, 0);
    historyPanelSubtitle.textContent =
        `${rides.length} trip${rides.length === 1 ? "" : "s"} · ${totalKm.toFixed(1)} km driven`;
    const todayStr = new Date().toDateString();
    const todaysRides = rides.filter(ride => {
        const ts = ride.updatedAt || ride.createdAt;
        return ts && new Date(ts).toDateString() === todayStr;
    });
    const todaysFarePromises = todaysRides.map(ride => estimateFare(ride));
    const todaysFares = await Promise.all(todaysFarePromises);
    const todaysTotal = todaysFares.reduce((sum, f) => sum + f.fare, 0);
    statEarnedToday.textContent = formatRand(todaysTotal);
    statTripsToday.textContent = todaysRides.length;
    if (rides.length === 0) {
        historyListEl.innerHTML = `<p class="drv-empty">No completed trips yet.</p>`;
        return;
    }
    const groups = groupHistory(rides);
    let html = "";
    for (const [label, groupRides] of Object.entries(groups)) {
        if (groupRides.length === 0) continue;
        html += `<div class="drv-history-group-label">${label}</div>`;
        for (const ride of groupRides) {
            const { km, fare } = await estimateFare(ride);
            const ts = ride.updatedAt || ride.createdAt;
            const timeLabel = ts
                ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";
            // Inside renderHistoryPanel(), update the history item HTML:

         html += `
            <div class="drv-history-item clickable" onclick='openDriverRideDetail(${JSON.stringify(ride).replace(/"/g, '&quot;')})'>
            <div class="drv-history-item-avatar">${passengerAvatarLetter(ride)}</div>
            <div class="drv-history-item-info">
                <strong>${addressTitle(ride.pickupAddress)} &rarr; ${addressTitle(ride.dropoffAddress)}</strong>
                <small>${timeLabel ? `${timeLabel} · ` : ""}${ride.passenger?.name || "Passenger"} · ${km.toFixed(1)} km</small>
            </div>
            <span class="drv-history-item-fare">${formatRand(fare)}</span>
            <span class="drv-chevron">›</span>
            </div>
         `;
        }
    }
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
// RIDE DETAIL MODAL - DRIVER
// ==========================================

const drvDetailOverlay = document.getElementById("drv-ride-detail-overlay");
const drvDetailBody = document.getElementById("drv-detail-body");
const drvDetailTitle = document.getElementById("drv-detail-title");
const drvDetailCloseBtn = document.getElementById("drv-detail-close-btn");

function openDriverRideDetail(ride) {
    drvDetailTitle.textContent = "Ride Details";
    
    const statusColors = {
        'pending': 'pending',
        'accepted': 'accepted',
        'completed': 'completed',
        'cancelled': 'cancelled'
    };
    
    const statusLabel = ride.status.charAt(0).toUpperCase() + ride.status.slice(1);
    
    const createdAt = new Date(ride.createdAt).toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const updatedAt = new Date(ride.updatedAt).toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Calculate fare
    let fareDisplay = '--';
    if (ride.pickup && ride.dropoff) {
        const km = haversineKm(ride.pickup, ride.dropoff);
        const fare = FARE_BASE + km * FARE_PER_KM;
        fareDisplay = formatRand(fare);
    }
    
    drvDetailBody.innerHTML = `
        <div class="detail-fare-large">${fareDisplay}</div>
        
        <div class="detail-section-title">Trip Status</div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value">
                <span class="status-pill ${statusColors[ride.status] || 'pending'}">${statusLabel}</span>
            </span>
        </div>
        
        <div class="detail-section-title">Route</div>
        <div class="detail-address">
            <strong>Pickup</strong><br>
            ${ride.pickupAddress || 'Address unavailable'}
        </div>
        <div class="detail-address dropoff">
            <strong>Drop-off</strong><br>
            ${ride.dropoffAddress || 'Address unavailable'}
        </div>
        
        <div class="detail-section-title">Passenger</div>
        <div class="detail-row">
            <span class="detail-label">Name</span>
            <span class="detail-value">${ride.passenger?.name || 'Unknown'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${ride.passenger?.email || 'No email'}</span>
        </div>
        
        <div class="detail-section-title">Timeline</div>
        <div class="detail-row">
            <span class="detail-label">Requested</span>
            <span class="detail-value">${createdAt}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Last Updated</span>
            <span class="detail-value">${updatedAt}</span>
        </div>
    `;
    
    drvDetailOverlay.hidden = false;
}

// Close modal
drvDetailCloseBtn.addEventListener("click", () => {
    drvDetailOverlay.hidden = true;
});

drvDetailOverlay.addEventListener("click", (e) => {
    if (e.target === drvDetailOverlay) {
        drvDetailOverlay.hidden = true;
    }
});

// ==========================================
// ROUTE PREVIEW — shown on hover/click over an
// available ride, before it's accepted
// ==========================================

let previewRouteLine = null;
let previewRouteRideId = null;

async function previewRoute(rideId) {

    // Already showing this ride's route — nothing to do
    if (previewRouteRideId === rideId) return;

    const ride = availableRides.find(r => r._id === rideId);
    if (!ride || !ride.pickup || !ride.dropoff) return;

    previewRouteRideId = rideId;

    try {

        const url = `https://router.project-osrm.org/route/v1/driving/${ride.pickup.lng},${ride.pickup.lat};${ride.dropoff.lng},${ride.dropoff.lat}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        // Ride may have been accepted/dismissed while the
        // request was in flight — bail if the hover moved on
        if (previewRouteRideId !== rideId) return;

        if (data.code !== "Ok") return;

        const coords = data.routes[0].geometry.coordinates.map(
            c => [c[1], c[0]]
        );

        clearRoutePreview(false);

        previewRouteLine = L.polyline(coords, {
            color: "#22c55e",
            weight: 5,
            opacity: 0.85
        }).addTo(map);

        previewRouteRideId = rideId;

        map.fitBounds(previewRouteLine.getBounds(), { padding: [40, 40] });

    } catch (err) {
        console.error("Route preview error:", err);
    }

}

function clearRoutePreview(resetView = true) {

    if (previewRouteLine) {
        map.removeLayer(previewRouteLine);
        previewRouteLine = null;
    }

    previewRouteRideId = null;

}
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