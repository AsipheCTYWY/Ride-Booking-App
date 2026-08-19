const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "passenger") {
    window.location.href = "/driver.html";
}


// ==========================================
// DOM ELEMENTS
// ==========================================

const sheetTitleEl = document.getElementById("sheet-title");
const sheetBodyEl = document.getElementById("sheet-body");

const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");

const rideStatusBadge = document.getElementById("ride-status-badge");
const rideStatusText = document.getElementById("ride-status-text");

const historySummary = document.getElementById("history-summary");

const openHistoryBtn = document.getElementById("open-history-btn");
const closeHistoryBtn = document.getElementById("close-history-btn");
const historyOverlay = document.getElementById("history-overlay");
const historyPanelSubtitle = document.getElementById("history-panel-subtitle");
const historyListEl = document.getElementById("history-list");

const toastEl = document.getElementById("psg-toast");

const pickupSearch = document.getElementById("pickup-search");
const dropoffSearch = document.getElementById("dropoff-search");
const searchResults = document.getElementById("search-results");
const activeRide = document.getElementById("active-ride");

const priceDetails = document.getElementById("price-details");
const priceAmount = document.getElementById("price-amount");

const requestBtn = document.getElementById("request-btn");
const resetBtn = document.getElementById("reset-btn");


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

function formatRand(amount) {
    return `R${amount.toFixed(2)}`;
}


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
        const name = user.name || "Passenger";
        profileName.textContent = name;
        profileEmail.textContent = user.email || "";
        profileAvatar.textContent = name.charAt(0).toUpperCase();
    } catch (error) {
        console.error("Profile load error:", error);
        profileName.textContent = "Passenger";
        profileAvatar.textContent = "P";
    }
}

loadProfile();


// ==========================================
// MAP
// ==========================================

const map = L.map("map", { zoomControl: true }).setView([-33.9601, 25.6022], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

setTimeout(() => map.invalidateSize(), 300);


// ==========================================
// MARKER ICONS
// ==========================================

const greenIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


// ==========================================
// STATE
// ==========================================

let selectedPickup = null;
let selectedDropoff = null;
let pickupMarker = null;
let dropoffMarker = null;
let clickState = "pickup";
let currentRoute = null;
let pickupAddress = "";
let dropoffAddress = "";


// ==========================================
// SEARCH BOX SELECTION
// ==========================================

pickupSearch.addEventListener("focus", () => {
    clickState = "pickup";
    pickupSearch.classList.add("active-location");
    dropoffSearch.classList.remove("active-location");
});

dropoffSearch.addEventListener("focus", () => {
    clickState = "dropoff";
    dropoffSearch.classList.add("active-location");
    pickupSearch.classList.remove("active-location");
});


// ==========================================
// REVERSE GEOCODING
// ==========================================

let lastNominatimCall = 0;

async function throttleNominatim() {
    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastNominatimCall));
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastNominatimCall = Date.now();
}

async function getAddress(lat, lng, attempt = 1) {
    try {
        await throttleNominatim();
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { "Accept": "application/json" } }
        );
        if (!response.ok) throw new Error("Could not find address");
        const data = await response.json();
        if (data.display_name) return data.display_name;
        throw new Error("No display_name in response");
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        if (attempt < 2) return getAddress(lat, lng, attempt + 1);
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
}


// ==========================================
// MAP CLICK
// ==========================================

map.on("click", async function (e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (clickState === "pickup") {
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupAddress = await getAddress(lat, lng);
        selectedPickup = { lat, lng, address: pickupAddress };
        pickupMarker = L.marker([lat, lng], { icon: greenIcon })
            .addTo(map)
            .bindPopup("Pickup")
            .openPopup();
        pickupSearch.value = pickupAddress;
        clickState = "dropoff";
        pickupSearch.classList.remove("active-location");
        dropoffSearch.classList.add("active-location");
        return;
    }

    if (clickState === "dropoff") {
        if (dropoffMarker) map.removeLayer(dropoffMarker);
        dropoffAddress = await getAddress(lat, lng);
        selectedDropoff = { lat, lng, address: dropoffAddress };
        dropoffMarker = L.marker([lat, lng], { icon: redIcon })
            .addTo(map)
            .bindPopup("Drop-off")
            .openPopup();
        dropoffSearch.value = dropoffAddress;
        clickState = "done";
        pickupSearch.classList.remove("active-location");
        dropoffSearch.classList.remove("active-location");
        checkRideReady();
        if (selectedPickup && selectedDropoff) {
            showRoute(selectedPickup, selectedDropoff);
        }
    }
});


// ==========================================
// DRAW ROUTE + ESTIMATE FARE
// ==========================================

