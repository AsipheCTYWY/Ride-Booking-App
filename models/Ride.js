const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({

    passenger: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
    },

    pickup: {
        lat: Number,
        lng: Number
    },

    dropoff: {
        lat: Number,
        lng: Number
    },

    status: {
        type: String,
        enum: ["pending", "accepted", "completed"],
        default: "pending"
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Ride", rideSchema);