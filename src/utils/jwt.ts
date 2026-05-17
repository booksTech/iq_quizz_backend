const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

class JWTService {
  secret: string;
  expiresIn: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'your-super-secret-key-change-this';
    this.expiresIn = process.env.JWT_EXPIRE || '7d';
  }

  /**
   * Generate JWT token
   * @param {Object} payload - Token payload
   * @returns {string} - JWT token
   */
  generateToken(payload) {
    try {
      return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
    } catch (error) {
      console.error('Token generation error:', error);
      throw new Error('Failed to generate token');
    }
  }

  /**
   * Generate refresh token (longer expiry)
   * @param {Object} payload - Token payload
   * @returns {string} - Refresh token
   */
  generateRefreshToken(payload) {
    try {
      return jwt.sign(payload, this.secret, { expiresIn: '30d' });
    } catch (error) {
      console.error('Refresh token generation error:', error);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Verify and decode token
   * @param {string} token - JWT token
   * @returns {Object} - Decoded payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Decode token without verification (use carefully)
   * @param {string} token - JWT token
   * @returns {Object} - Decoded payload
   */
  decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = new JWTService();
