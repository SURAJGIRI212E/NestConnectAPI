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
  const userId = req.user?._id;
  if (!userId) throw new CustomError('Authentication required', 401);

  const user = await User.findById(userId);
  if (!user) throw new CustomError('User not found', 404);

  let customerId = user.razorpayCustomerId;

  if (!customerId) {
    try {
      const customer = await razorpay.customers.create({
        name: user.fullName,
        email: user.email,
        fail_existing: '0',
        notes: { userId: userId.toString() }
      });
      customerId = customer.id;
      user.razorpayCustomerId = customerId;
      await user.save();
    } catch (err) {
      const desc = err?.error?.description || err?.message || '';
      if (desc.includes('Customer already exists') || desc.includes('customer already exists')) {
        // Attempt to find existing customer by email
        try {
          const list = await razorpay.customers.all({ email: user.email });
          if (list && Array.isArray(list.items) && list.items.length > 0) {
            customerId = list.items[0].id;
            user.razorpayCustomerId = customerId;
            await user.save();
          } else {
            console.error('Customer exists but could not be found via customers.all', user.email);
            throw new CustomError('Could not locate existing Razorpay customer', 500);
          }
        } catch (findErr) {
          console.error('Error finding existing Razorpay customer', findErr);
          throw new CustomError('Could not create or locate Razorpay customer', 500);
        }
      } else {
        console.error('Error creating Razorpay customer', err);
        throw new CustomError('Could not create Razorpay customer', 500);
      }
    }
  } else {
    // try to keep customer record updated
    try {
      await razorpay.customers.edit(customerId, { email: user.email, name: user.fullName });
    } catch (err) {
      console.warn('Could not update Razorpay customer (non-fatal)', err?.message || err);
    }
  }

  const totalCount = planId === subscriptionPlans.MONTHLY.id ? 12 : 1;

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    customer_id: customerId,
    total_count: totalCount,
  });

  return res.json({ subscriptionId: subscription.id });
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
  const entity = payload.payload?.subscription?.entity;

  if (!entity) {
    // Not a subscription payload we care about
    return res.status(200).send('OK');
  }

  // Helper to find our user: prefer razorpay customer id, fall back to notes.userId
  const findUserFromEntity = async (ent) => {
    if (!ent) return null;
    if (ent.customer_id) {
      const user = await User.findOne({ razorpayCustomerId: ent.customer_id });
      if (user) return user;
    }
    if (ent.notes?.userId) {
      const userById = await User.findById(ent.notes.userId);
      if (userById) return userById;
    }
    return null;
  };

  const startEpoch = entity.current_start || entity.start_at;
  const endEpoch = entity.current_end || entity.end_at;
  const startDate = startEpoch ? new Date(startEpoch * 1000) : new Date();
  const endDate = endEpoch ? new Date(endEpoch * 1000) : null;

  switch (event) {
    case 'subscription.activated':
    case 'subscription.resumed':
    case 'subscription.charged': {
      console.log(event);
      const user = await findUserFromEntity(entity);
      if (!user) {
        console.warn('Webhook: no user found for entity', entity.id);
        return res.status(200).send('OK');
      }

      // Upsert subscription record
      await Subscription.findOneAndUpdate(
        { user: user._id, paymentId: entity.id },
        {
          user: user._id,
          status: 'ACTIVE',
          plan: entity.plan_id === subscriptionPlans.ANNUAL.id ? 'ANNUAL' : 'MONTHLY',
          paymentProvider: 'Razorpay',
          paymentId: entity.id,
          startDate,
          endDate
        },
        { upsert: true, new: true }
      );

      // Update user premium
      const userUpdate = { 'premium.isActive': true };
      if (endDate) userUpdate['premium.expiresAt'] = endDate;
      userUpdate['premium.subscribedAt'] = startDate;
      userUpdate['premium.planId'] = entity.plan_id;
      userUpdate['premium.subscriptionId'] = entity.id;

      await User.findByIdAndUpdate(user._id, userUpdate);
      break;
    }

    case 'subscription.payment_failed': {
      console.log('subscription.payment_failed');
      const user = await findUserFromEntity(entity);
      if (user) {
        await Subscription.findOneAndUpdate(
          { user: user._id, paymentId: entity.id },
          { status: 'PAST_DUE' }
        );
        await User.findByIdAndUpdate(user._id, { 'premium.isActive': false });
      }
      break;
    }

    case 'subscription.cancelled': {
      console.log('subscription.cancelled');
      const user = await findUserFromEntity(entity);
      if (user) {
        await Subscription.findOneAndUpdate(
          { user: user._id, paymentId: entity.id },
          { status: 'CANCELLED' }
        );
        await User.findByIdAndUpdate(user._id, { 'premium.isActive': false });
      }
      break;
    }

    case 'subscription.paused': {
      console.log('subscription.paused');
      const user = await findUserFromEntity(entity);
      if (user) {
        await Subscription.findOneAndUpdate(
          { user: user._id, paymentId: entity.id },
          { status: 'PAUSED' }
        );
        await User.findByIdAndUpdate(user._id, { 'premium.isActive': false });
      }
      break;
    }

    default:
      console.log('Unhandled event', event);
      break;
  }

  return res.status(200).send('OK');
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
