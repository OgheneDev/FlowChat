import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    let token;

    // 1. Try to get token from cookie (works on desktop browsers)
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookieToken = cookieHeader
        .split("; ")
        .find((row) => row.startsWith("jwt="))
        ?.split("=")[1];
      
      if (cookieToken) {
        token = cookieToken;
        console.log("🍪 Socket auth: Using token from cookie");
      }
    }

    // 2. If no cookie, try auth token from handshake (fallback for iOS Safari)
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
      console.log("📱 Socket auth: Using token from handshake (iOS Safari)");
    }

    // 3. If still no token, reject connection
    if (!token) {
      console.log("❌ Socket connection rejected: No authentication provided");
      return next(new Error("Unauthorized - No authentication provided"));
    }

    // 4. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.log("❌ Socket connection rejected: Invalid token", error.message);
      return next(new Error("Unauthorized - Invalid token"));
    }

    if (!decoded.userId) {
      console.log("❌ Socket connection rejected: Invalid token payload");
      return next(new Error("Unauthorized - Invalid token payload"));
    }

    // 5. Get user from database
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      console.log("❌ Socket connection rejected: User not found", decoded.userId);
      return next(new Error("Unauthorized - User not found"));
    }

    // 6. Attach user to socket
    socket.user = user;
    socket.userId = user._id.toString();
    console.log(`✅ Socket authenticated for user: ${user.fullName} (${user._id})`);

    next();
  } catch (error) {
    console.error("❌ Error in socket authentication:", error.message);
    next(new Error("Unauthorized - Authentication failed"));
  }
};