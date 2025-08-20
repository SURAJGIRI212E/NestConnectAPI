import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { createServer } from 'http'; // use https if you have certs
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import connectDB from './config/db.js';
import CustomError from './utilities/CustomError.js';
import errorHandler from './middlewares/errorMiddleware.js';

// Routes
import authRoute from './routes/authRoute.js';
import userRoute from './routes/userRoute.js';
import postRoute from './routes/postRoute.js';
import followRoute from './routes/followRoute.js';
import notiRoute from './routes/notiRoute.js';
import chatRoute from './routes/chatRoute.js';
import subscriptionRoute from './routes/subscriptionRoute.js';

import { setupChatSocket } from './sockets/chatSocket.js';
import { setupWebRTCSocket } from './sockets/webrtcSocket.js';
import isAuthenticated from './middlewares/authMiddleware.js';
import twilio from 'twilio';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL;

const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  CLIENT_URL
];

// Middleware
app.set('trust proxy', 1); // for ngrok & cookies
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

//cors in production
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // allow cookies/auth headers
    methods: ["GET", "POST", "PUT", "DELETE"], // allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // allowed headers
  })
);

// Custom CORS middleware
// app.use((req, res, next) => {
//   const origin = req.headers.origin;

//   const isNgrok = origin?.endsWith('.ngrok-free.app');

//   if (origin && (allowedOrigins.includes(origin) || isNgrok)) {
    
//     res.setHeader('Access-Control-Allow-Origin', origin);
//     res.setHeader('Access-Control-Allow-Credentials', 'true');
//     res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,ngrok-skip-browser-warning');

//     res.setHeader('Vary', 'Origin');
//   }

//   if (req.method === 'OPTIONS') {
//     return res.sendStatus(204);
//   }

//   next();
// });


// Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/posts', postRoute);
app.use('/api/follow', followRoute);
app.use('/api/notifications', notiRoute);
app.use('/api/chat', chatRoute);
app.use('/api/subscription', subscriptionRoute);

// Secure endpoint to fetch Twilio ICE servers
app.get('/api/webrtc/ice-servers', isAuthenticated, async (req, res, next) => {
  try {

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ message: 'Twilio credentials not configured' });
    }
    const client = twilio(accountSid, authToken);
    const token = await client.tokens.create();
    // token.iceServers is an array of TURN/STUN server entries
    return res.json({ iceServers: token.iceServers || [] });
  } catch (err) {
    console.error('Twilio ICE fetch error:', err);
    return next(new CustomError('Failed to fetch ICE servers', 500));
  }
});

app.get('/test', (req, res) => {
  res.send('API is running...');
});

// 404 handler
app.all('*', (req, res, next) => {
  next(new CustomError(`${req.originalUrl} not found`, 404));
});

// Global error handler
app.use(errorHandler);

//setup socket in production
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman, mobile apps, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH"],
    transports: ["websocket", "polling"],
  },
});

// Setup Socket.IO in development mode
// const io = new Server(httpServer, {
//   cors: {
//     origin: (origin, callback) => {
//       if (!origin) return callback(null, true);
//       if (allowedOrigins.includes(origin) || origin.endsWith('.ngrok-free.app')) {
//         return callback(null, true);
//       }
//       callback(new Error('Not allowed by CORS'));
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PATCH'],
//     transports: ['websocket', 'polling']
//   }
// });

setupChatSocket(io);
setupWebRTCSocket(io);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Server start error:', err);
    process.exit(1);
  }
};

startServer();
