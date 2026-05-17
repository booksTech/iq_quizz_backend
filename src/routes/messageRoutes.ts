const express = require('express');
const { clearMessages, deleteMessage, listMessages, markMessagesRead, sendMessage } = require('../controllers/messageController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.get('/', verifyToken, listMessages);
router.post('/', verifyToken, sendMessage);
router.post('/read', verifyToken, markMessagesRead);
router.delete('/', verifyToken, clearMessages);
router.delete('/:messageId', verifyToken, deleteMessage);

module.exports = router;
