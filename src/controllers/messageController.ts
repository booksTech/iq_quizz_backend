const { v4: uuidv4 } = require('uuid');
const { ChatRoom, Message } = require('../db/database');
const { firstZodMessage, sendMessageSchema } = require('../validation/schemas');
const { notifyRoomMessage } = require('../utils/pushNotifications');

const urlPattern = /(https?:\/\/[^\s]+)/i;
const READ_DELETE_DELAY_MS = 3 * 60 * 1000;

const isRoomParticipant = (room, userId) => room?.participant_ids?.includes(userId);

const createHttpError = (message, statusCode, issues = undefined) => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  error.issues = issues;
  return error;
};

const serializeAttachment = (attachment) => ({
  id: attachment.id,
  name: attachment.name,
  type: attachment.type,
  url: attachment.url,
  size: attachment.size,
  mimeType: attachment.mime_type,
});

const serializeReadReceipt = (receipt) => ({
  userId: receipt.user_id,
  email: receipt.email,
  readAt: receipt.read_at,
});

const serializeMessage = (message) => {
  if (message.is_deleted) {
    return {
      id: message._id,
      roomId: message.room_id,
      senderId: message.sender_id,
      senderEmail: message.sender_email,
      isDeleted: true,
      deletedAt: message.deleted_at,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
      expiresAt: message.expires_at,
      readBy: (message.read_by || []).map(serializeReadReceipt),
      text: 'This message is deleted.',
      attachments: [],
    };
  }

  return {
    id: message._id,
    roomId: message.room_id,
    senderId: message.sender_id,
    senderEmail: message.sender_email,
    text: message.text,
    emoji: message.emoji,
    gifUrl: message.gif_url,
    attachments: (message.attachments || []).map(serializeAttachment),
    replyTo: message.reply_to,
    linkPreview: message.link_preview,
    location: message.location,
    isDeleted: false,
    deletedAt: message.deleted_at,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
    expiresAt: message.expires_at,
    readBy: (message.read_by || []).map(serializeReadReceipt),
  };
};

const scheduleReadDeletion = (io, roomId, messageIds, delayMs = READ_DELETE_DELAY_MS) => {
  if (!io || !messageIds?.length) return;

  setTimeout(async () => {
    try {
      const deleteAt = new Date();
      const result = await Message.deleteMany({
        _id: { $in: messageIds },
        room_id: roomId,
        expires_at: { $lte: deleteAt },
      });

      if (result.deletedCount) {
        io.to(roomId).emit('message:removed', { roomId, messageIds });
      }
    } catch (error) {
      console.error('Scheduled message removal error:', error);
    }
  }, delayMs);
};

const readMeta = (html, property) => {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return '';
};

async function buildLinkPreview(text) {
  const url = text.match(urlPattern)?.[1];
  if (!url) return undefined;

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(2500),
      headers: { 'user-agent': 'IQ-Quizz-LinkPreview/1.0' },
    });
    const html = await response.text();
    const title = readMeta(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || url;

    return {
      url,
      title,
      description: readMeta(html, 'og:description') || readMeta(html, 'description'),
      image: readMeta(html, 'og:image'),
      siteName: readMeta(html, 'og:site_name'),
    };
  } catch {
    return { url, title: url, description: '', image: '', siteName: '' };
  }
}

async function listMessages(req, res) {
  try {
    const { roomId } = req.params;
    const room = await ChatRoom.findById(roomId);

    if (!room || !isRoomParticipant(room, req.user.userId)) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    await Message.deleteMany({ room_id: roomId, expires_at: { $lte: new Date() } });

    const messages = await Message.find({
      room_id: roomId,
      $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }],
    }).sort({ created_at: 1 }).limit(200);

    return res.json({
      success: true,
      data: messages.map(serializeMessage),
    });
  } catch (error) {
    console.error('List messages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load messages',
    });
  }
}

async function createMessage(roomId, user, payload) {
  const parsed = sendMessageSchema.safeParse(payload);
  if (!parsed.success) {
    throw createHttpError(firstZodMessage(parsed, 'Invalid message'), 400, parsed.error.issues);
  }

  const room = await ChatRoom.findById(roomId);
  if (!room || !isRoomParticipant(room, user.userId)) {
    throw createHttpError('Chat room not found', 404);
  }

  const data = parsed.data;
  const linkPreview = await buildLinkPreview(data.text);
  const now = new Date();
  const message = new Message({
    _id: uuidv4(),
    room_id: roomId,
    sender_id: user.userId,
    sender_email: user.email,
    text: data.text,
    emoji: data.emoji,
    gif_url: data.gifUrl,
    attachments: data.attachments.map((attachment) => ({
      id: attachment.id || uuidv4(),
      name: attachment.name,
      type: attachment.type,
      url: attachment.url,
      size: attachment.size,
      mime_type: attachment.mimeType,
    })),
    reply_to: data.replyTo,
    link_preview: linkPreview,
    location: data.location,
    read_by: [{
      user_id: user.userId,
      email: user.email,
      read_at: now,
    }],
    created_at: now,
    updated_at: now,
  });

  await message.save();
  return serializeMessage(message);
}

