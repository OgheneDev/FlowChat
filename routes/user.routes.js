import express from "express"
const router = express.Router();
import { protect } from "../src/middleware/auth.middleware.js";
import { getUserById, getUnreadCounts } from "../src/controllers/user.controller.js";

router.use(protect)

router.get("/:id", getUserById);
router.get("/unread-counts", getUnreadCounts)

export const usersRouter = router;