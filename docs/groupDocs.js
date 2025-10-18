/**
 * @swagger
 * components:
 *   schemas:
 *     Group:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Group ID
 *         name:
 *           type: string
 *           description: Group name
 *         description:
 *           type: string
 *           description: Group description
 *           nullable: true
 *         groupImage:
 *           type: string
 *           description: Group image URL
 *           nullable: true
 *         createdBy:
 *           type: string
 *           description: User ID of group creator
 *         admins:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of admin user IDs
 *         members:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of member user IDs
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     GroupCreateRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Group name
 *         description:
 *           type: string
 *           description: Group description
 *           nullable: true
 *         groupImage:
 *           type: string
 *           description: base64 encoded image or URL
 *           nullable: true
 *         members:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs to add as members
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         error:
 *           type: string
 *         stack:
 *           type: string
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Group management and operations
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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
 */

/**
 * @swagger
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