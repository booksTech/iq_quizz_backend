const bcrypt = require('bcryptjs');

class PasswordService {
  /**
   * Hash password using bcrypt
   * IMPORTANT: Passwords are HASHED, never encrypted or stored in plaintext
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  async hashPassword(password) {
    try {
      const saltRounds = 10; // Cost factor - higher = more secure but slower
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      return hashedPassword;
    } catch (error) {
      console.error('Password hashing error:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Compare plain password with hashed password
   * @param {string} plainPassword - Plain text password from user
   * @param {string} hashedPassword - Hashed password from database
   * @returns {Promise<boolean>} - True if passwords match
   */
  async comparePassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Password comparison error:', error);
      throw new Error('Failed to compare passwords');
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} - Validation result with isValid and message
   */
  validatePasswordStrength(password) {
    const requirements = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    const isValid = Object.values(requirements).every(req => req);
    const message = !isValid 
      ? 'Password must contain at least 8 characters, uppercase, lowercase, number, and special character'
      : 'Password is strong';

    return { isValid, requirements, message };
  }
}

module.exports = new PasswordService();
