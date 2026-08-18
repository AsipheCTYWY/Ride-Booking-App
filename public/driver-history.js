const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "driver") {
    alert("Access Denied");
    window.location.href = "/login.html";
}

const driverHistoryFull = document.getElementById("driver-history-full");
const earningsTotalEl = document.getElementById("earnings-total");


// ==========================================
// FARE ESTIMATE — same formula as driver.js.
// Keep these two files in sync if you change the rate.
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
// LOAD COMPLETED RIDES
// ==========================================

async function loadDriverHistory() {

    try {

        const response = await fetch("/api/completed-rides", {
            headers: { "Authorization": token }
        });

        if (!response.ok) {
            throw new Error("Failed to load completed rides");
        }

        const rides = await response.json();

        driverHistoryFull.innerHTML = "";

        if (rides.length === 0) {

            driverHistoryFull.innerHTML = `
                <p class="no-rides">No completed rides yet.</p>
            `;

            earningsTotalEl.textContent = formatRand(0);
            return;

        }

        // Most recent first, if a timestamp is available
        rides.sort((a, b) => {

            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);

            return dateB - dateA;

        });

        let totalEarnings = 0;

        rides.forEach(ride => {

            const { km, fare } = estimateFare(ride);
            totalEarnings += fare;

            const card = document.createElement("div");

            card.className = "history-card";

            card.innerHTML = `

                <div class="trip-fare-row">
                    <span class="trip-fare">${formatRand(fare)}</span>
                    <span class="status completed">Completed</span>
                </div>

                <p class="trip-fare-detail">
                    ${km.toFixed(1)} km
                </p>

                <p>
                    <strong>Passenger</strong><br>
                    ${ride.passenger?.name || "Passenger"}
                </p>

                <p>
                    <strong>Pickup</strong><br>
                    ${ride.pickupAddress || "Address unavailable"}
                </p>

                <p>
                    <strong>Drop-off</strong><br>
                    ${ride.dropoffAddress || "Address unavailable"}
                </p>

            `;

            driverHistoryFull.appendChild(card);

        });

        earningsTotalEl.textContent = formatRand(totalEarnings);

    } catch (error) {

        console.error("Error loading driver history:", error);

        driverHistoryFull.innerHTML = `
            <p class="no-rides">Couldn't load your ride history. Try refreshing.</p>
        `;

    }

}

loadDriverHistory();


// ==========================================
// LOGOUT
// ==========================================

document.getElementById("history-logout-btn").addEventListener("click", () => {

    localStorage.removeItem("token");
    localStorage.removeItem("role");

    window.location.href = "/login.html";

});