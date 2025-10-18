import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";

import { connectDB } from "./src/lib/db.js";
import { authRouter } from "./src/routes/auth.route.js";
import { messagesRouter } from "./src/routes/messages.routes.js";
import { groupRouter } from "./src/routes/group.routes.js";
import { chatRouter } from "./src/routes/chat.routes.js";
import { searchRouter } from "./src/routes/search.routes.js";
import { server, app } from "./src/lib/socket.js";

const __dirname = path.resolve();
const PORT = process.env.PORT || 5000;

// ✅ Body parsers (must come before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Cookies
app.use(cookieParser());

// ✅ CORS (MUST include credentials + frontend URLs)
const allowedOrigins = [
  "http://localhost:3000",
  "https://flowchat.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like Postman) or allowed ones
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Handle preflight CORS for all routes
app.options("*", cors());

// ✅ Routes
app.use("/api/auth", authRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/groups", groupRouter);
app.use("/api/chats", chatRouter);
app.use("/api/search", searchRouter);

// ✅ Start server
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  connectDB();
});
