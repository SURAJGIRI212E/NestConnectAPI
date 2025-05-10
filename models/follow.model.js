// models/Follow.js
import mongoose from "mongoose";

const followSchema = new mongoose.Schema({
  follower: { //user who is following in term of youtube subscribers (current user)
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  following: { //user who is being followed in term of youtube channel
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
 
}, {
  timestamps: true
});

// Compound index
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Methods
followSchema.statics.isFollowing = async function(followerId, followingId) {
  return await this.exists({ 
    follower: followerId, 
    following: followingId
  });
};

followSchema.statics.getFollowersCount = async function(userId) {
  return await this.countDocuments({ 
    following: userId
  });
};

followSchema.statics.getFollowingCount = async function(userId) {
  return await this.countDocuments({ 
    follower: userId
  });
};

const FollowModel = mongoose.model("Follow", followSchema);
export default FollowModel;
