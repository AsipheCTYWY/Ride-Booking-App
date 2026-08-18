const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "passenger") {
    window.location.href = "/driver.html";
}

const pickupSearch =
    document.getElementById("pickup-search");

const dropoffSearch =
    document.getElementById("dropoff-search");

const searchResults =
    document.getElementById("search-results");

const activeRide =
    document.getElementById("active-ride");

// Ride history now lives on its own page (history.js
// handles it) — this file only deals with the active ride.

// Profile block
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");

// Price details
const priceDetails = document.getElementById("price-details");
const priceAmount = document.getElementById("price-amount");


// ==========================================
// MAP
// ==========================================

const map = L.map("map", {zoomControl: true}).setView(
    [-33.9601, 25.6022],
    13
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
// DOM ELEMENTS
// ==========================================

const requestBtn =
    document.getElementById("request-btn");

const resetBtn =
    document.getElementById("reset-btn");



// ==========================================
// MARKER ICONS
// ==========================================

const greenIcon = L.icon({

    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",

    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

    iconSize: [25, 41],

    iconAnchor: [12, 41],

    popupAnchor: [1, -34],

    shadowSize: [41, 41]

});


const redIcon = L.icon({

    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

    iconSize: [25, 41],

    iconAnchor: [12, 41],

    popupAnchor: [1, -34],

    shadowSize: [41, 41]

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

        const name = user.name || "Passenger";

        profileName.textContent = name;
        profileEmail.textContent = user.email || "";
        profileAvatar.textContent = name.charAt(0).toUpperCase();

    } catch (error) {

        console.error("Profile load error:", error);

        // Fallback if /api/me isn't available yet
        profileName.textContent = "Passenger";
        profileAvatar.textContent = "P";

    }

}

loadProfile();


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
// MAP CLICK
// ==========================================

map.on("click", async function (e) {

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;


    // ======================================
    // PICKUP
    // ======================================

    if (clickState === "pickup") {

        // Remove old pickup marker
        if (pickupMarker) {

            map.removeLayer(pickupMarker);

        }


        // Get address from coordinates
        pickupAddress = await getAddress(lat, lng);


        // Save pickup coordinates + address together
        // (rideData below relies on selectedPickup.address existing)
        selectedPickup = {
            lat: lat,
            lng: lng,
            address: pickupAddress
        };


        // Create pickup marker
        pickupMarker = L.marker(
            [lat, lng],
            {
                icon: greenIcon
            }
        )
        .addTo(map)
        .bindPopup("Pickup")
        .openPopup();


        // Put address into pickup search box
        pickupSearch.value = pickupAddress;


        // Automatically switch to drop-off
        clickState = "dropoff";


        pickupSearch.classList.remove(
            "active-location"
        );

        dropoffSearch.classList.add(
            "active-location"
        );


        console.log(
            "Pickup selected:",
            selectedPickup
        );


        return;
    }


    // ======================================
    // DROP-OFF
    // ======================================

    if (clickState === "dropoff") {

        // Remove old dropoff marker
        if (dropoffMarker) {

            map.removeLayer(dropoffMarker);

        }


        // Get address
        dropoffAddress = await getAddress(
            lat,
            lng
        );


        // Save dropoff coordinates + address together
        selectedDropoff = {
            lat: lat,
            lng: lng,
            address: dropoffAddress
        };


        // Create dropoff marker
        dropoffMarker = L.marker(
            [lat, lng],
            {
                icon: redIcon
            }
        )
        .addTo(map)
        .bindPopup("Drop-off")
        .openPopup();


        // Put address into dropoff search box
        dropoffSearch.value = dropoffAddress;


        // Finished selecting
        clickState = "done";


        pickupSearch.classList.remove(
            "active-location"
        );

        dropoffSearch.classList.remove(
            "active-location"
        );


        console.log(
            "Drop-off selected:",
            selectedDropoff
        );


        checkRideReady();


        // Draw route if your showRoute()
        // function exists
        if (
            typeof showRoute === "function" &&
            selectedPickup &&
            selectedDropoff
        ) {

            showRoute(
                selectedPickup,
                selectedDropoff
            );

        }

    }

});


// ==========================================
// REVERSE GEOCODING
// ==========================================

// Nominatim's usage policy allows roughly 1 request/sec.
// Typing quickly or clicking pickup+dropoff back-to-back
// can blow past that and get requests rejected, which is
// what was showing raw coordinates instead of an address.
// This forces a minimum gap between calls to Nominatim.

let lastNominatimCall = 0;

async function throttleNominatim() {

    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastNominatimCall));

    if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
    }

    lastNominatimCall = Date.now();

}

