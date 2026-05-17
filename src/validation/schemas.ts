const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Invalid email format');
const optionalText = z.string().trim().optional().default('');

const registerSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  email,
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
  firstName: optionalText,
  lastName: optionalText,
  deviceName: z.string().trim().optional().default('Unknown'),
  deviceId: optionalText,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username and password required'),
  password: z.string().min(1, 'Username and password required'),
  deviceName: z.string().trim().optional().default('Unknown'),
  deviceId: optionalText,
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  sessionId: z.string().optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  profilePictureUrl: z.string().trim().url('Invalid profile picture URL').optional().or(z.literal('')),
});

const checkAnswerSchema = z.object({
  questionId: z.string().trim().min(1, 'Question ID and answer are required'),
  answer: z.string().min(1, 'Question ID and answer are required'),
});

const chatRoomSchema = z.object({
  emails: z.array(email).length(2, 'Enter exactly two email addresses.').optional(),
  emailOne: email.optional(),
  emailTwo: email.optional(),
}).transform((data) => ({
  emails: data.emails || [data.emailOne, data.emailTwo].filter(Boolean),
})).refine((data) => data.emails.length === 2, {
  message: 'Enter exactly two email addresses.',
  path: ['emails'],
}).refine((data) => new Set(data.emails).size === 2, {
  message: 'Choose two different registered users.',
  path: ['emails'],
});

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const attachmentUrl = z.string().trim().refine((value) => (
  /^https?:\/\//i.test(value) || /^data:[\w.+-]+\/[\w.+-]+;base64,/i.test(value)
), 'Attachment URL must be valid');

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Attachment name is required'),
  type: z.enum(['image', 'audio', 'voice', 'gif', 'file']).default('file'),
  url: attachmentUrl,
  size: z.number().nonnegative().max(MAX_ATTACHMENT_SIZE, 'Attachment size must be 5 MB or less'),
  mimeType: z.string().trim().optional().default(''),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().trim().optional().default(''),
});

const sendMessageSchema = z.object({
  text: z.string().trim().max(4000, 'Message is too long').optional().default(''),
  emoji: z.string().trim().max(32).optional().default(''),
  gifUrl: z.string().trim().url('GIF URL must be valid').optional().or(z.literal('')).default(''),
  attachments: z.array(attachmentSchema).max(6, 'You can share up to 6 attachments per message').optional().default([]),
  replyTo: z.string().trim().optional().nullable().default(null),
  location: locationSchema.optional().nullable().default(null),
}).refine((data) => (
  data.text
  || data.emoji
  || data.gifUrl
  || data.attachments.length
  || data.location
), {
  message: 'Message needs text, emoji, GIF, attachment, or location.',
});

function firstZodMessage(result, fallback) {
  return result.error?.issues?.[0]?.message || fallback;
}

module.exports = {
  chatRoomSchema,
  checkAnswerSchema,
  firstZodMessage,
  forgotPasswordSchema,
  sendMessageSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
};
