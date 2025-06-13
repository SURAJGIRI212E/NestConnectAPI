import User from '../models/user.model.js';
import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import { canMessageUser, canVideoCall } from '../services/permissionService.js';

const onlineUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // userId -> Set of socket IDs

const updateUserOnlineStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, {
      isOnline,
      lastActive: new Date()
    });
  } catch (error) {
    console.error(`Error updating user ${isOnline ? 'online' : 'offline'} status:`, error);
  }
};

export const setupChatSocket = (io) => {
  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId;
    console.log("userid connecetd",userId,socket.id)
    if (!userId) return;

    // Handle user connection
    socket.on('addUser', async (userId) => {
      if (!userId) return;

      // Add to user's socket set
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      
      // Update online status
      onlineUsers.set(userId, socket.id);
      await updateUserOnlineStatus(userId, true);
      
      // Broadcast online users
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    });

    // Handle user going offline
    socket.on('userOffline', async (userId) => {
      if (!userId) return;
      
      // Remove from online users
      onlineUsers.delete(userId);
      await updateUserOnlineStatus(userId, false);
      
      // Broadcast updated online users
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    });

    // Keep-alive ping
    socket.on('ping', async (userId) => {
      if (!userId) return;
      await updateUserOnlineStatus(userId, true);
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      const userId = socket.handshake.auth.userId;
      if (!userId) return;

      // Remove socket from user's socket set
      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        
        // If no more sockets, user is offline
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
          onlineUsers.delete(userId);
          await updateUserOnlineStatus(userId, false);
          io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
        }
      }
    });

    // Handle message sending
    socket.on('sendMessage', async ({ senderId, receiverId, message, conversationId }) => {
      try {
        const { canInteract, reason } = await canMessageUser(senderId, receiverId);
        if (!canInteract) {
          socket.emit('error', { message: reason || 'You cannot send messages to this user.' });
          return;
        }

        // Create and save message
        const newMessage = await Message.create({
          conversationId,
          senderId,
          content: message.content,
          media: message.media
        });
        await newMessage.populate('senderId', 'username avatar');

        // Send to receiver if online
        const receiverSocket = onlineUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket).emit('receiveMessage', {
            message: newMessage,
            conversationId
          });
        }

        // Confirm to sender
        socket.emit('messageSent', newMessage);

        // Update conversation and unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          // Only update unread count if receiver is different from sender
          if (receiverId !== senderId) {
            const currentCount = conversation.unreadCount.get(receiverId) || 0;
            conversation.unreadCount.set(receiverId, currentCount + 1);
            await conversation.save();

            // Notify receiver of updated unread count
            if (receiverSocket) {
              io.to(receiverSocket).emit('unreadCountUpdated', {
                conversationId,
                unreadCount: currentCount + 1
              });
            }
          }
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message deletion
    socket.on('deleteMessage', async ({ messageId, conversationId }) => {
      try {
        // Find message and verify ownership
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Only allow sender to delete their own messages
        if (message.senderId.toString() !== socket.handshake.auth.userId) {
          socket.emit('error', { message: 'Not authorized to delete this message' });
          return;
        }

        // Delete message
        await message.deleteOne();
console.log("message deleted", messageId);
        // Notify conversation participants about message deletion
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.participants.forEach(participantId => {
            const participantSocket = onlineUsers.get(participantId.toString());
            if (participantSocket) {
              io.to(participantSocket).emit('messageDeleted', { messageId, conversationId });
            }
          });
        }
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle typing status
    socket.on('typing', ({ senderId, receiverId, conversationId }) => {
      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('typing', { senderId, conversationId });
      }
    });

    socket.on('stopTyping', ({ senderId, receiverId, conversationId }) => {
      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('stopTyping', { senderId, conversationId });
      }
    });

    // Handle marking messages as read
    socket.on('markMessagesAsRead', async ({ conversationId, userId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        // Reset unread count for this user
        conversation.unreadCount.set(userId, 0);
        await conversation.save();

        // Mark messages as read in the database
        const messages = await Message.find({
          conversationId,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        });

        if (messages.length > 0) {
          await Message.updateMany(
            {
              conversationId,
              senderId: { $ne: userId },
              readBy: { $ne: userId }
            },
            {
              $addToSet: { readBy: userId },
              deliveryStatus: 'read'
            }
          );

          // Notify the sender about messages being read
          const otherParticipant = conversation.participants.find(
            p => p.toString() !== userId
          );
          
          if (otherParticipant) {
            const senderSocket = onlineUsers.get(otherParticipant.toString());
            if (senderSocket) {
              io.to(senderSocket).emit('messagesRead', { 
                conversationId,
                messageIds: messages.map(m => m._id)
              });
            }
          }
        }

        // Send updated unread count to the reader
        socket.emit('unreadCountUpdated', {
          conversationId,
          unreadCount: 0
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle conversation deletion notification
    socket.on('conversationDeleted', async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          // Notify all participants except the one deleting
          conversation.participants.forEach(participantId => {
            const participantSocket = onlineUsers.get(participantId.toString());
            if (participantSocket && participantSocket !== socket.id) {
              io.to(participantSocket).emit('conversationDeleted', { conversationId });
            }
          });
        }
      } catch (error) {
        console.error('Error in conversation deletion notification:', error);
      }
    });

    // Video call events
    socket.on('callUser', async ({ targetUserId, from }) => {
      console.log(`User ${socket.handshake.auth.userId} calling user ${targetUserId}`);
      const { canInteract, reason } = await canVideoCall(from._id, targetUserId);
      if (!canInteract) {
        console.log({ message: reason || 'You cannot video call this user.' })
        socket.emit('error', { message: reason || 'You cannot video call this user.' });
        return;
      }
      const targetUserSocketIds = userSockets.get(targetUserId);
      console.log(targetUserSocketIds)
      if (targetUserSocketIds) {
        targetUserSocketIds.forEach(socketId => {
          console.log("inside foreach",socketId)
          io.to(socketId).emit('incomingCall', { from, signal: socket.id }); // Sending caller's socket ID as initial signal
        });
        // Optionally, notify the caller that the request was sent
        socket.emit('callRequestSent', { to: targetUserId });
      } else {
        console.log(`Target user ${targetUserId} not online.`);
        socket.emit('userNotOnline', { targetUserId });
      }
    });

    socket.on('answerCall', ({ signal, to, from }) => {
      console.log(`User ${socket.handshake.auth.userId} answering call to user ${to}`);
      const callerSocketId = signal; // The initial signal from callUser was the caller's socket ID
      if (callerSocketId) {
        io.to(callerSocketId).emit('callAccepted', { signal, to: from }); // Send answer signal and receiver's user object back to caller
        // Also send the answer signal to the receiver's other sockets if any
         const receiverSocketIds = userSockets.get(from._id);
         if(receiverSocketIds) {
            receiverSocketIds.forEach(socketId => {
                if(socketId !== socket.id) { // Don't resend to the socket that just answered
                    io.to(socketId).emit('callAccepted', { signal, to: from });
                }
            });
         }
      } else {
         console.log(`Caller socket ID not found for answering call to user ${to}`);
      }
    });

    socket.on('rejectCall', ({ to }) => {
      console.log(`User ${socket.handshake.auth.userId} rejecting call from user ${to}`);
      const callerSocketIds = userSockets.get(to); // 'to' here is the caller's user ID
      if (callerSocketIds) {
         callerSocketIds.forEach(socketId => {
           io.to(socketId).emit('callRejected', { to: socket.handshake.auth.userId }); // Send receiver's user ID back to caller
         });
      }
    });

    socket.on('hangUp', ({ to }) => {
      console.log(`User ${socket.handshake.auth.userId} hanging up call with user ${to}`);
       const otherUserSocketIds = userSockets.get(to); // 'to' here is the other user's ID
       if (otherUserSocketIds) {
          otherUserSocketIds.forEach(socketId => {
            io.to(socketId).emit('callEnded');
          });
       }
    });

    socket.on('sendingSignal', ({ targetUserId, signal }) => {
      console.log(`User ${socket.handshake.auth.userId} sending signal to user ${targetUserId}`);
      const targetUserSocketIds = userSockets.get(targetUserId);
      if (targetUserSocketIds) {
        targetUserSocketIds.forEach(socketId => {
          // Send signal to all sockets of the target user
          io.to(socketId).emit('returningSignal', { signal });
        });
      }
    });
  });
};
