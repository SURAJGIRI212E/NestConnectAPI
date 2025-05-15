import express from 'express';
import {
    createPost,
    getPost,
    updatePost,
    deletePost,
    getFeedPosts,
    getUserPosts,
    getComments,
    searchPosts
} from '../controllers/postControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import { uploadPostMedia } from '../middlewares/multerMiddleware.js';

const router = express.Router();

// Search Route
router.get('/search', isAuthenticated, searchPosts);

// Feed Routes
router.get('/feed', isAuthenticated, getFeedPosts);

// Post CRUD Routes
router.route('/')
    .post(isAuthenticated, uploadPostMedia, createPost);

router.route('/:postId')
    .get(isAuthenticated, getPost)
    .patch(isAuthenticated, updatePost)
    .delete(isAuthenticated, deletePost);

// User Posts Route
router.get('/user/:userId', isAuthenticated, getUserPosts);

// Comments Route
router.get('/:postId/comments', isAuthenticated, getComments);

export default router;