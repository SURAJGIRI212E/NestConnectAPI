import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utilities/cloudinary.js';
import fs from 'fs';


// Start or get a conversation with another user
export const getOrCreateConversation = asyncErrorHandler(async (req, res) => {
  const { _id: userId } = req.user;
  const { receiverId } = req.params;

  let conversation = await Conversation.findOne({
    participants: {
      $all: [userId, receiverId]
    }
  });

  if (!conversation) {
   
    conversation = await Conversation.create({
      participants: [userId, receiverId]
    });
  }

  // Populate premium field for participants
  await conversation.populate('participants', 'username avatar isOnline lastActive premium');
  
  res.status(200).json({
    status: 'success',
    data: conversation
  });
});
// get all conversations for the current user
export const getConversations = asyncErrorHandler(async (req, res) => {
  const { _id: userId } = req.user;

  const conversations = await Conversation.find({
    participants: userId
  })
  .populate('participants', 'username avatar isOnline lastActive fullName premium')
  .populate('lastMessage')
  .sort('-updatedAt');

  // Add current user's unread count to each conversation
  const conversationsWithUnreadCount = conversations.map(conversation => {
    const conversationObject = conversation.toObject(); // Convert Mongoose document to plain object
    const currentUserUnreadCount = conversation.unreadCount.get(userId.toString()) || 0;
    return { ...conversationObject, currentUserUnreadCount };
  });

  res.status(200).json({
    status: 'success',
    data: conversationsWithUnreadCount
  });
});  // Get messages in a conversation
export const getMessages = asyncErrorHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  // Get conversation and ensure unread count is accurate
  const conversation = await Conversation.findById(conversationId);
  if (conversation) {
    const currentUnreadCount = conversation.unreadCount.get(req.user._id.toString()) || 0;
    conversation.unreadCount.set(req.user._id.toString(), currentUnreadCount);
    await conversation.save();
  }
  if (!conversation) {
    throw new CustomError('Conversation not found', 404);
  }

  // Verify user is part of conversation
  if (!conversation.participants.includes(req.user._id)) {
    throw new CustomError('Not authorized to access this conversation', 403);
  }

  const messages = await Message.find({ conversationId })
    .sort('-createdAt')
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username avatar');


  // Mark messages as read
  const messageIds = messages.map(msg => msg._id);
  await Message.updateMany(
    { 
      _id: { $in: messageIds },
      senderId: { $ne: req.user._id },
      readBy: { $ne: req.user._id }
    },
    { 
      $addToSet: { readBy: req.user._id },
      deliveryStatus: 'read'
    }
  );

  // Update conversation unread count
  await conversation.markAsRead(req.user._id);

  res.status(200).json({
    status: 'success',
    data: messages
  });
});

export const uploadMessageMedia = asyncErrorHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new CustomError('No images provided', 400);
  }

  if (req.files.length > 4) {
    throw new CustomError('Maximum 4 images allowed per message', 400);
  }

  const uploadPromises = req.files.map(async (file) => {
    const result = await uploadOnCloudinary(file.path, 'chat_images');
    // Delete local file after upload
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('Error deleting local file:', error);
    }
    return {
      url: result.secure_url,
      type: 'image'
    };
  });

  const uploadedImages = await Promise.all(uploadPromises);

  res.status(200).json({
    status: 'success',
    data: uploadedImages
  });
});
// Mark messages as read in a conversation
export const markMessagesAsRead = asyncErrorHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { _id: userId } = req.user;

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new CustomError('Conversation not found', 404);
  }

  // Verify user is part of conversation
  if (!conversation.participants.includes(userId)) {
    throw new CustomError('Not authorized to access this conversation', 403);
  }

  // Mark messages as read for the current user in the conversation
  // This logic should ideally be in the Conversation model as a method
  // For now, we'll update the unreadCount map directly
  conversation.unreadCount.set(userId.toString(), 0);
  await conversation.save();

  // Optionally, mark individual messages as read (depending on your schema and requirements)
  // await Message.updateMany(
  //   { conversationId: conversationId, senderId: { $ne: userId }, isRead: false },
  //   { $set: { isRead: true } }
  // );

  res.status(200).json({
    status: 'success',
    message: 'Messages marked as read',
  });
});
// Delete conversation
export const deleteConversation = asyncErrorHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  const conversation = await Conversation.findById(conversationId);
  
  if (!conversation) {
    throw new CustomError('Conversation not found', 404);
  }

  // Check if user is part of the conversation
  if (!conversation.participants.includes(userId)) {
    throw new CustomError('Not authorized to delete this conversation', 403);
  }

  // Delete all messages in the conversation
  await Message.deleteMany({ conversationId });

  // Delete the conversation
  await Conversation.findByIdAndDelete(conversationId);

  res.status(200).json({
    status: 'success',
    message: 'Conversation deleted successfully'
  });
});


