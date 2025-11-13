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
  leaveGroup,
  deleteGroup 
} from "../src/controllers/group.controller.js";
import { protect } from "../src/middleware/auth.middleware.js";
import { createGroupEvent, getGroupEvents } from "../src/controllers/groupEvent.controller.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
 
// Create a new group
router.post("/", createGroup);
 
// Get all groups user is part of
router.get("/my-groups", getMyGroups);

// Get specific group details
router.get("/:groupId", getGroupById);

// Group messaging routes
router.post("/:groupId/messages", sendGroupMessage);
router.get("/:groupId/messages", getGroupMessages);

//Group event routes
router.post("/:groupId/events", createGroupEvent);
router.get("/:groupId/events", getGroupEvents);

// Admin-only group management
router.put("/:id", updateGroup);
router.post("/make-admin", makeGroupAdmin);
router.post("/:groupId/add-members", addMembersToGroup);
router.delete("/:groupId/members/:memberId", removeMemberFromGroup);
router.delete("/:groupId", deleteGroup);

// Leave group
router.delete("/:groupId/leave", leaveGroup);

export const groupRouter = router;