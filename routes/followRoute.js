import express from 'express';
import isAuthenticated from '../middlewares/authMiddleware.js';
import {
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    getFollowSuggestions
} from '../controllers/followControllers.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(isAuthenticated);

router.post('/:username', followUser);
router.delete('/:username', unfollowUser);
router.get('/followers/:username', getFollowers);
router.get('/following/:username', getFollowing);
router.get('/suggestions', getFollowSuggestions);

export default router;