async function getAddress(lat, lng, attempt = 1) {

    try {

        await throttleNominatim();

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {

            throw new Error(
                "Could not find address"
            );

        }

        const data = await response.json();

        if (data.display_name) {

            return data.display_name;

        }

        throw new Error("No display_name in response");

    }

    catch (error) {

        console.error(
            "Reverse geocoding error:",
            error
        );

        // One retry before giving up — most failures here
        // are transient rate-limit rejections, not a truly
        // missing address.
        if (attempt < 2) {
            return getAddress(lat, lng, attempt + 1);
        }

        // Last-resort fallback if address lookup keeps failing
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    }

}


// ==========================================
// RESET
// ==========================================

function resetMarkers() {

    // Remove pickup marker
    if (pickupMarker) {

        map.removeLayer(pickupMarker);

    }


    // Remove dropoff marker
    if (dropoffMarker) {

        map.removeLayer(dropoffMarker);

    }


    // Remove route
    if (currentRoute) {

        map.removeLayer(currentRoute);

        currentRoute = null;

    }


    // Reset variables
    pickupMarker = null;
    dropoffMarker = null;

    selectedPickup = null;
    selectedDropoff = null;

    pickupAddress = "";
    dropoffAddress = "";


    // Reset state
    clickState = "pickup";


    // Clear search boxes
    pickupSearch.value = "";
    dropoffSearch.value = "";


    // Remove active styling
    pickupSearch.classList.remove(
        "active-location"
    );

    dropoffSearch.classList.remove(
        "active-location"
    );


    // Hide price details
    priceDetails.classList.add("hidden");
    priceAmount.textContent = "--";


    checkRideReady();


    console.log("Map reset");

}


resetBtn.addEventListener(
    "click",
    resetMarkers
);


// ==========================================
// DRAW ACTUAL ROAD ROUTE + ESTIMATE FARE
// ==========================================

