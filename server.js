import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import { connectDB } from "./src/lib/db.js";
import { authRouter } from "./routes/auth.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { groupRouter } from "./routes/group.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { usersRouter } from "./routes/user.routes.js";
import { server, app } from "./src/sockets/config.js";
import { swaggerSpec } from "./swagger.js";
import { devRouter } from "./routes/dev.routes.js";
import swaggerUi from "swagger-ui-express";
import { setupConnection } from "./src/sockets/connection.js";
import { io } from "./src/sockets/config.js";

const __dirname = path.resolve();
const PORT = process.env.PORT || 5000;

connectDB().then(() => {

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Cookies
  app.use(cookieParser());

  // CORS
  const allowedOrigins = [
    "http://localhost:3000",
    "https://flowchat-three.vercel.app",
  ];

  app.use(
    cors({
      origin: function (origin, callback) {
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

  // Handle preflight CORS
  app.options("*", cors());

  // Routes
  app.use("/api/auth", authRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/groups", groupRouter);
  app.use("/api/chats", chatRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/dev", devRouter);
  app.use("/api/users", usersRouter);

  // Swagger route
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Redirect root to Swagger UI
  app.get('/', (req, res) => res.redirect('/api-docs'));

  // Setup Socket.IO connection handlers - ADD THIS HERE
  console.log("🔧 Initializing Socket.IO connection handlers...");
  setupConnection(io);
  
  // Start server
  server.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}).catch((error) => {
  console.error("Failed to connect to MongoDB:", error);
  process.exit(1);
});