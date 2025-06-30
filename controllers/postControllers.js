import Post from '../models/post.model.js';
import User from '../models/user.model.js';
import Like from '../models/like.model.js';
import Follow from '../models/follow.model.js'
import CustomError from '../utilities/CustomError.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utilities/cloudinary.js';
import mongoose from 'mongoose';
import { createNotification } from './notiControllers.js';
import { getCurrentUserInteractionData } from '../utilities/userInteractionUtils.js';

// Helper function to add user interaction flags to posts
export const addInteractionFlags = async (posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds) => {
    if (!posts || posts.length === 0) return [];

    const allRelevantPostIds = new Set();
    const allOwnerIds = new Set();
    const postsToProcess = [];

    // bookmarkedPostIds is now passed as a parameter
    console.log("addInteractionFlags - userId:", userId);
    console.log("addInteractionFlags - bookmarkedPostIds (Set):", bookmarkedPostIds);

    // First, identify all unique post IDs (including original posts of reposts)
    for (const post of posts) {
        allRelevantPostIds.add(post._id.toString());
        if (post.isRepost && post.originalPost && post.originalPost._id) {
            allRelevantPostIds.add(post.originalPost._id.toString());
        }
        postsToProcess.push(post);

        if (post.ownerid) allOwnerIds.add(post.ownerid._id ? post.ownerid._id.toString() : post.ownerid.toString());
        if (post.isRepost && post.originalPost && post.originalPost.ownerid) {
            allOwnerIds.add(post.originalPost.ownerid._id ? post.originalPost.ownerid._id.toString() : post.originalPost.ownerid.toString());
        }
        if (post.parentPost && post.parentPost.ownerid) {
            allOwnerIds.add(post.parentPost.ownerid._id ? post.parentPost.ownerid._id.toString() : post.parentPost.ownerid.toString());
        }
    }

    const relevantPostIdsArray = Array.from(allRelevantPostIds);
    const allOwnerIdsArray = Array.from(allOwnerIds);

    // Fetch all likes and reposts for relevant posts in one go
    const [likedPosts, repostedOriginalPosts, followingStatus] = await Promise.all([
        Like.find({ post: { $in: relevantPostIdsArray }, likedBy: userId }).select('post'),
        Post.find({ originalPost: { $in: relevantPostIdsArray }, ownerid: userId, isRepost: true }).select('originalPost'),
        Follow.find({ follower: userId, following: { $in: allOwnerIdsArray } }).select('following'),
    ]);

    const likedPostIds = new Set(likedPosts.map(like => like.post.toString()));
    const repostedOriginalPostIds = new Set(repostedOriginalPosts.map(repost => repost.originalPost.toString()));
    const followingUserIds = new Set(followingStatus.map(f => f.following.toString()));

    const finalPosts = [];

    const sanitizeOwnerIfBlocked = async (owner) => {
        if (!owner) return owner;
        const ownerIdString = typeof owner === 'object' ? owner._id.toString() : owner.toString();

        // Use the passed mutuallyBlockedUserIds directly without re-fetching User
        const isBlocked = mutuallyBlockedUserIds.includes(ownerIdString);

        if (isBlocked) {
            return {
                _id: ownerIdString,
                username: 'unknown',
                fullName: 'Unknown User',
                avatar: 'https://res.cloudinary.com/dpds708v8/image/upload/v1700877960/users/sampleprofile.jpg',
                isFollowingByCurrentUser: false,
                isBlockedByCurrentUser: true
            };
        }

        let populatedOwner = owner;
        if (typeof owner === 'string' || !owner.username) {
            // If owner is just an ID or not fully populated by the initial query,
            // we should NOT re-fetch it here to prevent redundant database calls.
            // Instead, we create a basic object with just the ID, or use existing partial data.
            if (typeof owner === 'string') {
                populatedOwner = { _id: ownerIdString };
            } else if (!owner.username) {
                populatedOwner = { _id: ownerIdString, ...owner }; 
            } else {
                // If it's an object but not fully populated, use its existing fields
                populatedOwner = { ...owner };
            }
        }

        return {
            ...populatedOwner,
            isFollowingByCurrentUser: followingUserIds.has(ownerIdString),
            isBlockedByCurrentUser: isBlocked
        };
    };

    for (let post of postsToProcess) {
        let postObject = post.toObject ? post.toObject() : { ...post };

        if (postObject.isRepost && postObject.originalPost && postObject.originalPost.ownerid) {
            const originalPostOwnerId = typeof postObject.originalPost.ownerid === 'object' 
                                        ? postObject.originalPost.ownerid._id.toString() 
                                        : postObject.originalPost.ownerid.toString();
            if (mutuallyBlockedUserIds.includes(originalPostOwnerId)) {
                postObject.originalPost = null;
            }
        }

        if (postObject.parentPost && postObject.parentPost.ownerid) {
            const parentPostOwnerId = typeof postObject.parentPost.ownerid === 'object'
                                      ? postObject.parentPost.ownerid._id.toString()
                                      : postObject.parentPost.ownerid.toString();
            if (mutuallyBlockedUserIds.includes(parentPostOwnerId)) {
                postObject.parentPost = null;
            }
        }

        if (postObject.ownerid) {
            postObject.ownerid = await sanitizeOwnerIfBlocked(postObject.ownerid);
        }

        if (postObject.isRepost && postObject.originalPost) {
            postObject.originalPost.isLikedByCurrentUser = likedPostIds.has(postObject.originalPost._id.toString());
            postObject.originalPost.isRepostedByCurrentUser = repostedOriginalPostIds.has(postObject.originalPost._id.toString());
            if (postObject.originalPost.ownerid) {
                postObject.originalPost.ownerid = await sanitizeOwnerIfBlocked(postObject.originalPost.ownerid);
            }
            postObject.originalPost.isBookmarkedByCurrentUser = bookmarkedPostIds ? bookmarkedPostIds.has(postObject.originalPost._id.toString()) : false;
        }

        if (postObject.parentPost && postObject.parentPost.ownerid) {
            postObject.parentPost.ownerid = await sanitizeOwnerIfBlocked(postObject.parentPost.ownerid);
        }

        postObject.isLikedByCurrentUser = likedPostIds.has(postObject._id.toString());
        postObject.isRepostedByCurrentUser = repostedOriginalPostIds.has(postObject._id.toString());
        postObject.isBookmarkedByCurrentUser = bookmarkedPostIds ? bookmarkedPostIds.has(postObject._id.toString()) : false;
        console.log(`  Post ${postObject._id.toString()} - isRepostedByCurrentUser (final): ${postObject.isRepostedByCurrentUser}, isBookmarkedByCurrentUser: ${postObject.isBookmarkedByCurrentUser}`);

        finalPosts.push(postObject);
    }
    return finalPosts;
};

