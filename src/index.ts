import Peer from 'peerjs';
import { shuffle } from './helpers';
import { GameData, Player, Question, SettingsData } from './types';

const MAIN = document.querySelector('main')!;

function showScreen(showing: string) {
  for (const child of MAIN.children) {
    child.classList.toggle('hidden', child.id !== showing);
  }
}

const isGameActive = () => document.querySelector('#start-game')!.classList.contains('hidden');

const PEER_WAIT_TIME = 5000;
const NAMESPACE = 'RascalTwo-MultiplayerTrivia-';

const GAME_OVER = document.querySelector('#game-over')!;
const QUESTION_TITLE = document.querySelector('#game-play h1')!;
const QUESTION_INFO = document.querySelector('#question-info')!;
const QUESTION_METER = document.querySelector('meter')!;
const QUESTION_PROGRESS = document.querySelector('progress')!;
const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container')!;

const PARAMS = (() => {
  return {
    USERNAME: localStorage.getItem(NAMESPACE + '-username') || '',
    JOINING: new URLSearchParams(window.location.hash.slice(1)).get('joining'),
  };
})();

const getUsernameFromID = (id: string) => id.split(NAMESPACE).slice(1).join(NAMESPACE);

function joinPeer(id: string) {
  console.log('Joining', id);
  const conn = (peer as Peer).connect(id);
  let player: Player = {
    answerIndexes: [],
    conn,
  };

  conn.on('open', () => {
    console.log(`Connection to ${id} opened`);
    Players.add(player);
    Settings.formEnabled = true;
  });
  conn.on('close', () => {
    console.log(`Connection to ${id} closed`);
    Players.remove(player);
    Settings.formEnabled = true;
  });
  conn.on('error', console.error);
  conn.on('data', data => handlePeerMessage(conn.peer, data));
}

let peer: Peer | { id: string };
if (PARAMS.USERNAME) {
  const pjsPeer = new Peer(
    NAMESPACE + PARAMS.USERNAME,
    ['127.0.0.1', 'localhost'].includes(window.location.hostname)
      ? {
          port: 9000,
          host: 'localhost',
          path: '/myapp',
        }
      : {},
  );

  pjsPeer.on('error', err => alert(err.message));

  pjsPeer.on('open', id => {
    Players.self.conn.peer = id;
    Players.render();

    if (!PARAMS.JOINING) return (Settings.formEnabled = true);
    joinPeer(NAMESPACE + PARAMS.JOINING);
  });

  pjsPeer.on('connection', conn => {
    Settings.formEnabled = false;
    console.log('Incoming connection', conn.peer);
    let player: Player = {
      answerIndexes: [],
      conn,
    };

    conn.on('open', () => {
      console.log(`Connection to ${conn.peer} opened`);
      Players.add(player);
      Settings.formEnabled = true;

      if (isGameActive()) {
        conn.send({ action: 'message', data: 'Is in active game' });
        setTimeout(() => conn.close(), PEER_WAIT_TIME);
        return;
      }

      sendMessage('updateSettings', Settings.gameData);
      for (const player of Players.list) {
        if (player.self || player.conn === conn) continue;
        conn.send({ action: 'member', data: player.conn.peer });
      }
    });
    conn.on('close', () => {
      console.log(`Connection to ${conn.peer} closed`);
      Players.remove(player);
      Settings.formEnabled = true;
    });
    conn.on('error', console.error);
    conn.on('data', data => handlePeerMessage(conn.peer, data));
  });

  peer = pjsPeer;
} else {
  setTimeout(() => (Settings.formEnabled = true), 1000);
  peer = { id: '' };
}

const Players = {
  listElement: document.querySelector('#player-list-wrapper ul')!,
  list: [
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
      answerIndexes: [],
      self: true,
    },
  ] as Player[],
  add(player: Player) {
    this.list.push(player);
    this.render();
  },
  remove(player: Player) {
    this.list.splice(this.list.indexOf(player), 1);
    this.render();
  },
  get(id: string): Player | undefined {
    return this.list.find(player => player.conn.peer === id);
  },
  get self() {
    return this.list.find(player => player.self)!;
  },
  render() {
    this.listElement.innerHTML = '';
    this.listElement.appendChild(
      this.list.reduce((fragment, player) => {
        const li = document.createElement('li');
        li.textContent = `${getUsernameFromID(player.conn.peer)} ${player.response !== undefined ? '' : '...'}`;

        fragment.appendChild(li);
        return fragment;
      }, document.createDocumentFragment()),
    );
  },
};

