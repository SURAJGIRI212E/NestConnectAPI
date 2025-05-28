// models/Conversation.js
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  ],
  typingUsers: {
    type: Map,
    of: Boolean,
    default: new Map()
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message"
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
conversationSchema.index({ participants: 1 }, { unique: true });
conversationSchema.index({ updatedAt: -1 });

// Method to get messages
conversationSchema.methods.getMessages = async function(limit = 50, skip = 0) {
  return await mongoose.model('Message')
    .find({ conversationId: this._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username avatar');
};

// Method to mark messages as read
conversationSchema.methods.markAsRead = async function(userId) {
  this.unreadCount.set(userId.toString(), 0);
  await this.save();
  
  await mongoose.model('Message').updateMany(
    { conversationId: this._id },
    { isRead: true }
  );
};

conversationSchema.pre('save', function(next) {
  if (this.isModified('participants') || this.isNew) {
    this.participants.sort(); // Sort the participant IDs
  }
  next();
});

const ConversationModel = mongoose.model("Conversation", conversationSchema);
export default ConversationModel;
