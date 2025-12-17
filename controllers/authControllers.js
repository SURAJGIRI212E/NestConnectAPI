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
             return next(new CustomError('All fields are required', 400));
        }


        // Check if user already exists (using findOne instead of find)
        const existingUser = await User.findOne({ 
            $or: [
                { username: username.toLowerCase() }, 
                { email: email.toLowerCase() }
            ] 
        });

        if (existingUser) {
             return next(new CustomError('Username or email already exists', 400));
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
  secure: true,
  sameSite: 'none',
  path: '/',
        expires: new Date(Date.now() + 60 * 60 * 1000) // 60 minutes
    });

    // Set refresh token in cookie
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: true,
 sameSite: 'none',
 path: '/',
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Send response
    return res.status(200).json({
        status: 'success',
        message: 'Login successful',
        userid: user._id,
        username: user.username,
        subscription: user.premium
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
    // Clear cookies with options to match how they were set
    const cookieOptions = {
        httpOnly: true,
        secure: true,
sameSite: 'none',
        path: '/',
    };
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

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
   
    await user.save();

   try {
     const frontendUrl = process.env.CLIENT_URL || 'http://localhost:3000';
     const resetLink = `${frontendUrl}/reset-password/${resetToken}`;
    await sendEmail({
    email: user.email,
    subject: 'Password Reset',
    message: `
        <p>We have received a password reset request from your side.</p>
        <p>Click the button below to reset your password or link</p>
        <a href="${resetLink}" style="
            display: inline-block;
            padding: 10px 20px;
            margin-top: 10px;
            font-size: 16px;
            color: #ffffff;
            background-color: #007BFF;
            text-decoration: none;
            border-radius: 5px;
        ">Reset Password</a>
        ${resetLink}
        <p>If you did not request this, please ignore this email.</p>
    `,
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