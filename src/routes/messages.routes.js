import express from 'express'
const router = express.Router();
import { getAllContacts, getChatPartners, getMessagesByUserId, sendMessage, deleteMessage, editMessage } from '../controllers/message.controller.js';
import { protect } from '../middleware/auth.middleware.js';

router.use(protect);

// ✅ Specific routes FIRST
router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners); // This now works correctly

// ❌ Parameterized route LAST (/:id will catch any remaining routes)
router.get("/:id", getMessagesByUserId);

router.post("/send/:id", sendMessage);
router.delete("/delete", protect, deleteMessage);
router.put("/edit/:messageId", protect, editMessage);

export const messagesRouter = router;