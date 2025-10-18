import express from "express";
import { protect } from "../src/middleware/auth.middleware.js";
import { globalSearch } from "../src/controllers/search.controller.js";

const router = express.Router();

/**
 * @openapi
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

// ✅ Global search route
router.get("/", protect, globalSearch);

export const searchRouter = router;
