import Peer from 'peerjs';
import { shuffle } from './helpers';
import { Player, Question, SettingsData } from './types';

const MAIN = document.querySelector('main')!;

function showScreen(showing: string) {
  for (const child of MAIN.children) {
    child.classList.toggle('hidden', child.id !== showing);
  }
}

const isGameActive = () => document.querySelector('#start-game')!.classList.contains('hidden');

const PEER_WAIT_TIME = 5000;

const GAME_OVER = document.querySelector('#game-over')!;
const QUESTION_TITLE = document.querySelector('#game-play h1')!;
const QUESTION_INFO = document.querySelector('#question-info')!;
const QUESTION_METER = document.querySelector('meter')!;
const QUESTION_PROGRESS = document.querySelector('progress')!;
const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container')!;

const peer = new Peer(
  new URLSearchParams(window.location.hash.slice(1)).get('id')!,
  ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? {
        port: 9000,
        host: 'localhost',
        path: '/myapp',
      }
    : {},
);

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

peer.on('error', err => alert(err.message));

peer.on('open', id => {
  PLAYERS.find(player => player.self)!.conn.peer = id;

  const joining = new URLSearchParams(window.location.hash.slice(1)).get('joining')!;
  if (!joining) return (Settings.formEnabled = true);

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
    Settings.formEnabled = true;
  });
  conn.on('close', () => {
    console.log(`Connection to ${joining} closed`);
    PLAYERS.splice(PLAYERS.indexOf(player), 1);
    Settings.formEnabled = true;
  });
  conn.on('error', console.error);
  conn.on('data', data => handlePeerMessage(conn.peer, data));
});

peer.on('connection', conn => {
  Settings.formEnabled = false;
  console.log('Incoming connection', conn.peer);
  let player: Player = {
    displayName: '',
    answerIndexes: [],
    conn,
  };

  conn.on('open', () => {
    console.log(`Connection to ${conn.peer} opened`);
    PLAYERS.push(player);
    Settings.formEnabled = true;

    if (isGameActive()) {
      conn.send({ action: 'message', data: 'Is in active game' });
      setTimeout(() => conn.close(), PEER_WAIT_TIME);
      return;
    }

    sendMessage('updateSettings', Settings.data);
  });
  conn.on('close', () => {
    console.log(`Connection to ${conn.peer} closed`);
    PLAYERS.splice(PLAYERS.indexOf(player), 1);
    Settings.formEnabled = true;
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

  renderQuestion(true);

  ProgressTimer.set(
    () => {
      currentQuestionIndex++;
      if (currentQuestionIndex >= questions.length) {
        showScreen('game-over');
        renderGameOver();
      } else {
        renderQuestion();
      }
    },
    Settings.data.reviewTimer * 1000,
    'Next Question...',
  );
}

const Settings = (() => {
  const form = document.querySelector('#settings-form') as HTMLFormElement;
  const Settings = {
    elements: {
      form,
      fieldset: form.children[0] as HTMLFieldSetElement,
      questionTimerInput: form.querySelector('#question-timer-input') as HTMLInputElement,
      reviewTimerInput: form.querySelector('#review-timer-input') as HTMLInputElement,
      submitButton: form.querySelector('button')!,
    },
    get data(): SettingsData {
      return {
        questionTimer: +this.elements.questionTimerInput.value,
        reviewTimer: +this.elements.reviewTimerInput.value,
      };
    },
    set data({ questionTimer, reviewTimer }: SettingsData) {
      this.elements.questionTimerInput.value = questionTimer.toString();
      this.elements.reviewTimerInput.value = reviewTimer.toString();
    },
    get formEnabled() {
      return !this.elements.fieldset.disabled;
    },
    set formEnabled(enabled: boolean) {
      this.elements.fieldset.disabled = !enabled;
    },
    handleChange() {
      sendMessage('updateSettings', this.data);
    },
    handleSubmit(event: SubmitEvent) {
      event.preventDefault();

      this.elements.submitButton.disabled = true;
      RESTART_BUTTON.removeAttribute('disabled');
      sendMessage('ready', 1);
    },
  };
  Settings.elements.form.addEventListener('change', Settings.handleChange.bind(Settings));
  Settings.elements.form.addEventListener('submit', Settings.handleSubmit.bind(Settings));
  return Settings;
})();

const ProgressTimer = {
  callback: (() => undefined) as Function,
  end: 0,
  tick(): any {
    QUESTION_PROGRESS.value = this.end - Date.now();

    if (Date.now() < this.end) return requestAnimationFrame(this.tick.bind(this));

    QUESTION_PROGRESS.parentElement!.classList.add('hidden');
    return this.callback();
  },
  set(callback: Function, ms: number, title: string) {
    this.callback = callback;
    this.end = Date.now() + ms;
    QUESTION_PROGRESS.previousElementSibling!.textContent = title;
    QUESTION_PROGRESS.parentElement!.classList.remove('hidden');
    QUESTION_PROGRESS.max = ms;

    this.tick();
  },
  stop() {
    this.callback = () => undefined;
    this.end = 0;
  },
};

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
    case 'updateSettings':
      Settings.data = data;
      break;
    case 'answer':
      const player = PLAYERS.find(player => player.conn.peer === id)!;
      player.response = data;

      if (PLAYERS.every(player => player.response !== undefined)) {
        await advanceGame();
        PLAYERS.forEach(player => delete player.response);
      }
      break;
    case 'message':
      alert(`${id} said: ${data}`);
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

const RESTART_BUTTON = document.querySelector('#game-over button')!;
RESTART_BUTTON.addEventListener('click', ({ currentTarget }) => {
  (currentTarget as HTMLButtonElement).disabled = true;
  Settings.elements.submitButton.disabled = false;
  sendMessage('restart', 1);
});

document.querySelector('#options-form')!.addEventListener('change', event => {
  const answerIndex = +(event.target as HTMLInputElement).value;
  ProgressTimer.callback = () => undefined;
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

function renderQuestion(showCorrectAnswer: boolean = false) {
  const question = questions[currentQuestionIndex];
  QUESTION_TITLE.innerHTML = question.question;
  QUESTION_INFO.textContent = `${currentQuestionIndex + 1} / ${questions.length}`;
  QUESTION_METER.value = currentQuestionIndex + 1;
  QUESTION_METER.max = questions.length;
  ANSWERS_CONTAINER.innerHTML = '';
  const myAnswerIndex = PLAYERS.find(player => player.self)?.answerIndexes.slice(-1)[0]!;
  for (let i = 0; i < question.answers.length; i++) {
    const checked = showCorrectAnswer && myAnswerIndex === i ? 'checked' : '';
    const isCorrect = showCorrectAnswer && question.answers[i] === question.correctAnswer;
    ANSWERS_CONTAINER.innerHTML += `
			<input id="answer-${i}" type="radio" value="${i}" name="answer" ${checked} />
			<label for="answer-${i}" ${isCorrect ? 'class="correct-answer"' : ''}>${question.answers[i]}</label>
		`;
  }

  ProgressTimer.set(() => sendMessage('answer', -1), Settings.data.questionTimer * 1000, 'Time Remaining...');
}

function fetchQuestions() {
  return fetch('https://opentdb.com/api.php?amount=5&category=18').then(response => response.json());
}
