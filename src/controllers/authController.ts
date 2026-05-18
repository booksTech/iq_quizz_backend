const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { User, RefreshToken, PasswordResetToken, UserSession, PushToken } = require('../db/database');
const jwtService = require('../utils/jwt');
const passwordService = require('../utils/password');
const {
  decryptPasswordFields,
  getPublicPasswordKey,
} = require('../utils/passwordEncryption');
const {
  firstZodMessage,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} = require('../validation/schemas');

const DEFAULT_ROLE = 'user';

function buildAuthPayload(user) {
  return {
    userId: user._id,
    username: user.username,
    email: user.email,
    role: user.role || DEFAULT_ROLE,
  };
}

function generateAuthTokens(payload) {
  return {
    accessToken: jwtService.generateToken({ ...payload, tokenId: uuidv4() }),
    refreshToken: jwtService.generateRefreshToken({ ...payload, tokenId: uuidv4() }),
  };
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sendPasswordDecryptError(res) {
  return res.status(400).json({
    success: false,
    message: 'Could not read encrypted password. Please reload and try again.',
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function passwordKey(req, res) {
  return res.json({
    success: true,
    data: getPublicPasswordKey(),
  });
}

/**
 * Register new user
 * POST /auth/register
 */
async function register(req, res) {
  try {
    let requestBody;
    try {
      requestBody = decryptPasswordFields(req.body);
    } catch {
      return sendPasswordDecryptError(res);
    }

    const parsed = registerSchema.safeParse(requestBody);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Missing required fields'),
        issues: parsed.error.issues,
      });
    }

    const {
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      deviceName,
      deviceId,
    } = parsed.data;

    // Check password strength
    const passwordValidation = passwordService.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
        requirements: passwordValidation.requirements,
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists',
      });
    }

    // Hash password - NEVER store plaintext
    const passwordHash = await passwordService.hashPassword(password);

    // Create user
    const userId = uuidv4();
    const newUser = new User({
      _id: userId,
      username: normalizedUsername,
      email: normalizedEmail,
      role: DEFAULT_ROLE,
      password_hash: passwordHash,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
    });

    await newUser.save();

    // Generate tokens
    const payload = buildAuthPayload(newUser);
    const { accessToken, refreshToken } = generateAuthTokens(payload);

    // Save refresh token
    const refreshTokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const newRefreshToken = new RefreshToken({
      _id: refreshTokenId,
      user_id: userId,
      token: refreshToken,
      expires_at: expiresAt,
    });

    await newRefreshToken.save();

    // Create session so registration and login return the same auth contract.
    const sessionId = uuidv4();
    const sessionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newSession = new UserSession({
      _id: sessionId,
      user_id: userId,
      device_name: deviceName,
      device_id: deviceId,
      ip_address: req.ip || '',
      user_agent: req.get('user-agent') || '',
      expires_at: sessionExpires,
    });

    await newSession.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId,
        username: normalizedUsername,
        email: normalizedEmail,
        role: newUser.role,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        accessToken,
        refreshToken,
        sessionId,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
}

/**
 * Login user
 * POST /auth/login
 */
async function login(req, res) {
  try {
    let requestBody;
    try {
      requestBody = decryptPasswordFields(req.body);
    } catch {
      return sendPasswordDecryptError(res);
    }

    const parsed = loginSchema.safeParse(requestBody);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Username and password required'),
        issues: parsed.error.issues,
      });
    }

    const {
      username: normalizedUsername,
      password,
      deviceName,
      deviceId,
    } = parsed.data;

    // Let the login field accept either username or email, without case surprises.
    const loginIdentifier = normalizedUsername.trim();
    const exactIdentifier = new RegExp(`^${escapeRegExp(loginIdentifier)}$`, 'i');
    const userQuery = loginIdentifier.includes('@')
      ? { email: exactIdentifier }
      : { username: exactIdentifier };
    const user = await User.findOne(userQuery);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive',
      });
    }

    // Verify password
    const passwordMatch = await passwordService.comparePassword(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Update last login
    user.last_login = new Date();
    await user.save();

    // Generate tokens
    const payload = buildAuthPayload(user);
    const { accessToken, refreshToken } = generateAuthTokens(payload);

    // Save refresh token
    const refreshTokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const newRefreshToken = new RefreshToken({
      _id: refreshTokenId,
      user_id: user._id,
      token: refreshToken,
      expires_at: expiresAt,
    });

    await newRefreshToken.save();

    // Create session
    const sessionId = uuidv4();
    const sessionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newSession = new UserSession({
      _id: sessionId,
      user_id: user._id,
      device_name: deviceName,
      device_id: deviceId,
      ip_address: req.ip || '',
      user_agent: req.get('user-agent') || '',
      expires_at: sessionExpires,
    });

    await newSession.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role || DEFAULT_ROLE,
        firstName: user.first_name,
        lastName: user.last_name,
        accessToken,
        refreshToken,
        sessionId,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
}

/**
 * Refresh access token
 * POST /auth/refresh
 */
