import Post from '../models/post.model.js';
import User from '../models/user.model.js';
import Like from '../models/like.model.js';
import CustomError from '../utilities/CustomError.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utilities/cloudinary.js';
import mongoose from 'mongoose';

// Create a new post or comment
export const createPost = asyncErrorHandler(async (req, res, next) => {
    const { content, visibility, parentPost } = req.body;
    const mediaFiles = req.files;
    const isPremium = req.user.premium;
    const CONTENT_LIMITS = {
        BASIC: 200,
        PREMIUM: 500
    };

    // Validate content length based on user type
    if (content && content.length > (isPremium ? CONTENT_LIMITS.PREMIUM : CONTENT_LIMITS.BASIC)) {
        return next(new CustomError(
            `Content length exceeds limit. ${isPremium ? 'Premium' : 'Basic'} users can post up to ${isPremium ? CONTENT_LIMITS.PREMIUM : CONTENT_LIMITS.BASIC} characters.`,
            400
        ));
    }

    // Check if post has either content or media
    if (!content && (!mediaFiles || mediaFiles.length === 0)) {
        return next(new CustomError('Post must have either content or media', 400));
    }

    // Handle media uploads if present
    let mediaUrls = [];
    if (mediaFiles && mediaFiles.length > 0) {
        const uploadPromises = mediaFiles.map(async (file) => {
            const result = await uploadOnCloudinary(
                file.path,
                `posts/${req.user._id}/media`
            );
            return {
                url: result.secure_url,
                type: file.mimetype.startsWith('image') ? 'image' : 'video'
            };
        });
        mediaUrls = await Promise.all(uploadPromises);
    }

    let postData = {
        ownerid: req.user._id,
        content,
        media: mediaUrls,
        visibility: visibility || 'public'
    };

    // Handle commenting functionality
    if (parentPost) {
        const parentPostDoc = await Post.findById(parentPost)
            .select('depth visibility ownerid');
            
        if (!parentPostDoc) {
            return next(new CustomError('Post not found', 404));
        }

        // Validate comment nesting depth
        if (parentPostDoc.depth >= 2) {
            return next(new CustomError('Maximum comment depth reached', 400));
        }        // Check comment permissions
        if (parentPostDoc.visibility === 'followers') {
            // If it's not the post owner
            if (parentPostDoc.ownerid.toString() !== req.user._id.toString()) {
                const Follow = mongoose.model('Follow');
                const isFollowing = await Follow.isFollowing(req.user._id, parentPostDoc.ownerid);
                if (!isFollowing) {
                    return next(new CustomError('Cannot comment on this post', 403));
                }
            }
            // Note: Post owner can always comment on their own posts
        }

        // Set comment-specific data
        postData.parentPost = parentPost;
        postData.visibility = 'public'; // All comments are public
    }

    // Create the post
    const post = await Post.create(postData);

    // Update parent's comment count if this is a comment
    if (parentPost) {
        await Post.findByIdAndUpdate(parentPost, {
            $inc: { 'stats.commentCount': 1 }
        });
    }

    // Populate necessary fields
    await post.populate([
        { path: 'ownerid', select: 'username fullName avatar' },
        { 
            path: 'parentPost',
            select: 'content ownerid depth',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        }
    ]);

    res.status(201).json({
        status: 'success',
        data: post,
        message: parentPost ? 'Comment added successfully' : 'Post created successfully'
    });
});

