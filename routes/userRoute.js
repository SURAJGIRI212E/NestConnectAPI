import express from 'express';
import { 
    getUserByUsername, 
    updateUserProfile, 
    toggleBookmark,
    getUserBookmarks,
    toggleBlockUser,
    getBlockedUsers,
    searchUsers,
    getSuggestedUsers,
    updateMessagePreference,
    getNotificationPreferences,
    updateNotificationPreferences
} from '../controllers/userControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import { uploadUserProfile } from '../middlewares/multerMiddleware.js';
// Import specific limiters
import { 
    userSearchLimiter, 
    bookmarkLimiter, 
    followLimiter, 
    authLimiter
} from '../middlewares/ratelimterMiddleware.js';

const router = express.Router();

// User Profile Routes
router.get('/getuser/:username', isAuthenticated, getUserByUsername);
router.patch('/updateuser', isAuthenticated,authLimiter, uploadUserProfile, updateUserProfile);
router.patch('/message-preference', isAuthenticated,authLimiter, updateMessagePreference);

// Bookmark Routes
router.get('/bookmarks', isAuthenticated, getUserBookmarks);
router.post('/bookmarks/:postId', isAuthenticated, bookmarkLimiter, toggleBookmark);

// Block User Routes
router.get('/blocked-users', isAuthenticated, getBlockedUsers);
router.post('/toogleblock/:userId', isAuthenticated, followLimiter, toggleBlockUser);

// Search Routes
router.get('/search', isAuthenticated, userSearchLimiter, searchUsers);

// Suggested Users Route
router.get('/suggested', isAuthenticated, userSearchLimiter, getSuggestedUsers);

// Notification preferences routes
router.get('/me/notification-preferences', isAuthenticated, getNotificationPreferences);
router.put('/me/notification-preferences', isAuthenticated,authLimiter, updateNotificationPreferences);

export default router;

