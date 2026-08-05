const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
  window.location.href = "/login.html";
}
if (role !== "driver"){

  alert("Access Denied");
  window.location.href = "/index.html";
}

const availableRides = document.getElementById("available-rides");
const myRides = document.getElementById("my-rides");
const completedRides = document.getElementById("completed-rides");

async function loadAvailableRides() {

    try {

        const response = await fetch("/api/available-rides", {
            headers: {
                "Authorization": localStorage.getItem("token")
            }
        });

        const rides = await response.json();

        availableRides.innerHTML = "";

        if (rides.length === 0) {
            availableRides.innerHTML = "<p class='no-rides'>No available rides.</p>";
            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `
                <div class="coords">
                    <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
                    <strong>Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
                </div>

                <button
                    class="accept-btn"
                    onclick="updateRide('${ride._id}','accepted')">
                    Accept
                </button>
            `;

            availableRides.appendChild(card);

        });

    } catch (err) {

        console.error(err);

    }

}

async function loadMyRides() {

    try {

        const response = await fetch("/api/my-driver-rides", {
            headers: {
                "Authorization": localStorage.getItem("token")
            }
        });

        const rides = await response.json();

        myRides.innerHTML = "";

        if (rides.length === 0) {
            myRides.innerHTML = "<p class='no-rides'>No active rides.</p>";
            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `
                <div class="coords">
                    <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
                    <strong>Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
                </div>

                <button
                    class="complete-btn"
                    onclick="updateRide('${ride._id}','completed')">
                    Complete
                </button>
            `;

            myRides.appendChild(card);

        });

    } catch (err) {

        console.error(err);

    }

}

async function loadCompletedRides() {

    try {

        const response = await fetch("/api/completed-rides", {
            headers: {
                "Authorization": localStorage.getItem("token")
            }
        });

        const rides = await response.json();

        completedRides.innerHTML = "";

        if (rides.length === 0) {
            completedRides.innerHTML = "<p class='no-rides'>No completed rides.</p>";
            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("div");

            card.className = "ride-card";

            card.innerHTML = `
                <div class="coords">
                    <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
                    <strong>Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
                </div>

                <span class="status completed">
                    Completed
                </span>
            `;

            completedRides.appendChild(card);

        });

    } catch (err) {

        console.error(err);

    }

}

async function updateRide(id, status) {

    try {

        const response = await fetch(`/api/rides/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": localStorage.getItem("token")
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.message || error.error);
            return;
        }

        // Refresh all sections
        loadAvailableRides();
        loadMyRides();
        loadCompletedRides();

    } catch (err) {

        console.error("Error updating ride:", err);

    }

}

loadAvailableRides();
loadMyRides();
loadCompletedRides();

setInterval(() => {

    loadAvailableRides();
    loadMyRides();
    loadCompletedRides();

}, 5000);

document
.getElementById("driver-logout-btn")
.addEventListener("click", () => {

    localStorage.removeItem("token");
    localStorage.removeItem("role");

    window.location.href = "/login.html";

});