// Create a new post or comment done
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
        visibility: visibility || 'public',
        _creatorUsername: req.user.username // Add username for mention notifications
    };

    // Handle commenting functionality
    if (parentPost) {
        const parentPostDoc = await Post.findById(parentPost)
            .select('depth visibility ownerid originalPost isRepost')
            .populate('originalPost', 'ownerid depth'); // Populate originalPost to get its owner and depth
            
        if (!parentPostDoc) {
            return next(new CustomError('Post not found', 404));
        }

        const actualParentPost = parentPostDoc.isRepost ? parentPostDoc.originalPost : parentPostDoc;

        if (!actualParentPost) {
            return next(new CustomError('Original post not found for commenting', 404));
        }

        // Validate comment nesting depth
        // if (actualParentPost.depth >= 10) {
        //     return next(new CustomError('Maximum comment depth reached', 400));
        // }

        // Check comment permissions (on the actual parent post)
        if (actualParentPost.visibility === 'followers') {
            if (actualParentPost.ownerid.toString() !== req.user._id.toString()) {
                const Follow = mongoose.model('Follow');
                const isFollowing = await Follow.isFollowing(req.user._id, actualParentPost.ownerid);
                if (!isFollowing) {
                    return next(new CustomError('Cannot comment on this post', 403));
                }
            }
        }

        // Set comment-specific data
        postData.parentPost = actualParentPost._id; // Link comment to the original post
        postData.visibility = 'public'; // All comments are public

        // Create notification for the actual parent post owner (if it's not their own comment)
        if (actualParentPost.ownerid.toString() !== req.user._id.toString()) {
            await createNotification({
                recipient: actualParentPost.ownerid,
                type: 'comment',
                post: actualParentPost._id,
                message: `${req.user.username} commented on your post`
            });
        }
    }

    // Create the post (mentions will be handled in the pre-save middleware)
    const post = await Post.create(postData);

    // Update actual parent's comment count if this is a comment
    if (postData.parentPost) { // Check against postData.parentPost which now holds the actual parent ID
        await Post.findByIdAndUpdate(postData.parentPost, {
            $inc: { 'stats.commentCount': 1 }
        });
    }

    // Populate necessary fields
    await post.populate([
        { path: 'ownerid', select: 'username fullName avatar' },
        { path: 'mentions', select: 'username fullName' },
        { 
            path: 'parentPost',
            select: 'content ownerid depth createdAt media',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        }
    ]);

    res.status(201).json({
        status: 'success',
        data: post,
        message: parentPost ? 'Comment added successfully' : 'Post created successfully'
    });
});