// Get a single post by postId param
export const getPost = asyncErrorHandler(async (req, res, next) => {
    const userId = req.user._id;
    const post = await Post.findById(req.params.postId)
        .populate('ownerid', 'username fullName avatar')
        .populate('mentions', 'username fullName')
        .populate({
            path: 'parentPost',
            populate: {
                path: 'ownerid',
                select: 'username fullName avatar'
            }
        });

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check if either user has blocked the other
    const user = await User.findById(userId);
    const isBlocked = user.blockedUsers.includes(post.ownerid._id) || 
                     (await User.findById(post.ownerid._id)).blockedUsers.includes(userId);

    if (isBlocked) {
        return next(new CustomError('Cannot view this post', 403));
    }

    // Check post visibility
    if (post.ownerid._id.toString() === userId.toString()) {
        // User can always see their own posts
    } else if (post.visibility === 'followers') {
        // For other users' posts, check if following
        const Follow = mongoose.model('Follow');
        const isFollowing = await Follow.isFollowing(userId, post.ownerid._id);
        if (!isFollowing) {
            return next(new CustomError('This post is only visible to followers', 403));
        }
    }

    res.status(200).json({
        status: 'success',
        data: post
    });
});

// Get user posts by userId param
export const getUserPosts = asyncErrorHandler(async (req, res, next) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(userId);
    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    // Check if either user has blocked the other
    const currentUser = await User.findById(currentUserId);
    const isBlocked = currentUser.blockedUsers.includes(userId) || 
                     user.blockedUsers.includes(currentUserId);

    if (isBlocked) {
        return next(new CustomError('Cannot view posts from this user', 403));
    }

    // Build query based on ownership and following status
    let query = { ownerid: userId };
    if (userId !== currentUserId.toString()) {
        const Follow = mongoose.model('Follow');
        const isFollowing = await Follow.isFollowing(currentUserId, userId);
        if (!isFollowing) {
            query.visibility = 'public';
        }
    }

    const posts = await Post.find(query)
        .populate('ownerid', 'username fullName avatar')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit);

    const total = await Post.countDocuments(query);

    res.status(200).json({
        status: 'success',
        data: {
            posts,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalPosts: total
        }
    });
});

// Get feed posts of current user
export const getFeedPosts = asyncErrorHandler(async (req, res, next) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get the user's blocked users and users who blocked them
    const user = await User.findById(userId);
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers,
        ...blockedByOthers.map(u => u._id)
    ];

    // Get followed users
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    // Find posts from followed users that aren't blocked
    const posts = await Post.find({
        ownerid: { 
            $in: followingIds, 
            $nin: mutuallyBlockedUserIds 
        }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('ownerid', 'username profilePicture')
    .populate('originalPost');

    // Get total count for pagination
    const total = await Post.countDocuments({
        ownerid: { 
            $in: followingIds, 
            $nin: mutuallyBlockedUserIds 
        }
    });

    res.status(200).json({
        status: 'success',
        data: {
            posts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPosts: total
            }
        }
    });
});

// Get comments for a post/comment
export const getComments = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const post = await Post.findById(postId)
        .populate('ownerid')
        .populate({
            path: 'comments.user',
            select: 'username profilePicture'
        });

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check if either user has blocked the other
    const user = await User.findById(userId);
    const isBlocked = user.blockedUsers.includes(post.ownerid._id) || 
                     (await User.findById(post.ownerid._id)).blockedUsers.includes(userId);

    if (isBlocked) {
        return next(new CustomError('Cannot view comments on this post', 403));
    }

    // Get blocked users for filtering comments
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers.map(id => id.toString()),
        ...blockedByOthers.map(u => u._id.toString())
    ];

    // Filter out comments from blocked users
    const filteredComments = post.comments.filter(comment => 
        !mutuallyBlockedUserIds.includes(comment.user._id.toString())
    );

    // Apply pagination
    const paginatedComments = filteredComments.slice(skip, skip + limit);

    res.status(200).json({
        status: 'success',
        data: {
            comments: paginatedComments,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(filteredComments.length / limit),
                totalComments: filteredComments.length
            }
        }
    });
});

