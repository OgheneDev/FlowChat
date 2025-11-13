/**
 * @swagger
 * components:
 *   schemas:
 *     SearchResult:
 *       type: object
 *       properties:
 *         users:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *           description: Matching users
 *         groups:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Group'
 *           description: Matching groups that user is member of
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Message'
 *           description: Matching messages involving the authenticated user
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
 *   - name: Search
 *     description: Global search operations
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     tags:
 *       - Search
 *     summary: Global search across users, groups and messages
 *     description: Performs a full-text search across users, groups (that the user is member of) and messages involving the authenticated user. Query string parameter `query` is required.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term to query users, groups and messages
 *     responses:
 *       200:
 *         description: Search results object containing users, groups and messages arrays
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResult'
 *       400:
 *         description: Missing or empty query
 *       500:
 *         description: Server error
 */