import express from 'express';
import {
    getNotifications,
    getUnreadCount,
    markAllAsRead,
    markAsRead,
    deleteNotification,
    deleteAllNotifications
} from '../controllers/notiControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(isAuthenticated);

// Get notifications and counts
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);

// Mark notifications as read
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:notificationId/mark-read', markAsRead);

// Delete notification
router.delete('/', deleteAllNotifications);
router.delete('/:notificationId', deleteNotification);


export default router;