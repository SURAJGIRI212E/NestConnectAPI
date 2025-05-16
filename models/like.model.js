// models/Like.js
import mongoose from "mongoose";

const likeSchema = new mongoose.Schema({
  post: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Post", 
    required: true 
  },
  likedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  }
}, {
  timestamps: true
});

// Compound index for post and user
likeSchema.index({ post: 1, likedBy: 1 }, { unique: true });

// Update post stats after like/unlike
likeSchema.post('save', async function() {
  const Post = mongoose.model('Post');
  const post = await Post.findById(this.post);
  if (post) await post.updateStats();
});

// Handle both deleteOne and findOneAndDelete
likeSchema.pre('deleteOne', { document: true, query: false }, async function() {
  const Post = mongoose.model('Post');
  const post = await Post.findById(this.post);
  if (post) await post.updateStats();
});

likeSchema.pre('findOneAndDelete', async function() {
  const doc = await this.model.findOne(this.getFilter());
  if (doc) {
    const Post = mongoose.model('Post');
    const post = await Post.findById(doc.post);
    if (post) await post.updateStats();
  }
});

// Method to check if user has liked
likeSchema.statics.hasLiked = async function(postId, userId) {
  return await this.exists({ post: postId, likedBy: userId });
};

const LikeModel = mongoose.model("Like", likeSchema);
export default LikeModel;