// Update a post by postId param
export const updatePost = asyncErrorHandler(async (req, res, next) => {
    const { content } = req.body;
    console.log("content", content)
    const post = await Post.findById(req.params.postId);

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check ownership
    console.log( req.user._id.toString(), post.ownerid.toString())
    if (post.ownerid.toString() !== req.user._id.toString()) {
        return next(new CustomError('You can only edit your own posts', 403));
    }

    // Check edit time window
    const now = new Date();
    if (now > post.edits.editvalidtill) {
        return next(new CustomError('Edit time window has expired', 400));
    }

    // Check edit chances
    if (post.edits.editchancesleft <= 0) {
        return next(new CustomError('No edit chances left', 400));
    }

    // Update post
    post.content = content;
    await post.save(); // This will trigger the pre-save middleware

    res.status(200).json({
        status: 'success',
        data: post
    });
});

// Delete a post
export const deletePost = asyncErrorHandler(async (req, res, next) => {
    const post = await Post.findById(req.params.postId);

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check ownership
    if (post.ownerid.toString() !== req.user._id.toString()) {
        return next(new CustomError('You can only delete your own posts', 403));
    }

    // Delete media from cloudinary if exists
    if (post.media && post.media.length > 0) {
        const deletePromises = post.media.map(async (media) => {
            try {
                // Extract public ID from Cloudinary URL
                // URL format: https://res.cloudinary.com/cloud-name/image/upload/v1234567/folder/filename
                const parts = media.url.split('/upload/');
                if (parts.length === 2) {
                    // Remove version number and file extension
                    const publicId = parts[1].split('/').slice(1).join('/').replace(/\.[^/.]+$/, '');
                    // console.log('Attempting to delete:', publicId);
                    await deleteFromCloudinary(publicId);
                }
            } catch (error) {
                console.error('Failed to delete media:', media.url, error);
            }
        });

        // Wait for all media deletions to complete
        await Promise.all(deletePromises);
    }

    // If this is a reply, decrease parent's comment count
    if (post.parentPost) {
        await Post.findByIdAndUpdate(post.parentPost, {
            $inc: { 'stats.commentCount': -1 }
        });
    }

    await post.deleteOne();

    res.status(200).json({
        status: 'success',
        message: 'Post deleted successfully'
    });
});

// Search posts
export const searchPosts = asyncErrorHandler(async (req, res, next) => {
    const { query } = req.query;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!query) {
        return next(new CustomError('Search query is required', 400));
    }

    // Get blocked users
    const user = await User.findById(userId);
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers,
        ...blockedByOthers.map(u => u._id)
    ];

    // Get IDs of users being followed for visibility check
    const Follow = mongoose.model('Follow');
    const following = await Follow.find({ follower: userId })
        .select('following');
    const followingIds = following.map(f => f.following);

    // Build search query
    const searchQuery = {
        $and: [
            // Exclude blocked users
            { ownerid: { $nin: mutuallyBlockedUserIds } },
            // Search in content or hashtags
            {
                $or: [
                    { content: { $regex: query, $options: 'i' } }, // Case-insensitive content search
                    { hashtags: { $regex: query.replace('#', ''), $options: 'i' } } // Search hashtags without #
                ]
            },
            // Visibility conditions
            {
                $or: [
                    { visibility: 'public' }, // Public posts
                    { ownerid: userId }, // User's own posts
                    { 
                        $and: [
                            { visibility: 'followers' },
                            { ownerid: { $in: followingIds } }
                        ]
                    } // Posts from followed users
                ]
            },
            { parentPost: null } // Only search main posts, not comments
        ]
    };

    const posts = await Post.find(searchQuery)
        .populate('ownerid', 'username fullName avatar')
        .populate('mentions', 'username fullName')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit);

    const total = await Post.countDocuments(searchQuery);

    res.status(200).json({
        status: 'success',
        data: {
            posts,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalPosts: total,
            query
        }
    });
});


