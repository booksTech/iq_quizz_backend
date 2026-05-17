const express = require('express');
const { createOrGetChatRoom, listChatRooms, resolveChatRoomByCode } = require('../controllers/chatRoomController');
const { requireRole, verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, listChatRooms);
router.get('/resolve/:roomCode', verifyToken, resolveChatRoomByCode);
router.post('/', verifyToken, requireRole('admin'), createOrGetChatRoom);

module.exports = router;
