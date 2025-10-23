import express from "express";
import {
  pinMessage,
  unpinMessage,
  toggleStarMessage,
  toggleStarChat,
  getStarredData
} from "../src/controllers/chat.controller.js";
import { protect } from "../src/middleware/auth.middleware.js";

const router = express.Router();

router.use(protect)

router.post("/pin", pinMessage);
router.post("/unpin", unpinMessage);
router.post("/star-message", toggleStarMessage);
router.post("/star-chat", toggleStarChat);
router.get('/starred-data', getStarredData);

export const chatRouter = router;