// Get a single post by postId param done
export const getPost = asyncErrorHandler(async (req, res, next) => {
    const userId = req.user._id;
    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    let post = await Post.findById(req.params.postId)
        .populate('ownerid', 'username fullName avatar')
        .populate('mentions', 'username fullName')
        .populate({
            path: 'parentPost',
            select: 'content media createdAt ownerid',
            populate: {
                path: 'ownerid',
                select: 'username fullName avatar'
            }
        })
        .populate({
            path: 'originalPost',
            populate: {
                path: 'ownerid',
                select: 'username fullName avatar'
            }
        });

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check post visibility
    if (post.ownerid._id.toString() === userId.toString()) {
        // User can always see their own posts
    } else if (post.visibility === 'followers') {
        // For other users\' posts, check if following
        const Follow = mongoose.model('Follow');
        const isFollowing = await Follow.isFollowing(userId, post.ownerid._id);
        if (!isFollowing) {
            return next(new CustomError('This post is only visible to followers', 403));
        }
    }

    // Add interaction flags to the single post, passing mutuallyBlockedUserIds and bookmarkedPostIds
    const [postWithFlags] = await addInteractionFlags([post], userId, mutuallyBlockedUserIds, bookmarkedPostIds);
    post = postWithFlags;

    res.status(200).json({
        status: 'success',
        data: post
    });
});

// Get user posts by userId param partially
export const getUserPosts = asyncErrorHandler(async (req, res, next) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(userId);
    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    // Use the utility function to get blocked users and bookmarks once for the current user
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(currentUserId);

    // Build query based on ownership and following status
    let query = { ownerid: userId, parentPost: null };
    if (userId !== currentUserId.toString()) {
        const Follow = mongoose.model('Follow');
        const isFollowing = await Follow.isFollowing(currentUserId, userId);
        if (!isFollowing) {
            query.visibility = 'public';
        }
    }

    let posts = await Post.find(query)
        .populate('ownerid', 'username fullName avatar')
        .populate({
            path: 'originalPost',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        })
        .populate({
            path: 'parentPost',
            select: 'content media createdAt ownerid',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        })
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit);

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to user posts, passing pre-fetched IDs
    posts = await addInteractionFlags(posts, currentUserId, mutuallyBlockedUserIds, bookmarkedPostIds);

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

