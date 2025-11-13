import express from 'express';
import { registerDeviceToken, removeDeviceToken } from '../src/controllers/notifications.controller.js';
import { protect } from '../src/middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/register-token', registerDeviceToken);
router.post('/remove-token', removeDeviceToken);

export const notificationsRouter = router; 