import User from '../models/user.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';
import Follow from '../models/follow.model.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utilities/cloudinary.js';
import mongoose from 'mongoose';
import { addInteractionFlags } from '../controllers/postControllers.js';
import { getCurrentUserInteractionData } from '../utilities/userInteractionUtils.js';

// Get user profile by username done
export const getUserByUsername = asyncErrorHandler(async (req, res, next) => {
    const { username } = req.params;
    const loggedInUserId = req.user._id;
  
    const user = await User.findOne({ username })
      .select('fullName username email bio avatar coverImage messagePreference isOnline lastActive createdAt updatedAt');
  
    if (!user) {
      return next(new CustomError('User not found', 404));
    }
  
    const [followersCount, followingCount, isFollowing, isBlockedByCurrentUser, blockedByOtherUser] = await Promise.all([
      Follow.getFollowersCount(user._id),
      Follow.getFollowingCount(user._id),
      Follow.isFollowing(loggedInUserId, user._id),
      Follow.isBlocked(loggedInUserId, user._id),
      Follow.isBlocked(user._id, loggedInUserId)
    ]);
  
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          ...user.toObject(), // Convert Mongoose document to plain object
          isFollowingByCurrentUser: isFollowing,
          isBlockedByCurrentUser: isBlockedByCurrentUser,
        followersCount,
        followingCount,
          blockedByOtherUser,
        },
       
      }
    });
  });

// Update user profile done
export const updateUserProfile = asyncErrorHandler(async (req, res, next) => {
    const { fullName, bio } = req.body;
    const avatarFile = req.files?.avatar;
    const coverImageFile = req.files?.coverImage;

    if (!fullName && !bio && !avatarFile && !coverImageFile) {
        return next(new CustomError('Please provide at least one field to update', 400));
    }
       // Get current user to check existing images
    const currentUser = await User.findById(req.user._id);
    if (!currentUser) {
        return next(new CustomError('User not found', 404));
    }

    const updateFields = {};
    if (fullName) updateFields.fullName = fullName;
    if (bio) updateFields.bio = bio;

    // Handle avatar upload
    if (avatarFile && avatarFile[0]) {
        // Upload new avatar
        const avatarResult = await uploadOnCloudinary(
            avatarFile[0].path,
            `users/${req.user._id}/avatar`
        );
        
        if (avatarResult) {
            updateFields.avatar = avatarResult.secure_url;  
            // Delete old avatar if it exists and is not the default avatar
            if (currentUser.avatar && !currentUser.avatar.includes('sampleprofile')) {
                const oldAvatarId = currentUser.avatar.split('/').pop().split('.')[0];
             
                await deleteFromCloudinary(oldAvatarId);
            }
        }
    }    // Handle cover image upload
    if (coverImageFile && coverImageFile[0]) {
        // Upload new cover image with transformation
        const coverResult = await uploadOnCloudinary(
            coverImageFile[0].path,
            `users/${req.user._id}/cover`,
            [
                { width: 1500, height: 500, crop: "fill" },
                { quality: "auto", fetch_format: "auto" }
            ]
        );
        
        if (coverResult) {
            updateFields.coverImage = coverResult.secure_url;
            
            // Delete old cover image if it exists
            if (currentUser.coverImage) {
                const oldCoverId = currentUser.coverImage.split('/').pop().split('.')[0];
                await deleteFromCloudinary(oldCoverId);
            }
        }
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true }
    ).select("-password -blockedUsers -bookmarks -passwordChangeAt");

    return res.status(200).json({
        status: 'success',
        data: updatedUser,
        message: "Profile updated successfully"
    });
});

// Toggle bookmark post
export const toggleBookmark = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;

    const user = await User.findById(req.user._id);
    const isBookmarked = user.bookmarks.includes(postId);

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            [isBookmarked ? '$pull' : '$addToSet']: {
                bookmarks: postId
            }
        },
        { new: true }
    ).select("bookmarks");

    // After updating bookmarks, ensure the frontend can reflect the change immediately for the bookmark page.
    // We will not add `addInteractionFlags` here directly as it's a mutation, not a query of posts.
    // The `useToggleBookmarkMutation` in frontend invalidates the `userBookmarks` query on success, 
    // which will trigger a re-fetch with the correct flags.

    return res.status(200).json({
        status: 'success',
        data: { bookmarks: updatedUser.bookmarks },
        message: `Post ${isBookmarked ? 'removed from' : 'added to'} bookmarks`
    });
});

// Get user bookmarks
export const getUserBookmarks = asyncErrorHandler(async (req, res, next) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    // Find bookmarked posts, excluding those from blocked users
    const user = await User.findById(userId)
        .select('bookmarks')
        .populate({
            path: 'bookmarks',
            populate: [
                { path: 'ownerid', select: 'username fullName avatar' },
                { path: 'originalPost', populate: { path: 'ownerid', select: 'username fullName avatar' } },
                { path: 'parentPost', select: 'content media createdAt ownerid', populate: { path: 'ownerid', select: 'username fullName avatar' } }
            ],
            match: { ownerid: { $nin: mutuallyBlockedUserIds } },
            options: { sort: { createdAt: -1 }, skip, limit }
        });

    // Filter out null posts (from blocked users)
    let posts = (user.bookmarks || []).filter(post => post !== null);

    // Filter out reposts/comments of blocked users
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to the bookmarked posts
    posts = await addInteractionFlags(posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

    // Get total count for pagination (excluding blocked users' posts)
    const total = posts.length;

    return res.status(200).json({
        status: 'success',
        data: {
            posts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPosts: total
            }
        },
        message: "Bookmarks fetched successfully"
    });
});