async function markMessagesReadByUser(roomId, user, throughMessageId = '') {
  const room = await ChatRoom.findById(roomId);
  if (!room || !isRoomParticipant(room, user.userId)) {
    throw createHttpError('Chat room not found', 404);
  }

  const query: any = {
    room_id: roomId,
    sender_id: { $ne: user.userId },
    is_deleted: false,
    read_by: { $not: { $elemMatch: { user_id: user.userId } } },
  };

  if (throughMessageId) {
    const throughMessage = await Message.findOne({ _id: throughMessageId, room_id: roomId });
    if (throughMessage) {
      query.created_at = { $lte: throughMessage.created_at };
    }
  }

  const unreadMessages = await Message.find(query).select('_id');
  if (!unreadMessages.length) {
    return { roomId, messageIds: [], reader: { userId: user.userId, email: user.email }, readAt: new Date() };
  }

  const readAt = new Date();
  const expiresAt = new Date(readAt.getTime() + READ_DELETE_DELAY_MS);
  const messageIds = unreadMessages.map((message) => message._id);

  await Message.updateMany(
    { _id: { $in: messageIds } },
    {
      $push: {
        read_by: {
          user_id: user.userId,
          email: user.email,
          read_at: readAt,
        },
      },
      $set: { updated_at: readAt, expires_at: expiresAt },
    }
  );

  return {
    roomId,
    messageIds,
    reader: {
      userId: user.userId,
      email: user.email,
    },
    readAt,
    expiresAt,
    deleteDelayMs: READ_DELETE_DELAY_MS,
  };
}

async function markMessagesRead(req, res) {
  try {
    const receipt = await markMessagesReadByUser(req.params.roomId, req.user, req.body?.throughMessageId || '');
    if (receipt.messageIds.length) {
      const io = req.app.get('io');
      io?.to(req.params.roomId).emit('message:read', receipt);
      scheduleReadDeletion(io, req.params.roomId, receipt.messageIds, receipt.deleteDelayMs);
    }

    return res.json({
      success: true,
      message: 'Messages marked as read',
      data: receipt,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to mark messages as read',
    });
  }
}

async function sendMessage(req, res) {
  try {
    const message = await createMessage(req.params.roomId, req.user, req.body);
    req.app.get('io')?.to(req.params.roomId).emit('message:new', message);
    notifyRoomMessage(message);

    return res.status(201).json({
      success: true,
      message: 'Message sent',
      data: message,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to send message',
      issues: error.issues,
    });
  }
}

async function deleteMessageById(roomId, messageId, user) {
  const message = await Message.findOne({ _id: messageId, room_id: roomId });
  if (!message) {
    throw createHttpError('Message not found', 404);
  }

  if (message.sender_id !== user.userId && user.role !== 'admin') {
    throw createHttpError('You can only delete your own messages', 403);
  }

  message.is_deleted = true;
  message.deleted_at = new Date();
  message.updated_at = new Date();
  message.text = '';
  message.emoji = '';
  message.gif_url = '';
  message.attachments = [];
  message.link_preview = undefined;
  message.location = undefined;
  await message.save();

  return serializeMessage(message);
}

async function deleteMessage(req, res) {
  try {
    const message = await deleteMessageById(req.params.roomId, req.params.messageId, req.user);
    req.app.get('io')?.to(req.params.roomId).emit('message:deleted', message);

    return res.json({
      success: true,
      message: 'Message deleted',
      data: message,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete message',
    });
  }
}

async function clearMessages(req, res) {
  try {
    const { roomId } = req.params;
    const room = await ChatRoom.findById(roomId);

    if (!room || !isRoomParticipant(room, req.user.userId)) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    const result = await Message.deleteMany({ room_id: roomId });
    req.app.get('io')?.to(roomId).emit('messages:cleared', {
      roomId,
      clearedBy: {
        userId: req.user.userId,
        email: req.user.email,
      },
      deletedCount: result.deletedCount || 0,
    });

    return res.json({
      success: true,
      message: 'Chat messages cleared',
      data: {
        roomId,
        deletedCount: result.deletedCount || 0,
      },
    });
  } catch (error) {
    console.error('Clear messages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear messages',
    });
  }
}

module.exports = {
  clearMessages,
  createMessage,
  deleteMessage,
  deleteMessageById,
  listMessages,
  markMessagesRead,
  markMessagesReadByUser,
  scheduleReadDeletion,
  serializeMessage,
  sendMessage,
};
