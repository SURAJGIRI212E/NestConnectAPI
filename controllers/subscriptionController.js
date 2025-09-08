// controllers/subscriptionController.js
import razorpay from '../config/razorpay.js';
import User from '../models/user.model.js';
import { subscriptionPlans } from '../config/subscriptionPlans.js';
import crypto from 'crypto';
import Subscription from '../models/subscription.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';

export const createSubscription = asyncErrorHandler(async (req, res) => {
  const { planId } = req.body;
  console.log("planId",planId)
  const userId = req.user?._id; // If not present, handle accordingly
  if (!userId) {
    throw new CustomError('Authentication required', 401);
  }
  console.log("createSubscription...");
  const isAnnual = planId === subscriptionPlans.ANNUAL.id;
  const totalCount = isAnnual ? 1 : 12;
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCount,
    // Attach our user id for mapping on webhook
    notes: { userId: userId.toString() },
  });

 
  // Do NOT create subscription in DB here. Only create after payment confirmation in webhook for security.
  res.json({ subscriptionId: subscription.id });
});

export const getPlans = (req, res) => {
  res.json(subscriptionPlans);
};

export const getSubscriptionStatus = asyncErrorHandler(async (req, res) => {
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
});

export const razorpayWebhook = asyncErrorHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new CustomError('Invalid signature', 400);
  }

  const payload = JSON.parse(rawBody.toString('utf8'));
  const event = payload.event;

  if (event === 'subscription.activated') {
    const entity = payload.payload.subscription.entity;
    const subscriptionId = entity.id;
    const mappedUserId = entity.notes?.userId; // set during createSubscription
    if (!mappedUserId) {
      throw new CustomError('Missing userId in notes', 400);
    }

    const subscription = await Subscription.create({
      user: mappedUserId,
      status: 'ACTIVE',
      plan: entity.plan_id === subscriptionPlans.ANNUAL.id ? 'ANNUAL' : 'MONTHLY',
      paymentProvider: 'Razorpay',
      paymentId: subscriptionId,
      startDate: new Date(entity.start_at * 1000),
      endDate: new Date(entity.end_at * 1000)
    });
    await User.findByIdAndUpdate(
      mappedUserId,
      {
        premium: {
          isActive: true,
          subscribedAt: subscription.startDate,
          expiresAt: subscription.endDate,
          planId: entity.plan_id,
          subscriptionId: subscriptionId
        }
      }
    );
  }

  // Other events can be handled here (charged, payment_failed, paused, cancelled)

  res.status(200).send('OK');
});

export const cancelSubscription = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const active = await Subscription.findOne({ user: userId, status: 'ACTIVE' }).sort({ createdAt: -1 });
  if (!active) throw new CustomError('No active subscription', 404);
  // cancel immediately: cancel_at_cycle_end=false; to cancel at end of cycle pass true
  await razorpay.subscriptions.cancel(active.paymentId, true);
  active.status = 'CANCELLED';
  await active.save();
  await User.findByIdAndUpdate(userId, { 'premium.isActive': false });
  return res.json({ success: true });
});

export const getSubscriptionHistory = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const history = await Subscription.find({ user: userId }).sort({ createdAt: -1 });
  return res.json({ history });
});
