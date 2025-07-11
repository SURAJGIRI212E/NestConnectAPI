import Notification from '../models/noti.model.js';
import CustomError from '../utilities/CustomError.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import { getIO, getUserSocketIds } from '../sockets/chatSocket.js';

// Get user's notifications with pagination
export const getNotifications = asyncErrorHandler(async (req, res) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('recipient', 'username avatar')
        .populate('post', 'content');
// console.log(notifications)
    const total = await Notification.countDocuments({ recipient: userId });

    res.status(200).json({
        status: 'success',
        data: {
            notifications,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalNotifications: total
            }
        }
    });
});

// Get unread notification count
export const getUnreadCount = asyncErrorHandler(async (req, res) => {
    const userId = req.user._id;
    const count = await Notification.getUnreadCount(userId);

    res.status(200).json({
        status: 'success',
        data: { unreadCount: count }
    });
});

// Mark all notifications as read
export const markAllAsRead = asyncErrorHandler(async (req, res) => {
    const userId = req.user._id;
    await Notification.markAsRead(userId);

    res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read'
    });
});

// Mark single notification as read
export const markAsRead = asyncErrorHandler(async (req, res, next) => {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
        return next(new CustomError('Notification not found', 404));
    }

    // Check if the notification belongs to the user
    if (notification.recipient.toString() !== userId.toString()) {
        return next(new CustomError('Not authorized to access this notification', 403));
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
        status: 'success',
        message: 'Notification marked as read'
    });
});

// Delete a notification
export const deleteNotification = asyncErrorHandler(async (req, res, next) => {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
        return next(new CustomError('Notification not found', 404));
    }

    // Check if the notification belongs to the user
    if (notification.recipient.toString() !== userId.toString()) {
        return next(new CustomError('Not authorized to delete this notification', 403));
    }

    await notification.deleteOne();

    res.status(200).json({
        status: 'success',
        message: 'Notification deleted successfully'
    });
});

//Delete all notifications
export const deleteAllNotifications = asyncErrorHandler(async (req, res) => {
    const userId = req.user._id;

    await Notification.deleteMany({ recipient: userId });

    res.status(200).json({
        status: 'success',
        message: 'All notifications deleted successfully'
    });
});

// Helper function to create a new notification (for internal use)
export const createNotification = async ({
    recipient,
    type,
    post = null,
    message,
    sender = null
}) => {
    try {
        const notification = await Notification.create({
            recipient,
            type,
            post,
            message,
            sender,
            read: false,
        });

        // Populate sender before emitting
        // await notification.populate( 'username avatar');

        // Emit real-time notification using socket.io
        const io = getIO && getIO();
        if (io) {
            const recipientSocketIds = getUserSocketIds(recipient);
            if (recipientSocketIds) {
                recipientSocketIds.forEach(socketId => {
                    io.to(socketId).emit('newNotification', notification);
                   
                });
            }
        }

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};