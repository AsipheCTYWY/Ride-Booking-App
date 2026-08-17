const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({

    passenger: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",    
        required: true
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

    pickupAddress: {
        type: String,
        default: ""
    },

    dropoff: {
        lat: Number,
        lng: Number
    },

    dropoffAddress: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        enum: ["pending", "accepted", "completed", "cancelled"],
        default: "pending"
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Ride", rideSchema);