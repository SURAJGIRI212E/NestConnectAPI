// models/Subscription.js
import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: [true,'current userid is required'] ,index: true},
  status: { type: String, enum: ["ACTIVE", "EXPIRED", "PAUSED", "CANCELLED", "PAST_DUE", "COMPLETED", "HALTED"], default: null },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  plan: { type: String, enum: ["MONTHLY", "ANNUAL"],},
  paymentProvider: { type: String },  // e.g. Stripe, Razorpay
  paymentId: { type: String },        // transaction ID
  createdAt: { type: Date, default: Date.now }
});

// Add indexes
subscriptionSchema.index({ user: 1, status: 1 });

// Pre-save middleware to set end date
subscriptionSchema.pre('save',async function(next) {
  // Only set end date if it's not already set
  if (!this.endDate) {
    const date = new Date();
    
    // Calculate end date based on plan
    if (this.plan === 'ANNUAL') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      // Default to MONTHLY
      date.setMonth(date.getMonth() + 1);
    }
    
    this.endDate = date;
  }

  // Check if subscription has expired
  if (this.endDate < new Date()) {
    this.status = 'EXPIRED';
  }
});

// Add methods
subscriptionSchema.methods.extendSubscription = function(days) {
  this.endDate = new Date(this.endDate.getTime() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

subscriptionSchema.methods.isActive = function() {
  return this.status === "ACTIVE" && this.endDate > new Date();
};

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
export default SubscriptionModel;