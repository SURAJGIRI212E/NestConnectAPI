import express from 'express';
import { getUserByUsername, updateUserProfile } from '../controllers/userControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/:username').get(isAuthenticated, getUserByUsername); // Get and update user details

export default router;