async function showRoute(pickup, dropoff) {

    try {

        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${pickup.lng},${pickup.lat};` +
            `${dropoff.lng},${dropoff.lat}` +
            `?overview=full&geometries=geojson`;

        const response = await fetch(url);

        const data = await response.json();

        if (data.code !== "Ok") {

            console.error(
                "Could not find a route."
            );

            return;
        }

        const route =
            data.routes[0];

        const routeCoordinates =
            route.geometry.coordinates.map(
                coordinate => [
                    coordinate[1],
                    coordinate[0]
                ]
            );

        if (currentRoute) {
            map.removeLayer(currentRoute);
        }

        currentRoute = L.polyline(
            routeCoordinates,
            {
                weight: 6
            }
        ).addTo(map);

        map.fitBounds(
            currentRoute.getBounds(),
            {
                padding: [30, 30]
            }
        );


        // ------------------------------------------
        // Estimated fare: R15 base + R8.50/km
        // Adjust these rates to match your pricing.
        // ------------------------------------------

        const distanceKm = route.distance / 1000;
        const fare = 15 + distanceKm * 8.5;

        priceAmount.textContent = `R${fare.toFixed(2)}`;
        priceDetails.classList.remove("hidden");


    } catch (error) {

        console.error(
            "Routing error:",
            error
        );
    }
}



// ==========================================
// DISPLAY RIDE ON MAP
// ==========================================

function addRideToMap(ride) {

    L.circleMarker(
        [
            ride.pickup.lat,
            ride.pickup.lng
        ],
        {
            radius: 8,
            color: "#800020",
            fillColor: "#800020",
            fillOpacity: 0.8
        }
    )
        .addTo(map)
        .bindPopup(`
            <strong>Pickup</strong><br>
            ${ride.pickupAddress || "Address unavailable"}
        `);


    L.circleMarker(
        [
            ride.dropoff.lat,
            ride.dropoff.lng
        ],
        {
            radius: 8,
            color: "#d8b7a5",
            fillColor: "#d8b7a5",
            fillOpacity: 0.9
        }
    )
        .addTo(map)
        .bindPopup(`
            <strong>Drop-off</strong><br>
            ${ride.dropoffAddress || "Address unavailable"}
        `);


    showRoute(
        ride.pickup,
        ride.dropoff
    );
}


// ==========================================
// REQUEST RIDE
// ==========================================

requestBtn.addEventListener(
    "click",
    async function () {

        if (
            !selectedPickup ||
            !selectedDropoff
        ) {
            return;
        }


        requestBtn.disabled = true;


        try {

            const rideData = {

                pickup: {
                    lat: selectedPickup.lat,
                    lng: selectedPickup.lng
                },

                pickupAddress:
                    selectedPickup.address,

                dropoff: {
                    lat: selectedDropoff.lat,
                    lng: selectedDropoff.lng
                },

                dropoffAddress:
                    selectedDropoff.address

            };


            const response =
                await fetch(
                    "/api/rides",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Authorization":
                                token
                        },

                        body:
                            JSON.stringify(
                                rideData
                            )
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                alert(
                    data.message ||
                    "Could not request ride."
                );

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

            console.error(
                "Request ride error:",
                error
            );

        }

    }
);


// ==========================================
// LOAD PASSENGER RIDES
// ==========================================

async function loadRides() {

    try {

        const response = await fetch("/api/my-rides", {
            headers: {
                "Authorization": token
            }
        });

        if (!response.ok) {
            throw new Error("Failed to load rides");
        }

        const rides = await response.json();

        console.log("RIDES FROM SERVER:", rides);

        // Clear section
        activeRide.innerHTML = "";


        // ------------------------------------------
        // Only the active ride is handled on this
        // page — completed/cancelled rides are shown
        // on history.html instead.
        // ------------------------------------------

        const activeRides = rides.filter(
            ride =>
                ride.status === "pending" ||
                ride.status === "accepted"
        );


        // ------------------------------------------
        // ACTIVE RIDE
        // ------------------------------------------

        if (activeRides.length === 0) {

            activeRide.innerHTML = `
                <p class="no-rides">
                    No active ride.
                </p>
            `;

        } else {

            // Only show the latest active ride
            const ride = activeRides[0];

            activeRide.innerHTML = `

                <div class="active-ride-card">

                    <span class="status ${ride.status}">
                        ${ride.status}
                    </span>

                    <p>
                        <strong>Pickup</strong><br>
                        ${ride.pickupAddress || "Address unavailable"}
                    </p>

                    <p>
                        <strong>Drop-off</strong><br>
                        ${ride.dropoffAddress || "Address unavailable"}
                    </p>

                    ${
                        ride.status === "pending"
                        ? `
                            <p class="ride-message">
                                Waiting for a driver...
                            </p>

                            <button
                                class="cancel-ride-btn"
                                onclick="cancelRide('${ride._id}')">
                                Cancel Ride
                            </button>
                        `
                        : `
                            <p class="ride-message">
                                Your driver has accepted the ride.
                            </p>
                        `
                    }

                </div>

            `;

        }


        // ------------------------------------------
        // SHOW RIDES ON MAP
        // Only plot active rides — plotting every
        // completed/cancelled ride on every refresh
        // clutters the map over time.
        // ------------------------------------------

        activeRides.forEach(ride => {

            addRideToMap(ride);

        });


        // ------------------------------------------
        // PREVENT NEW REQUEST IF ACTIVE RIDE EXISTS
        // ------------------------------------------

        if (activeRides.length > 0) {

            requestBtn.disabled = true;

            requestBtn.textContent =
                "Active Ride in Progress";

        } else {

            requestBtn.disabled = false;

            requestBtn.textContent =
                "Request Ride";

        }


    } catch (err) {

        console.error(
            "Error loading rides:",
            err
        );

    }

}

// ==========================================
// LOAD RIDES ON PAGE OPEN
// ==========================================

loadRides();


// ==========================================
// LOGOUT
// ==========================================

document.getElementById("index-logout-btn").addEventListener("click", () => {

    localStorage.removeItem("token");
    localStorage.removeItem("role");

    window.location.href = "/login.html";
});

async function searchLocation(query) {

    if (!query || query.length < 3) {
        searchResults.innerHTML = "";
        return;
    }

    try {

        await throttleNominatim();

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&` +
            `q=${encodeURIComponent(query)}&` +
            `limit=5&countrycodes=za`
        );

        const results = await response.json();

        searchResults.innerHTML = "";

        if (results.length === 0) {

            searchResults.innerHTML = `
                <p class="search-message">
                    No locations found.
                </p>
            `;

            return;
        }

        results.forEach(result => {

            const item =
                document.createElement("div");

            item.className = "search-result";

            item.textContent =
                result.display_name;

            item.addEventListener(
                "click",
                () => selectLocation(result)
            );

            searchResults.appendChild(item);

        });

    } catch (error) {

        console.error(
            "Location search error:",
            error
        );

    }

}

