import User from '../models/user.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';
import Follow from '../models/follow.model.js';

// Get user profile by username
export const getUserByUsername = asyncErrorHandler(async (req, res, next) => {
    const { username } = req.params;
    const loggedInUserId = req.user.userId;
  
    const user = await User.findOne({ username })
      .select('-password -blockedUsers -bookmarks ');
  
    if (!user) {
      return next(new CustomError('User not found', 404));
    }
  
    const [followersCount, followingCount, isFollowing] = await Promise.all([
      Follow.getFollowersCount(user._id),
      Follow.getFollowingCount(user._id),
      Follow.isFollowing(loggedInUserId, user._id)
    ]);
  
    res.status(200).json({
      status: 'success',
      data: {
        user,
        followersCount,
        followingCount,
        isFollowing
      }
    });
  });

// Update user profile
export const updateUserProfile = asyncErrorHandler(async (req, res, next) => {
    const { fullName, bio } = req.body;
    const avatarFile = req.files?.avatar;
    const coverImageFile = req.files?.coverImage;

    if (!fullName && !bio && !avatarFile && !coverImageFile) {
        return next(new CustomError('Please provide at least one field to update', 400));
    }
 return res.status(200).json({
        status: 'success',
        // data: updatedUser,
        message: "Profile updated successfully"
    });
    const updateFields = {};
    if (fullName) updateFields.fullName = fullName;
    if (bio) updateFields.bio = bio;

    if (avatarFile) {
        // TODO: Implement file upload logic
        
        updateFields.avatar = "path_to_uploaded_avatar";
    }

    if (coverImageFile) {
        // TODO: Implement file upload logic
        updateFields.coverImage = "path_to_uploaded_cover_image";
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true }
    ).select("-password -blockedUsers");

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

    return res.status(200).json({
        status: 'success',
        data: { bookmarks: updatedUser.bookmarks },
        message: `Post ${isBookmarked ? 'removed from' : 'added to'} bookmarks`
    });
});

// Get user bookmarks
export const getUserBookmarks = asyncErrorHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .select("bookmarks")
        .populate("bookmarks", "title content images createdAt");

    return res.status(200).json({
        status: 'success',
        data: user.bookmarks,
        message: "Bookmarks fetched successfully"
    });
});

// Block/Unblock user
export const toggleBlockUser = asyncErrorHandler(async (req, res, next) => {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
        return next(new CustomError('You cannot block yourself', 400));
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
export const togglePremiumSubscription = asyncErrorHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    
    // TODO: Implement payment processing logic here

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { isPremium: !user.isPremium }
        },
        { new: true }
    ).select("isPremium");

    return res.status(200).json({
        status: 'success',
        data: { isPremium: updatedUser.isPremium },
        message: `Premium subscription ${updatedUser.isPremium ? 'activated' : 'deactivated'} successfully`
    });
});

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