export const likeunlikePost = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;
    const userId = req.user._id;

    // Check if the post exists
    const post = await Post.findById(postId).populate('ownerid');
    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check if either user has blocked the other
    const user = await User.findById(userId);
    const isBlocked = user.blockedUsers.includes(post.ownerid._id) || 
                     (await User.findById(post.ownerid._id)).blockedUsers.includes(userId);

    if (isBlocked) {
        return next(new CustomError('Cannot interact with this post', 403));
    }

    // Check if the user has already liked the post
    const existingLike = await Like.findOne({ post: postId, likedBy: userId });

    let isLiked = false;
    if (existingLike) {
        // Unlike: Remove the existing like
        await existingLike.deleteOne();  // Use document deleteOne to trigger middleware
        await post.updateStats();  // Ensure stats are updated
    } else {
        // Like: Create a new like
        await Like.create({ post: postId, likedBy: userId });
        isLiked = true;
    }

    res.status(200).json({
        status: 'success',
        message: `Post ${isLiked ? 'liked' : 'unliked'} successfully`,
        data: { liked: isLiked }
    });
});

export const getOwnLikedPosts = asyncErrorHandler(async (req, res, next) => {   
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get blocked users
    const user = await User.findById(userId);
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers,
        ...blockedByOthers.map(u => u._id)
    ];

    // Find liked posts, excluding those from blocked users
    const likedPosts = await Like.find({ likedBy: userId })
        .populate({
            path: 'post',
            populate: {
                path: 'ownerid',
                select: 'username profilePicture'
            },
            match: { ownerid: { $nin: mutuallyBlockedUserIds } }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    // Filter out null posts (from blocked users)
    const posts = likedPosts
        .map(like => like.post)
        .filter(post => post !== null);

    // Get total count for pagination (excluding blocked users' posts)
    const total = await Like.countDocuments({
        likedBy: userId,
        post: {
            $in: await Post.find({ ownerid: { $nin: mutuallyBlockedUserIds } }).select('_id')
        }
    });

    res.status(200).json({
        status: 'success',
        data: {
            posts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPosts: total
            }
        }
    });
 
            });

// Repost a post
export const repost = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;
    const userId = req.user._id;

    // Check if the original post exists
    const originalPost = await Post.findById(postId).populate('ownerid');
    if (!originalPost) {
        return next(new CustomError('Post not found', 404));
    }

    // Check if either user has blocked the other
    const user = await User.findById(userId);
    const isBlocked = user.blockedUsers.includes(originalPost.ownerid._id) || 
                     (await User.findById(originalPost.ownerid._id)).blockedUsers.includes(userId);

    if (isBlocked) {
        return next(new CustomError('Cannot repost this content', 403));
    }

    // Check if the user has already reposted this post
    const existingRepost = await Post.findOne({
        ownerid: userId,
        isRepost: true,
        originalPost: postId
    });

    if (existingRepost) {
        return next(new CustomError('You have already reposted this post', 400));
    }

    // Create the repost
    const repost = await Post.create({
        ownerid: userId,
        content: originalPost.content,
        media: originalPost.media,
        isRepost: true,
        originalPost: postId
    });

    await originalPost.updateStats();  // Update original post stats

    res.status(201).json({
        status: 'success',
        message: 'Post reposted successfully',
        data: { repost }
    });
});

// Get posts by hashtag
export const getPostsByHashtag = asyncErrorHandler(async (req, res, next) => {
    const { hashtag } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get blocked users
    const user = await User.findById(userId);
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');
    const mutuallyBlockedUserIds = [
        ...user.blockedUsers,
        ...blockedByOthers.map(u => u._id)
    ];

    // Find posts with the hashtag, excluding blocked users
    const posts = await Post.find({
        hashtags: hashtag,
        ownerid: { $nin: mutuallyBlockedUserIds }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('ownerid', 'username profilePicture')
    .populate('originalPost');

    // Get total count for pagination
    const total = await Post.countDocuments({
        hashtags: hashtag,
        ownerid: { $nin: mutuallyBlockedUserIds }
    });

    res.status(200).json({
        status: 'success',
        data: {
            posts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPosts: total
            }
        }
    });
});


export const getTrendingHashtags = asyncErrorHandler(async (req, res) => {
  const hashtags = await Post.aggregate([
    { $unwind: "$hashtags" },
    { $group: { _id: "$hashtags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  res.json({ success: true, hashtags });
});