async function showRoute(pickup, dropoff) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== "Ok") {
            console.error("Could not find a route.");
            return;
        }
        const route = data.routes[0];
        const routeCoordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        if (currentRoute) map.removeLayer(currentRoute);
        currentRoute = L.polyline(routeCoordinates, { weight: 6 }).addTo(map);
        map.fitBounds(currentRoute.getBounds(), { padding: [30, 30] });
        const distanceKm = route.distance / 1000;
        const fare = FARE_BASE + distanceKm * FARE_PER_KM;
        priceAmount.textContent = formatRand(fare);
        priceDetails.classList.remove("hidden");
    } catch (error) {
        console.error("Routing error:", error);
    }
}


// ==========================================
// LOCATION SEARCH
// ==========================================

async function searchLocation(query) {
    if (!query || query.length < 3) {
        searchResults.innerHTML = "";
        return;
    }
    try {
        await throttleNominatim();
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=za`
        );
        const results = await response.json();
        searchResults.innerHTML = "";
        if (results.length === 0) {
            searchResults.innerHTML = `<p class="psg-search-message">No locations found.</p>`;
            return;
        }
        results.forEach(result => {
            const item = document.createElement("div");
            item.className = "psg-search-result";
            item.textContent = result.display_name;
            item.addEventListener("click", () => selectLocation(result));
            searchResults.appendChild(item);
        });
    } catch (error) {
        console.error("Location search error:", error);
    }
}

function selectLocation(result) {
    const location = {
        lat: Number(result.lat),
        lng: Number(result.lon),
        address: result.display_name
    };

    if (clickState === "dropoff") {
        selectedDropoff = location;
        dropoffSearch.value = location.address;
        if (dropoffMarker) map.removeLayer(dropoffMarker);
        dropoffMarker = L.marker([location.lat, location.lng], { icon: redIcon })
            .addTo(map)
            .bindPopup("Drop-off")
            .openPopup();
    } else {
        selectedPickup = location;
        pickupSearch.value = location.address;
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = L.marker([location.lat, location.lng], { icon: greenIcon })
            .addTo(map)
            .bindPopup("Pickup")
            .openPopup();
    }

    if (selectedPickup && selectedDropoff) {
        showRoute(selectedPickup, selectedDropoff);
    }

    searchResults.innerHTML = "";
    checkRideReady();
}

let pickupSearchTimer = null;
let dropoffSearchTimer = null;

pickupSearch.addEventListener("input", () => {
    selectedPickup = null;
    clearTimeout(pickupSearchTimer);
    pickupSearchTimer = setTimeout(() => searchLocation(pickupSearch.value), 350);
});

dropoffSearch.addEventListener("input", () => {
    selectedDropoff = null;
    clearTimeout(dropoffSearchTimer);
    dropoffSearchTimer = setTimeout(() => searchLocation(dropoffSearch.value), 350);
});


// ==========================================
// CHECK RIDE READY
// ==========================================

function checkRideReady() {
    if (selectedPickup && selectedDropoff) {
        requestBtn.disabled = false;
    } else {
        requestBtn.disabled = true;
    }
}


// ==========================================
// RESET
// ==========================================

function resetMarkers() {
    if (pickupMarker) map.removeLayer(pickupMarker);
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    if (currentRoute) { map.removeLayer(currentRoute); currentRoute = null; }
    pickupMarker = null;
    dropoffMarker = null;
    selectedPickup = null;
    selectedDropoff = null;
    pickupAddress = "";
    dropoffAddress = "";
    clickState = "pickup";
    pickupSearch.value = "";
    dropoffSearch.value = "";
    pickupSearch.classList.remove("active-location");
    dropoffSearch.classList.remove("active-location");
    priceDetails.classList.add("hidden");
    priceAmount.textContent = "--";
    checkRideReady();
}

resetBtn.addEventListener("click", resetMarkers);


// ==========================================
// REQUEST RIDE
// ==========================================

requestBtn.addEventListener("click", async function () {
    if (!selectedPickup || !selectedDropoff) return;
    requestBtn.disabled = true;

    try {
        const rideData = {
            pickup: { lat: selectedPickup.lat, lng: selectedPickup.lng },
            pickupAddress: selectedPickup.address,
            dropoff: { lat: selectedDropoff.lat, lng: selectedDropoff.lng },
            dropoffAddress: selectedDropoff.address
        };

        const response = await fetch("/api/rides", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token
            },
            body: JSON.stringify(rideData)
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Could not request ride.");
            await loadActiveRide();
            return;
        }

        resetMarkers();
        selectedPickup = null;
        selectedDropoff = null;
        pickupSearch.value = "";
        dropoffSearch.value = "";
        await loadActiveRide();

    } catch (error) {
        console.error("Request ride error:", error);
    } finally {
        requestBtn.disabled = false;
    }
});


// ==========================================
// LOAD ACTIVE RIDE
// ==========================================

async function loadActiveRide() {
    try {
        const response = await fetch("/api/passenger-active-ride", {
            headers: { "Authorization": token }
        });
        const ride = await response.json();

        if (!ride) {
            activeRide.innerHTML = `<p class="psg-empty-state">No active ride.</p>`;
            updateRideStatus("Idle", "#6d7d73");
            requestBtn.disabled = !(selectedPickup && selectedDropoff);
            return;
        }

        requestBtn.disabled = true;
        updateRideStatus(ride.status, ride.status === "accepted" ? "#22c55e" : "#f2b705");

        let driverHTML = ride.driver ? `
            <div class="psg-driver-info">
                <strong>Driver</strong>
                <p>${ride.driver.name}</p>
                <small>${ride.driver.email || ""}</small>
            </div>
        ` : `<p class="psg-waiting">Waiting for a driver...</p>`;

        let cancelBtn = ride.status === "pending" ? `
            <button class="psg-cancel-btn" onclick="cancelRide('${ride._id}')">Cancel Ride</button>
        ` : '';

        activeRide.innerHTML = `
            <div class="psg-active-card">
                <span class="psg-status-pill ${ride.status}">${ride.status}</span>
                <div class="psg-route-info">
                    <strong>Pickup</strong>
                    <p>${ride.pickupAddress || "Address unavailable"}</p>
                    <strong>Drop-off</strong>
                    <p>${ride.dropoffAddress || "Address unavailable"}</p>
                </div>
                ${driverHTML}
                ${cancelBtn}
            </div>
        `;

    } catch (error) {
        console.error("Error loading active ride:", error);
    }
}

function updateRideStatus(text, color) {
    rideStatusText.textContent = text;
    rideStatusBadge.style.color = color || "#6d7d73";
}


// ==========================================
// CANCEL RIDE
// ==========================================

async function cancelRide(rideId) {
    if (!confirm("Are you sure you want to cancel this ride?")) return;
    try {
        const response = await fetch(`/api/rides/${rideId}/cancel`, {
            method: "PATCH",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to cancel ride");
        showToast("Ride cancelled successfully.");
        await loadActiveRide();
    } catch (error) {
        console.error("Cancel ride error:", error);
        alert(error.message || "Failed to cancel ride.");
    }
}


// ==========================================
// RIDE HISTORY
// ==========================================

async function loadRideHistory() {
    try {
        const response = await fetch("/api/my-rides", {
            headers: { "Authorization": token }
        });
        if (!response.ok) throw new Error("Failed to load ride history");
        const rides = await response.json();
        const history = rides.filter(ride => ride.status === "completed" || ride.status === "cancelled");

        historyPanelSubtitle.textContent = `${history.length} trip${history.length === 1 ? "" : "s"}`;

        if (history.length === 0) {
            historyListEl.innerHTML = `<p class="psg-empty-state">No ride history yet.</p>`;
            return;
        }

        history.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateB - dateA;
        });

        let html = "";
        history.forEach(ride => {
            const { fare } = estimateFareFromRide(ride);
            const ts = ride.updatedAt || ride.createdAt;
            const timeLabel = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            html += `
                <div class="psg-history-item">
                    <div class="psg-history-item-avatar">${ride.passenger?.name?.charAt(0)?.toUpperCase() || "P"}</div>
                    <div class="psg-history-item-info">
                        <strong>${ride.pickupAddress?.split(",")[0] || "Pickup"} → ${ride.dropoffAddress?.split(",")[0] || "Drop-off"}</strong>
                        <small>${timeLabel ? `${timeLabel} · ` : ""}${ride.status}</small>
                    </div>
                    <span class="psg-history-item-fare">${formatRand(fare)}</span>
                </div>
            `;
        });

        historyListEl.innerHTML = html;

    } catch (error) {
        console.error("Error loading ride history:", error);
        historyListEl.innerHTML = `<p class="psg-empty-state">Couldn't load your ride history.</p>`;
    }
}

function estimateFareFromRide(ride) {
    const km = haversineKm(ride.pickup, ride.dropoff);
    return { km, fare: FARE_BASE + km * FARE_PER_KM };
}

openHistoryBtn.addEventListener("click", () => {
    historyOverlay.hidden = false;
    loadRideHistory();
});

closeHistoryBtn.addEventListener("click", () => {
    historyOverlay.hidden = true;
});

historyOverlay.addEventListener("click", (e) => {
    if (e.target === historyOverlay) historyOverlay.hidden = true;
});


// ==========================================
// INITIAL LOAD
// ==========================================

loadActiveRide();

setInterval(() => {
    loadActiveRide();
}, 5000);


// ==========================================
// LOGOUT
// ==========================================

document.getElementById("passenger-logout-btn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login.html";
});