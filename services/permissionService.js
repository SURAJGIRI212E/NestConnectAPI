import User from '../models/user.model.js';
import Follow from '../models/follow.model.js';


export const checkUserInteractionPermission = async (senderId, receiverId, requireMutualFollow = false) => {
  const [sender, receiver] = await Promise.all([
    User.findById(senderId).select('blockedUsers'),
    User.findById(receiverId).select('blockedUsers messagePreference')
  ]);

  if (!sender || !receiver) {
    return { canInteract: false, reason: 'User not found' };
  }

  // Check if either user has blocked the other
  if (sender.blockedUsers.includes(receiverId) || receiver.blockedUsers.includes(senderId)) {
    return { canInteract: false, reason: 'User is blocked' };
  }

  // If requireMutualFollow is true, always check for mutual following
  // Otherwise, check based on receiver's message preference
  const [senderFollowsReceiver, receiverFollowsSender] = await Promise.all([
    Follow.exists({ follower: senderId, following: receiverId }),
    Follow.exists({ follower: receiverId, following: senderId })
  ]);

  if (requireMutualFollow && !(senderFollowsReceiver && receiverFollowsSender)) {
    return { canInteract: false, reason: 'Mutual following required for video Calling' };
  }

  // Check receiver's message preference
  switch (receiver.messagePreference) {
    case 'followers':
      if (!senderFollowsReceiver) {
        return { canInteract: false, reason: 'Only followers can message' };
      }
      break;
    case 'following':
      if (!receiverFollowsSender) {
        return { canInteract: false, reason: 'Only users I follow can message me' };
      }
      break;
    case 'mutualFollowers':
      if (!(senderFollowsReceiver && receiverFollowsSender)) {
        return { canInteract: false, reason: 'Only mutual followers can message' };
      }
      break;
    case 'everyone':
      break;
    case 'no one':
      return { canInteract: false, reason: 'Receiving messages is currently disabled' };
    default:
      return { canInteract: false, reason: 'Unknown message preference' };
  }

  return { canInteract: true, reason: null };
};

/**
 * Check if users can message each other
 */
export const canMessageUser = async (senderId, receiverId) => {
  const result = await checkUserInteractionPermission(senderId, receiverId, false);
  return result;
};

/**
 * Check if users can video call each other (requires mutual following)
 */
export const canVideoCall = async (senderId, receiverId) => {
  const result = await checkUserInteractionPermission(senderId, receiverId, true);
  return result;
};
