import User from '../models/user.model.js';

export const getCurrentUserInteractionData = async (userId) => {
    const user = await User.findById(userId).select('bookmarks blockedUsers');
    const blockedByOthers = await User.find({ blockedUsers: userId }).select('_id');

    const mutuallyBlockedUserIds = [
        ...(user?.blockedUsers || []).map(id => id.toString()),
        ...(blockedByOthers || []).map(u => u._id.toString())
    ];

    const bookmarkedPostIds = new Set(user?.bookmarks.map(id => id.toString()));

    return {
        user, // The current user document with selected fields
        mutuallyBlockedUserIds,
        bookmarkedPostIds
    };
}; 