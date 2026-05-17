const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

// Note: DO NOT store passwords encrypted here. 
// Passwords should ONLY be hashed with bcrypt and never encrypted/decrypted.
// This encryption utility is for OTHER sensitive data (emails, tokens backup, etc.)

class EncryptionService {
  encryptionKey: Buffer;
  algorithm: string;

  constructor() {
    // In production, use proper key management (AWS KMS, HashiCorp Vault, etc.)
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(String(process.env.ENCRYPTION_KEY || 'default-key-change-in-production'))
      .digest();
    
    this.algorithm = 'aes-256-cbc';
  }

  /**
   * Encrypt sensitive data (NOT passwords)
   * @param {string} text - Text to encrypt
   * @returns {string} - Encrypted data with IV prepended
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Prepend IV to encrypted data
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data (NOT passwords)
   * @param {string} encryptedData - Encrypted data with IV
   * @returns {string} - Decrypted text
   */
  decrypt(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Decryption failed');
    }
  }
}

module.exports = new EncryptionService();
