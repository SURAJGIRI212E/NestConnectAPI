import express from 'express';
import { forgetPassword, login, logout, register, resetPassword, updatePassword, getMe } from '../controllers/authControllers.js';
import  isAuthenticated  from '../middlewares/authMiddleware.js';
import { resetPasswordLimiter, authLimiter } from '../middlewares/ratelimterMiddleware.js'; // <-- add this

const router = express.Router();

router.route('/register').post(authLimiter, register); // <-- add limiter
router.route('/login').post(authLimiter, login); // <-- add limiter
router.route('/logout').post(isAuthenticated, logout);
router.route('/forgetPassword').post(resetPasswordLimiter, forgetPassword); // <-- add limiter
router.route('/resetPassword/:token').patch(resetPasswordLimiter, resetPassword); // <-- add limiter
router.route('/updatePassword').patch(isAuthenticated, updatePassword);
router.get('/me', isAuthenticated, getMe);

export default router;