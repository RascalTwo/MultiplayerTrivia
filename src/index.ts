import Peer from 'peerjs';
import { generateRandomGenerator, shuffle } from './helpers';
import { Player, Question } from './types';

const MAIN = document.querySelector('main')!;

function showScreen(showing: string) {
  for (const child of MAIN.children) {
    child.classList.toggle('hidden', child.id !== showing);
  }
}

const GAME_OVER = document.querySelector('#game-over')!;
const QUESTION_TITLE = document.querySelector('#game-play h1')!;
const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container')!;

let seed = Date.now();
let getRandom = generateRandomGenerator(seed);

const peer = new Peer(new URLSearchParams(window.location.hash.slice(1)).get('id')!, {
  host: 'localhost',
  port: 9000,
  path: '/myapp',
});

const PLAYERS: Player[] = [
  {
    conn: (() => {
      const handlers: Record<string, Function[]> = {};
      return {
        send(data: any) {
          handlePeerMessage(peer.id, data);
        },
        close() {
          (handlers.close || []).forEach(func => func());
        },
        on(event: string, func: Function) {
          if (!(event in handlers)) handlers[event] = [];
          handlers[event].push(func);
        },
        peer: peer.id,
      };
    })(),
    displayName: '',
    answerIndexes: [],
    self: true,
  },
];

/*
peer.on('open', id => {
  console.log({ id });
  const joining = new URLSearchParams(window.location.hash.slice(1)).get('joining')!;
  if (!joining) return;

  console.log('Joining', joining)
  const connection = peer.connect(joining);
  connection.on('open', () => {
    console.log(`Connection to ${joining} opened`);
  });
  connection.on('close', () => {
    console.log(`Connection to ${joining} closed`);
  });
  connection.on('error', err => {
    console.error(err);
  });
  connection.on('data', data => {
    console.error(data);
  });
});

peer.on('connection', conn => {
  console.log('Connection from', conn.peer)
})*/

const questions: Question[] = [];
let currentQuestionIndex = 0;
async function advanceGame() {
  if (!questions.length) {
    const ids = PLAYERS.map(player => player.conn.peer).sort();
    const id = ids[Math.floor(getRandom() * ids.length)];
    const player = PLAYERS.find(player => player.conn.peer === id)!;
    if (!player.self) return;

    return fetchQuestions().then(data => {
      sendMessage(
        'setQuestions',
        data.results.map((raw: any) => {
          const correctAnswer = raw.correct_answer.trim();
          return {
            question: raw.question,
            answers: shuffle([correctAnswer, ...raw.incorrect_answers.map((incorrect: string) => incorrect.trim())]),
            correctAnswer,
          };
        }),
      );
    });
  }

  currentQuestionIndex++;
  if (currentQuestionIndex >= questions.length) {
    showScreen('game-over');
    renderGameOver();
  } else {
    renderQuestion();
  }
}

async function handlePeerMessage(id: string, { action, data }: any) {
  switch (action) {
    case 'ready':
      PLAYERS.find(player => player.conn.peer === id)!.response = data;
      if (PLAYERS.every(player => player.response === 1)) await advanceGame();

      PLAYERS.forEach(player => delete player.response);
      break;
    case 'setQuestions':
      questions.splice(0, questions.length);
      questions.push(...data);
      showScreen('game-play');
      renderQuestion();
      break;
    case 'answer':
      const player = PLAYERS.find(player => player.conn.peer === id)!;
      player.response = data;
      player.answerIndexes.push(data);

      if (PLAYERS.every(player => player.response !== undefined)) await advanceGame();
      break;
    default:
      console.error('Unknown Action', action);
      break;
  }
}

function sendMessage(action: string, data: any) {
  for (const player of PLAYERS) player.conn.send({ action, data });
}

document.querySelector('#start-game button')!.addEventListener('click', () => {
  sendMessage('ready', 1);
});

document.querySelector('form')!.addEventListener('change', event => {
  const answerIndex = +(event.target as HTMLInputElement).value;
  const question = questions[currentQuestionIndex];
  if (question.answers[answerIndex] === question.correctAnswer) {
    alert('You are right!');
  } else {
    alert('You are wrong!');
  }
  sendMessage('answer', answerIndex);
});

function renderGameOver() {
  const self = PLAYERS.find(player => player.self)!;
  const ul = GAME_OVER.querySelector('ul')!;
  ul.innerHTML = '';
  let correct = 0;

  for (let q = 0; q < questions.length; q++) {
    const question = questions[q];
    let html = `
			<li>
				<fieldset>
					<legend>${question.question}</legend>
					<div class="answers-container">`;
    for (let a = 0; a < question.answers.length; a++) {
      const checked = self.answerIndexes[q] === a ? 'checked' : '';
      const isCorrect = question.answers[a] === question.correctAnswer;
      if (checked && isCorrect) correct++;
      const selectedCount = PLAYERS.filter(player => player.answerIndexes[q] === a).length;
      html += `
				<input id="q-${q}-answer-${a}" type="radio" value="${a}" name="q-${q}-answer" ${checked} disabled />
				<label for="q-${q}-answer-${a}" ${isCorrect ? 'class="correct-answer"' : ''}>${question.answers[a]}${
        selectedCount ? ` +${selectedCount}` : ''
      }</label>
			`;
    }
    html += `
				</div>
			</fieldset>
		</li>
		`;
    ul.innerHTML += html;
  }

  GAME_OVER.querySelector('#result')!.textContent = `You got ${((correct / questions.length) * 100).toFixed(
    0,
  )}% correct!`;
}

function renderQuestion() {
  const question = questions[currentQuestionIndex];
  QUESTION_TITLE.innerHTML = question.question;
  ANSWERS_CONTAINER.innerHTML = '';
  for (let i = 0; i < question.answers.length; i++) {
    ANSWERS_CONTAINER.innerHTML += `
			<input id="answer-${i}" type="radio" value="${i}" name="answer" />
			<label for="answer-${i}">${question.answers[i]}</label>
		`;
  }
}

function fetchQuestions() {
  return fetch('https://opentdb.com/api.php?amount=3&category=18').then(response => response.json());
}
