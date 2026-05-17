# IQ Quizz Backend - Developer Guide

## 📋 Project Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── authController.js       # Authentication business logic
│   ├── routes/
│   │   └── authRoutes.js           # API route definitions
│   ├── middleware/
│   │   └── auth.js                 # JWT verification & error handling
│   ├── db/
│   │   └── database.js             # Mongoose schemas & connection
│   ├── utils/
│   │   ├── jwt.js                  # JWT token utilities
│   │   ├── password.js             # Password hashing & validation
│   │   └── encryption.js           # AES-256 encryption utilities
│   └── index.js                    # Express server entry point
├── .env.example                    # Environment template
├── SECURITY.md                     # Security documentation
├── package.json                    # Dependencies
└── DEVELOPER_GUIDE.md              # This file
```

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 14+
- MongoDB 4.4+
- npm or yarn

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Environment Setup
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Key Variables:**
```
PORT=3000                           # Server port
NODE_ENV=development                # Environment
JWT_SECRET=<your-secret-key>        # JWT signing key (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_EXPIRE=7d                       # Token expiry
ENCRYPTION_KEY=<32-char-key>        # Encryption key (generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
MONGODB_URI=mongodb://localhost:27017/iq-quizz-v1  # Local MongoDB
CORS_ORIGIN=http://localhost:19000  # Expo dev client
```

### 4. Database Setup

#### Option A: Local MongoDB
```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify
mongosh
show dbs
exit

# If not running:
brew services start mongodb-community
```

#### Option B: MongoDB Atlas (Cloud)
1. Visit https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create cluster
4. Get connection string
5. Update MONGODB_URI in .env

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/iq-quizz-v1?retryWrites=true&w=majority
```

### 5. Start Development Server
```bash
npm run dev

# You should see:
# ✅ Connected to MongoDB at: mongodb://localhost:27017/iq-quizz-v1
# 🚀 Server running on http://localhost:3000
```

## 📚 Database Schema

### Collections (Auto-created)

**users**
```javascript
{
  _id: "uuid",
  username: "string (unique)",
  email: "string (unique)",
  password_hash: "bcrypt hash",
  first_name: "string",
  last_name: "string",
  profile_picture_url: "string",
  is_active: true,
  created_at: Date,
  updated_at: Date,
  last_login: Date
}
```

**refreshtokens**
```javascript
{
  _id: "uuid",
  user_id: "uuid",
  token: "jwt string (unique)",
  expires_at: Date,
  is_revoked: false,
  created_at: Date
}
```

**usersessions**
```javascript
{
  _id: "uuid",
  user_id: "uuid",
  device_name: "string",
  device_id: "string",
  ip_address: "string",
  user_agent: "string",
  expires_at: Date,
  created_at: Date
}
```

**quizzes** & **quizresults** (ready for expansion)

## 🔍 MongoDB Queries

### Common Operations in Code

```javascript
// Import models
const { User, RefreshToken, UserSession } = require('./src/db/database');

// Find user
const user = await User.findOne({ username: 'john' });

// Find by ID
const user = await User.findById(userId);

// Find with conditions
const users = await User.find({ is_active: true });

// Update
await User.updateOne({ _id: userId }, { last_name: 'Smith' });

// Update and return
const user = await User.findByIdAndUpdate(
  userId,
  { last_name: 'Smith' },
  { new: true }
);

// Delete
await User.deleteOne({ _id: userId });

// Count
const count = await User.countDocuments();

// With conditions ($or, $and, etc)
const users = await User.find({
  $or: [{ username: 'john' }, { email: 'john@example.com' }]
});

// Exclude fields
const user = await User.findById(userId).select('-password_hash');
```

### Query with MongoDB CLI

```bash
# Connect
mongosh

# Show databases
show dbs

# Use database
use iq-quizz-v1

# Show collections
show collections

# Count users
db.users.countDocuments()

# Find user
db.users.findOne({ username: 'john' })

# Find all
db.users.find()

# Update
db.users.updateOne({ _id: ObjectId('...') }, { $set: { last_name: 'Smith' } })

# Delete
db.users.deleteOne({ _id: ObjectId('...') })

# Create index
db.users.createIndex({ email: 1 }, { unique: true })

# Exit
exit
```

## 🛠️ Development Tasks

### Adding New Endpoints

1. **Create Controller Method** (`src/controllers/`)
```javascript
async function newEndpoint(req, res) {
  try {
    // Logic here
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
```

2. **Add Route** (`src/routes/authRoutes.js`)
```javascript
router.post('/new-endpoint', verifyToken, newEndpoint);
```

3. **Export Controller** in `src/controllers/index.js`

### Extending Database Schema

1. **Update Schema** in `src/db/database.js`
```javascript
const newSchema = new Schema({
  field1: String,
  field2: { type: Number, default: 0 },
  // ...
});

const NewModel = mongoose.model('NewCollection', newSchema);
module.exports = { NewModel };
```

2. **Create Index** (in `initDatabase()`)
```javascript
await NewModel.collection.createIndex({ field1: 1 });
```

## 🧪 Testing

### Test Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPassword123!",
    "confirmPassword": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPassword123!"
  }'
```

Save the returned `accessToken` and use it:

### Test Protected Endpoint
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer <accessToken>"
```

## 🐛 Debugging

### Enable Debug Logs
```bash
# Mongoose debugging
NODE_DEBUG=mongoose npm run dev

# All debugging
DEBUG=* npm run dev
```

### Check MongoDB Logs
```bash
# macOS
tail -f /usr/local/var/log/mongodb/mongo.log

# Linux
sudo journalctl -u mongod -f
```

### Test Database Connection
```javascript
// In src/index.ts or anywhere
const mongoose = require('mongoose');
async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}
test();
```

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.2 | Web framework |
| mongoose | 7.5.0 | MongoDB ODM |
| jsonwebtoken | 9.0.0 | JWT tokens |
| bcryptjs | 2.4.3 | Password hashing |
| helmet | 7.0.0 | Security headers |
| cors | 2.8.5 | CORS middleware |
| uuid | 9.0.0 | UUID generation |
| dotenv | 16.3.1 | Environment variables |
| nodemon | 3.0.1 | Auto-reload (dev) |

## 🚀 Production Deployment

### Environment Setup
```bash
# .env.production
NODE_ENV=production
PORT=3000
JWT_SECRET=<strong-random-secret>
ENCRYPTION_KEY=<strong-random-key>
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/iq-quizz-v1
CORS_ORIGIN=https://yourdomain.com
```

### Deploy to Heroku
```bash
# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=<secret>
heroku config:set ENCRYPTION_KEY=<key>
heroku config:set MONGODB_URI=<atlas-uri>

# Deploy
git push heroku main
```

### Deploy to AWS/GCP
- Use Node.js runtime
- Set environment variables in deployment
- Use MongoDB Atlas for database
- Enable HTTPS
- Set up CloudFront for CDN

## 📞 Support

For issues or questions:
1. Check logs: `npm run dev`
2. Verify MongoDB is running: `brew services list`
3. Test connection: `mongosh`
4. Check MONGODB_URI in .env
5. See MONGODB_SETUP.md for detailed setup

## 📚 Resources

- [Express.js Docs](https://expressjs.com)
- [Mongoose Docs](https://mongoosejs.com)
- [MongoDB Docs](https://docs.mongodb.com)
- [JWT Docs](https://jwt.io)
- [Bcryptjs Docs](https://github.com/dcodeIO/bcrypt.js)
- [Helmet Docs](https://helmetjs.github.io)
