/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Message ID
 *         senderId:
 *           type: string
 *           description: Sender user ID
 *         receiverId:
 *           type: string
 *           description: Receiver user ID
 *           nullable: true
 *         groupId:
 *           type: string
 *           description: Group ID (if group message)
 *           nullable: true
 *         text:
 *           type: string
 *           description: Message text content
 *           maxLength: 2000
 *         image:
 *           type: string
 *           description: Image URL or base64 data
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [sent, delivered, seen]
 *           default: sent
 *         replyTo:
 *           type: string
 *           description: Reference to replied message ID
 *           nullable: true
 *         deletedFor:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs for whom message is deleted
 *         deletedForEveryone:
 *           type: boolean
 *           default: false
 *         deletedBy:
 *           type: string
 *           description: User ID who deleted the message
 *           nullable: true
 *         edited:
 *           type: boolean
 *           default: false
 *         editedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     MessageCreateRequest:
 *       type: object
 *       properties:
 *         text:
 *           type: string
 *           maxLength: 2000
 *         image:
 *           type: string
 *           description: base64 encoded image or URL
 *           nullable: true
 *         replyTo:
 *           type: string
 *           description: Message ID to reply to
 *           nullable: true
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
 *   - name: Messages
 *     description: Message management and operations
 */

/**
 * @swagger
 * /api/messages/contacts:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Get all contacts
 *     description: Returns a list of users excluding the logged-in user. Requires auth.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user contacts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/messages/chats:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Get chat partners
 *     description: Returns recent chat partners for the logged-in user, inferred from messages collection.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of chat partner users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */

/**
 * @swagger
 * /api/messages/{id}:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Get messages between current user and another user
 *     description: Fetches messages exchanged between authenticated user and user identified by {id}. Supports replyTo population and soft-delete markers.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the other user (receiver)
 *     responses:
 *       200:
 *         description: Array of messages (chronological)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /api/messages/send/{id}:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Send a message to a user
 *     description: Create a new message targeting user with ID {id}. Accepts text, optional image (base64 or url), and optional replyTo message ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Receiver user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MessageCreateRequest'
 *     responses:
 *       201:
 *         description: Created message object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/messages/delete:
 *   delete:
 *     tags:
 *       - Messages
 *     summary: Delete a message (me or everyone)
 *     description: Soft-delete a message for the current user or mark as deleted for everyone. Body must include messageId and deleteType ('me'|'everyone').
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
 *               - deleteType
 *             properties:
 *               messageId:
 *                 type: string
 *               deleteType:
 *                 type: string
 *                 enum: [me, everyone]
 *     responses:
 *       200:
 *         description: Deletion result message
 *       403:
 *         description: Forbidden (e.g., not allowed to delete for everyone)
 *       404:
 *         description: Message not found
 */

/**
 * @swagger
 * /api/messages/edit/{messageId}:
 *   put:
 *     tags:
 *       - Messages
 *     summary: Edit a message
 *     description: Edit the text of a message. Only the original sender (or authorized admin) may edit. Returns updated message.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message updated
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Message not found
 */