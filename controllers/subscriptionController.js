// controllers/subscriptionController.js
import razorpay from '../config/razorpay.js';
import User from '../models/user.model.js';
import { subscriptionPlans } from '../config/subscriptionPlans.js';
import crypto from 'crypto';
import Subscription from '../models/subscription.model.js';

export const createSubscription = async (req, res) => {
  try {
    const { planId } = req.body;
    
    const userId = req.user?._id; // If not present, handle accordingly
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12, // 12 months, for example
    });


    // Do NOT create subscription in DB here. Only create after payment confirmation in webhook for security.
    res.json({ subscriptionId: subscription.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPlans = (req, res) => {
  res.json(subscriptionPlans);
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    // Find latest subscription for user
    const subscription = await Subscription.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!subscription) {
      return res.json({
        isActive: false,
        plan: null,
        status: null,
        startDate: null,
        endDate: null,
        paymentProvider: null,
        paymentId: null,
        createdAt: null
      });
    }
    res.json({
      isActive: subscription.isActive(),
      plan: subscription.plan,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      paymentProvider: subscription.paymentProvider,
      paymentId: subscription.paymentId,
      createdAt: subscription.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const razorpayWebhook = async (req, res) => {
  console.log("razorwebhook called")
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).send('Invalid signature');
  }

  // Handle subscription activation event
  if (req.body.event === 'subscription.activated') {
    const razorpaySubscription = req.body.payload.subscription.entity;
    const subscriptionId = razorpaySubscription.id;
    try {
      // Create subscription in DB only after payment confirmation
      const subscription = await Subscription.create({
        user: razorpaySubscription.customer_id, // You may need to map this to your user
        status: 'ACTIVE',
        plan: razorpaySubscription.plan_id === subscriptionPlans.ANNUAL.id ? 'ANNUAL' : 'MONTHLY',
        paymentProvider: 'Razorpay',
        paymentId: subscriptionId,
        startDate: new Date(razorpaySubscription.start_at * 1000),
        endDate: new Date(razorpaySubscription.end_at * 1000)
      });
      // Update the user premium status
      await User.findByIdAndUpdate(
        subscription.user,
        {
          premium: {
            isActive: true,
            subscribedAt: subscription.startDate,
            expiresAt: subscription.endDate,
            planId: razorpaySubscription.plan_id,
            subscriptionId: subscriptionId
          }
        }
      );
    } catch (err) {
      console.error('Error updating subscription/user:', err);
      return res.status(500).send('Webhook processing error');
    }
  }

  res.status(200).send('OK');
};
