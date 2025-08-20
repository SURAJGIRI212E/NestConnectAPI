import express from 'express';
import { createSubscription, getPlans, razorpayWebhook, getSubscriptionStatus } from '../controllers/subscriptionController.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
const router = express.Router();

router.post('/create', isAuthenticated,createSubscription);
router.get('/plans',isAuthenticated, getPlans);
router.post('/webhook', razorpayWebhook);
router.get('/status', isAuthenticated, getSubscriptionStatus);

export default router;