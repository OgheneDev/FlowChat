import jwt from "jsonwebtoken"
import User from "../models/User.js"

export const socketAuthMiddleware = async (socket, next) => {
    try {
        // extract token from http-onlz cookies
        const token = socket.handshake.headers.cookie
          ?.split("; ")
          .find((row) => row.startsWith("jwt="))
          ?.split("=") [1];

        if (!token) {
            console.log("Socket connection rejected: No token provided");
            return next(new Error("Unauthorized - No token provided"))
        }

        // verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        if (!decoded) {
            return res.status(401).json({message: "Unauthorized - Invalid token"});
         }

        // find user from db
        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            return res.status(404).json({message: "User not found"});
        }

        // attach user info to socket
        socket.user = user;
        socket.userId = user._id.toString();

        console.log(`Socket authenticated for user: ${user.fullName} (${user._id})`);

        next();
    } catch (error) {
        console.log("Error in socket authentication:", error.message)
        next(new Error("Unauthorized - Authentication failed"))
    }
}