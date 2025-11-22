import express from "express"
const router = express.Router();
import { protect } from "../src/middleware/auth.middleware.js";
import { getUserById, getUnreadCounts } from "../src/controllers/user.controller.js";

router.use(protect)

router.get("/unread-counts", getUnreadCounts)
router.get("/:id", getUserById);

export const usersRouter = router;