const questions: Question[] = [];
let currentQuestionIndex = 0;
async function advanceGame() {
  if (!questions.length) {
    const player = [...Players.list].sort((a, b) => a.conn.peer.localeCompare(b.conn.peer))[0];
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

  Players.render();
  for (const player of Players.list) {
    player.answerIndexes.push(player.response!);
    delete player.response;
  }

  renderQuestion(true);

  ProgressTimer.set(
    () => {
      Players.render();
      currentQuestionIndex++;
      renderGame();
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
      amountInput: form.querySelector('#question-count-input') as HTMLInputElement,
      categoryInput: form.querySelector('#category-input') as HTMLSelectElement,
      difficultyInput: form.querySelector('#difficulty-input') as HTMLSelectElement,
      typeInput: form.querySelector('#type-input') as HTMLSelectElement,
      usernameInput: form.querySelector('#username-input') as HTMLInputElement,
      joiningInput: form.querySelector('#joining-input') as HTMLInputElement,
      submitButton: form.querySelector('button')!,
    },
    get gameData(): GameData {
      return {
        questionTimer: +this.elements.questionTimerInput.value,
        reviewTimer: +this.elements.reviewTimerInput.value,
        amount: +this.elements.amountInput.value,
        category: this.elements.categoryInput.value,
        difficulty: this.elements.difficultyInput.value,
        type: this.elements.typeInput.value,
      };
    },
    set gameData({ questionTimer, reviewTimer, amount, category, difficulty, type }: Partial<GameData>) {
      if (questionTimer !== undefined) this.elements.questionTimerInput.value = questionTimer.toString();
      if (reviewTimer !== undefined) this.elements.reviewTimerInput.value = reviewTimer.toString();
      if (amount !== undefined) this.elements.amountInput.value = amount.toString();
      if (category !== undefined) this.elements.categoryInput.value = category;
      if (difficulty !== undefined) this.elements.difficultyInput.value = difficulty;
      if (type !== undefined) this.elements.typeInput.value = type;
    },
    get data(): SettingsData {
      return {
        ...this.gameData,
        username: this.elements.usernameInput.value.trim(),
        joining: this.elements.joiningInput.value.trim(),
      };
    },
    set data({ username, joining, ...gameData }: SettingsData) {
      this.gameData = gameData;
      if (username !== undefined) this.elements.usernameInput.value = username;
      if (joining !== undefined) this.elements.joiningInput.value = joining;
    },
    get formEnabled() {
      return !this.elements.fieldset.disabled;
    },
    set formEnabled(enabled: boolean) {
      this.elements.fieldset.disabled = !enabled;
    },
    handleChange() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      for (const [key, value] of Object.entries(this.gameData)) params.set(key, value);
      history.pushState({}, '', window.location.pathname + '#' + params.toString());

      sendMessage('updateSettings', this.gameData);
    },
    handleSubmit(event: SubmitEvent) {
      event.preventDefault();

      this.elements.submitButton.disabled = true;
      RESTART_BUTTON.removeAttribute('disabled');
      sendMessage('ready', 1);
    },
    handleUsernameChange(_: Event) {
      localStorage.setItem(NAMESPACE + '-username', this.data.username)
      window.location.reload();
    },
    handleJoining(_: Event) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      params.set('joining', this.data.joining);
      history.pushState({}, '', window.location.pathname + '#' + params.toString());
      window.location.reload();
    },
  };

  Settings.elements.form.addEventListener('change', Settings.handleChange.bind(Settings));
  Settings.elements.form.addEventListener('submit', Settings.handleSubmit.bind(Settings));
  Settings.elements.usernameInput.addEventListener('change', Settings.handleUsernameChange.bind(Settings));
  Settings.elements.joiningInput.addEventListener('change', Settings.handleJoining.bind(Settings));

  Settings.elements.usernameInput.value = PARAMS.USERNAME;
  Settings.elements.joiningInput.value = PARAMS.JOINING || '';
  Settings.gameData = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)).entries());
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
      Players.get(id)!.response = data;
      Players.render();
      if (Players.list.every(player => player.response === 1)) {
        await advanceGame();
        Players.list.forEach(player => delete player.response);
      }
      Players.render();

      break;
    case 'restart':
      Players.get(id)!.response = data;
      Players.render();
      if (Players.list.every(player => player.response === 1)) {
        restart();
        Players.list.forEach(player => delete player.response);
      }

      break;
    case 'setQuestions':
      questions.push(...data);
      renderGame();
      break;
    case 'updateSettings':
      Settings.data = data;
      break;
    case 'member':
      if (!Players.get(data)) joinPeer(data);
      break;
    case 'answer':
      const player = Players.get(id)!;
      player.response = data;
      Players.render();

      if (Players.list.every(player => player.response !== undefined)) {
        await advanceGame();
        Players.list.forEach(player => delete player.response);
      }

      break;
    case 'message':
      alert(`${getUsernameFromID(id)} said: ${data}`);
      break;
    default:
      console.error('Unknown Action', action);
      break;
  }
}

function restart() {
  for (const player of Players.list) {
    player.answerIndexes.splice(0, player.answerIndexes.length);
  }
  questions.splice(0, questions.length);
  currentQuestionIndex = 0;
  showScreen('start-game');
}

function sendMessage(action: string, data: any) {
  console.log('[SEND]', action, data);
  for (const player of Players.list) player.conn.send({ action, data });
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

function renderGame() {
  if (currentQuestionIndex >= questions.length) {
    showScreen('game-over');
    renderGameOver();
  } else {
    showScreen('game-play');
    renderQuestion();
  }
}

function renderGameOver() {
  const self = Players.self;
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
      const selectedCount = Players.list.filter(player => player.answerIndexes[q] === a).length;
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

  GAME_OVER.querySelector('#result')!.textContent = `You got ${questions.length ? ((correct / questions.length) * 100).toFixed(
    0,
  ) : 0}% correct!`;
}

function renderQuestion(showCorrectAnswer: boolean = false) {
  const question = questions[currentQuestionIndex];
  QUESTION_TITLE.innerHTML = question.question;
  QUESTION_INFO.textContent = `${currentQuestionIndex + 1} / ${questions.length}`;
  QUESTION_METER.value = currentQuestionIndex + 1;
  QUESTION_METER.max = questions.length;
  ANSWERS_CONTAINER.innerHTML = '';
  const myAnswerIndex = Players.self.answerIndexes.slice(-1)[0]!;
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
  const url = new URL('https://opentdb.com/api.php');
  const { amount, category, difficulty, type } = Settings.data;
  url.searchParams.set('amount', amount.toString());
  url.searchParams.set('category', category);
  url.searchParams.set('difficulty', difficulty);
  url.searchParams.set('type', type);
  return fetch(url.toString()).then(response => response.json());
}
