import Peer from 'peerjs';
import { shuffle } from './helpers';
import { Player, Question } from './types';

const MAIN = document.querySelector('main')!;

function showScreen(showing: string) {
  for (const child of MAIN.children) {
    child.classList.toggle('hidden', child.id !== showing);
  }
}

const GAME_OVER = document.querySelector('#game-over')!;
const QUESTION_TITLE = document.querySelector('#game-play h1')!;
const QUESTION_INFO = document.querySelector('#question-info')!;
const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container')!;

const peer = new Peer(new URLSearchParams(window.location.hash.slice(1)).get('id')!);

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

peer.on('open', id => {
  PLAYERS.find(player => player.self)!.conn.peer = id;

  const joining = new URLSearchParams(window.location.hash.slice(1)).get('joining')!;
  if (!joining) return;

  console.log('Joining', joining);
  const conn = peer.connect(joining);
  let player: Player = {
    displayName: '',
    answerIndexes: [],
    conn,
  };

  conn.on('open', () => {
    console.log(`Connection to ${joining} opened`);
    PLAYERS.push(player);
  });
  conn.on('close', () => {
    console.log(`Connection to ${joining} closed`);
    PLAYERS.splice(PLAYERS.indexOf(player), 1);
  });
  conn.on('error', console.error);
  conn.on('data', data => handlePeerMessage(conn.peer, data));
});

peer.on('connection', conn => {
  console.log('Incoming connection', conn.peer);
  let player: Player = {
    displayName: '',
    answerIndexes: [],
    conn,
  };

  conn.on('open', () => {
    console.log(`Connection to ${conn.peer} opened`);
    PLAYERS.push(player);
  });
  conn.on('close', () => {
    console.log(`Connection to ${conn.peer} closed`);
    PLAYERS.splice(PLAYERS.indexOf(player), 1);
  });
  conn.on('error', console.error);
  conn.on('data', data => handlePeerMessage(conn.peer, data));
});

const questions: Question[] = [];
let currentQuestionIndex = 0;
async function advanceGame() {
  if (!questions.length) {
    const player = [...PLAYERS].sort((a, b) => a.conn.peer.localeCompare(b.conn.peer))[0];
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

  for (const player of PLAYERS) {
    player.answerIndexes.push(player.response!);
    delete player.response;
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
  console.log('[HANDLE]', id, action, data);
  switch (action) {
    case 'ready':
      PLAYERS.find(player => player.conn.peer === id)!.response = data;
      if (PLAYERS.every(player => player.response === 1)) {
        await advanceGame();
        PLAYERS.forEach(player => delete player.response);
      }

      break;
    case 'restart':
      PLAYERS.find(player => player.conn.peer === id)!.response = data;
      if (PLAYERS.every(player => player.response === 1)) {
        restart();
        PLAYERS.forEach(player => delete player.response);
      }

      break;
    case 'setQuestions':
      questions.push(...data);
      showScreen('game-play');
      renderQuestion();
      break;
    case 'answer':
      const player = PLAYERS.find(player => player.conn.peer === id)!;
      player.response = data;

      if (PLAYERS.every(player => player.response !== undefined)) {
        await advanceGame();
        PLAYERS.forEach(player => delete player.response);
      }
      break;
    default:
      console.error('Unknown Action', action);
      break;
  }
}

function restart() {
  for (const player of PLAYERS) {
    player.answerIndexes.splice(0, player.answerIndexes.length);
  }
  questions.splice(0, questions.length);
  currentQuestionIndex = 0;
  showScreen('start-game');
}

function sendMessage(action: string, data: any) {
  console.log('[SEND]', action, data);
  for (const player of PLAYERS) player.conn.send({ action, data });
}

const START_BUTTON = document.querySelector('#start-game button')!;
const RESTART_BUTTON = document.querySelector('#game-over button')!;

START_BUTTON.addEventListener('click', ({ currentTarget }) => {
  (currentTarget as HTMLButtonElement).disabled = true;
  RESTART_BUTTON.removeAttribute('disabled');
  sendMessage('ready', 1);
});

RESTART_BUTTON.addEventListener('click', ({ currentTarget }) => {
  (currentTarget as HTMLButtonElement).disabled = true;
  START_BUTTON.removeAttribute('disabled');
  sendMessage('restart', 1);
});

document.querySelector('form')!.addEventListener('change', event => {
  const answerIndex = +(event.target as HTMLInputElement).value;
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
  QUESTION_INFO.textContent = `${currentQuestionIndex + 1} / ${questions.length}`;
  ANSWERS_CONTAINER.innerHTML = '';
  for (let i = 0; i < question.answers.length; i++) {
    ANSWERS_CONTAINER.innerHTML += `
			<input id="answer-${i}" type="radio" value="${i}" name="answer" />
			<label for="answer-${i}">${question.answers[i]}</label>
		`;
  }
}

function fetchQuestions() {
  return fetch('https://opentdb.com/api.php?amount=5&category=18').then(response => response.json());
}
