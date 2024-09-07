const TODOS = () => {
    const todos = [
	"- Proper site scaling / in game zooming",
	"- Resign: Are you sure? MEH",
    ].join('\n');
    console.log(todos);
}; // TODOS();

import { Server } from './js/reusable/server.js';
import { PageFlip, includeHtml, StyledPopup, Tabs } from './js/reusable/html.js';
import { randomName } from './js/random-name.js';
import { Game } from './js/wall-dudes.js';
import { timeout } from './js/reusable/async.js'; // Need? Nice for testing...
import { StoredObject } from './js/reusable/stored-object.js';

class Main {
    async runLoop() {
	while (true) { await this.run(); }
    }
    async run() {
	// Initial setup -------------------------------------------------------
	this.setupMemoryAndStorage();
	const memory = this.memory;

	await this.setupHtml(); this.html.tabs.to('page-home');
	await this.setupServer();
	await this.askReturnToGame();
	['button-change-name'].map(id => { // Subscribe
	    document.getElementById(id).addEventListener('click', async () => await this.changeName());
	});
	// Get opponent and play -----------------------------------------------
	while (!memory.game.opponent.id) { memory.game.opponent.id = await this.getOpponent(); }
	this.storage.write(memory);
	await this.startGame();
    }
    // Setup -------------------------------------------------------------------
    setupMemoryAndStorage() {
	this.storage = new StoredObject('storage')
	    .withDefaults({
		id: {
		    secret: uuidv4(),
		    shared: null,
		},
		name: randomName(),
		game: {
		    history: [],
		    opponent: {
			id: null,
			name: null,
		    },
		    myIdx: null,
		},
	    });
	this.memory = this.storage.read();

	return this;
    }
    async setupHtml() {
	const memory = this.memory;
	// ---------------------------------------------------------------------
	if (this.skipHtmlSetup) { return this; } else { this.skipHtmlSetup = true; } // Don't setup many times
	// ---------------------------------------------------------------------
	await includeHtml({selector: '.include', attribute: 'from'});
	document.getElementById('view-client-name').textContent = memory.name;
	const popup = new StyledPopup({outer: 'popup-outer', inner: 'popup-inner', visible: 'popup-visible'});
	const tabs = new Tabs({containerId: 'tabs-main', tabClass: 'tab', openClass: 'tab-open'})
	      .add({label: 'Home', destId: 'page-home'},
		   {label: 'Game', destId: 'page-game'},
		   {label: 'Rules', destId: 'page-rules'})
	      .setSelector('.page').to('page-home');
	// ---------------------------------------------------------------------
	window.popup = popup;
	// ---------------------------------------------------------------------
	this.html = {popup, tabs};
	return this;
    }
    async askReturnToGame() {
	const memory = this.memory;
	const storage = this.storage;
	// ---------------------------------------------------------------------

	if (!memory.game.opponent.id) {return this;}

	const choice = await popup.show(
	    `<h3>Return to game?</h3>`,
	    `<hr>`,
	    `<button onclick="popup.resolve('yes')">Yes</button>`,
	    `<button onclick="popup.resolve('no')">No</button>`,
	).value();

	if (choice === 'no') {
	    memory.game = memory.game = {
		history: [],
		opponent: {
		    id: null,
		    name: null,
		},
		myIdx: null,
	    };
	    storage.write(memory);
	}

	return this;
    }
    async setupServer() {
	const memory = this.memory;
	// ---------------------------------------------------------------------
	const server = new Server(io());
	server.socket.on('profiles', profiles => { // Update Player count UI
	    document.getElementById('view-players-online').textContent = Object.keys(profiles).length;
	});
	memory.id.shared = await server.message('register', memory.id.secret);

	await server.message('update', {name: memory.name, wantToPlayRandom: false});
	// ---------------------------------------------------------------------
	this.server = server;
	this.storage.write(memory);
	return this;
    }
    // Do stuff ----------------------------------------------------------------
    async changeName() {
	const server = this.server;
	const memory = this.memory;
	// ---------------------------------------------------------------------
	memory.name = await [popup].map(async popup => {
	    popup.show(
		`<h3>New name</h3>`,
		`<input id="input-edit-name" value="${memory.name}"></input>`,
		`<br>`,
		`<button id="button-edit-name">OK</button>`,
	    );
	    // .................................................................
	    const inputEditName = document.getElementById('input-edit-name');
	    inputEditName.addEventListener('keydown', event => {
		if (event.key === 'Enter') {
		    popup.resolve(inputEditName.value);
		}
	    });
	    setTimeout(() => inputEditName.focus(), 100); // Hack?
	    inputEditName.setSelectionRange(0, inputEditName.value.length);
	    // .................................................................
	    const buttonEditName = document.getElementById('button-edit-name');
	    buttonEditName.addEventListener('click', () => {
		popup.resolve(inputEditName.value);
	    });
	    return await popup.value();
	})[0];
	document.getElementById('view-client-name').textContent = memory.name;
	// ---------------------------------------------------------------------
	await server.message('update', {name: memory.name});
	this.storage.write(memory);
	return this;
    }
    // -------------------------------------------------------------------------
    async getOpponent() {
	const memory = this.memory;
	const button = document.getElementById('button-play');
	// ---------------------------------------------------------------------
	if (memory.game.opponent.id) { // Return if in game
	    tabs.to('page-game');
	    await popup.show(
		`<h3>Already in game</h3>`,
		`<button onclick="popup.resolve()">OK</button>`
	    ).value();
	    return null;
	}
	// ---------------------------------------------------------------------
	await new Promise(resolve => button.addEventListener('click', resolve, {once: true}));

	const choice = await popup.show(
	    `<h3>Play</h3>`,
	    `<hr>`,
	    `<button onclick="popup.resolve('random')">Random</button>`,
	    `<button onclick="popup.resolve('friend')">Friend</button>`,
	    `<br>`,
	    `<button onclick="popup.resolve('cancel')">Cancel</button>`,
	).value();

	let opponentId =
	    (choice === 'random')? await this.getOpponentRandom() :
	    (choice === 'friend')? await this.getOpponentFriend() :
	    null;

	// console.log(opponentId)

	return opponentId;
    }
    async getOpponentRandom() {
	const server = this.server;
	const status = document.getElementById('view-play-status');
	const cancel = document.getElementById('button-cancel-play');
	const memory = this.memory;
	// ---------------------------------------------------------------------
	await server.message('update', {wantToPlayRandom: true});
	const intervalId = [status].map(status => {
	    let cycleCounter = 0;
	    status.textContent = 'searching';
	    const intervalId = setInterval(() => {
		status.textContent = 'searching' + '.'.repeat(cycleCounter);
		cycleCounter = (cycleCounter + 1) % 4;
	    }, 500);
	    cancel.style.visibility = 'visible';

	    return intervalId;
	})[0];
	// ---------------------------------------------------------------------
	const promiseCancel = new Promise(async resolve => {
	    await new Promise(resolve1 => cancel.addEventListener('click', resolve1, {once: true}));
	    cancel.style.visibility = 'hidden';
	    await server.message('update', {wantToPlayRandom: false});
	    resolve(null);
	});
	const promiseInvite = new Promise(async resolve => {
	    const profiles = await server.message('profiles');
	    const inviteeIds = Object.keys(profiles).filter(inviteeId => { // Wants to play & is not self
		return profiles[inviteeId].wantToPlayRandom && inviteeId !== memory.id.shared;
	    });

	    for (const inviteeId of inviteeIds) {
		const response = await server.message('relay', inviteeId, 'invite', memory.name);
		if (response.accept) {resolve(inviteeId); return;}
	    }
	});
	const promiseGetInvited = new Promise(async resolve => {
	    while (true) {
		const [inviterId, inviterName, callback] = await new Promise(resolve1 => {
		    server.socket.removeAllListeners('invite');
		    server.socket.once('invite', (inviterId, inviterName, callback) =>
			resolve1([inviterId, inviterName, callback]));
		});
		const {accept} = await [popup].map(async popup => {
		    popup.show(
			`<h3>Invite received from </h3>`,
			`<h3>${inviterName}</h3>`,
			`<hr>`,
			`<button id="button-accept">Accept</button>`,
			`<button id="button-decline">Decline</button>`,
		    );
		    document
			.getElementById('button-accept')
			.addEventListener('click', () => {
			    popup.resolve({accept: true});
			});
		    document
			.getElementById('button-decline')
			.addEventListener('click', () => {
			    popup.resolve({accept: false});
			});
		    return await popup.value();
		})[0];
		callback({accept});
		if (accept) {resolve(inviterId); return;}
	    }
	});
	const opponentId = await Promise.race([promiseCancel, promiseInvite, promiseGetInvited]);
	// ---------------------------------------------------------------------
	clearInterval(intervalId);
	status.textContent = (opponentId)? 'opponent found' : 'idle';
	return opponentId;
    }
    async getOpponentFriend() {
	const memory = this.memory;
	const server = this.server;
	// ---------------------------------------------------------------------
	const initialFriendTag = Math.round(1000*Math.random()).toString();
	popup.show(
	    `<h3>Find friend by tag</h3>`,

	    `<input type="text" id="input-friend-tag" value="${initialFriendTag}">`,
	    `<br>`,
	    `<div class="align-left">`,
	    `<span id="view-search-status" class="searching"></span>`,
	    `</div>`,
	    `<br>`,
	    `<button id="button-search-friend-by-tag">Search</button>`,
	    `<button id="button-cancel-play-friend">Cancel</button>`,
	).value();

	const inputFriendTag = [document.getElementById('input-friend-tag')].map(inputFriendTag => {
	    setTimeout(() => { // Focus friendTag
		inputFriendTag.focus();
		const length = inputFriendTag.value.length;
		inputFriendTag.setSelectionRange(length, length);
	    }, 100); // Hack?
	    return inputFriendTag;
	})[0];
	const buttonSearch = document.getElementById('button-search-friend-by-tag');
	const buttonCancel = document.getElementById('button-cancel-play-friend');
	const searchStatus = document.getElementById('view-search-status');

	const promiseCancel = new Promise(resolve => {
	    buttonCancel.addEventListener('click', () => { popup.resolve(); resolve(null); });
	});
	const promiseInvite = new Promise(async resolve => {
	    while (true) {
		await Promise.race([
		    new Promise(resolve1 => buttonSearch.addEventListener('click', resolve1)),
		    new Promise(resolve1 => inputFriendTag.addEventListener('keydown', event => {
			if (event.key === 'Enter') { resolve1(); }
		    })),
		]);

		const intervalId = [searchStatus].map(status => {
		    let cycleCounter = 0;

		    status.textContent = 'searching';
		    const intervalId = setInterval(() => {
			status.textContent = 'searching' + '.'.repeat(cycleCounter);
			cycleCounter = (cycleCounter + 1) % 4;
		    }, 500);

		    return intervalId;
		})[0];

		await server.message('update', {friendTag: inputFriendTag.value});
		const profiles = await server.message('profiles');
		const inviteeIds = Object.keys(profiles).filter(inviteeId => { // Same tag & is not self
		    // console.log(profiles[inviteeId].friendTag, inputFriendTag.value)
		    return profiles[inviteeId].friendTag === inputFriendTag.value && inviteeId !== memory.id.shared;
		});
		// TODO: remember to reset friendTag to null
		for (const inviteeId of inviteeIds) {
		    const response = await server.message('relay', inviteeId, 'invite', memory.name);
		    if (!response.accept) {continue;}

		    await server.message('update', {friendTag: null});
		    clearInterval(intervalId);
		    popup.resolve(); resolve(inviteeId); return;
		}
	    }
	});
	const promiseGetInvited = new Promise(async resolve => {
	    new Promise(resolve1 => buttonSearch.addEventListener('click', resolve1)),
	    await Promise.race([
		new Promise(resolve1 => inputFriendTag.addEventListener('keydown', event => {
		    if (event.key === 'Enter') { resolve1(); }
		})),
	    ]);
	    await server.message('update', {friendTag: inputFriendTag.value});
	    // -----------------------------------------------------------------
	    const [inviterId, inviterName, callback] = await new Promise(resolve1 => {
		    server.socket.removeAllListeners('invite');
		    server.socket.once('invite', (inviterId, inviterName, callback) =>
			resolve1([inviterId, inviterName, callback]));
		});
	    popup.resolve();
	    const {accept} = await [popup].map(async popup => {
		    popup.show(
			`<h3>Invite received from </h3>`,
			`<h3>${inviterName}</h3>`,
			`<hr>`,
			`<button id="button-accept">Accept</button>`,
			`<button id="button-decline">Decline</button>`,
		    );
		    document
			.getElementById('button-accept')
			.addEventListener('click', () => {
			    popup.resolve({accept: true});
			});
		    document
			.getElementById('button-decline')
			.addEventListener('click', () => {
			    popup.resolve({accept: false});
			});
		    return await popup.value();
		})[0];
	    callback({accept});

	    resolve((accept)? inviterId : null);
	});
	const opponentId = await Promise.race([promiseCancel, promiseInvite, promiseGetInvited]);

	return opponentId;
    }
    // -------------------------------------------------------------------------
    async startGame() {
	document.getElementById('view-play-status').textContent = 'in game';
	document.getElementById('button-cancel-play').style.visibility = 'hidden';
	if (this.game) {this.game.destroy(); this.game = null;}
	// ---------------------------------------------------------------------
	const memory = this.memory;
	const server = this.server;
	const tabs = this.html.tabs;
	// ---------------------------------------------------------------------
	await server.message('update', {wantToPlayRandom: false});
	// ---------------------------------------------------------------------
	const gameLog = memory.game.history;
	memory.game.opponent.name = memory.game.opponent.name ||
	    await server.message('exchange', memory.game.opponent.id, memory.name);
	memory.game.myIdx = memory.game.myIdx ??
	    await [Math.floor(Math.random()*2)].map(async myNum => {
		const hisNum = await server.message('exchange', memory.game.opponent.id, myNum);
		const sortedIds = [memory.id.shared, memory.game.opponent.id].sort();
		const playerIds = ((myNum + hisNum) % 2) ? sortedIds : sortedIds.reverse();
		const myIdx = playerIds.indexOf(memory.id.shared);
		return myIdx;
	    })[0];
	this.storage.write(memory);
	// ---------------------------------------------------------------------
	let myTurnFirst = memory.game.myIdx === 0;
	const [color1, color2] = [myTurnFirst].map(myTurnFirst => {
	    let [color1, color2] = ['#ffff00', '#00aaff'];
	    if (!myTurnFirst) {[color1, color2] = [color2, color1]}
	    return [color1, color2];
	})[0];
	// ---------------------------------------------------------------------
	['stillInGame'].map(async stillInGame => { // Tell eachother: still in game
	    const viewOpponentInGame = document.getElementById('view-opponent-in-game');
	    const waitTime = 2000; // TODO: Make this higher?
	    while (true) {
		const promiseTimeout = new Promise(resolve => setTimeout(() => resolve(false), 2*waitTime));
		const promiseStillInGame =  new Promise(resolve => {
		    server.socket.once(stillInGame, opponentId => {
			if (opponentId === memory.game.opponent.id) {
			    resolve(true);
			}});
		    server.message('relay', memory.game.opponent.id, stillInGame, memory.id.shared);
		});
		const opponentInGame = await Promise.race([promiseStillInGame, promiseTimeout]);
		viewOpponentInGame.textContent = (opponentInGame)? 'Opponent in game' : 'Opponent not in game';
		await timeout(waitTime);
	    }
	})[0];
	// ---------------------------------------------------------------------
	setTimeout(() => tabs.to('page-game'), 0); // Hack?
	const game = await new Game().initialize({
	    nrows: 9 , ncols: 9,
	    me: {name: memory.name, color: color1},
	    opponent: {name: memory.game.opponent.name, color: color2},
	    history: JSON.parse(JSON.stringify(gameLog)), // Ugly
	    myIdx: memory.game.myIdx,
	}); this.game = game; // Ugly?

	const exchange = async turnData => {
	    // TODO: make own method?
	    const message = {turnData, inGame: true};
	    const response = await server.message('exchange', memory.game.opponent.id, message);
	    // Check if in sync ------------------------------------------------
	    if (!response.inGame) { console.log('Opponent out of sync!'); return; } // Need this?
	    // Log and store exchanged moves -------------------------------
	    const deepCopy = obj => JSON.parse(JSON.stringify(obj));
	    memory.game.history.push(deepCopy(message.turnData || response.turnData));
	    this.storage.write(memory);
	    // -------------------------------------------------------------
	    return response.turnData;
	};
	const comms = [null].map(_ => {
	    const subscribe = (event, handler, onType) => server.socket[onType](event, (id, ...args) => {
		const callback = args.pop();
		if (id !== memory.game.opponent.id) {callback({error: 'dontTalkToMe'}); return;}
		handler(...args);
	    });
	    const comms = {
		send: async (event, ...args) => await server.message(
		    'relay', memory.game.opponent.id, event, ...args),
		on: (event, handler) => subscribe(event, handler, 'on'),
		once: (event, handler) => subscribe(event, handler, 'once'),
		off: (event, handler) => subscribe(event, handler, 'off'),
	    };
	    return comms;
	})[0];
	await game.play({
	    exchange,
	    gameOver: async message => this.gameOverDialogue(message),
	    comms,
	});
	// ---------------------------------------------------------------------
	return this;
    }
    async gameOverDialogue(message) {
	const server = this.server;
	const memory = this.memory;
	const storage = this.storage;
	// ---------------------------------------------------------------------
	const prevGame = memory.game;
	memory.game = {
	    history: [],
	    opponent: {
		id: null,
		name: null,
	    },
	    myIdx: null,
	};
	storage.write(memory);
	// ---------------------------------------------------------------------
	const choice = await popup.show(
	    `<h3>${message}</h3>`,
	    `<hr>`,
	    `<button onclick="popup.resolve('rematch')">Rematch</button>`,
	    `<button onclick="popup.resolve('leave')">Leave</button>`,
	).value();

	if (choice === 'rematch') {
	    const response = await Promise.race([
		popup.show(
		    `<h3>Waiting for opponent...</h3>`,
		    `<hr>`,
		    `<button onclick="popup.resolve('cancel')">Leave</button>`,
		).value(),
		server.message('exchange', prevGame.opponent.id, choice),
	    ]); popup.resolve?.();

	    if (response === 'rematch') {
		memory.game.opponent = prevGame.opponent;
		memory.game.myIdx = 1 - prevGame.myIdx;
		storage.write(memory);
		await this.startGame(); return this;
	    }
	    else if (response === 'leave') {
		await popup.show(
		    `<h3>Opponent left</h3>`,
		    `<button onclick="popup.resolve()">OK</button>`,
		).value();
	    }
	}
	else if (choice === 'leave') {
	    server.message('exchange', prevGame.opponent.id, choice);
	}

	return this;
    }
}
// localStorage.clear();
await new Main().runLoop();
// while (true) {
//     try { await new Main().runLoop(); }
//     catch (error) { console.log(error); localStorage.clear(); }
// }
