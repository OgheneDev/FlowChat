/**
 * @swagger
 * components:
 *   schemas:
 *     PinUnpinRequest:
 *       type: object
 *       required:
 *         - messageId
 *       properties:
 *         messageId:
 *           type: string
 *           description: ID of the message to pin/unpin
 *         chatId:
 *           type: string
 *           description: ID of the chat (for direct messages)
 *           nullable: true
 *         groupId:
 *           type: string
 *           description: ID of the group (for group messages)
 *           nullable: true
 *     StarMessageRequest:
 *       type: object
 *       required:
 *         - messageId
 *       properties:
 *         messageId:
 *           type: string
 *           description: ID of the message to star/unstar
 *     StarChatRequest:
 *       type: object
 *       required:
 *         - chatId
 *       properties:
 *         chatId:
 *           type: string
 *           description: ID of the chat to star/unstar
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
 *   - name: Chats
 *     description: Chat management operations (pinning, starring)
 */

/**
 * @swagger
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
 *             $ref: '#/components/schemas/PinUnpinRequest'
 *     responses:
 *       200:
 *         description: Message pinned
 *       400:
 *         description: Invalid request - must provide either chatId or groupId
 *       403:
 *         description: Not authorized to pin in this chat/group
 *       404:
 *         description: Message, chat, or group not found
 */

/**
 * @swagger
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
 *             $ref: '#/components/schemas/PinUnpinRequest'
 *     responses:
 *       200:
 *         description: Message unpinned
 *       400:
 *         description: Invalid request - must provide either chatId or groupId
 *       403:
 *         description: Not authorized to unpin in this chat/group
 *       404:
 *         description: Message, chat, or group not found
 */

/**
 * @swagger
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
 *             $ref: '#/components/schemas/StarMessageRequest'
 *     responses:
 *       200:
 *         description: Message starred/unstarred
 *       404:
 *         description: Message not found
 */

/**
 * @swagger
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
 *             $ref: '#/components/schemas/StarChatRequest'
 *     responses:
 *       200:
 *         description: Chat starred/unstarred
 *       404:
 *         description: Chat not found
 */