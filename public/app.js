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

const rideHistory =
    document.getElementById("ride-history");


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


        // Save pickup coordinates
        selectedPickup = {
            lat: lat,
            lng: lng
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


        // Get address from coordinates
        pickupAddress = await getAddress(lat, lng);


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

        console.log(
            "Pickup address:",
            pickupAddress
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


        // Save dropoff coordinates
        selectedDropoff = {
            lat: lat,
            lng: lng
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


        // Get address
        dropoffAddress = await getAddress(
            lat,
            lng
        );


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

        console.log(
            "Drop-off address:",
            dropoffAddress
        );


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

async function getAddress(lat, lng) {

    try {

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


        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    }

    catch (error) {

        console.error(
            "Reverse geocoding error:",
            error
        );


        // Fallback if address lookup fails
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


    console.log("Map reset");

}


resetBtn.addEventListener(
    "click",
    resetMarkers
);


// ==========================================
// GET ADDRESS FROM COORDINATES
// ==========================================

async function getAddress(lat, lng) {

    try {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const data = await response.json();

        if (data && data.display_name) {
            return data.display_name;
        }

        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    } catch (error) {

        console.error(
            "Error getting address:",
            error
        );

        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
}


// ==========================================
// DRAW ACTUAL ROAD ROUTE
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

        // Clear sections
        activeRide.innerHTML = "";
        rideHistory.innerHTML = "";


        // ------------------------------------------
        // Separate active and completed rides
        // ------------------------------------------

        const activeRides = rides.filter(
            ride =>
                ride.status === "pending" ||
                ride.status === "accepted"
        );

        const completedRides = rides.filter(
            ride =>
        ride.status === "completed" ||
        ride.status === "cancelled"
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
        // RIDE HISTORY
        // ------------------------------------------

        if (completedRides.length === 0) {

            rideHistory.innerHTML = `
                <p class="no-rides">
                    No ride history yet.
                </p>
            `;

        } else {

            completedRides.forEach(ride => {

                const card =
                    document.createElement("div");

                card.className = "history-card";

                card.innerHTML = `

                    <span class="status completed">
                        Completed
                    </span>

                    <p>
                        <strong>Pickup</strong><br>
                        ${ride.pickupAddress || "Address unavailable"}
                    </p>

                    <p>
                        <strong>Drop-off</strong><br>
                        ${ride.dropoffAddress || "Address unavailable"}
                    </p>

                `;

                rideHistory.appendChild(card);

            });

        }


        // ------------------------------------------
        // SHOW RIDES ON MAP
        // ------------------------------------------

        rides.forEach(ride => {

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

const logoutButton =
    document.getElementById(
        "index-logout-btn"
    );

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


    if (!selectedPickup) {

        selectedPickup = location;

        pickupSearch.value =
            location.address;

        pickupMarker =
            L.marker(
                [location.lat, location.lng],
                { icon: greenIcon }
            )
            .addTo(map)
            .bindPopup("Pickup")
            .openPopup();

    } else {

        selectedDropoff = location;

        dropoffSearch.value =
            location.address;

        dropoffMarker =
            L.marker(
                [location.lat, location.lng],
                { icon: redIcon }
            )
            .addTo(map)
            .bindPopup("Drop-off")
            .openPopup();

        showRoute(
            selectedPickup,
            selectedDropoff
        );

    }

    searchResults.innerHTML = "";

    checkRideReady();

}

pickupSearch.addEventListener(
    "input",
    () => {

        selectedPickup = null;

        searchLocation(
            pickupSearch.value
        );

    }
);
dropoffSearch.addEventListener(
    "input",
    () => {

        selectedDropoff = null;

        searchLocation(
            dropoffSearch.value
        );

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

        const token =
            localStorage.getItem("token");

        const response = await fetch(
            `/api/rides/${rideId}/cancel`,
            {
                method: "PATCH",

                headers: {
                    "Authorization":
                        `Bearer ${token}`,

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

async function loadRideHistory() {

    try {

        const response =
            await fetch(
                "/api/my-rides",
                {
                    headers: {
                        "Authorization": token
                    }
                }
            );

        const rides =
            await response.json();


        rideHistory.innerHTML = "";


        const history =
            rides.filter(
                ride =>
                    ride.status === "completed" ||
                    ride.status === "cancelled"
            );


        if (history.length === 0) {

            rideHistory.innerHTML = `
                <p class="no-rides">
                    No ride history yet.
                </p>
            `;

            return;
        }


        history.forEach(ride => {

            const card =
                document.createElement("div");

            card.className =
                "history-card";


            card.innerHTML = `

                <span class="status ${ride.status}">
                    ${ride.status}
                </span>

                <div class="history-route">

                    <strong>
                        ${ride.pickupAddress}
                    </strong>

                    <span>↓</span>

                    <strong>
                        ${ride.dropoffAddress}
                    </strong>

                </div>

                ${
                    ride.driver
                    ? `
                        <small>
                            Driver: ${ride.driver.name}
                        </small>
                    `
                    : ""
                }

            `;

            rideHistory.appendChild(card);

        });

    } catch (error) {

        console.error(
            "History error:",
            error
        );

    }

}

setInterval(() => {

    loadActiveRide();
    loadRideHistory();

}, 5000);