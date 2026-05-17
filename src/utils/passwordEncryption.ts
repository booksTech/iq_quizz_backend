const crypto = require('crypto');

const privateKeyFromEnv = process.env.PASSWORD_ENCRYPTION_PRIVATE_KEY_BASE64
  ? Buffer.from(process.env.PASSWORD_ENCRYPTION_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  : process.env.PASSWORD_ENCRYPTION_PRIVATE_KEY;

const keyPair = privateKeyFromEnv
  ? crypto.createPrivateKey(privateKeyFromEnv)
  : crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

const privateKey = privateKeyFromEnv ? keyPair : keyPair.privateKey;
const publicKey = privateKeyFromEnv
  ? crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })
  : keyPair.publicKey;

function decryptPasswordValue(encryptedValue) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedValue, 'base64')
  ).toString('utf8');
}

function decryptPasswordFields(body) {
  const next = { ...body };

  if (body.passwordEncrypted) {
    next.password = decryptPasswordValue(body.passwordEncrypted);
    delete next.passwordEncrypted;
  }

  if (body.confirmPasswordEncrypted) {
    next.confirmPassword = decryptPasswordValue(body.confirmPasswordEncrypted);
    delete next.confirmPasswordEncrypted;
  }

  return next;
}

function getPublicPasswordKey() {
  return {
    algorithm: 'RSA-OAEP-256',
    publicKey,
  };
}

module.exports = {
  decryptPasswordFields,
  getPublicPasswordKey,
};
