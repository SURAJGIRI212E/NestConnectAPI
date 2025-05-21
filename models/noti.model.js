import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum:{
      values: ['like', 'comment', 'follow', 'mention', 'repost'],
      message: 'types is either like, comment, follow, mention, repost.'
  },
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  read: {
    type: Boolean,
    default: false
  },
  message: String
}, {
  timestamps: true
});



// Add compound index for faster queries
notificationSchema.index({ recipient: 1, createdAt: -1 });

// Add these methods at the bottom before model creation
notificationSchema.statics.markAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } }
  );
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;