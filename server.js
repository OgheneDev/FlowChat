import express from 'express'
import cors from 'cors'
import path from 'path';
import cookieParser from 'cookie-parser';

import { connectDB } from './src/lib/db.js';
import { authRouter } from './src/routes/auth.route.js';
import { messagesRouter } from './src/routes/messages.routes.js';
import { groupRouter } from './src/routes/group.routes.js'
import { chatRouter } from './src/routes/chat.routes.js';
import { searchRouter } from './src/routes/search.routes.js';
import { server, app } from './src/lib/socket.js';

const _dirname = path.resolve();

const PORT = process.env.PORT || 3000

// Configure CORS
app.use(cors({
    origin: [  
        'http://localhost:3000',
        'https://chat-app.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parsing middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser())

// Use routes
app.use('/api/auth', authRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/groups', groupRouter);
app.use('/api/chats', chatRouter);
app.use('/api/search', searchRouter)

server.listen(PORT, () => {
    console.log("Server is running on port: " + PORT)
    connectDB();
});