// Get feed posts of current user done
export const getFeedPosts = asyncErrorHandler(async (req, res, next) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    // Get followed users
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    // Add current user's ID to the list of IDs to query for, so they see their own posts
    const allRelevantUserIds = [
        ...followingIds,
        userId
    ];

    // Find posts from relevant users that aren't blocked
    let posts = await Post.find({
        ownerid: {
            $in: allRelevantUserIds,
            $nin: mutuallyBlockedUserIds
        }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('ownerid', 'username fullName avatar')
    .populate({
        path: 'originalPost',
        populate: {
            path: 'ownerid',
            select: 'username fullName avatar'
        }
    })
    .populate({
        path: 'parentPost',
        select: 'content media createdAt ownerid',
        populate: {
            path: 'ownerid',
            select: 'username fullName avatar'
        }
    });

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to feed posts, passing pre-fetched IDs
    posts = await addInteractionFlags(posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

    // Get total count for pagination
    const total = await Post.countDocuments({
        ownerid: {
            $in: allRelevantUserIds,
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

// Get comments for a post/comment done
export const getComments = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let mainPost = await Post.findById(postId)
        .populate('ownerid');

    if (!mainPost) {
        return next(new CustomError('Post not found', 404));
    }

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    let allThreadComments = [];
    let currentLevelParentIds = [mainPost._id];

    // Fetch comments iteratively for limited depth (e.g., 2 levels of nesting + main post)
    for (let i = 0; i < 2; i++) {
        if (currentLevelParentIds.length === 0) break;

        const newComments = await Post.find({
            parentPost: { $in: currentLevelParentIds },
            ownerid: { $nin: mutuallyBlockedUserIds }
        })
        .populate('ownerid', 'username fullName avatar')
        .populate({
            path: 'parentPost',
            select: 'content media createdAt ownerid isRepost originalPost',
            populate: [
                { path: 'ownerid', select: 'username fullName avatar' },
                { path: 'originalPost', select: 'ownerid content media createdAt' }
            ]
        })
        .populate({
            path: 'originalPost',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        })
        .sort({ createdAt: 1 });

        if (newComments.length === 0) break;

        allThreadComments = allThreadComments.concat(newComments);
        currentLevelParentIds = newComments.map(comment => comment._id);
    }

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    allThreadComments = allThreadComments.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to all fetched comments, passing pre-fetched IDs
    const commentsWithFlags = await addInteractionFlags(allThreadComments, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

    res.status(200).json({
        status: 'success',
        data: {
            comments: commentsWithFlags,
            pagination: {
                currentPage: page,
                totalPages: 1,
                totalComments: commentsWithFlags.length
            }
        }
    });
});

// Update a post by postId param done
export const updatePost = asyncErrorHandler(async (req, res, next) => {
    const { content } = req.body;
   
    const post = await Post.findById(req.params.postId);

    if (!post) {
        return next(new CustomError('Post not found', 404));
    }

    // Check ownership
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
    await post.save();

    res.status(200).json({
        status: 'success',
        data: post
    });
});

// Delete a post done
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
                const parts = media.url.split('/upload/');
                if (parts.length === 2) {
                    const publicId = parts[1].split('/').slice(1).join('/').replace(/\.[^/.]+$/, '');
                   
                    await deleteFromCloudinary(publicId);
                }
            } catch (error) {
                console.error('Failed to delete media:', media.url, error);
            }
        });

        await Promise.all(deletePromises);
    }

    // If this is a reply, decrease parent\'s comment count
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

// Search posts done
export const searchPosts = asyncErrorHandler(async (req, res, next) => {
    const { query } = req.query;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!query) {
        return next(new CustomError('Search query is required', 400));
    }

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

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
            // Exclude reposts from search results
            { isRepost: false }, 
            // Search in content or hashtags
            {
                $or: [
                    { content: { $regex: query, $options: 'i' } },
                    { hashtags: { $regex: query.replace('#', ''), $options: 'i' } }
                ]
            },
            // Visibility conditions
            {
                $or: [
                    { visibility: 'public' },
                    { ownerid: userId },
                    { 
                        $and: [
                            { visibility: 'followers' },
                            { ownerid: { $in: followingIds } }
                        ]
                    }
                ]
            },
            { parentPost: null }
        ]
    };

    let posts = await Post.find(searchQuery)
        .populate('ownerid', 'username fullName avatar')
        .populate('mentions', 'username fullName')
        .populate({
            path: 'originalPost',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        })
        .populate({
            path: 'parentPost',
            select: 'content media createdAt ownerid',
            populate: { path: 'ownerid', select: 'username fullName avatar' }
        })
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit);

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to search results, passing pre-fetched IDs
    posts = await addInteractionFlags(posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

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

//done
export const likeunlikePost = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params;
    const userId = req.user._id;

    // Find the target post, which might be a repost
    const targetPost = await Post.findById(postId).populate('originalPost');
    if (!targetPost) {
        return next(new CustomError('Post not found', 404));
    }

    // Determine the actual post to like/unlike (original if it's a repost)
    const actualPostToModify = targetPost.isRepost ? 
                               (await Post.findById(targetPost.originalPost._id).populate('ownerid')) : 
                               targetPost;

    if (!actualPostToModify) {
        return next(new CustomError('Original post not found for repost', 404));
    }

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);
    
    // Check if current user is blocked by post owner or vice versa (using pre-fetched IDs)
    if (mutuallyBlockedUserIds.includes(actualPostToModify.ownerid._id.toString())) {
        return next(new CustomError('Cannot interact with this post due to blocking status', 403));
    }

    // Check if the user has already liked the actual post
    const existingLike = await Like.findOne({ post: actualPostToModify._id, likedBy: userId });

    let isLiked = false;
    if (existingLike) {
        // Unlike: Remove the existing like
        await existingLike.deleteOne();
        await actualPostToModify.updateStats();
    } else {
        // Like: Create a new like
        await Like.create({ post: actualPostToModify._id, likedBy: userId });
        isLiked = true;

        // Create notification for post owner (if it's not their own post)
        if (actualPostToModify.ownerid._id.toString() !== userId.toString()) {
            await createNotification({
                recipient: actualPostToModify.ownerid._id,
                type: 'like',
                post: actualPostToModify._id,
                message: `${(await User.findById(userId)).username} liked your post`
            });
        }
    }

    res.status(200).json({
        status: 'success',
        message: `Post ${isLiked ? 'liked' : 'unliked'} successfully`,
        data: { liked: isLiked, postId: actualPostToModify._id }
    });
});

