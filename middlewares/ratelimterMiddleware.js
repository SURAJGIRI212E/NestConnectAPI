import rateLimit from 'express-rate-limit';

// Password reset limiter
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    status: 'error',
    message: 'Too many password reset requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth limiter (login/register)
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User search limiter
export const userSearchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: {
    status: 'error',
    message: 'Too many user search requests, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Post creation limiter
export const postCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,
  message: {
    status: 'error',
    message: 'Too many posts created from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Follow/unfollow limiter
export const followLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15,
  message: {
    status: 'error',
    message: 'Too many follow/unfollow actions, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Bookmark limiter
export const bookmarkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: {
    status: 'error',
    message: 'Too many bookmark actions, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});