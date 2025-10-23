import express from 'express'
const router = express.Router();
import { getAllContacts, getChatPartners, getMessagesByUserId, sendMessage, deleteMessage, editMessage } from '../src/controllers/message.controller.js';
import { protect } from '../src/middleware/auth.middleware.js';

router.use(protect);

// ✅ Specific routes FIRST
router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners); // This now works correctly

// ❌ Parameterized route LAST (/:id will catch any remaining routes)
router.get("/:id", getMessagesByUserId);

router.post("/send/:id", sendMessage);
router.delete("/delete", deleteMessage);
router.put("/edit/:messageId", editMessage);

export const messagesRouter = router;