async function refreshToken(req, res) {
  try {
    const parsed = refreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Refresh token required'),
        issues: parsed.error.issues,
      });
    }

    const { refreshToken } = parsed.data;

    // Verify refresh token structure/signature first.
    jwtService.verifyToken(refreshToken);

    // Check if token exists in database and not revoked
    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
      is_revoked: false,
      expires_at: { $gt: new Date() },
    });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    const user = await User.findById(storedToken.user_id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive',
      });
    }

    user.updated_at = new Date();
    await user.save();

    // Generate new access token from the current DB user, not stale token claims.
    const payload = {
      userId: user._id,
      username: user.username,
      email: user.email,
      role: user.role || DEFAULT_ROLE,
    };
    const newAccessToken = jwtService.generateToken({ ...payload, tokenId: uuidv4() });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        user: {
          userId: user._id,
          username: user.username,
          email: user.email,
          role: user.role || DEFAULT_ROLE,
          firstName: user.first_name,
          lastName: user.last_name,
          profilePictureUrl: user.profile_picture_url,
        },
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
    });
  }
}

async function registerPushToken(req, res) {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const platform = ['ios', 'android', 'web'].includes(req.body?.platform) ? req.body.platform : 'unknown';
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';

    if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Expo push token required',
      });
    }

    const now = new Date();
    await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          user_id: req.user.userId,
          platform,
          device_id: deviceId,
          is_active: true,
          updated_at: now,
          last_used_at: now,
        },
        $setOnInsert: {
          _id: uuidv4(),
          created_at: now,
        },
      },
      { upsert: true, new: true }
    );

    console.log('Push token registered:', {
      userId: req.user.userId,
      platform,
      tokenPrefix: token.slice(0, 22),
    });

    return res.json({
      success: true,
      message: 'Push token registered',
    });
  } catch (error) {
    console.error('Register push token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register push token',
    });
  }
}

async function unregisterPushToken(req, res) {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Push token required',
      });
    }

    await PushToken.updateOne(
      { token, user_id: req.user.userId },
      { is_active: false, updated_at: new Date() }
    );

    return res.json({
      success: true,
      message: 'Push token unregistered',
    });
  } catch (error) {
    console.error('Unregister push token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to unregister push token',
    });
  }
}

async function forgotPassword(req, res) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Invalid email format'),
        issues: parsed.error.issues,
      });
    }

    const user = await User.findOne({ email: parsed.data.email });
    const genericMessage = 'If that email is registered, a password reset token has been created.';

    if (!user || !user.is_active) {
      return res.json({ success: true, message: genericMessage });
    }

    await PasswordResetToken.updateMany(
      { user_id: user._id, used_at: null },
      { used_at: new Date() }
    );

    const token = crypto.randomBytes(32).toString('hex');
    const resetToken = new PasswordResetToken({
      _id: uuidv4(),
      user_id: user._id,
      token_hash: hashResetToken(token),
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    });

    await resetToken.save();

    return res.json({
      success: true,
      message: genericMessage,
      data: {
        expiresInMinutes: 15,
      },
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to request password reset',
    });
  }
}

async function resetPassword(req, res) {
  try {
    let requestBody;
    try {
      requestBody = decryptPasswordFields(req.body);
    } catch {
      return sendPasswordDecryptError(res);
    }

    const parsed = resetPasswordSchema.safeParse(requestBody);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Invalid password reset request'),
        issues: parsed.error.issues,
      });
    }

    const { token, password } = parsed.data;
    const passwordValidation = passwordService.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
        requirements: passwordValidation.requirements,
      });
    }

    const resetToken = await PasswordResetToken.findOne({
      token_hash: hashResetToken(token),
      used_at: null,
      expires_at: { $gt: new Date() },
    });

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is invalid or expired',
      });
    }

    const user = await User.findById(resetToken.user_id);
    if (!user || !user.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is invalid or expired',
      });
    }

    user.password_hash = await passwordService.hashPassword(password);
    user.updated_at = new Date();
    await user.save();

    resetToken.used_at = new Date();
    await resetToken.save();

    await RefreshToken.updateMany({ user_id: user._id }, { is_revoked: true });
    await UserSession.deleteMany({ user_id: user._id });

    return res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
}

/**
 * Logout user
 * POST /auth/logout
 */
async function logout(req, res) {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Invalid logout request'),
        issues: parsed.error.issues,
      });
    }

    const { refreshToken, sessionId } = parsed.data;

    if (refreshToken) {
      await RefreshToken.updateOne(
        { token: refreshToken },
        { is_revoked: true }
      );
    }

    if (sessionId) {
      await UserSession.deleteOne({ _id: sessionId });
    }

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
}

/**
 * Get user profile
 * GET /auth/profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select('-password_hash');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || DEFAULT_ROLE,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_picture_url: user.profile_picture_url,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
    });
  }
}

/**
 * Update user profile
 * PUT /auth/profile
 */
async function updateProfile(req, res) {
  try {
    const userId = req.user.userId;
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Invalid profile update'),
        issues: parsed.error.issues,
      });
    }

    const { firstName, lastName, profilePictureUrl } = parsed.data;

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (profilePictureUrl) updateData.profile_picture_url = profilePictureUrl;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password_hash');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || DEFAULT_ROLE,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_picture_url: user.profile_picture_url,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
}

module.exports = {
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
  unregisterPushToken,
};