//done
export const getOwnLikedPosts = asyncErrorHandler(async (req, res, next) => {   
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    // Find liked posts, excluding those from blocked users
    const likedPosts = await Like.find({ likedBy: userId })
        .populate({
            path: 'post',
            populate: [
                { path: 'ownerid', select: 'avatar fullName username' },
                { 
                    path: 'originalPost',
                    populate: { path: 'ownerid', select: 'username fullName avatar' }
                },
                { 
                    path: 'parentPost',
                    select: 'content media createdAt ownerid',
                    populate: { path: 'ownerid', select: 'username fullName avatar' }
                }
            ],
            match: { ownerid: { $nin: mutuallyBlockedUserIds } }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    // Filter out null posts (from blocked users)
    let posts = likedPosts
        .map(like => like.post)
        .filter(post => post !== null);

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to liked posts, passing pre-fetched IDs
    posts = await addInteractionFlags(posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

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

// Repost a post done
export const repost = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params; // This postId refers to the original post's ID
    const userId = req.user._id;

    // Check if the original post exists
    const originalPost = await Post.findById(postId).populate('ownerid');
    if (!originalPost) {
        return next(new CustomError('Post not found', 404));
    }

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds, user: currentUserDoc } = await getCurrentUserInteractionData(userId);

    // Check if reposting user is blocked by original post owner or vice versa (using pre-fetched IDs)
    if (mutuallyBlockedUserIds.includes(originalPost.ownerid._id.toString())) {
        return next(new CustomError('Cannot repost this content due to blocking status', 403));
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

    // Re-fetch the original post to get its updated stats after repost
    const updatedOriginalPost = await Post.findById(originalPost._id)
        .populate('ownerid', 'username fullName avatar')
        .select('+stats');

    // Populate the originalPost field of the newly created repost document before sending to client
    if (updatedOriginalPost) {
        repost.originalPost = updatedOriginalPost;
    }

    // Create notification for original post owner (if it's not their own repost)
    if (originalPost.ownerid._id.toString() !== userId.toString()) {
        await createNotification({
            recipient: originalPost.ownerid._id,
            type: 'repost',
            post: postId,
            message: `${currentUserDoc.username} reposted your post`
        });
    }

    // Apply interaction flags to the newly created repost, passing pre-fetched IDs
    const [repostWithFlags] = await addInteractionFlags([repost], userId, mutuallyBlockedUserIds, bookmarkedPostIds);

    console.log("Backend Repost Response Data:", repostWithFlags);

    res.status(201).json({
        status: 'success',
        message: 'Post reposted successfully',
        data: { repost: repostWithFlags }
    });
});

// Get posts by hashtag
export const getPostsByHashtag = asyncErrorHandler(async (req, res, next) => {
    const { hashtag } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Use the utility function to get blocked users and bookmarks once
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(userId);

    // Find posts with the hashtag, excluding blocked users
    let posts = await Post.find({
        hashtags: hashtag,
        ownerid: { $nin: mutuallyBlockedUserIds }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('ownerid', 'username profilePicture')
    .populate('originalPost')
    .populate({
        path: 'parentPost',
        select: 'content media createdAt ownerid',
        populate: { path: 'ownerid', select: 'username fullName avatar' }
    });

    // NEW FILTERING STEP FOR REPOSTS/COMMENTS OF BLOCKED USERS
    posts = posts.filter(post => {
        if (post.isRepost && post.originalPost && post.originalPost.ownerid && mutuallyBlockedUserIds.includes(post.originalPost.ownerid._id.toString())) {
            return false;
        }
        if (post.parentPost && post.parentPost.ownerid && mutuallyBlockedUserIds.includes(post.parentPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to hashtag posts, passing pre-fetched IDs
    posts = await addInteractionFlags(posts, userId, mutuallyBlockedUserIds, bookmarkedPostIds);

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

// Get comments made by a specific user
export const getUserComments = asyncErrorHandler(async (req, res, next) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    // Use the utility function to get blocked users and bookmarks once for the current user
    const { mutuallyBlockedUserIds, bookmarkedPostIds } = await getCurrentUserInteractionData(currentUserId);

    // Check if the target user (whose comments are being fetched) is blocked by the current user,
    // or if the target user has blocked the current user.
    const isTargetUserBlocked = mutuallyBlockedUserIds.includes(userId);
    if (isTargetUserBlocked) {
        return next(new CustomError('Cannot view comments from this user due to blocking status', 403));
    }

    let comments = await Post.find({
        ownerid: userId,
        parentPost: { $ne: null } // Only fetch posts that are comments
    })
    .populate('ownerid', 'username fullName avatar')
    .populate({
        path: 'parentPost',
        select: 'content media createdAt ownerid originalPost isRepost',
        populate: [
            { path: 'ownerid', select: 'username fullName avatar' },
            { path: 'originalPost', select: 'ownerid content media createdAt' }
        ]
    })
    .populate({
        path: 'originalPost',
        populate: { path: 'ownerid', select: 'username fullName avatar' }
    })
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

    // Filter out comments where the originalPost or parentPost owner is mutually blocked
    comments = comments.filter(comment => {
        if (comment.parentPost && comment.parentPost.ownerid && mutuallyBlockedUserIds.includes(comment.parentPost.ownerid._id.toString())) {
            return false;
        }
        if (comment.parentPost && comment.parentPost.isRepost && comment.parentPost.originalPost && comment.parentPost.originalPost.ownerid && mutuallyBlockedUserIds.includes(comment.parentPost.originalPost.ownerid._id.toString())) {
            return false;
        }
        return true;
    });

    // Add interaction flags to comments (for the current user viewing), passing pre-fetched IDs
    comments = await addInteractionFlags(comments, currentUserId, mutuallyBlockedUserIds, bookmarkedPostIds);

    const total = await Post.countDocuments({
        ownerid: userId,
        parentPost: { $ne: null }
    });

    res.status(200).json({
        status: 'success',
        data: {
            comments,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalComments: comments.length
            }
        }
    });
});

// Unrepost a post (delete a repost)
export const unrepostPost = asyncErrorHandler(async (req, res, next) => {
    const { postId } = req.params; // This postId refers to the original post's ID
    const userId = req.user._id;

    // Find the repost by the current user for the given original postId
    const repostToDelete = await Post.findOne({
        ownerid: userId,
        isRepost: true,
        originalPost: postId
    });

    if (!repostToDelete) {
        return next(new CustomError('No repost found for this post by current user', 404));
    }

    // Get the original post to update its stats
    const originalPost = await Post.findById(postId);
    if (!originalPost) {
        // This scenario should ideally not happen if repostToDelete exists and its originalPost points to a valid ID
        return next(new CustomError('Original post not found', 404));
    }

    // Use the utility function to get blocked users once
    const { mutuallyBlockedUserIds } = await getCurrentUserInteractionData(userId);

    // Check if reposting user is blocked by original post owner or vice versa (using pre-fetched IDs)
    if (mutuallyBlockedUserIds.includes(originalPost.ownerid._id.toString())) {
        return next(new CustomError('Cannot unrepost this content due to blocking status', 403));
    }

    await repostToDelete.deleteOne(); // Delete the repost document
    await originalPost.updateStats(); // Update original post stats (decrement repostCount)

    res.status(200).json({
        status: 'success',
        message: 'Post unreposted successfully',
        data: { originalPostId: postId }
    });
});



