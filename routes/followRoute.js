import express from 'express';
import { 
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    getFollowSuggestions
} from '../controllers/followControllers.js';
import { 
    
    followLimiter 
} from '../middlewares/ratelimterMiddleware.js';
import isAuthenticated from '../middlewares/authMiddleware.js';

const router = express.Router();

// Follow/Unfollow Routes
router.post('/:userId', isAuthenticated,followLimiter, followUser);
router.delete('/:userId', isAuthenticated,followLimiter, unfollowUser);

// Get Followers/Following Lists
router.get('/:userId/followers', isAuthenticated, getFollowers);
router.get('/:userId/following', isAuthenticated, getFollowing);

// Get Follow Suggestions
router.get('/suggestions', isAuthenticated, getFollowSuggestions);

export default router;
