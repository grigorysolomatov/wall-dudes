const TODOS = () => {
    const todos = [
	"* BUGS",
	"- Leaving game breaks finding random opponent",
	"* TODOS",
	"- Enable resignation",
	"- Alternate first turn when rematch",
	"- Await opponent when chosing rematch",
	"- Deal with .recall('secretId', 'name', 'opponentId', 'gameLog', 'opponentName', 'myIdx')",
	"- Make Rematch/Leave better: need a nice system, related to above point",	
    ].join('\n');
    console.log(todos);
}; // TODOS();

import { Server } from './js/reusable/server.js';
import { PageFlip, includeHtml, StyledPopup, Tabs } from './js/reusable/html.js';
import { randomName } from './js/random-name.js';
import { EventStream } from './js/reusable/events.js';
import { Game } from './js/wall-dudes.js';
import { timeout } from './js/reusable/async.js'; // Need?
import { StoredObject } from './js/reusable/stored-object.js';

// localStorage.clear();
// console.log(localStorage)

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
	['button-change-name'].map(id => { // Subscribe
	    document.getElementById(id).addEventListener('click', async () => await this.changeName());
	});
	// Get opponent and play -----------------------------------------------
	memory.game.opponent.id = memory.game.opponent.id || await this.getRandomOpponent();
	this.storage.write(memory);
	await this.startGame();
	// After game ----------------------------------------------------------
	this.setQueueStatus('idle');	
    } // Entry point
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
    async setupServer() {
	const memory = this.memory;
	// ---------------------------------------------------------------------
	const server = new Server(io());
	memory.id.shared = await server.message('register', memory.id.secret);
	await server.message('update', {name: memory.name, wantToPlay: false});
	// ---------------------------------------------------------------------
	this.server = server;
	this.storage.write(memory);
	return this;
    }
    // Do stuff ----------------------------------------------------------------    
    setQueueStatus(status) {
	if (status === 'searching') {
	    document.getElementById('view-play-status').textContent = 'searching';
	    document.getElementById('button-play-random').style.display = 'none';
	    document.getElementById('button-stop-play-random').style.display = 'inline-block';
	}
	if (status === 'idle') {
	    document.getElementById('view-play-status').textContent = 'idle';
	    document.getElementById('button-stop-play-random').style.display = 'none';
	    document.getElementById('button-play-random').style.display = 'inline-block';
	}
	if (status === 'game') {
	    document.getElementById('view-play-status').textContent = 'in game';
	    document.getElementById('button-stop-play-random').style.display = 'none';
	    document.getElementById('button-play-random').style.display = 'none';
	}
    }
    async changeName() {
	const popup = this.html.popup;
	const server = this.server;
	const memory = this.memory;
	// ---------------------------------------------------------------------
	memory.name = await [popup].map(async popup => {
	    popup.show(
		`<h3>New name</h3>`,
		`<input id="input-edit-name" value="${memory.name}"></input>`,
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
    async tryGetRandomOpponent() {
	const server = this.server;
	const memory = this.memory;
	const {popup, tabs} = this.html;
	// ---------------------------------------------------------------------
	if (memory.game.opponent.id) { // Return if in game
	    //tabs.to('page-game');
	    await popup.show(
		`<h3>Already in game</h3>`,
		`<button onclick="popup.resolve()">OK</button>`
	    ).value();
	    return;
	}
	await server.message('update', {wantToPlay: true});
	this.setQueueStatus('searching'); { // DELETE BLOCK
	    // this.setQueueStatus('searching');
	    // document.getElementById('view-play-status').textContent = 'searching';
	    // document.getElementById('button-play-random').style.display = 'none';
	    // document.getElementById('button-stop-play-random').style.display = 'inline-block';
	}

	const promisedInviteeId = new Promise(async resolve => { // Invite
	    const profiles = await server.message('profiles');
	    const inviteeIds = Object.keys(profiles).filter(id => { // Wants to play & is not self
		return profiles[id].wantToPlay && id !== memory.id.shared;
	    });

	    for (const inviteeId of inviteeIds) {
		const response = await server.message('relay', inviteeId, 'invite');
		if (response.accept) {resolve(inviteeId); return;}
	    }
	});
	const promisedInviterId = new Promise(async resolve => { // Get invited
	    while (true) {
		const [inviterId, callback] = await new Promise(resolveInner => {
		    server.socket.removeAllListeners('invite');
		    server.socket.once('invite',
				       (inviterId, callback) => resolveInner([inviterId, callback]));
		});
		const {accept} = await [popup].map(async popup => {
		    popup.show(
			`<h3>Invite received</h3>`,
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
	const promisedCancel = new Promise(async resolve => { // Cancel
	    await new Promise(resolveInner => document
			      .getElementById('button-stop-play-random')
			      .addEventListener('click', resolveInner, {once: true}));

	    await server.message('update', {wantToPlay: false});
	    this.setQueueStatus('idle');
	    //document.getElementById('view-play-status').textContent = 'idle';
	    //document.getElementById('button-stop-play-random').style.display = 'none';
	    //document.getElementById('button-play-random').style.display = 'inline-block';

	    resolve(null);
	});

	const opponentId = await Promise.race([promisedInviteeId, promisedInviterId, promisedCancel]);
	return opponentId;
    }
    async getRandomOpponent() {
	const button = document.getElementById('button-play-random');
	let opponentId = null;
	while (!opponentId) {
	    await new Promise(resolve1 => button.addEventListener('click', resolve1, {once: true}));
	    opponentId = await this.tryGetRandomOpponent();
	}	
	return opponentId;
    }
    async startGame() {
	// TODO: clean up in here
	// ---------------------------------------------------------------------
	if (this.game) {this.game.destroy(); this.game = null;}
	this.setQueueStatus('game');
	// ---------------------------------------------------------------------
	const memory = this.memory;
	const server = this.server;
	const tabs = this.html.tabs;
	// ---------------------------------------------------------------------
	await server.message('update', {wantToPlay: false});
	tabs.to('page-game');
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
	// ---------------------------------------------------------------------
	this.storage.write(memory);
	let myTurnFirst = memory.game.myIdx === 0;
	const [color1, color2] = [myTurnFirst].map(myTurnFirst => {
	    let [color1, color2] = ['#ffff00', '#00aaff'];
	    if (!myTurnFirst) {[color1, color2] = [color2, color1]}
	    return [color1, color2];
	})[0];
	// -------------------------------------------------------------------------
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
	await game.play(exchange, async message => this.gameOverDialogue(message));
	// ---------------------------------------------------------------------
	return this;
    }
    async gameOverDialogue(message) {
	const server = this.server;
	const memory = this.memory;
	const storage = this.storage;
	const popup = this.html.popup;
	// ---------------------------------------------------------------------
	const choice = await popup.show(
	    `<h3>${message}</h3>`,
	    `<button onclick="popup.resolve('rematch')">Rematch</button>`,
	    `<button onclick="popup.resolve('leave')">Leave</button>`,
	).value();
	
	if (choice === 'rematch') {
	    const response = await Promise.race([
		popup.show(
		    `<h3>Waiting for opponent...</h3>`,
		    `<button onclick="popup.resolve('cancel')">Leave</button>`,
		).value(),
		server.message('exchange', memory.game.opponent.id, choice),
	    ]); popup.resolve?.();
	    
	    if (response === 'rematch') {
		memory.game.history = [];
		storage.write(memory);
		await this.startGame();
		return this;
	    }
	    else if (response === 'leave') {
		await popup.show(
		    `<h3>Opponent left</h3>`,
		    `<button onclick="popup.resolve()">OK</button>`,
		).value();
	    }
	}
	else if (choice === 'leave') {
	    server.message('exchange', memory.game.opponent.id, choice);
	}
	memory.game = {
	    history: [],
	    opponent: {
		    id: null,
		    name: null,
		},
	};
	storage.write(memory);
	
	return this;
    }
}
// -----------------------------------------------------------------------------
await new Main().runLoop();
// while (true) {
//     try { await new Main().runLoop(); }
//     catch (error) { console.log(error); localStorage.clear(); }
// }
