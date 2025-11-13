import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL,
      "http://localhost:3000",
      "https://flowchatt.vercel.app", 
    ].filter(Boolean),
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/socket.io",
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.use(socketAuthMiddleware);

export { io, app, server };