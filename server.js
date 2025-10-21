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
import { server, app } from "./src/lib/socket.js";
import { swaggerSpec } from "./swagger.js";
import swaggerUi from "swagger-ui-express";

const __dirname = path.resolve();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB before starting the server
connectDB().then(() => {
  // Body parsers  ←←←  ADD THE LIMITS HERE
app.use(express.json({ limit: "10mb" }));                 // <-- JSON (base-64 images)
app.use(express.urlencoded({ limit: "10mb", extended: true })); // <-- form-urlencoded

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

  // Swagger route
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Redirect root to Swagger UI
  app.get('/', (req, res) => res.redirect('/api-docs'));
  
  // Start server
  server.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}).catch((error) => {
  console.error("Failed to connect to MongoDB:", error);
  process.exit(1);
});