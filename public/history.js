const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "/login.html";
}

if (role !== "passenger") {
    window.location.href = "/driver.html";
}

const rideHistoryFull =
    document.getElementById("ride-history-full");


// ==========================================
// LOAD FULL RIDE HISTORY
// ==========================================

async function loadRideHistory() {

    try {

        const response = await fetch(
            "/api/my-rides",
            {
                headers: {
                    "Authorization": token
                }
            }
        );

        if (!response.ok) {
            throw new Error("Failed to load ride history");
        }

        const rides = await response.json();

        const history = rides.filter(
            ride =>
                ride.status === "completed" ||
                ride.status === "cancelled"
        );

        rideHistoryFull.innerHTML = "";

        if (history.length === 0) {

            rideHistoryFull.innerHTML = `
                <p class="no-rides">
                    No ride history yet.
                </p>
            `;

            return;

        }

        // Most recent first, if the API doesn't already sort them
        history.sort((a, b) => {

            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);

            return dateB - dateA;

        });

        history.forEach(ride => {

            const card =
                document.createElement("div");

            card.className = "history-card";

            card.innerHTML = `

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
                    ride.driver
                    ? `
                        <p>
                            <strong>Driver</strong><br>
                            ${ride.driver.name}
                        </p>
                    `
                    : ""
                }

            `;

            rideHistoryFull.appendChild(card);

        });

    } catch (error) {

        console.error(
            "Error loading ride history:",
            error
        );

        rideHistoryFull.innerHTML = `
            <p class="no-rides">
                Couldn't load your ride history. Try refreshing.
            </p>
        `;

    }

}

loadRideHistory();


// ==========================================
// LOGOUT
// ==========================================

document.getElementById("history-logout-btn").addEventListener("click", () => {

    localStorage.removeItem("token");
    localStorage.removeItem("role");

    window.location.href = "/login.html";

});