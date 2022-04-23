const QUESTION_TITLE = document.querySelector('h1');
const ANSWERS_CONTAINER = document.querySelector('#answers-container');

const answerIndexes = []
document.querySelector('form').addEventListener('change', event => {
	const answerIndex = +event.target.value
	answerIndexes.push(answerIndex)

	const question = questions[currentQuestionIndex];
	if (question.answers[answerIndex] === question.correctAnswer) {
		alert('You are right!');
	} else {
		alert('You are wrong!');
	}

	currentQuestionIndex++;
	if (currentQuestionIndex >= questions.length){
		alert('Out of question');
	} else {
		renderQuestion()
	}
})


const questions = [];
let currentQuestionIndex = 0;

function renderQuestion() {
	const question = questions[currentQuestionIndex];
	QUESTION_TITLE.innerHTML = question.question;
	ANSWERS_CONTAINER.innerHTML = '';
	for (let i = 0; i < question.answers.length; i++) {
		ANSWERS_CONTAINER.innerHTML += `
			<input id="answer-${i}" type="radio" value="${i}" name="answer" />
			<label for="answer-${i}">${question.answers[i]}</label>
		`
	}
}

fetchQuestions().then((data) => {
	questions.push(...data.results.map(raw => {
		const correctAnswer = raw.correct_answer.trim()
		return {
			question: raw.question,
			answers: [correctAnswer, ...raw.incorrect_answers.map(incorrect => incorrect.trim())],
			correctAnswer
		}
	}));
	renderQuestion();
});

function fetchQuestions() {
	return fetch('https://opentdb.com/api.php?amount=3')
		.then(response => response.json())
}
