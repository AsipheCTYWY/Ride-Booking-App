const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "driver") {
    alert("Access Denied");
    window.location.href = "/login.html";
}

const availableRides = document.getElementById("available-rides");
const myRides = document.getElementById("my-rides");
const completedRides = document.getElementById("completed-rides");


// ==========================================
// PASSENGER PROFILE
// ==========================================

function passengerProfile(ride) {

    return `
        <div class="passenger-profile">

            <div class="profile-avatar">
                ${
                    ride.passenger?.name
                        ? ride.passenger.name.charAt(0).toUpperCase()
                        : "P"
                }
            </div>

            <div class="profile-info">

                <strong>
                    ${ride.passenger?.name || "Passenger"}
                </strong>

                <small>
                    ${ride.passenger?.email || ""}
                </small>

            </div>

        </div>
    `;
}


// ==========================================
// AVAILABLE RIDES
// ==========================================

async function loadAvailableRides() {

    try {

        const response = await fetch("/api/available-rides", {
            headers: {
                "Authorization": token
            }
        });

        if (!response.ok) {
            throw new Error("Failed to load available rides");
        }

        const rides = await response.json();

        availableRides.innerHTML = "";

        if (rides.length === 0) {

            availableRides.innerHTML =
                "<p class='no-rides'>No available rides.</p>";

            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `

    ${passengerProfile(ride)}

    <span class="status pending">
        Pending
    </span>

    <div class="coords">

        <strong>Pickup:</strong>
        <p>${ride.pickupAddress || "Address unavailable"}</p>

        <strong>Drop-off:</strong>
        <p>${ride.dropoffAddress || "Address unavailable"}</p>

    </div>

    <button
        class="accept-btn"
        onclick="updateRide('${ride._id}', 'accepted')">

        Accept

    </button>
`;

            availableRides.appendChild(card);

        });

    } catch (err) {

        console.error("Error loading available rides:", err);

    }
}


// ==========================================
// MY ACCEPTED RIDES
// ==========================================

async function loadMyRides() {

    try {

        const response = await fetch("/api/my-driver-rides", {
            headers: {
                "Authorization": token
            }
        });

        if (!response.ok) {
            throw new Error("Failed to load accepted rides");
        }

        const rides = await response.json();

        myRides.innerHTML = "";

        if (rides.length === 0) {

            myRides.innerHTML =
                "<p class='no-rides'>No active rides.</p>";

            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `

                ${passengerProfile(ride)}

                <span class="status accepted">
                    Accepted
                </span>

                <div class="coords">

                    <strong>Pickup:</strong>
                    ${ride.pickupAddress || "Address unavailable"}

                    <br>

                    <strong>Drop-off:</strong>
                    ${ride.dropoffAddress || "Address unavailable"}

                </div>

                <button
                    class="complete-btn"
                    onclick="updateRide('${ride._id}', 'completed')">

                    Complete

                </button>
            `;

            myRides.appendChild(card);

        });

    } catch (err) {

        console.error("Error loading accepted rides:", err);

    }
}


// ==========================================
// COMPLETED RIDES
// ==========================================

async function loadCompletedRides() {

    try {

        const response = await fetch("/api/completed-rides", {
            headers: {
                "Authorization": token
            }
        });

        if (!response.ok) {
            throw new Error("Failed to load completed rides");
        }

        const rides = await response.json();

        completedRides.innerHTML = "";

        if (rides.length === 0) {

            completedRides.innerHTML =
                "<p class='no-rides'>No completed rides.</p>";

            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `

                ${passengerProfile(ride)}

                <span class="status completed">
                    Completed
                </span>

                <div class="coords">

                    <strong>Pickup:</strong>
                    ${ride.pickupAddress || "Address unavailable"}

                    <br>

                    <strong>Drop-off:</strong>
                    ${ride.dropoffAddress || "Address unavailable"}

                </div>

            `;

            completedRides.appendChild(card);

        });

    } catch (err) {

        console.error("Error loading completed rides:", err);

    }
}


// ==========================================
// ACCEPT / COMPLETE RIDE
// ==========================================

async function updateRide(id, status) {

    try {

        const response = await fetch(`/api/rides/${id}`, {

            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                "Authorization": token
            },

            body: JSON.stringify({
                status: status
            })

        });

        if (!response.ok) {

            const error = await response.json();

            alert(error.message || error.error);

            return;
        }

        // Refresh all sections
        await loadAvailableRides();
        await loadMyRides();
        await loadCompletedRides();

    } catch (err) {

        console.error("Error updating ride:", err);

    }
}


// ==========================================
// INITIAL LOAD
// ==========================================

loadAvailableRides();
loadMyRides();
loadCompletedRides();


// ==========================================
// AUTOMATIC REFRESH
// ==========================================

setInterval(() => {

    loadAvailableRides();
    loadMyRides();
    loadCompletedRides();

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