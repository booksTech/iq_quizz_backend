const express = require('express');
const { getQuestions, checkAnswer } = require('../controllers/questionController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, getQuestions);
router.post('/check-answer', verifyToken, checkAnswer);

module.exports = router;
