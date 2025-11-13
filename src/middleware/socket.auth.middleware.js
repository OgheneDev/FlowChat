import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      console.log("Socket connection rejected: No cookies provided");
      return next(new Error("Unauthorized - No cookies provided"));
    } 

    const token = cookieHeader
      .split("; ")
      .find((row) => row.startsWith("jwt="))
      ?.split("=")[1];

    if (!token) {
      console.log("Socket connection rejected: No JWT token found");
      return next(new Error("Unauthorized - No token provided"));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.log("Socket connection rejected: Invalid token", error.message);
      return next(new Error("Unauthorized - Invalid token"));
    }

    if (!decoded.userId) {
      console.log("Socket connection rejected: Invalid token payload");
      return next(new Error("Unauthorized - Invalid token payload"));
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      console.log("Socket connection rejected: User not found", decoded.userId);
      return next(new Error("Unauthorized - User not found"));
    }

    socket.user = user;
    socket.userId = user._id.toString();
    console.log(`Socket authenticated for user: ${user.fullName} (${user._id})`);

    next();
  } catch (error) {
    console.error("Error in socket authentication:", error.message);
    next(new Error("Unauthorized - Authentication failed"));
  }
};