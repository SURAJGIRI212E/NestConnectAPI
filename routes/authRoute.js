import express from 'express';
import { forgetPassword, login, logout, register, resetPassword, updatePassword, getMe } from '../controllers/authControllers.js';
import  isAuthenticated  from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/register').post(register);
router.route('/login').post(login);
router.route('/logout').post(isAuthenticated, logout);
router.route('/forgetPassword').post(forgetPassword);
router.route('/resetPassword/:token').patch(resetPassword);
router.route('/updatePassword').patch(isAuthenticated, updatePassword);
router.get('/me', isAuthenticated, getMe);

export default router;