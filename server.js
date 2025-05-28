import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import CustomError from './utilities/CustomError.js';
import errorHandler from './middlewares/errorMiddleware.js';
import authRoute from './routes/authRoute.js';
import userRoute from './routes/userRoute.js';
import postRoute from './routes/postRoute.js';
import followRoute from './routes/followRoute.js';
import notiRoute from './routes/notiRoute.js';
import chatRoute from './routes/chatRoute.js';
import { setupChatSocket } from './sockets/chatSocket.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files from the 'public' directory
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true
}));
app.use(cookieParser());

// Setup Socket.IO
setupChatSocket(io);

// Test route
app.get('/test', (req, res) => {
    res.send('API is running...');
});

// Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/posts', postRoute);
app.use('/api/follow', followRoute);
app.use('/api/notifications', notiRoute);
app.use('/api/chat', chatRoute);

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
        httpServer.listen(PORT, () => {
            console.log(`Server is running on port http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();

