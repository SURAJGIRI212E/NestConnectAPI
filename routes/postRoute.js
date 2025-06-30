import express from 'express';
import {
    createPost,
    getPost,
    updatePost,
    deletePost,
    getFeedPosts,
    getUserPosts,
    getComments,
    searchPosts,
    likeunlikePost,
    getOwnLikedPosts,
    repost,
    getPostsByHashtag,
    getTrendingHashtags,
    getUserComments,
    unrepostPost
} from '../controllers/postControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import { uploadPostMedia } from '../middlewares/multerMiddleware.js';

const router = express.Router();
// Get posts by hashtag query
router.get('/hashtag/:hashtag', isAuthenticated, getPostsByHashtag);

//Get trending hashtags
router.get('/trending-hashtags', isAuthenticated, getTrendingHashtags);

// Search post by
router.get('/search', isAuthenticated, searchPosts);

// Feed Routes
router.get('/feed', isAuthenticated, getFeedPosts);

// User's liked posts
router.get('/user-likes', isAuthenticated, getOwnLikedPosts);

// Post CRUD Routes
router.route('/createpost')
    .post(isAuthenticated, uploadPostMedia, createPost);

router.route('/:postId')
    .get(isAuthenticated, getPost)
    .patch(isAuthenticated, updatePost)
    .delete(isAuthenticated, deletePost);

// any User Posts Route
router.get('/user/:userId', isAuthenticated, getUserPosts);

// Get comments made by a specific user
router.get('/user/:userId/comments', isAuthenticated, getUserComments);

// Comments Route
router.get('/:postId/comments', isAuthenticated, getComments);

//like and unlike routes
router.post('/:postId/like', isAuthenticated, likeunlikePost);

//repost route
router.post('/:postId/repost', isAuthenticated, repost);
router.delete('/:postId/unrepost', isAuthenticated, unrepostPost);

export default router;