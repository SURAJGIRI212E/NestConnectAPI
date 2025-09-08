import express from 'express';
import { createSubscription, getPlans, getSubscriptionStatus, cancelSubscription, getSubscriptionHistory } from '../controllers/subscriptionController.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
const router = express.Router();

router.post('/create', isAuthenticated,createSubscription);
router.get('/plans',isAuthenticated, getPlans);
router.get('/status', isAuthenticated, getSubscriptionStatus);
router.post('/cancel', isAuthenticated, cancelSubscription);
router.get('/history', isAuthenticated, getSubscriptionHistory);

export default router;