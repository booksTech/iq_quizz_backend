const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const DATABASE_NAME = 'iq-quizz-v1';

const withDatabaseName = (uri) => {
  const fallbackUri = `mongodb://localhost:27017/${DATABASE_NAME}`;
  const rawUri = uri || fallbackUri;

  try {
    const parsed = new URL(rawUri);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = `/${DATABASE_NAME}`;
    }
    return parsed.toString();
  } catch {
    return rawUri;
  }
};

const MONGODB_URI = withDatabaseName(process.env.MONGODB_URI);

async function ensureTtlIndex(collection, key, options) {
  const indexName = options.name || Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join('_');
  const indexes = await collection.indexes();
  const existing = indexes.find((index) => index.name === indexName);

  if (existing && existing.expireAfterSeconds !== options.expireAfterSeconds) {
    await collection.dropIndex(indexName);
  }

  await collection.createIndex(key, options);
}

// ==================== SCHEMAS ====================

/**
 * User Schema - passwords are HASHED and never stored in plaintext
 */
const userSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
  first_name: { type: String, default: '' },
  last_name: { type: String, default: '' },
  profile_picture_url: { type: String, default: null },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_login: { type: Date, default: null },
}, { _id: false });

/**
 * Refresh Token Schema - for token tracking and revocation
 */
const refreshTokenSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true, index: true },
  created_at: { type: Date, default: Date.now },
  is_revoked: { type: Boolean, default: false, index: true },
}, { _id: false });

/**
 * Password Reset Token Schema
 */
const passwordResetTokenSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, required: true, index: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true, index: true },
  used_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * User Session Schema - for multi-device session tracking
 */
const userSessionSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, required: true, index: true },
  device_name: { type: String, default: 'Unknown' },
  device_id: { type: String, default: '' },
  ip_address: { type: String, default: '' },
  user_agent: { type: String, default: '' },
  last_activity: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true, index: true },
  created_at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * Quiz Schema
 */
const quizSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: '' },
  difficulty_level: { type: String, default: 'medium', enum: ['easy', 'medium', 'hard'] },
  total_questions: { type: Number, default: 0 },
  time_limit_minutes: { type: Number, default: 0 },
  created_by: { type: String, required: true, index: true },
  is_published: { type: Boolean, default: false, index: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * Quiz Result Schema
 */
const quizResultSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, required: true, index: true },
  quiz_id: { type: String, required: true, index: true },
  score: { type: Number, default: 0 },
  total_questions: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  time_taken_minutes: { type: Number, default: 0 },
  completed_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * Chat Room Schema
 */
const chatRoomSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  room_code: { type: String, unique: true, sparse: true, index: true },
  participant_ids: [{ type: String, required: true }],
  participant_emails: [{ type: String, required: true }],
  participant_key: { type: String, required: true, unique: true, index: true },
  created_by: { type: String, required: true, index: true },
  is_active: { type: Boolean, default: true, index: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * Message Schema
 */
const messageSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  room_id: { type: String, required: true, index: true },
  sender_id: { type: String, required: true, index: true },
  sender_email: { type: String, required: true },
  text: { type: String, default: '' },
  emoji: { type: String, default: '' },
  gif_url: { type: String, default: '' },
  attachments: [{
    id: { type: String, default: uuidv4 },
    name: { type: String, required: true },
    type: { type: String, enum: ['image', 'audio', 'voice', 'gif', 'file'], default: 'file' },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mime_type: { type: String, default: '' },
  }],
  reply_to: { type: String, default: null, index: true },
  link_preview: {
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    siteName: { type: String, default: '' },
  },
  location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    label: { type: String, default: '' },
  },
  read_by: [{
    user_id: { type: String, required: true },
    email: { type: String, default: '' },
    read_at: { type: Date, default: Date.now },
  }],
  is_deleted: { type: Boolean, default: false, index: true },
  deleted_at: { type: Date, default: null },
  expires_at: { type: Date, default: null, index: true },
  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
}, { _id: false });

// ==================== MODELS ====================

const User = mongoose.model('User', userSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
const UserSession = mongoose.model('UserSession', userSessionSchema);
const Quiz = mongoose.model('Quiz', quizSchema);
const QuizResult = mongoose.model('QuizResult', quizResultSchema);
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
const Message = mongoose.model('Message', messageSchema);

// ==================== DATABASE INITIALIZATION ====================

/**
 * Initialize MongoDB connection
 */
async function initDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB at:', MONGODB_URI);

    // Create indexes
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await RefreshToken.collection.createIndex({ token: 1 }, { unique: true });
    await ensureTtlIndex(RefreshToken.collection, { expires_at: 1 }, { name: 'expires_at_1', expireAfterSeconds: 0 });
    await PasswordResetToken.collection.createIndex({ token_hash: 1 }, { unique: true });
    await ensureTtlIndex(PasswordResetToken.collection, { expires_at: 1 }, { name: 'expires_at_1', expireAfterSeconds: 0 });
    await ChatRoom.collection.createIndex({ participant_key: 1 }, { unique: true });
    await ChatRoom.collection.createIndex({ room_code: 1 }, { unique: true, sparse: true });
    await Message.collection.createIndex({ room_id: 1, created_at: -1 });
    await Message.collection.createIndex({ room_id: 1, 'read_by.user_id': 1 });
    await ensureTtlIndex(Message.collection, { expires_at: 1 }, { name: 'expires_at_1', expireAfterSeconds: 0 });
    
    console.log('✅ Database indexes created');
    return mongoose;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
async function closeDB() {
  try {
    await mongoose.disconnect();
    console.log('🛑 Database connection closed');
  } catch (error) {
    console.error('Error closing database:', error);
    throw error;
  }
}

// ==================== EXPORTS ====================

module.exports = {
  initDatabase,
  closeDB,
  // Models
  User,
  RefreshToken,
  PasswordResetToken,
  UserSession,
  Quiz,
  QuizResult,
  ChatRoom,
  Message,
  // Mongoose connection
  mongoose,
};
