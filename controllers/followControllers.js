import Follow from '../models/follow.model.js';
import User from '../models/user.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';

// Follow a user
export const followUser = asyncErrorHandler(async (req, res, next) => {
  
    const  {username}  = req.params; // Changed from userId to username
    console.log("username",username)
    const followerId = req.user.userId;//current login user
    console.log("followerID",followerId)

    // Find the user to follow by username
    const userToFollow = await User.findOne({ username });
    if (!userToFollow) {
        return next(new CustomError('User to follow not found', 404));
    }

    // Check if trying to follow self
    if (userToFollow._id.toString() === followerId.toString()) {
        return next(new CustomError('You cannot follow yourself', 400));
    }

    // Check if already following
    const existingFollow = await Follow.isFollowing(followerId, userToFollow._id);
    if (existingFollow) {
        return next(new CustomError('You are already following this user', 400));
    }

    // Create new follow relationship
    const follow = await Follow.create({
        follower: followerId,
        following: userToFollow._id
    });

    res.status(200).json({
        status: 'success',
        message: `Successfully followed ${userToFollow.username}`,
       
    });
});

// Unfollow a user
export const unfollowUser = asyncErrorHandler(async (req, res, next) => {
    const  {username}  = req.params; // Changed from userId to username
    console.log("username",username)
    const followerId = req.user.userId;//current login user
    console.log("followerID",followerId)

    const userToUnFollow = await User.findOne({ username });
   
    if (!userToUnFollow) {
        return next(new CustomError('User to unfollow not found', 404));
    }
    if (userToUnFollow._id.toString() === followerId.toString()) {
        return next(new CustomError('You cannot unfollow yourself', 400));
    }

    const result = await Follow.findOneAndDelete({
        follower: followerId,
        following: userToUnFollow._id
    });

    if (!result) {
        return next(new CustomError('You are not following this user', 400));
    }

    res.status(200).json({
        status: 'success',
        message: `Successfully unfollowed ${userToUnFollow.username}`,
    });
});

// Get followers list
export const getFollowers = asyncErrorHandler(async (req, res, next) => {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // First find user by username
    const user = await User.findOne({ username });
    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    const followers = await Follow.find({ following: user._id })
        .populate('follower', 'username fullName avatar bio')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    const total = await Follow.getFollowersCount(user._id);

    res.status(200).json({
        status: 'success',
        data: {
            followers,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalFollowers: total,
            user: {
                current_username: user.username,
               
            }
        }
    });
});

// Get following list
export const getFollowing = asyncErrorHandler(async (req, res, next) => {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // First find user by username
    const user = await User.findOne({ username });
    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    const following = await Follow.find({ follower: user._id })
        .populate('following', 'username fullName avatar bio') // Populate following user details
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    // Transform the data to only include following user details
    const formattedFollowing = following.map(follow => follow.following);

    const total = await Follow.getFollowingCount(user._id);

    res.status(200).json({
        status: 'success',
        data: {
            following: formattedFollowing,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalFollowing: total,
            user: {
                username: user.username,
                fullName: user.fullName
            }
        }
    });
});

// Get follow suggestions
export const getFollowSuggestions = asyncErrorHandler(async (req, res, next) => {
    const followerId = req.user.userId;
    const limit = parseInt(req.query.limit) || 5;

    // Get users that the current user is following
    const following = await Follow.find({ follower: followerId })
        .select('following');
    const followingIds = following.map(f => f.following);

    // Add current user's ID to exclusion list
    followingIds.push(followerId);
    

    // Find users not followed by current user
    const suggestions = await User.find({
        _id: { $nin: followingIds }
    })
    .select('username fullName avatar bio')
    .limit(limit);

    if (!suggestions.length) {
        return next(new CustomError('No suggestions available at the moment', 404));
    }

    res.status(200).json({
        status: 'success',
        data: {
            suggestions,
            currentUser: req.user.username
        }
    });
});