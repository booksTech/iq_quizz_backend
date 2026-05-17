const questions = require('../constants/questions');
const { checkAnswerSchema, firstZodMessage } = require('../validation/schemas');

const publicQuestion = ({ answer, ...question }) => question;

function getQuestions(req, res) {
  res.json({
    success: true,
    data: questions.map(publicQuestion),
  });
}

function checkAnswer(req, res) {
  const parsed = checkAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: firstZodMessage(parsed, 'Question ID and answer are required'),
      issues: parsed.error.issues,
    });
  }

  const { questionId, answer } = parsed.data;

  const question = questions.find((item) => item.id === questionId);

  if (!question) {
    return res.status(404).json({
      success: false,
      message: 'Question not found',
    });
  }

  const isCorrect = answer === question.answer;

  return res.json({
    success: true,
    data: {
      questionId,
      isCorrect,
      correctAnswer: isCorrect ? question.answer : null,
    },
  });
}

module.exports = {
  getQuestions,
  checkAnswer,
};
