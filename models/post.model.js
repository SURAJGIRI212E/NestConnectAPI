// models/Post.js
import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  ownerid: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true 
  },
  content: { 
    type: String,
    maxLength: 280
  },
  media: [{
    url: String,
    type: {
      type: String,
      enum: ['image', 'video', 'audio'],
    }
  }],
  parentPost: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Post", 
    default: null,
    index: true
  },
  stats: {
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    repostCount: { type: Number, default: 0 }
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  hashtags: [{ type: String }],
  isRepost: { type: Boolean, default: false },
  visibility: {
    type: String,
    enum: ['public', 'followers'],
    default: 'public'
  },
  edits: {
    isedited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editvalidtill: { type: Date, default: null },
    editchancesleft: { type: Number, default: 3 }
  },
  depth: { 
    type: Number, 
    default: 0,
    validate: {
      validator: function(value) {
        return value <= 2; // Limit nesting to 2 levels (post -> comment -> reply)
      },
      message: 'Comments can only be nested up to 2 levels deep'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
postSchema.index({ ownerid: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ parentPost: 1, createdAt: -1 });
postSchema.index({ 'stats.likeCount': -1 });

// Virtual for comments/replies
postSchema.virtual('comments', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'parentPost',
  options: { sort: { createdAt: -1 } }
});

// Pre-save middleware
postSchema.pre('save', async function(next) {
  // Handle hashtags and mentions
  if (this.isModified('content')) {
    // Extract hashtags
    this.hashtags = (this.content.match(/#[a-zA-Z0-9_]+/g) || [])
      .map(tag => tag.slice(1).toLowerCase());
    
    // Extract mentions
    const mentionUsernames = (this.content.match(/@[a-zA-Z0-9_]+/g) || [])
      .map(mention => mention.slice(1));
    
    if (mentionUsernames.length > 0) {
      try {
        const User = mongoose.model('User');
        const mentionedUsers = await User.find({ 
          username: { $in: mentionUsernames } 
        });
        this.mentions = mentionedUsers.map(user => user._id);
      } catch (error) {
        next(error);
      }
    }

    // Handle edit tracking
    this.edits.isedited = true;
    this.edits.editedAt = new Date();
    this.edits.editchancesleft = this.edits.editchancesleft - 1;
  }

  // Set edit window and depth for new posts
  if (this.isNew) {
    const createdTime = this.createdAt || new Date();
    this.edits.editvalidtill = new Date(createdTime.getTime() + 15 * 60 * 1000);

    // Set depth based on parent post
    if (this.parentPost) {
      const ParentPost = mongoose.model('Post');
      const parent = await ParentPost.findById(this.parentPost);
      if (parent) {
        this.depth = parent.depth + 1;
      }
    }
  }

  next();
});

// Methods
postSchema.methods.updateStats = async function() {
  const Like = mongoose.model('Like');
  const Post = mongoose.model('Post');
  
  const [likeCount, commentCount] = await Promise.all([
    Like.countDocuments({ post: this._id }),
    Post.countDocuments({ parentPost: this._id })
  ]);

  this.stats.likeCount = likeCount;
  this.stats.commentCount = commentCount;
  return this.save();
};

const PostModel = mongoose.model("Post", postSchema);
export default PostModel;
