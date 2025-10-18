import express from "express";
import {
  pinMessage,
  unpinMessage,
  toggleStarMessage,
  toggleStarChat,
} from "../controllers/chat.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect)

/**
 * @openapi
 * /api/chats/pin:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Pin a message in a chat or group
 *     description: Add a messageId to pinnedMessages on a chat or a group. Provide chatId OR groupId plus messageId in the body. User must be participant/member.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageId
 *             properties:
 *               messageId:
 *                 type: string
 *               chatId:
 *                 type: string
 *               groupId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message pinned
 *
 * /api/chats/unpin:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Unpin a message from chat or group
 *     description: Remove a messageId from pinnedMessages. Provide chatId or groupId and messageId.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageId
 *             properties:
 *               messageId:
 *                 type: string
 *               chatId:
 *                 type: string
 *               groupId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message unpinned
 *
 * /api/chats/star-message:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Toggle star on a message for current user
 *     description: Adds or removes messageId from the user's starredMessages list.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageId
 *             properties:
 *               messageId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message starred/unstarred
 *
 * /api/chats/star-chat:
 *   post:
 *     tags:
 *       - Chats
 *     summary: Toggle star on a chat for current user
 *     description: Adds or removes chatId from the user's starredChats list.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chatId
 *             properties:
 *               chatId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat starred/unstarred
 */

router.post("/pin", pinMessage);
router.post("/unpin", unpinMessage);
router.post("/star-message", toggleStarMessage);
router.post("/star-chat", toggleStarChat);

export const chatRouter = router;
