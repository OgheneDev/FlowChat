import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    token = req.cookies.jwt;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        console.log('📱 Protect middleware: Using token from Authorization header (iOS Safari)');
      }
    } else {
      console.log('🍪 Protect middleware: Using token from cookie');
    }

    if (!token) {
      console.log("❌ Protect middleware: No token provided");
      return res.status(401).json({ message: "Unauthorized - No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.log("❌ Protect middleware: Invalid token", error.message);
      return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }

    if (!decoded.userId) {
      console.log("❌ Protect middleware: Invalid token payload");
      return res.status(401).json({ message: "Unauthorized - Invalid token payload" });
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      console.log("❌ Protect middleware: User not found", decoded.userId);
      return res.status(404).json({ message: "User not found" });
    }

    req.user = user;
    console.log(`✅ Protect middleware: User authenticated - ${user.fullName}`);
    next();
  } catch (error) {
    console.error("❌ Error in protect middleware:", error);
    res.status(500).json({ message: "Internal Server Error", details: error.message });
  }
};