require("dotenv").config();

const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
    try {

        const authHeader = req.header("Authorization");

        if (!authHeader) {
            return res.status(401).json({
                message: "No token provided"
            });
        }

        // Support:
        // Authorization: Bearer TOKEN
        // and
        // Authorization: TOKEN

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : authHeader;

        if (!token) {
            return res.status(401).json({
                message: "No token provided"
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        console.error("JWT ERROR:", error.message);

        return res.status(401).json({
            message: "Invalid token"
        });
    }
};

module.exports = auth;