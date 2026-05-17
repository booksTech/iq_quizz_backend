const topics = [
  { label: 'pattern', offset: 3 },
  { label: 'logic', offset: 5 },
  { label: 'sequence', offset: 7 },
  { label: 'memory', offset: 11 },
  { label: 'reasoning', offset: 13 },
];

const questions = Array.from({ length: 500 }, (_, index) => {
  const number = index + 1;
  const topic = topics[index % topics.length];
  const left = number + topic.offset;
  const right = (number % 9) + topic.offset;
  const answer = String(left + right);
  const optionSet = [
    String(Number(answer) - 1),
    String(Number(answer) + 2),
    String(Number(answer) + 4),
  ];

  optionSet[number % 3] = answer;

  return {
    id: `q-${String(number).padStart(3, '0')}`,
    question: `Question ${number}: In the ${topic.label} set, what is ${left} + ${right}?`,
    options: [
      ...optionSet,
      'Other',
    ],
    answer,
  };
});

module.exports = questions;
