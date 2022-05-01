var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define("helpers", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shuffle = void 0;
    function shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex != 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }
    exports.shuffle = shuffle;
});
define("types", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("index", ["require", "exports", "peerjs", "helpers"], function (require, exports, peerjs_1, helpers_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    peerjs_1 = __importDefault(peerjs_1);
    const MAIN = document.querySelector('main');
    function showScreen(showing) {
        for (const child of MAIN.children) {
            child.classList.toggle('hidden', child.id !== showing);
        }
    }
    const isGameActive = () => document.querySelector('#start-game').classList.contains('hidden');
    const PEER_WAIT_TIME = 5000;
    const NAMESPACE = 'RascalTwo-MultiplayerTrivia-';
    const GAME_OVER = document.querySelector('#game-over');
    const QUESTION_TITLE = document.querySelector('#game-play h1');
    const QUESTION_INFO = document.querySelector('#question-info');
    const QUESTION_METER = document.querySelector('meter');
    const QUESTION_PROGRESS = document.querySelector('progress');
    const ANSWERS_CONTAINER = document.querySelector('#game-play .answers-container');
    const PARAMS = (() => {
        return {
            USERNAME: localStorage.getItem(NAMESPACE + '-username') || '',
            JOINING: new URLSearchParams(window.location.hash.slice(1)).get('joining'),
        };
    })();
    const getUsernameFromID = (id) => id.split(NAMESPACE).slice(1).join(NAMESPACE);
    function joinPeer(id) {
        console.log('Joining', id);
        const conn = peer.connect(id);
        let player = {
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
    let peer;
    if (PARAMS.USERNAME) {
        const pjsPeer = new peerjs_1.default(NAMESPACE + PARAMS.USERNAME, ['127.0.0.1', 'localhost'].includes(window.location.hostname)
            ? {
                port: 9000,
                host: 'localhost',
                path: '/myapp',
            }
            : {});
        pjsPeer.on('error', err => alert(err.message));
        pjsPeer.on('open', id => {
            Players.self.conn.peer = id;
            Players.render();
            if (!PARAMS.JOINING)
                return (Settings.formEnabled = true);
            joinPeer(NAMESPACE + PARAMS.JOINING);
        });
        pjsPeer.on('connection', conn => {
            Settings.formEnabled = false;
            console.log('Incoming connection', conn.peer);
            let player = {
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
                    if (player.self || player.conn === conn)
                        continue;
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
    }
    else {
        setTimeout(() => (Settings.formEnabled = true), 1000);
        peer = { id: '' };
    }
    const Players = {
        listElement: document.querySelector('#player-list-wrapper ul'),
        list: [
            {
                conn: (() => {
                    const handlers = {};
                    return {
                        send(data) {
                            handlePeerMessage(peer.id, data);
                        },
                        close() {
                            (handlers.close || []).forEach(func => func());
                        },
                        on(event, func) {
                            if (!(event in handlers))
                                handlers[event] = [];
                            handlers[event].push(func);
                        },
                        peer: peer.id,
                    };
                })(),
                answerIndexes: [],
                self: true,
            },
        ],
        add(player) {
            this.list.push(player);
            this.render();
        },
        remove(player) {
            this.list.splice(this.list.indexOf(player), 1);
            this.render();
        },
        get(id) {
            return this.list.find(player => player.conn.peer === id);
        },
        get self() {
            return this.list.find(player => player.self);
        },
        render() {
            this.listElement.innerHTML = '';
            this.listElement.appendChild(this.list.reduce((fragment, player) => {
                const li = document.createElement('li');
                li.textContent = `${getUsernameFromID(player.conn.peer)} ${player.response !== undefined ? '' : '...'}`;
                fragment.appendChild(li);
                return fragment;
            }, document.createDocumentFragment()));
        },
    };
    const questions = [];
    let currentQuestionIndex = 0;
    async function advanceGame() {
        if (!questions.length) {
            const player = [...Players.list].sort((a, b) => a.conn.peer.localeCompare(b.conn.peer))[0];
            if (!player.self)
                return;
            return fetchQuestions().then(data => {
                sendMessage('setQuestions', data.results.map((raw) => {
                    const correctAnswer = raw.correct_answer.trim();
                    return {
                        question: raw.question,
                        answers: (0, helpers_1.shuffle)([correctAnswer, ...raw.incorrect_answers.map((incorrect) => incorrect.trim())]),
                        correctAnswer,
                    };
                }));
            });
        }
        Players.render();
        for (const player of Players.list) {
            player.answerIndexes.push(player.response);
            delete player.response;
        }
        renderQuestion(true);
        ProgressTimer.set(() => {
            Players.render();
            currentQuestionIndex++;
            renderGame();
        }, Settings.data.reviewTimer * 1000, 'Next Question...');
    }
    const Settings = (() => {
        const form = document.querySelector('#settings-form');
        const Settings = {
            elements: {
                form,
                fieldset: form.children[0],
                questionTimerInput: form.querySelector('#question-timer-input'),
                reviewTimerInput: form.querySelector('#review-timer-input'),
                amountInput: form.querySelector('#question-count-input'),
                categoryInput: form.querySelector('#category-input'),
                difficultyInput: form.querySelector('#difficulty-input'),
                typeInput: form.querySelector('#type-input'),
                usernameInput: form.querySelector('#username-input'),
                joiningInput: form.querySelector('#joining-input'),
                submitButton: form.querySelector('button'),
            },
            get gameData() {
                return {
                    questionTimer: +this.elements.questionTimerInput.value,
                    reviewTimer: +this.elements.reviewTimerInput.value,
                    amount: +this.elements.amountInput.value,
                    category: this.elements.categoryInput.value,
                    difficulty: this.elements.difficultyInput.value,
                    type: this.elements.typeInput.value,
                };
            },
            set gameData({ questionTimer, reviewTimer, amount, category, difficulty, type }) {
                if (questionTimer !== undefined)
                    this.elements.questionTimerInput.value = questionTimer.toString();
                if (reviewTimer !== undefined)
                    this.elements.reviewTimerInput.value = reviewTimer.toString();
                if (amount !== undefined)
                    this.elements.amountInput.value = amount.toString();
                if (category !== undefined)
                    this.elements.categoryInput.value = category;
                if (difficulty !== undefined)
                    this.elements.difficultyInput.value = difficulty;
                if (type !== undefined)
                    this.elements.typeInput.value = type;
            },
            get data() {
                return {
                    ...this.gameData,
                    username: this.elements.usernameInput.value.trim(),
                    joining: this.elements.joiningInput.value.trim(),
                };
            },
            set data({ username, joining, ...gameData }) {
                this.gameData = gameData;
                if (username !== undefined)
                    this.elements.usernameInput.value = username;
                if (joining !== undefined)
                    this.elements.joiningInput.value = joining;
            },
            get formEnabled() {
                return !this.elements.fieldset.disabled;
            },
            set formEnabled(enabled) {
                this.elements.fieldset.disabled = !enabled;
            },
            handleChange() {
                const params = new URLSearchParams(window.location.hash.slice(1));
                for (const [key, value] of Object.entries(this.gameData))
                    params.set(key, value);
                history.pushState({}, '', window.location.pathname + '#' + params.toString());
                sendMessage('updateSettings', this.gameData);
            },
            handleSubmit(event) {
                event.preventDefault();
                this.elements.submitButton.disabled = true;
                RESTART_BUTTON.removeAttribute('disabled');
                sendMessage('ready', 1);
            },
            handleUsernameChange(_) {
                localStorage.setItem(NAMESPACE + '-username', this.data.username);
                window.location.reload();
            },
            handleJoining(_) {
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
        callback: (() => undefined),
        end: 0,
        tick() {
            QUESTION_PROGRESS.value = this.end - Date.now();
            if (Date.now() < this.end)
                return requestAnimationFrame(this.tick.bind(this));
            QUESTION_PROGRESS.parentElement.classList.add('hidden');
            return this.callback();
        },
        set(callback, ms, title) {
            this.callback = callback;
            this.end = Date.now() + ms;
            QUESTION_PROGRESS.previousElementSibling.textContent = title;
            QUESTION_PROGRESS.parentElement.classList.remove('hidden');
            QUESTION_PROGRESS.max = ms;
            this.tick();
        },
        stop() {
            this.callback = () => undefined;
            this.end = 0;
        },
    };
    async function handlePeerMessage(id, { action, data }) {
        console.log('[HANDLE]', id, action, data);
        switch (action) {
            case 'ready':
                Players.get(id).response = data;
                Players.render();
                if (Players.list.every(player => player.response === 1)) {
                    await advanceGame();
                    Players.list.forEach(player => delete player.response);
                }
                Players.render();
                break;
            case 'restart':
                Players.get(id).response = data;
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
                if (!Players.get(data))
                    joinPeer(data);
                break;
            case 'answer':
                const player = Players.get(id);
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
    function sendMessage(action, data) {
        console.log('[SEND]', action, data);
        for (const player of Players.list)
            player.conn.send({ action, data });
    }
    const RESTART_BUTTON = document.querySelector('#game-over button');
    RESTART_BUTTON.addEventListener('click', ({ currentTarget }) => {
        currentTarget.disabled = true;
        Settings.elements.submitButton.disabled = false;
        sendMessage('restart', 1);
    });
    document.querySelector('#options-form').addEventListener('change', event => {
        const answerIndex = +event.target.value;
        ProgressTimer.callback = () => undefined;
        sendMessage('answer', answerIndex);
    });
    function renderGame() {
        if (currentQuestionIndex >= questions.length) {
            showScreen('game-over');
            renderGameOver();
        }
        else {
            showScreen('game-play');
            renderQuestion();
        }
    }
    function renderGameOver() {
        const self = Players.self;
        const ul = GAME_OVER.querySelector('ul');
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
                if (checked && isCorrect)
                    correct++;
                const selectedCount = Players.list.filter(player => player.answerIndexes[q] === a).length;
                html += `
				<input id="q-${q}-answer-${a}" type="radio" value="${a}" name="q-${q}-answer" ${checked} disabled />
				<label for="q-${q}-answer-${a}" ${isCorrect ? 'class="correct-answer"' : ''}>${question.answers[a]}${selectedCount ? ` +${selectedCount}` : ''}</label>
			`;
            }
            html += `
				</div>
			</fieldset>
		</li>
		`;
            ul.innerHTML += html;
        }
        GAME_OVER.querySelector('#result').textContent = `You got ${questions.length ? ((correct / questions.length) * 100).toFixed(0) : 0}% correct!`;
    }
    function renderQuestion(showCorrectAnswer = false) {
        const question = questions[currentQuestionIndex];
        QUESTION_TITLE.innerHTML = question.question;
        QUESTION_INFO.textContent = `${currentQuestionIndex + 1} / ${questions.length}`;
        QUESTION_METER.value = currentQuestionIndex + 1;
        QUESTION_METER.max = questions.length;
        ANSWERS_CONTAINER.innerHTML = '';
        const myAnswerIndex = Players.self.answerIndexes.slice(-1)[0];
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGVscGVycy50cyIsIi4uLy4uL3NyYy90eXBlcy50cyIsIi4uLy4uL3NyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7O0lBQUEsU0FBZ0IsT0FBTyxDQUFJLEtBQVU7UUFDbkMsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFDN0IsV0FBVyxDQUFDO1FBRWQsT0FBTyxZQUFZLElBQUksQ0FBQyxFQUFFO1lBQ3hCLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxZQUFZLENBQUMsQ0FBQztZQUN2RCxZQUFZLEVBQUUsQ0FBQztZQUNmLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1NBQ3ZGO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBWEQsMEJBV0M7Ozs7Ozs7Ozs7SUVQRCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBRSxDQUFDO0lBRTdDLFNBQVMsVUFBVSxDQUFDLE9BQWU7UUFDakMsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2pDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLE9BQU8sQ0FBQyxDQUFDO1NBQ3hEO0lBQ0gsQ0FBQztJQUVELE1BQU0sWUFBWSxHQUFHLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUUvRixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUM7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RyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDL0MsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25DLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ2pFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gc2h1ZmZsZTxUPihhcnJheTogVFtdKSB7XG4gIGxldCBjdXJyZW50SW5kZXggPSBhcnJheS5sZW5ndGgsXG4gICAgcmFuZG9tSW5kZXg7XG5cbiAgd2hpbGUgKGN1cnJlbnRJbmRleCAhPSAwKSB7XG4gICAgcmFuZG9tSW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjdXJyZW50SW5kZXgpO1xuICAgIGN1cnJlbnRJbmRleC0tO1xuICAgIFthcnJheVtjdXJyZW50SW5kZXhdLCBhcnJheVtyYW5kb21JbmRleF1dID0gW2FycmF5W3JhbmRvbUluZGV4XSwgYXJyYXlbY3VycmVudEluZGV4XV07XG4gIH1cblxuICByZXR1cm4gYXJyYXk7XG59XG4iLCJleHBvcnQgaW50ZXJmYWNlIFF1ZXN0aW9uIHtcbiAgcXVlc3Rpb246IHN0cmluZztcbiAgYW5zd2Vyczogc3RyaW5nW107XG4gIGNvcnJlY3RBbnN3ZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaW5pbWFsRGF0YUNvbm5lY3Rpb24ge1xuICBzZW5kKGRhdGE6IGFueSk6IHZvaWQ7XG4gIGNsb3NlKCk6IHZvaWQ7XG4gIG9uKGV2ZW50OiBzdHJpbmcsIGNiOiAoKSA9PiB2b2lkKTogdm9pZDtcbiAgb24oZXZlbnQ6ICdkYXRhJywgY2I6IChkYXRhOiBhbnkpID0+IHZvaWQpOiB2b2lkO1xuICBvbihldmVudDogJ29wZW4nLCBjYjogKCkgPT4gdm9pZCk6IHZvaWQ7XG4gIG9uKGV2ZW50OiAnY2xvc2UnLCBjYjogKCkgPT4gdm9pZCk6IHZvaWQ7XG4gIG9uKGV2ZW50OiAnZXJyb3InLCBjYjogKGVycjogYW55KSA9PiB2b2lkKTogdm9pZDtcbiAgcGVlcjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYXllciB7XG4gIGFuc3dlckluZGV4ZXM6IG51bWJlcltdO1xuICByZXNwb25zZT86IG51bWJlcjtcbiAgY29ubjogTWluaW1hbERhdGFDb25uZWN0aW9uO1xuXHRzZWxmPzogdHJ1ZVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdhbWVEYXRhIHtcbiAgcXVlc3Rpb25UaW1lcjogbnVtYmVyXG4gIHJldmlld1RpbWVyOiBudW1iZXJcbiAgYW1vdW50OiBudW1iZXJcbiAgY2F0ZWdvcnk6IHN0cmluZ1xuICBkaWZmaWN1bHR5OiBzdHJpbmdcbiAgdHlwZTogc3RyaW5nXG59XG5leHBvcnQgaW50ZXJmYWNlIFNldHRpbmdzRGF0YSBleHRlbmRzIEdhbWVEYXRhIHtcbiAgdXNlcm5hbWU6IHN0cmluZ1xuICBqb2luaW5nOiBzdHJpbmdcbn0iLCJpbXBvcnQgUGVlciBmcm9tICdwZWVyanMnO1xuaW1wb3J0IHsgc2h1ZmZsZSB9IGZyb20gJy4vaGVscGVycyc7XG5pbXBvcnQgeyBHYW1lRGF0YSwgUGxheWVyLCBRdWVzdGlvbiwgU2V0dGluZ3NEYXRhIH0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IE1BSU4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYWluJykhO1xuXG5mdW5jdGlvbiBzaG93U2NyZWVuKHNob3dpbmc6IHN0cmluZykge1xuICBmb3IgKGNvbnN0IGNoaWxkIG9mIE1BSU4uY2hpbGRyZW4pIHtcbiAgICBjaGlsZC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBjaGlsZC5pZCAhPT0gc2hvd2luZyk7XG4gIH1cbn1cblxuY29uc3QgaXNHYW1lQWN0aXZlID0gKCkgPT4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N0YXJ0LWdhbWUnKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKTtcblxuY29uc3QgUEVFUl9XQUlUX1RJTUUgPSA1MDAwO1xuY29uc3QgTkFNRVNQQUNFID0gJ1Jhc2NhbFR3by1NdWx0aXBsYXllclRyaXZpYS0nO1xuXG5jb25zdCBHQU1FX09WRVIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjZ2FtZS1vdmVyJykhO1xuY29uc3QgUVVFU1RJT05fVElUTEUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjZ2FtZS1wbGF5IGgxJykhO1xuY29uc3QgUVVFU1RJT05fSU5GTyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNxdWVzdGlvbi1pbmZvJykhO1xuY29uc3QgUVVFU1RJT05fTUVURVIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRlcicpITtcbmNvbnN0IFFVRVNUSU9OX1BST0dSRVNTID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcigncHJvZ3Jlc3MnKSE7XG5jb25zdCBBTlNXRVJTX0NPTlRBSU5FUiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNnYW1lLXBsYXkgLmFuc3dlcnMtY29udGFpbmVyJykhO1xuXG5jb25zdCBQQVJBTVMgPSAoKCkgPT4ge1xuICByZXR1cm4ge1xuICAgIFVTRVJOQU1FOiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShOQU1FU1BBQ0UgKyAnLXVzZXJuYW1lJykgfHwgJycsXG4gICAgSk9JTklORzogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uaGFzaC5zbGljZSgxKSkuZ2V0KCdqb2luaW5nJyksXG4gIH07XG59KSgpO1xuXG5jb25zdCBnZXRVc2VybmFtZUZyb21JRCA9IChpZDogc3RyaW5nKSA9PiBpZC5zcGxpdChOQU1FU1BBQ0UpLnNsaWNlKDEpLmpvaW4oTkFNRVNQQUNFKTtcblxuZnVuY3Rpb24gam9pblBlZXIoaWQ6IHN0cmluZykge1xuICBjb25zb2xlLmxvZygnSm9pbmluZycsIGlkKTtcbiAgY29uc3QgY29ubiA9IChwZWVyIGFzIFBlZXIpLmNvbm5lY3QoaWQpO1xuICBsZXQgcGxheWVyOiBQbGF5ZXIgPSB7XG4gICAgYW5zd2VySW5kZXhlczogW10sXG4gICAgY29ubixcbiAgfTtcblxuICBjb25uLm9uKCdvcGVuJywgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGBDb25uZWN0aW9uIHRvICR7aWR9IG9wZW5lZGApO1xuICAgIFBsYXllcnMuYWRkKHBsYXllcik7XG4gICAgU2V0dGluZ3MuZm9ybUVuYWJsZWQgPSB0cnVlO1xuICB9KTtcbiAgY29ubi5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coYENvbm5lY3Rpb24gdG8gJHtpZH0gY2xvc2VkYCk7XG4gICAgUGxheWVycy5yZW1vdmUocGxheWVyKTtcbiAgICBTZXR0aW5ncy5mb3JtRW5hYmxlZCA9IHRydWU7XG4gIH0pO1xuICBjb25uLm9uKCdlcnJvcicsIGNvbnNvbGUuZXJyb3IpO1xuICBjb25uLm9uKCdkYXRhJywgZGF0YSA9PiBoYW5kbGVQZWVyTWVzc2FnZShjb25uLnBlZXIsIGRhdGEpKTtcbn1cblxubGV0IHBlZXI6IFBlZXIgfCB7IGlkOiBzdHJpbmcgfTtcbmlmIChQQVJBTVMuVVNFUk5BTUUpIHtcbiAgY29uc3QgcGpzUGVlciA9IG5ldyBQZWVyKFxuICAgIE5BTUVTUEFDRSArIFBBUkFNUy5VU0VSTkFNRSxcbiAgICBbJzEyNy4wLjAuMScsICdsb2NhbGhvc3QnXS5pbmNsdWRlcyh3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUpXG4gICAgICA/IHtcbiAgICAgICAgICBwb3J0OiA5MDAwLFxuICAgICAgICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxuICAgICAgICAgIHBhdGg6ICcvbXlhcHAnLFxuICAgICAgICB9XG4gICAgICA6IHt9LFxuICApO1xuXG4gIHBqc1BlZXIub24oJ2Vycm9yJywgZXJyID0+IGFsZXJ0KGVyci5tZXNzYWdlKSk7XG5cbiAgcGpzUGVlci5vbignb3BlbicsIGlkID0+IHtcbiAgICBQbGF5ZXJzLnNlbGYuY29ubi5wZWVyID0gaWQ7XG4gICAgUGxheWVycy5yZW5kZXIoKTtcblxuICAgIGlmICghUEFSQU1TLkpPSU5JTkcpIHJldHVybiAoU2V0dGluZ3MuZm9ybUVuYWJsZWQgPSB0cnVlKTtcbiAgICBqb2luUGVlcihOQU1FU1BBQ0UgKyBQQVJBTVMuSk9JTklORyk7XG4gIH0pO1xuXG4gIHBqc1BlZXIub24oJ2Nvbm5lY3Rpb24nLCBjb25uID0+IHtcbiAgICBTZXR0aW5ncy5mb3JtRW5hYmxlZCA9IGZhbHNlO1xuICAgIGNvbnNvbGUubG9nKCdJbmNvbWluZyBjb25uZWN0aW9uJywgY29ubi5wZWVyKTtcbiAgICBsZXQgcGxheWVyOiBQbGF5ZXIgPSB7XG4gICAgICBhbnN3ZXJJbmRleGVzOiBbXSxcbiAgICAgIGNvbm4sXG4gICAgfTtcblxuICAgIGNvbm4ub24oJ29wZW4nLCAoKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhgQ29ubmVjdGlvbiB0byAke2Nvbm4ucGVlcn0gb3BlbmVkYCk7XG4gICAgICBQbGF5ZXJzLmFkZChwbGF5ZXIpO1xuICAgICAgU2V0dGluZ3MuZm9ybUVuYWJsZWQgPSB0cnVlO1xuXG4gICAgICBpZiAoaXNHYW1lQWN0aXZlKCkpIHtcbiAgICAgICAgY29ubi5zZW5kKHsgYWN0aW9uOiAnbWVzc2FnZScsIGRhdGE6ICdJcyBpbiBhY3RpdmUgZ2FtZScgfSk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gY29ubi5jbG9zZSgpLCBQRUVSX1dBSVRfVElNRSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgc2VuZE1lc3NhZ2UoJ3VwZGF0ZVNldHRpbmdzJywgU2V0dGluZ3MuZ2FtZURhdGEpO1xuICAgICAgZm9yIChjb25zdCBwbGF5ZXIgb2YgUGxheWVycy5saXN0KSB7XG4gICAgICAgIGlmIChwbGF5ZXIuc2VsZiB8fCBwbGF5ZXIuY29ubiA9PT0gY29ubikgY29udGludWU7XG4gICAgICAgIGNvbm4uc2VuZCh7IGFjdGlvbjogJ21lbWJlcicsIGRhdGE6IHBsYXllci5jb25uLnBlZXIgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29ubi5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhgQ29ubmVjdGlvbiB0byAke2Nvbm4ucGVlcn0gY2xvc2VkYCk7XG4gICAgICBQbGF5ZXJzLnJlbW92ZShwbGF5ZXIpO1xuICAgICAgU2V0dGluZ3MuZm9ybUVuYWJsZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIGNvbm4ub24oJ2Vycm9yJywgY29uc29sZS5lcnJvcik7XG4gICAgY29ubi5vbignZGF0YScsIGRhdGEgPT4gaGFuZGxlUGVlck1lc3NhZ2UoY29ubi5wZWVyLCBkYXRhKSk7XG4gIH0pO1xuXG4gIHBlZXIgPSBwanNQZWVyO1xufSBlbHNlIHtcbiAgc2V0VGltZW91dCgoKSA9PiAoU2V0dGluZ3MuZm9ybUVuYWJsZWQgPSB0cnVlKSwgMTAwMCk7XG4gIHBlZXIgPSB7IGlkOiAnJyB9O1xufVxuXG5jb25zdCBQbGF5ZXJzID0ge1xuICBsaXN0RWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3BsYXllci1saXN0LXdyYXBwZXIgdWwnKSEsXG4gIGxpc3Q6IFtcbiAgICB7XG4gICAgICBjb25uOiAoKCkgPT4ge1xuICAgICAgICBjb25zdCBoYW5kbGVyczogUmVjb3JkPHN0cmluZywgRnVuY3Rpb25bXT4gPSB7fTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzZW5kKGRhdGE6IGFueSkge1xuICAgICAgICAgICAgaGFuZGxlUGVlck1lc3NhZ2UocGVlci5pZCwgZGF0YSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBjbG9zZSgpIHtcbiAgICAgICAgICAgIChoYW5kbGVycy5jbG9zZSB8fCBbXSkuZm9yRWFjaChmdW5jID0+IGZ1bmMoKSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvbihldmVudDogc3RyaW5nLCBmdW5jOiBGdW5jdGlvbikge1xuICAgICAgICAgICAgaWYgKCEoZXZlbnQgaW4gaGFuZGxlcnMpKSBoYW5kbGVyc1tldmVudF0gPSBbXTtcbiAgICAgICAgICAgIGhhbmRsZXJzW2V2ZW50XS5wdXNoKGZ1bmMpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgcGVlcjogcGVlci5pZCxcbiAgICAgICAgfTtcbiAgICAgIH0pKCksXG4gICAgICBhbnN3ZXJJbmRleGVzOiBbXSxcbiAgICAgIHNlbGY6IHRydWUsXG4gICAgfSxcbiAgXSBhcyBQbGF5ZXJbXSxcbiAgYWRkKHBsYXllcjogUGxheWVyKSB7XG4gICAgdGhpcy5saXN0LnB1c2gocGxheWVyKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9LFxuICByZW1vdmUocGxheWVyOiBQbGF5ZXIpIHtcbiAgICB0aGlzLmxpc3Quc3BsaWNlKHRoaXMubGlzdC5pbmRleE9mKHBsYXllciksIDEpO1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH0sXG4gIGdldChpZDogc3RyaW5nKTogUGxheWVyIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5saXN0LmZpbmQocGxheWVyID0+IHBsYXllci5jb25uLnBlZXIgPT09IGlkKTtcbiAgfSxcbiAgZ2V0IHNlbGYoKSB7XG4gICAgcmV0dXJuIHRoaXMubGlzdC5maW5kKHBsYXllciA9PiBwbGF5ZXIuc2VsZikhO1xuICB9LFxuICByZW5kZXIoKSB7XG4gICAgdGhpcy5saXN0RWxlbWVudC5pbm5lckhUTUwgPSAnJztcbiAgICB0aGlzLmxpc3RFbGVtZW50LmFwcGVuZENoaWxkKFxuICAgICAgdGhpcy5saXN0LnJlZHVjZSgoZnJhZ21lbnQsIHBsYXllcikgPT4ge1xuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgIGxpLnRleHRDb250ZW50ID0gYCR7Z2V0VXNlcm5hbWVGcm9tSUQocGxheWVyLmNvbm4ucGVlcil9ICR7cGxheWVyLnJlc3BvbnNlICE9PSB1bmRlZmluZWQgPyAnJyA6ICcuLi4nfWA7XG5cbiAgICAgICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgICByZXR1cm4gZnJhZ21lbnQ7XG4gICAgICB9LCBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCkpLFxuICAgICk7XG4gIH0sXG59O1xuXG5jb25zdCBxdWVzdGlvbnM6IFF1ZXN0aW9uW10gPSBbXTtcbmxldCBjdXJyZW50UXVlc3Rpb25JbmRleCA9IDA7XG5hc3luYyBmdW5jdGlvbiBhZHZhbmNlR2FtZSgpIHtcbiAgaWYgKCFxdWVzdGlvbnMubGVuZ3RoKSB7XG4gICAgY29uc3QgcGxheWVyID0gWy4uLlBsYXllcnMubGlzdF0uc29ydCgoYSwgYikgPT4gYS5jb25uLnBlZXIubG9jYWxlQ29tcGFyZShiLmNvbm4ucGVlcikpWzBdO1xuICAgIGlmICghcGxheWVyLnNlbGYpIHJldHVybjtcblxuICAgIHJldHVybiBmZXRjaFF1ZXN0aW9ucygpLnRoZW4oZGF0YSA9PiB7XG4gICAgICBzZW5kTWVzc2FnZShcbiAgICAgICAgJ3NldFF1ZXN0aW9ucycsXG4gICAgICAgIGRhdGEucmVzdWx0cy5tYXAoKHJhdzogYW55KSA9PiB7XG4gICAgICAgICAgY29uc3QgY29ycmVjdEFuc3dlciA9IHJhdy5jb3JyZWN0X2Fuc3dlci50cmltKCk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHF1ZXN0aW9uOiByYXcucXVlc3Rpb24sXG4gICAgICAgICAgICBhbnN3ZXJzOiBzaHVmZmxlKFtjb3JyZWN0QW5zd2VyLCAuLi5yYXcuaW5jb3JyZWN0X2Fuc3dlcnMubWFwKChpbmNvcnJlY3Q6IHN0cmluZykgPT4gaW5jb3JyZWN0LnRyaW0oKSldKSxcbiAgICAgICAgICAgIGNvcnJlY3RBbnN3ZXIsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgUGxheWVycy5yZW5kZXIoKTtcbiAgZm9yIChjb25zdCBwbGF5ZXIgb2YgUGxheWVycy5saXN0KSB7XG4gICAgcGxheWVyLmFuc3dlckluZGV4ZXMucHVzaChwbGF5ZXIucmVzcG9uc2UhKTtcbiAgICBkZWxldGUgcGxheWVyLnJlc3BvbnNlO1xuICB9XG5cbiAgcmVuZGVyUXVlc3Rpb24odHJ1ZSk7XG5cbiAgUHJvZ3Jlc3NUaW1lci5zZXQoXG4gICAgKCkgPT4ge1xuICAgICAgUGxheWVycy5yZW5kZXIoKTtcbiAgICAgIGN1cnJlbnRRdWVzdGlvbkluZGV4Kys7XG4gICAgICByZW5kZXJHYW1lKCk7XG4gICAgfSxcbiAgICBTZXR0aW5ncy5kYXRhLnJldmlld1RpbWVyICogMTAwMCxcbiAgICAnTmV4dCBRdWVzdGlvbi4uLicsXG4gICk7XG59XG5cbmNvbnN0IFNldHRpbmdzID0gKCgpID0+IHtcbiAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNzZXR0aW5ncy1mb3JtJykgYXMgSFRNTEZvcm1FbGVtZW50O1xuXG4gIGNvbnN0IFNldHRpbmdzID0ge1xuICAgIGVsZW1lbnRzOiB7XG4gICAgICBmb3JtLFxuICAgICAgZmllbGRzZXQ6IGZvcm0uY2hpbGRyZW5bMF0gYXMgSFRNTEZpZWxkU2V0RWxlbWVudCxcbiAgICAgIHF1ZXN0aW9uVGltZXJJbnB1dDogZm9ybS5xdWVyeVNlbGVjdG9yKCcjcXVlc3Rpb24tdGltZXItaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50LFxuICAgICAgcmV2aWV3VGltZXJJbnB1dDogZm9ybS5xdWVyeVNlbGVjdG9yKCcjcmV2aWV3LXRpbWVyLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCxcbiAgICAgIGFtb3VudElucHV0OiBmb3JtLnF1ZXJ5U2VsZWN0b3IoJyNxdWVzdGlvbi1jb3VudC1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQsXG4gICAgICBjYXRlZ29yeUlucHV0OiBmb3JtLnF1ZXJ5U2VsZWN0b3IoJyNjYXRlZ29yeS1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50LFxuICAgICAgZGlmZmljdWx0eUlucHV0OiBmb3JtLnF1ZXJ5U2VsZWN0b3IoJyNkaWZmaWN1bHR5LWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQsXG4gICAgICB0eXBlSW5wdXQ6IGZvcm0ucXVlcnlTZWxlY3RvcignI3R5cGUtaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCxcbiAgICAgIHVzZXJuYW1lSW5wdXQ6IGZvcm0ucXVlcnlTZWxlY3RvcignI3VzZXJuYW1lLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCxcbiAgICAgIGpvaW5pbmdJbnB1dDogZm9ybS5xdWVyeVNlbGVjdG9yKCcjam9pbmluZy1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQsXG4gICAgICBzdWJtaXRCdXR0b246IGZvcm0ucXVlcnlTZWxlY3RvcignYnV0dG9uJykhLFxuICAgIH0sXG4gICAgZ2V0IGdhbWVEYXRhKCk6IEdhbWVEYXRhIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHF1ZXN0aW9uVGltZXI6ICt0aGlzLmVsZW1lbnRzLnF1ZXN0aW9uVGltZXJJbnB1dC52YWx1ZSxcbiAgICAgICAgcmV2aWV3VGltZXI6ICt0aGlzLmVsZW1lbnRzLnJldmlld1RpbWVySW5wdXQudmFsdWUsXG4gICAgICAgIGFtb3VudDogK3RoaXMuZWxlbWVudHMuYW1vdW50SW5wdXQudmFsdWUsXG4gICAgICAgIGNhdGVnb3J5OiB0aGlzLmVsZW1lbnRzLmNhdGVnb3J5SW5wdXQudmFsdWUsXG4gICAgICAgIGRpZmZpY3VsdHk6IHRoaXMuZWxlbWVudHMuZGlmZmljdWx0eUlucHV0LnZhbHVlLFxuICAgICAgICB0eXBlOiB0aGlzLmVsZW1lbnRzLnR5cGVJbnB1dC52YWx1ZSxcbiAgICAgIH07XG4gICAgfSxcbiAgICBzZXQgZ2FtZURhdGEoeyBxdWVzdGlvblRpbWVyLCByZXZpZXdUaW1lciwgYW1vdW50LCBjYXRlZ29yeSwgZGlmZmljdWx0eSwgdHlwZSB9OiBQYXJ0aWFsPEdhbWVEYXRhPikge1xuICAgICAgaWYgKHF1ZXN0aW9uVGltZXIgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy5xdWVzdGlvblRpbWVySW5wdXQudmFsdWUgPSBxdWVzdGlvblRpbWVyLnRvU3RyaW5nKCk7XG4gICAgICBpZiAocmV2aWV3VGltZXIgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy5yZXZpZXdUaW1lcklucHV0LnZhbHVlID0gcmV2aWV3VGltZXIudG9TdHJpbmcoKTtcbiAgICAgIGlmIChhbW91bnQgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy5hbW91bnRJbnB1dC52YWx1ZSA9IGFtb3VudC50b1N0cmluZygpO1xuICAgICAgaWYgKGNhdGVnb3J5ICE9PSB1bmRlZmluZWQpIHRoaXMuZWxlbWVudHMuY2F0ZWdvcnlJbnB1dC52YWx1ZSA9IGNhdGVnb3J5O1xuICAgICAgaWYgKGRpZmZpY3VsdHkgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy5kaWZmaWN1bHR5SW5wdXQudmFsdWUgPSBkaWZmaWN1bHR5O1xuICAgICAgaWYgKHR5cGUgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy50eXBlSW5wdXQudmFsdWUgPSB0eXBlO1xuICAgIH0sXG4gICAgZ2V0IGRhdGEoKTogU2V0dGluZ3NEYXRhIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnRoaXMuZ2FtZURhdGEsXG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmVsZW1lbnRzLnVzZXJuYW1lSW5wdXQudmFsdWUudHJpbSgpLFxuICAgICAgICBqb2luaW5nOiB0aGlzLmVsZW1lbnRzLmpvaW5pbmdJbnB1dC52YWx1ZS50cmltKCksXG4gICAgICB9O1xuICAgIH0sXG4gICAgc2V0IGRhdGEoeyB1c2VybmFtZSwgam9pbmluZywgLi4uZ2FtZURhdGEgfTogU2V0dGluZ3NEYXRhKSB7XG4gICAgICB0aGlzLmdhbWVEYXRhID0gZ2FtZURhdGE7XG4gICAgICBpZiAodXNlcm5hbWUgIT09IHVuZGVmaW5lZCkgdGhpcy5lbGVtZW50cy51c2VybmFtZUlucHV0LnZhbHVlID0gdXNlcm5hbWU7XG4gICAgICBpZiAoam9pbmluZyAhPT0gdW5kZWZpbmVkKSB0aGlzLmVsZW1lbnRzLmpvaW5pbmdJbnB1dC52YWx1ZSA9IGpvaW5pbmc7XG4gICAgfSxcbiAgICBnZXQgZm9ybUVuYWJsZWQoKSB7XG4gICAgICByZXR1cm4gIXRoaXMuZWxlbWVudHMuZmllbGRzZXQuZGlzYWJsZWQ7XG4gICAgfSxcbiAgICBzZXQgZm9ybUVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgdGhpcy5lbGVtZW50cy5maWVsZHNldC5kaXNhYmxlZCA9ICFlbmFibGVkO1xuICAgIH0sXG4gICAgaGFuZGxlQ2hhbmdlKCkge1xuICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uaGFzaC5zbGljZSgxKSk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLmdhbWVEYXRhKSkgcGFyYW1zLnNldChrZXksIHZhbHVlKTtcbiAgICAgIGhpc3RvcnkucHVzaFN0YXRlKHt9LCAnJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgJyMnICsgcGFyYW1zLnRvU3RyaW5nKCkpO1xuXG4gICAgICBzZW5kTWVzc2FnZSgndXBkYXRlU2V0dGluZ3MnLCB0aGlzLmdhbWVEYXRhKTtcbiAgICB9LFxuICAgIGhhbmRsZVN1Ym1pdChldmVudDogU3VibWl0RXZlbnQpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgIHRoaXMuZWxlbWVudHMuc3VibWl0QnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIFJFU1RBUlRfQlVUVE9OLnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcbiAgICAgIHNlbmRNZXNzYWdlKCdyZWFkeScsIDEpO1xuICAgIH0sXG4gICAgaGFuZGxlVXNlcm5hbWVDaGFuZ2UoXzogRXZlbnQpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKE5BTUVTUEFDRSArICctdXNlcm5hbWUnLCB0aGlzLmRhdGEudXNlcm5hbWUpXG4gICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfSxcbiAgICBoYW5kbGVKb2luaW5nKF86IEV2ZW50KSB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5oYXNoLnNsaWNlKDEpKTtcbiAgICAgIHBhcmFtcy5zZXQoJ2pvaW5pbmcnLCB0aGlzLmRhdGEuam9pbmluZyk7XG4gICAgICBoaXN0b3J5LnB1c2hTdGF0ZSh7fSwgJycsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICcjJyArIHBhcmFtcy50b1N0cmluZygpKTtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9LFxuICB9O1xuXG4gIFNldHRpbmdzLmVsZW1lbnRzLmZvcm0uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgU2V0dGluZ3MuaGFuZGxlQ2hhbmdlLmJpbmQoU2V0dGluZ3MpKTtcbiAgU2V0dGluZ3MuZWxlbWVudHMuZm9ybS5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBTZXR0aW5ncy5oYW5kbGVTdWJtaXQuYmluZChTZXR0aW5ncykpO1xuICBTZXR0aW5ncy5lbGVtZW50cy51c2VybmFtZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIFNldHRpbmdzLmhhbmRsZVVzZXJuYW1lQ2hhbmdlLmJpbmQoU2V0dGluZ3MpKTtcbiAgU2V0dGluZ3MuZWxlbWVudHMuam9pbmluZ0lucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIFNldHRpbmdzLmhhbmRsZUpvaW5pbmcuYmluZChTZXR0aW5ncykpO1xuXG4gIFNldHRpbmdzLmVsZW1lbnRzLnVzZXJuYW1lSW5wdXQudmFsdWUgPSBQQVJBTVMuVVNFUk5BTUU7XG4gIFNldHRpbmdzLmVsZW1lbnRzLmpvaW5pbmdJbnB1dC52YWx1ZSA9IFBBUkFNUy5KT0lOSU5HIHx8ICcnO1xuICBTZXR0aW5ncy5nYW1lRGF0YSA9IE9iamVjdC5mcm9tRW50cmllcyhuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5oYXNoLnNsaWNlKDEpKS5lbnRyaWVzKCkpO1xuICByZXR1cm4gU2V0dGluZ3M7XG59KSgpO1xuXG5jb25zdCBQcm9ncmVzc1RpbWVyID0ge1xuICBjYWxsYmFjazogKCgpID0+IHVuZGVmaW5lZCkgYXMgRnVuY3Rpb24sXG4gIGVuZDogMCxcbiAgdGljaygpOiBhbnkge1xuICAgIFFVRVNUSU9OX1BST0dSRVNTLnZhbHVlID0gdGhpcy5lbmQgLSBEYXRlLm5vdygpO1xuXG4gICAgaWYgKERhdGUubm93KCkgPCB0aGlzLmVuZCkgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLnRpY2suYmluZCh0aGlzKSk7XG5cbiAgICBRVUVTVElPTl9QUk9HUkVTUy5wYXJlbnRFbGVtZW50IS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICByZXR1cm4gdGhpcy5jYWxsYmFjaygpO1xuICB9LFxuICBzZXQoY2FsbGJhY2s6IEZ1bmN0aW9uLCBtczogbnVtYmVyLCB0aXRsZTogc3RyaW5nKSB7XG4gICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgIHRoaXMuZW5kID0gRGF0ZS5ub3coKSArIG1zO1xuICAgIFFVRVNUSU9OX1BST0dSRVNTLnByZXZpb3VzRWxlbWVudFNpYmxpbmchLnRleHRDb250ZW50ID0gdGl0bGU7XG4gICAgUVVFU1RJT05fUFJPR1JFU1MucGFyZW50RWxlbWVudCEuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG4gICAgUVVFU1RJT05fUFJPR1JFU1MubWF4ID0gbXM7XG5cbiAgICB0aGlzLnRpY2soKTtcbiAgfSxcbiAgc3RvcCgpIHtcbiAgICB0aGlzLmNhbGxiYWNrID0gKCkgPT4gdW5kZWZpbmVkO1xuICAgIHRoaXMuZW5kID0gMDtcbiAgfSxcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVBlZXJNZXNzYWdlKGlkOiBzdHJpbmcsIHsgYWN0aW9uLCBkYXRhIH06IGFueSkge1xuICBjb25zb2xlLmxvZygnW0hBTkRMRV0nLCBpZCwgYWN0aW9uLCBkYXRhKTtcbiAgc3dpdGNoIChhY3Rpb24pIHtcbiAgICBjYXNlICdyZWFkeSc6XG4gICAgICBQbGF5ZXJzLmdldChpZCkhLnJlc3BvbnNlID0gZGF0YTtcbiAgICAgIFBsYXllcnMucmVuZGVyKCk7XG4gICAgICBpZiAoUGxheWVycy5saXN0LmV2ZXJ5KHBsYXllciA9PiBwbGF5ZXIucmVzcG9uc2UgPT09IDEpKSB7XG4gICAgICAgIGF3YWl0IGFkdmFuY2VHYW1lKCk7XG4gICAgICAgIFBsYXllcnMubGlzdC5mb3JFYWNoKHBsYXllciA9PiBkZWxldGUgcGxheWVyLnJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIFBsYXllcnMucmVuZGVyKCk7XG5cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Jlc3RhcnQnOlxuICAgICAgUGxheWVycy5nZXQoaWQpIS5yZXNwb25zZSA9IGRhdGE7XG4gICAgICBQbGF5ZXJzLnJlbmRlcigpO1xuICAgICAgaWYgKFBsYXllcnMubGlzdC5ldmVyeShwbGF5ZXIgPT4gcGxheWVyLnJlc3BvbnNlID09PSAxKSkge1xuICAgICAgICByZXN0YXJ0KCk7XG4gICAgICAgIFBsYXllcnMubGlzdC5mb3JFYWNoKHBsYXllciA9PiBkZWxldGUgcGxheWVyLnJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc2V0UXVlc3Rpb25zJzpcbiAgICAgIHF1ZXN0aW9ucy5wdXNoKC4uLmRhdGEpO1xuICAgICAgcmVuZGVyR2FtZSgpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlU2V0dGluZ3MnOlxuICAgICAgU2V0dGluZ3MuZGF0YSA9IGRhdGE7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdtZW1iZXInOlxuICAgICAgaWYgKCFQbGF5ZXJzLmdldChkYXRhKSkgam9pblBlZXIoZGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdhbnN3ZXInOlxuICAgICAgY29uc3QgcGxheWVyID0gUGxheWVycy5nZXQoaWQpITtcbiAgICAgIHBsYXllci5yZXNwb25zZSA9IGRhdGE7XG4gICAgICBQbGF5ZXJzLnJlbmRlcigpO1xuXG4gICAgICBpZiAoUGxheWVycy5saXN0LmV2ZXJ5KHBsYXllciA9PiBwbGF5ZXIucmVzcG9uc2UgIT09IHVuZGVmaW5lZCkpIHtcbiAgICAgICAgYXdhaXQgYWR2YW5jZUdhbWUoKTtcbiAgICAgICAgUGxheWVycy5saXN0LmZvckVhY2gocGxheWVyID0+IGRlbGV0ZSBwbGF5ZXIucmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBicmVhaztcbiAgICBjYXNlICdtZXNzYWdlJzpcbiAgICAgIGFsZXJ0KGAke2dldFVzZXJuYW1lRnJvbUlEKGlkKX0gc2FpZDogJHtkYXRhfWApO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gQWN0aW9uJywgYWN0aW9uKTtcbiAgICAgIGJyZWFrO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlc3RhcnQoKSB7XG4gIGZvciAoY29uc3QgcGxheWVyIG9mIFBsYXllcnMubGlzdCkge1xuICAgIHBsYXllci5hbnN3ZXJJbmRleGVzLnNwbGljZSgwLCBwbGF5ZXIuYW5zd2VySW5kZXhlcy5sZW5ndGgpO1xuICB9XG4gIHF1ZXN0aW9ucy5zcGxpY2UoMCwgcXVlc3Rpb25zLmxlbmd0aCk7XG4gIGN1cnJlbnRRdWVzdGlvbkluZGV4ID0gMDtcbiAgc2hvd1NjcmVlbignc3RhcnQtZ2FtZScpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWVzc2FnZShhY3Rpb246IHN0cmluZywgZGF0YTogYW55KSB7XG4gIGNvbnNvbGUubG9nKCdbU0VORF0nLCBhY3Rpb24sIGRhdGEpO1xuICBmb3IgKGNvbnN0IHBsYXllciBvZiBQbGF5ZXJzLmxpc3QpIHBsYXllci5jb25uLnNlbmQoeyBhY3Rpb24sIGRhdGEgfSk7XG59XG5cbmNvbnN0IFJFU1RBUlRfQlVUVE9OID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2dhbWUtb3ZlciBidXR0b24nKSE7XG5SRVNUQVJUX0JVVFRPTi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICh7IGN1cnJlbnRUYXJnZXQgfSkgPT4ge1xuICAoY3VycmVudFRhcmdldCBhcyBIVE1MQnV0dG9uRWxlbWVudCkuZGlzYWJsZWQgPSB0cnVlO1xuICBTZXR0aW5ncy5lbGVtZW50cy5zdWJtaXRCdXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgc2VuZE1lc3NhZ2UoJ3Jlc3RhcnQnLCAxKTtcbn0pO1xuXG5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjb3B0aW9ucy1mb3JtJykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGV2ZW50ID0+IHtcbiAgY29uc3QgYW5zd2VySW5kZXggPSArKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgUHJvZ3Jlc3NUaW1lci5jYWxsYmFjayA9ICgpID0+IHVuZGVmaW5lZDtcbiAgc2VuZE1lc3NhZ2UoJ2Fuc3dlcicsIGFuc3dlckluZGV4KTtcbn0pO1xuXG5mdW5jdGlvbiByZW5kZXJHYW1lKCkge1xuICBpZiAoY3VycmVudFF1ZXN0aW9uSW5kZXggPj0gcXVlc3Rpb25zLmxlbmd0aCkge1xuICAgIHNob3dTY3JlZW4oJ2dhbWUtb3ZlcicpO1xuICAgIHJlbmRlckdhbWVPdmVyKCk7XG4gIH0gZWxzZSB7XG4gICAgc2hvd1NjcmVlbignZ2FtZS1wbGF5Jyk7XG4gICAgcmVuZGVyUXVlc3Rpb24oKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJHYW1lT3ZlcigpIHtcbiAgY29uc3Qgc2VsZiA9IFBsYXllcnMuc2VsZjtcbiAgY29uc3QgdWwgPSBHQU1FX09WRVIucXVlcnlTZWxlY3RvcigndWwnKSE7XG4gIHVsLmlubmVySFRNTCA9ICcnO1xuICBsZXQgY29ycmVjdCA9IDA7XG5cbiAgZm9yIChsZXQgcSA9IDA7IHEgPCBxdWVzdGlvbnMubGVuZ3RoOyBxKyspIHtcbiAgICBjb25zdCBxdWVzdGlvbiA9IHF1ZXN0aW9uc1txXTtcbiAgICBsZXQgaHRtbCA9IGBcblx0XHRcdDxsaT5cblx0XHRcdFx0PGZpZWxkc2V0PlxuXHRcdFx0XHRcdDxsZWdlbmQ+JHtxdWVzdGlvbi5xdWVzdGlvbn08L2xlZ2VuZD5cblx0XHRcdFx0XHQ8ZGl2IGNsYXNzPVwiYW5zd2Vycy1jb250YWluZXJcIj5gO1xuICAgIGZvciAobGV0IGEgPSAwOyBhIDwgcXVlc3Rpb24uYW5zd2Vycy5sZW5ndGg7IGErKykge1xuICAgICAgY29uc3QgY2hlY2tlZCA9IHNlbGYuYW5zd2VySW5kZXhlc1txXSA9PT0gYSA/ICdjaGVja2VkJyA6ICcnO1xuICAgICAgY29uc3QgaXNDb3JyZWN0ID0gcXVlc3Rpb24uYW5zd2Vyc1thXSA9PT0gcXVlc3Rpb24uY29ycmVjdEFuc3dlcjtcbiAgICAgIGlmIChjaGVja2VkICYmIGlzQ29ycmVjdCkgY29ycmVjdCsrO1xuICAgICAgY29uc3Qgc2VsZWN0ZWRDb3VudCA9IFBsYXllcnMubGlzdC5maWx0ZXIocGxheWVyID0+IHBsYXllci5hbnN3ZXJJbmRleGVzW3FdID09PSBhKS5sZW5ndGg7XG4gICAgICBodG1sICs9IGBcblx0XHRcdFx0PGlucHV0IGlkPVwicS0ke3F9LWFuc3dlci0ke2F9XCIgdHlwZT1cInJhZGlvXCIgdmFsdWU9XCIke2F9XCIgbmFtZT1cInEtJHtxfS1hbnN3ZXJcIiAke2NoZWNrZWR9IGRpc2FibGVkIC8+XG5cdFx0XHRcdDxsYWJlbCBmb3I9XCJxLSR7cX0tYW5zd2VyLSR7YX1cIiAke2lzQ29ycmVjdCA/ICdjbGFzcz1cImNvcnJlY3QtYW5zd2VyXCInIDogJyd9PiR7cXVlc3Rpb24uYW5zd2Vyc1thXX0ke1xuICAgICAgICBzZWxlY3RlZENvdW50ID8gYCArJHtzZWxlY3RlZENvdW50fWAgOiAnJ1xuICAgICAgfTwvbGFiZWw+XG5cdFx0XHRgO1xuICAgIH1cbiAgICBodG1sICs9IGBcblx0XHRcdFx0PC9kaXY+XG5cdFx0XHQ8L2ZpZWxkc2V0PlxuXHRcdDwvbGk+XG5cdFx0YDtcbiAgICB1bC5pbm5lckhUTUwgKz0gaHRtbDtcbiAgfVxuXG4gIEdBTUVfT1ZFUi5xdWVyeVNlbGVjdG9yKCcjcmVzdWx0JykhLnRleHRDb250ZW50ID0gYFlvdSBnb3QgJHtxdWVzdGlvbnMubGVuZ3RoID8gKChjb3JyZWN0IC8gcXVlc3Rpb25zLmxlbmd0aCkgKiAxMDApLnRvRml4ZWQoXG4gICAgMCxcbiAgKSA6IDB9JSBjb3JyZWN0IWA7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclF1ZXN0aW9uKHNob3dDb3JyZWN0QW5zd2VyOiBib29sZWFuID0gZmFsc2UpIHtcbiAgY29uc3QgcXVlc3Rpb24gPSBxdWVzdGlvbnNbY3VycmVudFF1ZXN0aW9uSW5kZXhdO1xuICBRVUVTVElPTl9USVRMRS5pbm5lckhUTUwgPSBxdWVzdGlvbi5xdWVzdGlvbjtcbiAgUVVFU1RJT05fSU5GTy50ZXh0Q29udGVudCA9IGAke2N1cnJlbnRRdWVzdGlvbkluZGV4ICsgMX0gLyAke3F1ZXN0aW9ucy5sZW5ndGh9YDtcbiAgUVVFU1RJT05fTUVURVIudmFsdWUgPSBjdXJyZW50UXVlc3Rpb25JbmRleCArIDE7XG4gIFFVRVNUSU9OX01FVEVSLm1heCA9IHF1ZXN0aW9ucy5sZW5ndGg7XG4gIEFOU1dFUlNfQ09OVEFJTkVSLmlubmVySFRNTCA9ICcnO1xuICBjb25zdCBteUFuc3dlckluZGV4ID0gUGxheWVycy5zZWxmLmFuc3dlckluZGV4ZXMuc2xpY2UoLTEpWzBdITtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVzdGlvbi5hbnN3ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgY2hlY2tlZCA9IHNob3dDb3JyZWN0QW5zd2VyICYmIG15QW5zd2VySW5kZXggPT09IGkgPyAnY2hlY2tlZCcgOiAnJztcbiAgICBjb25zdCBpc0NvcnJlY3QgPSBzaG93Q29ycmVjdEFuc3dlciAmJiBxdWVzdGlvbi5hbnN3ZXJzW2ldID09PSBxdWVzdGlvbi5jb3JyZWN0QW5zd2VyO1xuICAgIEFOU1dFUlNfQ09OVEFJTkVSLmlubmVySFRNTCArPSBgXG5cdFx0XHQ8aW5wdXQgaWQ9XCJhbnN3ZXItJHtpfVwiIHR5cGU9XCJyYWRpb1wiIHZhbHVlPVwiJHtpfVwiIG5hbWU9XCJhbnN3ZXJcIiAke2NoZWNrZWR9IC8+XG5cdFx0XHQ8bGFiZWwgZm9yPVwiYW5zd2VyLSR7aX1cIiAke2lzQ29ycmVjdCA/ICdjbGFzcz1cImNvcnJlY3QtYW5zd2VyXCInIDogJyd9PiR7cXVlc3Rpb24uYW5zd2Vyc1tpXX08L2xhYmVsPlxuXHRcdGA7XG4gIH1cblxuICBQcm9ncmVzc1RpbWVyLnNldCgoKSA9PiBzZW5kTWVzc2FnZSgnYW5zd2VyJywgLTEpLCBTZXR0aW5ncy5kYXRhLnF1ZXN0aW9uVGltZXIgKiAxMDAwLCAnVGltZSBSZW1haW5pbmcuLi4nKTtcbn1cblxuZnVuY3Rpb24gZmV0Y2hRdWVzdGlvbnMoKSB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoJ2h0dHBzOi8vb3BlbnRkYi5jb20vYXBpLnBocCcpO1xuICBjb25zdCB7IGFtb3VudCwgY2F0ZWdvcnksIGRpZmZpY3VsdHksIHR5cGUgfSA9IFNldHRpbmdzLmRhdGE7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdhbW91bnQnLCBhbW91bnQudG9TdHJpbmcoKSk7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdjYXRlZ29yeScsIGNhdGVnb3J5KTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ2RpZmZpY3VsdHknLCBkaWZmaWN1bHR5KTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ3R5cGUnLCB0eXBlKTtcbiAgcmV0dXJuIGZldGNoKHVybC50b1N0cmluZygpKS50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSk7XG59XG4iXX0=