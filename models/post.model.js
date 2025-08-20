// models/Post.js
import mongoose from "mongoose";
import { createNotification } from '../controllers/notiControllers.js';

const postSchema = new mongoose.Schema({  ownerid: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true 
  },
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    default: null
  },
  content: { 
    type: String,
    maxLength: 1000
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
    if (this.isModified('content') && this.content) {
        // Check edit chances before allowing edit
        if (!this.isNew) {
            if (this.edits.editchancesleft <= 0) {
                return next(new Error('No edit chances left'));
            }
            this.edits.isedited = true;
            this.edits.editedAt = new Date();
            this.edits.editchancesleft -= 1;
        }

        // Extract hashtags
        this.hashtags = (this.content.match(/#[a-zA-Z0-9_]+/g) || [])
            .map(tag => tag.slice(1).toLowerCase());
        
        // Extract and process mentions
        const mentionUsernames = [...new Set((this.content.match(/@[a-zA-Z0-9_]+/g) || [])
            .map(mention => mention.slice(1)))];
        
        if (mentionUsernames.length > 0) {
            try {
                const User = mongoose.model('User');
                const mentionedUsers = await User.find({ 
                    username: { $in: mentionUsernames } 
                }).select('username avatar fullName');
                // Set mentions array
                this.mentions = mentionedUsers.map(user => user._id);

                // Create notifications for mentioned users if this is a new post
                if (this.isNew) {
                    for (const user of mentionedUsers) {
                        // Don't notify if it's a self-mention or if the user has blocked the poster
                        if (user._id.toString() !== this.ownerid.toString() && 
                            !user.blockedUsers?.includes(this.ownerid)) {
                             const currentuser=await User.findById(this.ownerid)
                            await createNotification({
                                recipient: user._id,
                                type: 'mention',
                                post: this._id,
                                message: `${(currentuser.username)} mentioned you in a post`,
                                sender: {avatar:currentuser.avatar,
                                  username:currentuser.username
                                }
                            });
                        }
                    }
                }
            } catch (error) {
                next(error);
            }
        }
    }

    // Set edit window and depth for new posts
    if (this.isNew) {
        // Only set editvalidtill if not already set (preserve premium/basic value from controller)
        if (!this.edits.editvalidtill) {
            const createdTime = this.createdAt || new Date();
            this.edits.editvalidtill = new Date(createdTime.getTime() + 15 * 60 * 1000);
        }

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
  
  const [likeCount, commentCount, repostCount] = await Promise.all([
    Like.countDocuments({ post: this._id }),
    Post.countDocuments({ parentPost: this._id }),
    Post.countDocuments({ originalPost: this._id, isRepost: true })
  ]);

  // Only update and save if counts have changed
  if (this.stats.likeCount !== likeCount || 
      this.stats.commentCount !== commentCount || 
      this.stats.repostCount !== repostCount) {
    this.stats.likeCount = likeCount;
    this.stats.commentCount = commentCount;
    this.stats.repostCount = repostCount;
    // Use updateOne to avoid triggering middleware
    await Post.updateOne(
      { _id: this._id },
      { 
        $set: {
          'stats.likeCount': likeCount,
          'stats.commentCount': commentCount,
          'stats.repostCount': repostCount
        }
      }
    );
  }
};

const PostModel = mongoose.model("Post", postSchema);
export default PostModel;
