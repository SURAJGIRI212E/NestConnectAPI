import express from 'express';
import { getUserByUsername, updateUserProfile } from '../controllers/userControllers.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import { uploadUserProfile }  from '../middlewares/multerMiddleware.js';

const router = express.Router();

router.route('/:username').get(isAuthenticated, getUserByUsername);
router.route('/updateuser').patch(
    isAuthenticated,
    uploadUserProfile,
    updateUserProfile
);

export default router;