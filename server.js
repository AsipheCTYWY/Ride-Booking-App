require("dotenv").config();

const auth = require("./middleware/auth");

const jwt = require("jsonwebtoken");

const bcrypt = require("bcryptjs");
const User = require("./models/User");

const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path")
const Ride = require("./models/Ride");

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.use(express.static("public"));

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

app.post('/api/rides', auth, async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({ passenger: req.user.userId, pickup, dropoff });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/my-rides', async (req, res) => {
  try {
    const rides = await Ride.find({
      passenger: req.user.userId
    }).sort({ createdAt: -1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/available-rides", auth, async (req, res) => {

    if (req.user.role !== "driver") {
        return res.status(403).json({
            message: "Access denied"
        });
    }

    try {

        const rides = await Ride.find({
            status: "pending"
        });

        res.json(rides);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});
app.get("/api/my-driver-rides", auth, async (req, res) => {

    if (req.user.role !== "driver") {
        return res.status(403).json({ message: "Access denied" });
    }

    const rides = await Ride.find({
        driver: req.user.userId,
        status: "accepted"
    });

    res.json(rides);
});

app.get("/api/completed-rides", auth, async (req, res) => {

    if (req.user.role !== "driver") {
        return res.status(403).json({ message: "Access denied" });
    }

    const rides = await Ride.find({
        driver: req.user.userId,
        status: "completed"
    });

    res.json(rides);
});

app.patch('/api/rides/:id', auth, async (req, res) => {

    if (req.user.role !== "driver") {
        return res.status(403).json({
            message: "Only drivers can update rides"
        });
    }

    try {

       const { status } = req.body;
       const update = { status };

       if (status === "accepted") {
        update.driver = req.user.userId;
      }
      const ride = await Ride.findByIdAndUpdate(
        req.params.id,
        update,
    { returnDocument: "after" }
  );
    res.json(ride);

    } catch (err) {

        res.status(400).json({
            error: err.message
        });

    }

});

app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role
    });

    await user.save();

    res.status(201).json({
      message: "User registered successfully"
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found"
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    // Create token
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );

    res.json({
    message: "Login successful",
    token,
    role: user.role
});

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});