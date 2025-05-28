import User from '../models/user.model.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import CustomError from '../utilities/CustomError.js';
import sendEmail from '../utilities/emails.js';
import crypto from 'crypto';
import { generateAccessToken, generateRefreshToken } from '../utilities/token.js';


const register = asyncErrorHandler(async (req, res,next) => {
   
        const { username, email, fullName, password } = req.body;

        // // Validate required fields
        if (!username || !email || !fullName || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }


        // Check if user already exists (using findOne instead of find)
        const existingUser = await User.findOne({ 
            $or: [
                { username: username.toLowerCase() }, 
                { email: email.toLowerCase() }
            ] 
        });

        if (existingUser) {
            return res.status(400).json({ 
                message: 'Username or email already exists' 
            });
        }

        // Create new user
        const user = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            fullName,
            password,
        });

        await user.save();
        res.status(201).json({ 
            message: 'User registered successfully',
            userId: user._id 
        });

   
})
 

const login = asyncErrorHandler(async (req, res, next) => {         
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return next(new CustomError('Email and password are required', 400));
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password'); 

    if (!user || !(await user.comparePassword(password))) {
        return next(new CustomError('Invalid email or password', 401));
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);


    // Set cookies
    res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Send response
    return res.status(200).json({
        status: 'success',
        message: 'Login successful',
        userid: user._id,
        username: user.username,
       accessToken,
        refreshToken,
    });
});

export const getMe = asyncErrorHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      throw new CustomError('User not found', 404);
    }
  
    res.status(200).json({
      status: 'success',
      data: user
    });
  }); 

const logout = asyncErrorHandler(async (req, res, next) => {
    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');           

    return res.status(200).json({
        status: 'success',
        message: 'Logout successful',
    }); 
})

const forgetPassword = asyncErrorHandler(async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        return next(new CustomError('Email is required', 400));
    }

    // Finding user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
        return next(new CustomError('User not found with given email ', 404));
    }

    // Generate password reset token and send email
    const resetToken = user.createResetPasswordToken(); // method generates a token and sets it in the user document
    console.log(resetToken)
    await user.save();

   try {
     await sendEmail({
         email: user.email,
         subject: 'Password Reset',
         message: `We have recievd a passowrd reset request from your side.Click the link to reset your password: ${req.protocol}://${req.get('host')}/api/auth/resetPassword/${resetToken}`,
     });
   } catch (error) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        return next(new CustomError('Error sending email. Try again later', 500));//calling global err handler
    
   }

    return res.status(200).json({
        status: 'success',
        message: 'Password reset link sent to your email',
    });
});


const resetPassword = asyncErrorHandler(async (req, res, next) => {
    const {password, confirmpassword} = req.body
     if (!req.params.token) {
        return next(new CustomError('Token is required', 400));
    }
    if (!password && !confirmpassword) {
        return next(new CustomError('Password and confirm password are required', 400));   
    }
    if (password != confirmpassword) {
        console.log(password,confirmpassword)
        return next(new CustomError('Password and confirm password do not match', 400));   
    }

    // Finding user by token
    const token= crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) {
        return next(new CustomError('Invalid or expired password reset token', 400));
    }
    user.password = password;
    user.resetPasswordToken = undefined;    
    user.resetPasswordExpire = undefined;
    user.passwordChangeAt = Date.now(); 
    await user.save();


    return res.status(200).json({
        status: 'success',
        message: 'Password reset successful now you can login with new password',
    });
}); 

const updatePassword = asyncErrorHandler(async (req, res, next) => {
    const { oldpassword, newpassword } = req.body;
    if (!oldpassword || !newpassword) {
        return next(new CustomError('Old password and new password are required', 400));
    }

    // Find user by ID and check old password
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(oldpassword))) {
        return next(new CustomError('Invalid old password', 401));
    }

    // Update password
    user.password = newpassword;
    user.passwordChangeAt = Date.now(); 
    await user.save();

    return res.status(200).json({
        status: 'success',
        message: 'Password updated successfully.now you can login with new password',
    });
});



export  {register,login,logout,forgetPassword,resetPassword,updatePassword};