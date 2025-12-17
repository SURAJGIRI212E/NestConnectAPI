
import User from '../models/user.model.js';
import CustomError from '../utilities/CustomError.js';
import asyncErrorHandler from '../utilities/asyncErrorHandler.js';
import { generateAccessToken, verifyAccessToken, verifyRefreshToken } from '../utilities/token.js';

const isAuthenticated = asyncErrorHandler(async (req, res, next) => {
    const accessToken = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;

    if (!accessToken && !refreshToken) {
        return next(new CustomError('Please login to access this resource', 401));
    }

    // First try to verify access token
    if (accessToken) {
        try {
            const decoded = verifyAccessToken(accessToken);

            if (!decoded) {
                return next(new CustomError('Invalid access token', 401));
            }

            const user = await User.findById(decoded.userId).select('+bookmarks');

            if (!user) {
                return next(new CustomError('User with given token not found', 404));
            }

            if (await user.isPasswordChangedAfter(decoded.iat)) {
                return next(new CustomError('Password changed recently. Please login again', 401));
            }

            req.user = { _id: user._id, username: user.username, avatar: user.avatar, premium: user.premium, bookmarks: user.bookmarks };
            return next();
        } catch (error) {
            if (error.name !== 'TokenExpiredError') {
                return next(new CustomError('Invalid access token', 401));
            }
            // fall through to refresh token flow when access token expired
        }
    }

    // If access token is expired, verify refresh token
    if (!refreshToken) {
        return next(new CustomError('Please login again', 401));
    }

    let decoded;
    try {
        decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
        return next(new CustomError('Invalid refresh token', 401));
    }

    if (!decoded) {
        return next(new CustomError('Invalid refresh token', 401));
    }

    const user = await User.findById(decoded.userId).select('+bookmarks');

    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    if (await user.isPasswordChangedAfter(decoded.iat)) {
        return next(new CustomError('Password changed recently. Please login again', 401));
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id);

    // Set new access token in cookie same as login
    res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        expires: new Date(Date.now() + 60 * 60 * 1000) // 60 minutes
    });

    // Set req.user after successful refresh token verification
    req.user = { _id: user._id, username: user.username, avatar: user.avatar, premium: user.premium, bookmarks: user.bookmarks };
    next();
});

export default isAuthenticated;
