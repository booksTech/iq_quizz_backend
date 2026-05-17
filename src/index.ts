const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { initDatabase, closeDB } = require('./db/database');
const { errorHandler } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const chatRoomRoutes = require('./routes/chatRoomRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { configureSockets } = require('./socket');

// Load environment variables
dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;
const defaultCorsOrigins = [
  'http://localhost:19000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const isLocalNetworkOrigin = (origin) => {
  if (!origin) return true;

  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
};

// ==================== SECURITY MIDDLEWARE ====================
// Use helmet for security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin(origin, callback) {
    if (process.env.CORS_ORIGIN === '*') {
      callback(null, true);
      return;
    }

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean)
      : defaultCorsOrigins;

    if (allowedOrigins.includes(origin) || (!process.env.CORS_ORIGIN && isLocalNetworkOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ==================== BODY PARSER ====================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ==================== REQUEST LOGGING ====================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==================== ROUTES ====================
// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/chat-rooms', chatRoomRoutes);
app.use('/api/chat-rooms/:roomId/messages', messageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// ==================== ERROR HANDLING ====================
app.use(errorHandler);

// ==================== SERVER STARTUP ====================
async function startServer() {
  try {
    // Initialize MongoDB connection
    await initDatabase();
    console.log('Database initialized successfully');

    // Start Express server
    const io = configureSockets(httpServer, corsOptions);
    app.set('io', io);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 API Documentation:`);
      console.log(`   - Register: POST /api/auth/register`);
      console.log(`   - Login: POST /api/auth/login`);
      console.log(`   - Refresh Token: POST /api/auth/refresh`);
      console.log(`   - Get Profile: GET /api/auth/profile`);
      console.log(`   - Update Profile: PUT /api/auth/profile`);
      console.log(`   - Logout: POST /api/auth/logout`);
      console.log(`   - Questions: GET /api/questions`);
      console.log(`   - Check Answer: POST /api/questions/check-answer`);
      console.log(`   - Create/Get Chat Room: POST /api/chat-rooms`);
      console.log(`   - Messages: GET/POST /api/chat-rooms/:roomId/messages`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeDB();
  process.exit(0);
});

// Start server
startServer();

module.exports = app;
