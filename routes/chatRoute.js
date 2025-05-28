import express from 'express';
import isAuthenticated from '../middlewares/authMiddleware.js';
import {
  getOrCreateConversation,
  getConversations,
  getMessages,
  markMessagesAsRead,
  uploadMessageMedia,
  deleteConversation
} from '../controllers/chatController.js';
import { uploadChatImages as uploadChatImagesMiddleware } from '../middlewares/multerMiddleware.js';

const router = express.Router();

// Protect all chat routes
router.use(isAuthenticated);

// Upload message media
router.post('/message-media-upload', uploadChatImagesMiddleware, uploadMessageMedia);

// Get all conversations for current user
router.get('/conversations', getConversations);

// Get or start a conversation with another user
router.get('/conversations/:receiverId', getOrCreateConversation);

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', getMessages);

// Mark messages as read in a conversation
router.patch('/conversations/:conversationId/read', markMessagesAsRead);

// Delete conversation
router.delete('/conversations/:conversationId', deleteConversation);

export default router;
