import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  fullName: { type: String ,required: [true,'fullname is required'] },
  username: { type: String, required: [true,'username is required'], unique: true },
  email:    { type: String, required: [true,'email is required'], unique: true, trim: true, lowercase: true ,
  match: [ /^\S+@\S+\.\S+$/, 'Please enter a valid email address' ]},
  bio:      { type: String },
  avatar:   { type: String },
  coverImage: { type: String },
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  password: { type: String, required: true ,select:false, minlength: [6, 'Password must be at least 6 characters long']},
  isPremium: { type: Boolean, default: false },
  passwordChangeAt: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  isOnline: { 
    type: Boolean, 
    default: false 
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for faster queries
userSchema.index({ username: 1, email: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
 userSchema.methods.isPasswordChangedAfter = async function(JWTTimestamp) {
  if (this.passwordChangeAt) {
    const changedTimestamp = parseInt(this.passwordChangeAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false; 
}

userSchema.methods.createResetPasswordToken = function() {   

const resetToken = crypto.randomBytes(32).toString('hex'); // Generate a random plain token
this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');//encrypting the token
this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes   
console.log(`Encrypt Reset token: ${this.resetPasswordToken}`); // For debugging purposes
return resetToken; 
}
const User = mongoose.model('User', userSchema);

export default User;