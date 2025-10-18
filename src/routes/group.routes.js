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
} from "../controllers/group.controller.js"; // Adjust path as needed
import { protect } from "../middleware/auth.middleware.js"; // Your auth middleware

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @openapi
 * /api/groups:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Create a new group
 *     description: Create a group with a name, optional members (array or comma-separated string) and optional groupImage (base64/URL). Creator becomes admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GroupCreateRequest'
 *     responses:
 *       201:
 *         description: Group created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Group'
 *       400:
 *         description: Validation error
 *
 * /api/groups/my-groups:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get groups for current user
 *     description: Returns all groups where the authenticated user is a member.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of groups
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Group'
 *
 * /api/groups/{groupId}:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get group details
 *     description: Return group by ID with populated members and admins.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Group'
 *       404:
 *         description: Group not found
 *
 * /api/groups/{groupId}/messages:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Send message to group
 *     description: Post a message to a group. Body accepts text, optional image, optional replyTo message ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               image:
 *                 type: string
 *               replyTo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created message (populated)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       403:
 *         description: Not a member
 *
 * /api/groups/{groupId}/messages:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get group messages
 *     description: Fetch all messages in a group (populated). Requires membership.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       403:
 *         description: Not a member
 *
 * /api/groups/{id}:
 *   put:
 *     tags:
 *       - Groups
 *     summary: Update group details (admin only)
 *     description: Change group name, image or members. Only admins can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               newImage:
 *                 type: string
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated group
 *       403:
 *         description: Forbidden
 *
 * /api/groups/make-admin:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Promote a member to admin
 *     description: Admin-only endpoint to make another member an admin. Requires groupId and userIdToPromote in body.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - groupId
 *               - userIdToPromote
 *             properties:
 *               groupId:
 *                 type: string
 *               userIdToPromote:
 *                 type: string
 *     responses:
 *       200:
 *         description: Promotion successful
 *       403:
 *         description: Forbidden
 *
 * /api/groups/{groupId}/add-members:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Add members to a group (admin only)
 *     description: Add one or more users to a group. Body expects members array of user IDs.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Members added
 *       403:
 *         description: Forbidden
 *
 * /api/groups/{groupId}/members/{memberId}:
 *   delete:
 *     tags:
 *       - Groups
 *     summary: Remove a member from group (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 *       403:
 *         description: Forbidden
 *
 * /api/groups/{groupId}/leave:
 *   delete:
 *     tags:
 *       - Groups
 *     summary: Leave a group
 *     description: The authenticated user leaves the specified group. Admin leaving is restricted if sole admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Left group successfully
 *       400:
 *         description: Cannot leave as only admin
 */
 
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