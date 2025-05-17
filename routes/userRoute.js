import express from 'express';
import { 
    getUserByUsername, 
    updateUserProfile, 
    toggleBookmark,
    getUserBookmarks,
    toggleBlockUser,
    getBlockedUsers,
    searchUsers,
    getSuggestedUsers
} from '../controllers/userControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import { uploadUserProfile } from '../middlewares/multerMiddleware.js';

const router = express.Router();

// User Profile Routes
router.get('/getuser/:username', isAuthenticated, getUserByUsername);
router.patch('/updateuser', isAuthenticated, uploadUserProfile, updateUserProfile);

// Bookmark Routes
router.get('/bookmarks', isAuthenticated, getUserBookmarks);
router.post('/bookmarks/:postId', isAuthenticated, toggleBookmark);

// Block User Routes
router.get('/blocked-users', isAuthenticated, getBlockedUsers);
router.post('/toogleblock/:userId', isAuthenticated, toggleBlockUser);

// Search Routes
router.get('/search', isAuthenticated, searchUsers);

// Suggested Users Route
router.get('/suggested', isAuthenticated, getSuggestedUsers);

export default router;

