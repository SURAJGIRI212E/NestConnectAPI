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
  media: {
    url: String,
    type: {
      type: String,
      enum: ['image', 'video', 'audio']
    }
  },
  isRead: { type: Boolean, default: false },
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
    const recipientId = conversation.participant1.equals(this.senderId) 
      ? conversation.participant2 
      : conversation.participant1;
    
    const currentCount = conversation.unreadCount.get(recipientId.toString()) || 0;
    conversation.unreadCount.set(recipientId.toString(), currentCount + 1);
    
    await conversation.save();
  }
});

const MessageModel = mongoose.model("Message", messageSchema);
export default MessageModel;
