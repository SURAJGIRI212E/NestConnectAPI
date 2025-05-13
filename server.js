import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import CustomError from './utilities/CustomError.js';
import errorHandler from './middlewares/errorMiddleware.js';
import authRoute from './routes/authRoute.js';
import userRoute from './routes/userRoute.js';
import followRoute from './routes/followRoute.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files from the 'public' directory
app.use(cors());
app.use(cookieParser());

// Test route
app.get('/test', (req, res) => {
    res.send('API is running...');
});

// Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/follow', followRoute);

// 404 Route Handler
app.all('*', (req, res, next) => {
    const err = new CustomError(`${req.originalUrl} Route not found`, 404);
    next(err);
});

// Global error handling middleware
app.use(errorHandler);

// Connect to MongoDB and start the server
const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();

