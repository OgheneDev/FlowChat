import express from "express";
import { 
  createGroup, 
  getMyGroups, 
  getGroupById, 
  sendGroupMessage, 
  getGroupMessages, 
  updateGroup, 
  makeGroupAdmin, 
  addMembersToGroup, 
  removeMemberFromGroup, 
  leaveGroup 
} from "../src/controllers/group.controller.js"; // Adjust path as needed
import { protect } from "../src/middleware/auth.middleware.js"; // Your auth middleware

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
 
// 🆕 Create a new group
router.post("/", createGroup);
 
// 📋 Get all groups user is part of
router.get("/my-groups", getMyGroups);

// 👁️ Get specific group details
router.get("/:groupId", getGroupById);

// 💬 Group messaging routes
router.post("/:groupId/messages", sendGroupMessage);
router.get("/:groupId/messages", getGroupMessages);

// 🔧 Admin-only group management
router.put("/:id", updateGroup); // Update group details
router.post("/make-admin", makeGroupAdmin); // Promote to admin
router.post("/:groupId/add-members", addMembersToGroup);
router.delete("/:groupId/members/:memberId", removeMemberFromGroup);

// 🚪 Leave group
router.delete("/:groupId/leave", leaveGroup);

export const groupRouter = router;