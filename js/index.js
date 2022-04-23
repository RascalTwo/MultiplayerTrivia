const MAIN = document.querySelector('main');
const GAME_OVER = document.querySelector('#game-over');
const QUESTION_TITLE = document.querySelector('#game-play h1');
const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container');

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}


function showScreen(showing) {
	for (const child of MAIN.children) {
		child.classList.toggle('hidden', child.id !== showing)
	}
}

document.querySelector('#start-game button').addEventListener('click', () => {
	fetchQuestions().then((data) => {
		questions.push(...data.results.map(raw => {
			const correctAnswer = raw.correct_answer.trim()
			return {
				question: raw.question,
				answers: shuffle([correctAnswer, ...raw.incorrect_answers.map(incorrect => incorrect.trim())]),
				correctAnswer
			}
		}));
		showScreen('game-play');
		renderQuestion();
	});
})

const answerIndexes = [];
document.querySelector('form').addEventListener('change', event => {
	const answerIndex = +event.target.value;
	answerIndexes.push(answerIndex);

	const question = questions[currentQuestionIndex];
	if (question.answers[answerIndex] === question.correctAnswer) {
		alert('You are right!');
	} else {
		alert('You are wrong!');
	}

	currentQuestionIndex++;
	if (currentQuestionIndex >= questions.length) {
		showScreen('game-over');
		renderGameOver();
	} else {
		renderQuestion();
	}
})

function renderGameOver() {
	const ul = GAME_OVER.querySelector('ul');
	ul.innerHTML = '';
	let correct = 0;

	for (let q = 0; q < questions.length; q++) {
		const question = questions[q];
		let html = `
			<li>
				<fieldset>
					<legend>${question.question}</legend>
					<div class="answers-container">`
		for (let a = 0; a < question.answers.length; a++) {
			const checked = answerIndexes[q] === a ? 'checked' : ''
			const isCorrect = question.answers[a] === question.correctAnswer;
			if (checked && isCorrect) correct++;
			html += `
				<input id="q-${q}-answer-${a}" type="radio" value="${a}" name="q-${q}-answer" ${checked} disabled />
				<label for="q-${q}-answer-${a}" ${isCorrect ? 'class="correct-answer"' : ''}>${question.answers[a]}</label>
			`
		}
		html += `
				</div>
			</fieldset>
		</li>
		`
		ul.innerHTML += html
	}

	GAME_OVER.querySelector('#result').textContent = `You got ${(correct / questions.length * 100).toFixed(0)}% correct!`
}

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

function fetchQuestions() {
	return fetch('https://opentdb.com/api.php?amount=3')
		.then(response => response.json())
}
