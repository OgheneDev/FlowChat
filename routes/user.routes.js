import express from "express"
const router = express.Router();
import { protect } from "../src/middleware/auth.middleware.js";
import { getUserById } from "../src/controllers/user.controller.js";

router.get("/:id", protect, getUserById);

export const usersRouter = router;