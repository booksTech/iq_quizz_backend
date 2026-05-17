const { v4: uuidv4 } = require('uuid');
const { ChatRoom, User } = require('../db/database');
const { chatRoomSchema, firstZodMessage } = require('../validation/schemas');

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode() {
  let suffix = '';
  for (let index = 0; index < 6; index += 1) {
    suffix += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return `IQ-${suffix}`;
}

function normalizeRoomCode(value = '') {
  const compact = String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  if (compact.startsWith('IQ')) return `IQ-${compact.slice(2)}`;
  return `IQ-${compact}`;
}

async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = createRoomCode();
    const existing = await ChatRoom.exists({ room_code: roomCode });
    if (!existing) return roomCode;
  }

  return `IQ-${Date.now().toString(36).toUpperCase()}`;
}

const serializeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  role: user.role,
});

const serializeRoom = (room, participants = []) => ({
  id: room._id,
  roomCode: room.room_code,
  participantIds: room.participant_ids,
  participantEmails: room.participant_emails,
  participants: participants.map(serializeUser),
  createdBy: room.created_by,
  isActive: room.is_active,
  createdAt: room.created_at,
  updatedAt: room.updated_at,
});

async function findParticipantsByEmail(emails) {
  return User.find({ email: { $in: emails } }).select('-password_hash');
}

async function serializeRooms(rooms) {
  const participantIds = [...new Set(rooms.flatMap((room) => room.participant_ids || []))];
  const users = await User.find({ _id: { $in: participantIds } }).select('-password_hash');
  const usersById = new Map(users.map((user) => [user._id, user]));

  return rooms.map((room) => serializeRoom(
    room,
    (room.participant_ids || []).map((id) => usersById.get(id)).filter(Boolean)
  ));
}

async function listChatRooms(req, res) {
  try {
    const query = req.user.role === 'admin'
      ? { is_active: true }
      : { is_active: true, participant_ids: req.user.userId };
    const rooms = await ChatRoom.find(query).sort({ updated_at: -1, created_at: -1 });

    return res.json({
      success: true,
      data: await serializeRooms(rooms),
    });
  } catch (error) {
    console.error('List chat rooms error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load chat rooms',
    });
  }
}

async function resolveChatRoomByCode(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    if (!roomCode || roomCode.length < 5) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found.',
        code: 'ROOM_NOT_FOUND',
      });
    }

    const room = await ChatRoom.findOne({ room_code: roomCode, is_active: true });
    if (!room || (req.user.role !== 'admin' && !room.participant_ids.includes(req.user.userId))) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found.',
        code: 'ROOM_NOT_FOUND',
      });
    }

    const serialized = await serializeRooms([room]);

    return res.json({
      success: true,
      message: 'Chat room found.',
      data: {
        room: serialized[0],
      },
    });
  } catch (error) {
    console.error('Resolve chat room error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to find chat room.',
      code: 'ROOM_LOOKUP_FAILED',
    });
  }
}

/**
 * Create or return an existing two-person chat room.
 * POST /api/chat-rooms
 */
async function createOrGetChatRoom(req, res) {
  try {
    const parsed = chatRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: firstZodMessage(parsed, 'Enter exactly two email addresses.'),
        code: 'INVALID_CHAT_ROOM_REQUEST',
        issues: parsed.error.issues,
      });
    }

    const uniqueEmails = parsed.data.emails;

    const participants = await findParticipantsByEmail(uniqueEmails);
    const foundEmails = participants.map((user) => user.email);
    const missingEmails = uniqueEmails.filter((email) => !foundEmails.includes(email));

    if (missingEmails.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more email addresses are not registered.',
        code: 'USERS_NOT_FOUND',
        details: { missingEmails },
      });
    }

    const inactiveEmails = participants
      .filter((user) => !user.is_active)
      .map((user) => user.email);

    if (inactiveEmails.length) {
      return res.status(409).json({
        success: false,
        message: 'One or more accounts are inactive.',
        code: 'INACTIVE_USERS',
        details: { inactiveEmails },
      });
    }

    const sortedParticipants = [...participants].sort((a, b) => a._id.localeCompare(b._id));
    const participantIds = sortedParticipants.map((user) => user._id);
    const participantEmails = sortedParticipants.map((user) => user.email);
    const participantKey = participantIds.join(':');

    const existingRoom = await ChatRoom.findOne({ participant_key: participantKey });
    if (existingRoom) {
      if (!existingRoom.room_code) {
        existingRoom.room_code = await generateUniqueRoomCode();
        existingRoom.updated_at = new Date();
        await existingRoom.save();
      }

      return res.json({
        success: true,
        message: 'A chat room already exists for these users.',
        data: {
          room: serializeRoom(existingRoom, sortedParticipants),
          existed: true,
        },
      });
    }

    const now = new Date();
    const room = new ChatRoom({
      _id: uuidv4(),
      room_code: await generateUniqueRoomCode(),
      participant_ids: participantIds,
      participant_emails: participantEmails,
      participant_key: participantKey,
      created_by: req.user.userId,
      created_at: now,
      updated_at: now,
    });

    await room.save();

    return res.status(201).json({
      success: true,
      message: 'Chat room created successfully.',
      data: {
        room: serializeRoom(room, sortedParticipants),
        existed: false,
      },
    });
  } catch (error) {
    console.error('Create chat room error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A chat room already exists for these users. Try again to load it.',
        code: 'ROOM_ALREADY_EXISTS',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create chat room.',
      code: 'CHAT_ROOM_CREATE_FAILED',
    });
  }
}

module.exports = {
  createOrGetChatRoom,
  listChatRooms,
  resolveChatRoomByCode,
};
