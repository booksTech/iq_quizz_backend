const express = require('express');
const { 
  register, 
  login, 
  forgotPassword,
  resetPassword,
  refreshToken, 
  passwordKey,
  registerPushToken,
  logout,
  getProfile,
  updateProfile,
  unregisterPushToken
} = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshToken);
router.get('/password-key', passwordKey);

// Protected routes
router.post('/logout', verifyToken, logout);
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, updateProfile);
router.post('/push-token', verifyToken, registerPushToken);
router.delete('/push-token', verifyToken, unregisterPushToken);

module.exports = router;
