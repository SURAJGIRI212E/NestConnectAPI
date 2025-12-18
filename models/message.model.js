// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Conversation", 
    required: true,
    index: true
  },
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  content: { 
    type: String,
    required: function() {
      return !this.media;
    }
  },
  media:[{
    url: String,
    type: {
      type: String,
      enum: ['image'],
    }
  }],
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });

// Update conversation's lastMessage and unreadCount
messageSchema.post('save', async function() {
  const conversation = await mongoose.model('Conversation').findById(this.conversationId);
  if (conversation) {
    conversation.lastMessage = this._id;
    await conversation.save();
  }
});

// Validate maximum 4 images
messageSchema.pre('save',async function(next) {
  if (this.media && this.media.length > 4) {
    next(new Error('Maximum 4 images allowed per message'));
  }
});

const MessageModel = mongoose.model("Message", messageSchema);
export default MessageModel;
