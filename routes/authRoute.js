import express from 'express';
import { forgetPassword, login, logout, register, resetPassword, updatePassword } from '../controllers/authControllers.js';
import  isAuthenticated  from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/register').post(register);
router.route('/login').post(login);
router.route('/logout').get(isAuthenticated, logout);
router.route('/forgetPassword').post(forgetPassword);
router.route('/resetPassword/:token').patch(resetPassword);
router.route('/updatePassword').patch(isAuthenticated, updatePassword);


export default router;