// Block/Unblock user done
export const toggleBlockUser = asyncErrorHandler(async (req, res, next) => {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
        return next(new CustomError('You cannot block yourself', 400));
    }

    const usertoBlock = await User.findById(userId);
    if (!usertoBlock) { 
        return next(new CustomError('User to block not found', 404));
    }
    const user = await User.findById(req.user._id);
    
    const isBlocked = user.blockedUsers.includes(userId);

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            [isBlocked ? '$pull' : '$addToSet']: {
                blockedUsers: userId
            }
        },
        { new: true }
    ).select("blockedUsers");

    return res.status(200).json({
        status: 'success',
        data: { blockedUsers: updatedUser.blockedUsers },
        message: `User ${isBlocked ? 'unblocked' : 'blocked'} successfully`
    });
});

// Get blocked users list
export const getBlockedUsers = asyncErrorHandler(async (req, res) => {
  
    const user = await User.findById(req.user._id)
        .select("blockedUsers")
        .populate("blockedUsers", "username fullName avatar");

    return res.status(200).json({
        status: 'success',
        data: user.blockedUsers,
        message: "Blocked users fetched successfully"
    });
});

// Toggle premium subscription
// export const togglePremiumSubscription = asyncErrorHandler(async (req, res) => {
//     const user = await User.findById(req.user._id);
    
//     // TODO: Implement payment processing logic here

//     const updatedUser = await User.findByIdAndUpdate(
//         req.user._id,
//         {
//             $set: { isPremium: !user.isPremium }
//         },
//         { new: true }
//     ).select("isPremium");

//     return res.status(200).json({
//         status: 'success',
//         data: { isPremium: updatedUser.isPremium },
//         message: `Premium subscription ${updatedUser.isPremium ? 'activated' : 'deactivated'} successfully`
//     });
// });

// Search users

export const searchUsers = asyncErrorHandler(async (req, res, next) => {
    const { query, page = 1, limit = 10 } = req.query;

    if (!query) {
        return next(new CustomError('Search query is required', 400));
    }

    const searchQuery = {
        $or: [
            { username: { $regex: query, $options: 'i' } },
            { fullName: { $regex: query, $options: 'i' } }
        ],
        _id: { $ne: req.user._id },
        blockedUsers: { $ne: req.user._id }
    };

    const users = await User.find(searchQuery)
        .select("username fullName avatar bio")
        .limit(limit * 1)
        .skip((page - 1) * limit);

    const total = await User.countDocuments(searchQuery);

    return res.status(200).json({
        status: 'success',
        data: {
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalUsers: total
        },
        message: "Users fetched successfully"
    });
});

// Get suggested users for the current user
export const getSuggestedUsers = asyncErrorHandler(async (req, res) => {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 5;

    // Get users that current user is following
    const following = await Follow.find({ follower: userId })
        .select('following');
    const followingIds = following.map(f => f.following);

    // Get users who blocked the current user and users blocked by current user
    const user = await User.findById(userId);
    const blockedByOthers = await User.find({ blockedUsers: userId })
        .select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers,
        ...blockedByOthers.map(u => u._id)
    ];

    // Exclude the current user, followed users, and blocked users
    const excludeIds = [
        userId,
        ...followingIds,
        ...mutuallyBlockedUserIds
    ];

    // Find users with most followers who aren't in the exclude list
    const suggestedUsers = await User.aggregate([
        {
            $match: {
                _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) }
            }
        },
        {
            // Look up follower count for each user
            $lookup: {
                from: 'follows',
                localField: '_id',
                foreignField: 'following',
                as: 'followers'
            }
        },
        {
            $addFields: {
                followersCount: { $size: '$followers' }
            }
        },
        {
            $project: {
                username: true,
                fullName: true,
                avatar: true,
                bio: true,
                followersCount: true
            }
        },
        {
            $sort: { followersCount: -1 }
        },
        {
            $limit: limit
        }
    ]);

    return res.status(200).json({
        status: 'success',
        data: suggestedUsers,
        message: "Suggested users fetched successfully"
    });
});

//done
export const updateMessagePreference = asyncErrorHandler(async (req, res, next) => {
  const { messagePreference } = req.body;

  if (!messagePreference) {
    return next(new CustomError('Message preference is required', 400));
  }

  const allowedPreferences = ['everyone', 'followers', 'following', 'mutualFollowers', 'no one'];
  if (!allowedPreferences.includes(messagePreference)) {
    return next(new CustomError('Invalid message preference', 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { messagePreference } },
    { new: true, runValidators: true }
  ).select('messagePreference');

  res.status(200).json({
    status: 'success',
    data: updatedUser.messagePreference,
    message: 'Message preference updated successfully'
  });
});