function selectLocation(result) {

    const location = {

        lat: Number(result.lat),

        lng: Number(result.lon),

        address: result.display_name

    };


    // Respect whichever box the user is actually
    // typing into, instead of always filling
    // pickup first.

    if (clickState === "dropoff") {

        selectedDropoff = location;

        dropoffSearch.value =
            location.address;

        if (dropoffMarker) {
            map.removeLayer(dropoffMarker);
        }

        dropoffMarker =
            L.marker(
                [location.lat, location.lng],
                { icon: redIcon }
            )
            .addTo(map)
            .bindPopup("Drop-off")
            .openPopup();

    } else {

        selectedPickup = location;

        pickupSearch.value =
            location.address;

        if (pickupMarker) {
            map.removeLayer(pickupMarker);
        }

        pickupMarker =
            L.marker(
                [location.lat, location.lng],
                { icon: greenIcon }
            )
            .addTo(map)
            .bindPopup("Pickup")
            .openPopup();

    }

    if (selectedPickup && selectedDropoff) {

        showRoute(
            selectedPickup,
            selectedDropoff
        );

    }

    searchResults.innerHTML = "";

    checkRideReady();

}

// Typing fires an 'input' event per keystroke — searching
// Nominatim on every single one is what was triggering the
// rate-limit fallback to raw coordinates. Debounce so it
// only searches ~350ms after the user stops typing.

let pickupSearchTimer = null;
let dropoffSearchTimer = null;

pickupSearch.addEventListener(
    "input",
    () => {

        selectedPickup = null;

        clearTimeout(pickupSearchTimer);

        pickupSearchTimer = setTimeout(() => {
            searchLocation(pickupSearch.value);
        }, 350);

    }
);
dropoffSearch.addEventListener(
    "input",
    () => {

        selectedDropoff = null;

        clearTimeout(dropoffSearchTimer);

        dropoffSearchTimer = setTimeout(() => {
            searchLocation(dropoffSearch.value);
        }, 350);

    }
);

function checkRideReady() {

    if (
        selectedPickup &&
        selectedDropoff
    ) {

        requestBtn.disabled = false;

    } else {

        requestBtn.disabled = true;

    }

}

async function loadActiveRide() {

    try {

        const response =
            await fetch(
                "/api/passenger-active-ride",
                {
                    headers: {
                        "Authorization": token
                    }
                }
            );

        const ride =
            await response.json();


        if (!ride) {

            activeRide.innerHTML = `
                <p class="no-rides">
                    No active ride.
                </p>
            `;

            requestBtn.disabled =
                !(selectedPickup && selectedDropoff);

            return;
        }


        requestBtn.disabled = true;


        activeRide.innerHTML = `

            <div class="active-ride-card">

                <span class="status ${ride.status}">
                    ${ride.status}
                </span>

                <div class="route-info">

                    <strong>Pickup</strong>

                    <p>
                        ${ride.pickupAddress}
                    </p>

                    <strong>Drop-off</strong>

                    <p>
                        ${ride.dropoffAddress}
                    </p>

                </div>

                ${
                    ride.driver
                    ? `
                        <div class="driver-info">

                            <strong>Driver</strong>

                            <p>
                                ${ride.driver.name}
                            </p>

                            <small>
                                ${ride.driver.email || ""}
                            </small>

                        </div>
                    `
                    : `
                        <p class="waiting">
                            Waiting for a driver...
                        </p>
                    `
                }

                <button
                    class="cancel-btn"
                    onclick="cancelRide('${ride._id}')">

                    Cancel Ride

                </button>

            </div>
        `;

    } catch (error) {

        console.error(
            "Error loading active ride:",
            error
        );

    }

}

// ==========================================
// CANCEL RIDE
// ==========================================

async function cancelRide(rideId) {

    const confirmed = confirm(
        "Are you sure you want to cancel this ride?"
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `/api/rides/${rideId}/cancel`,
            {
                method: "PATCH",

                headers: {
                    // Matches the header format used by every
                    // other request in this file. The old code
                    // sent "Bearer <token>" here only, which
                    // would fail if the backend expects the
                    // raw token like the rest of the app does.
                    // Flip this back to `Bearer ${token}` if
                    // your backend actually expects that format.
                    "Authorization": token,

                    "Content-Type":
                        "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to cancel ride"
            );

        }

        alert("Ride cancelled successfully.");

        // Refresh passenger rides
        loadRides();

    } catch (error) {

        console.error(
            "Cancel ride error:",
            error
        );

        alert(
            error.message ||
            "Failed to cancel ride."
        );
    }
}

setInterval(() => {

    loadActiveRide();

}, 5000);