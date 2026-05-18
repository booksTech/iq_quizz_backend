const { Server } = require('socket.io');
const jwtService = require('./utils/jwt');
const { ChatRoom } = require('./db/database');
const {
  createMessage,
  deleteMessageById,
  markMessagesReadByUser,
  scheduleReadDeletion,
} = require('./controllers/messageController');
const { notifyRoomMessage } = require('./utils/pushNotifications');

function configureSockets(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('No token provided');
      socket.user = jwtService.verifyToken(token);
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:join', async ({ roomId }, ack) => {
      try {
        const room = await ChatRoom.findById(roomId);
        if (!room?.participant_ids?.includes(socket.user.userId)) {
          throw new Error('Chat room not found');
        }

        socket.join(roomId);
        ack?.({ success: true });
      } catch (error) {
        ack?.({ success: false, message: error.message });
      }
    });

    socket.on('room:leave', ({ roomId }) => {
      if (roomId) socket.leave(roomId);
    });

    socket.on('message:send', async ({ roomId, payload }, ack) => {
      try {
        const message = await createMessage(roomId, socket.user, payload);
        io.to(roomId).emit('message:new', message);
        notifyRoomMessage(message);
        ack?.({ success: true, data: message });
      } catch (error) {
        ack?.({
          success: false,
          message: error.message || 'Failed to send message',
          issues: error.issues,
        });
      }
    });

    socket.on('message:delete', async ({ roomId, messageId }, ack) => {
      try {
        const message = await deleteMessageById(roomId, messageId, socket.user);
        io.to(roomId).emit('message:deleted', message);
        ack?.({ success: true, data: message });
      } catch (error) {
        ack?.({ success: false, message: error.message || 'Failed to delete message' });
      }
    });

    socket.on('message:read', async ({ roomId, throughMessageId }, ack) => {
      try {
        const receipt = await markMessagesReadByUser(roomId, socket.user, throughMessageId || '');
        if (receipt.messageIds.length) {
          io.to(roomId).emit('message:read', receipt);
          scheduleReadDeletion(io, roomId, receipt.messageIds, receipt.deleteDelayMs);
        }
        ack?.({ success: true, data: receipt });
      } catch (error) {
        ack?.({ success: false, message: error.message || 'Failed to mark messages as read' });
      }
    });
  });

  return io;
}

module.exports = { configureSockets };
