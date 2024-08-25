import { Server } from './js/reusable/server.js';
import { PageFlip, includeHtml, StyledPopup, Tabs } from './js/reusable/html.js';
import { randomName } from './js/random-name.js';
import { MemStorage } from './js/reusable/memory.js';
import { EventStream } from './js/reusable/events.js';
import { Game } from './js/wall-dudes.js';
import { timeout } from './js/reusable/async.js'; // Need?

// localStorage.clear();

class Main {
    async run() {
	// Mandatory initial setup ---------------------------------------------
	this.setupMemStorage();
	await this.setupHtml();
	await this.setupServer();

	['button-change-name'].map(id => { // Subscribe
	    document.getElementById(id).addEventListener('click', async () => await this.changeName());
	});

	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const opponentId = await new Promise(async resolve => {
	    const storedOpponentId = this.memstorage.get('opponentId');
	    if (storedOpponentId) { resolve(storedOpponentId); return; }
	    // -----------------------------------------------------------------
	    const receivedOpponentId = await this.getRandomOpponent();
	    resolve(receivedOpponentId); return;
	});
	this.startGame(opponentId);
	return;
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	// Input stream (ugly crap, deletable?) --------------------------------
	const buttonSubs = [...document.querySelectorAll('.stream')]
	      .map(element => handler => element.addEventListener('click', handler, {once: true}));
	new EventStream(buttonSubs).iterate(async event => {
	    // if (event.target.id === 'button-change-name') { await this.changeName(); }
	    if (event.target.id === 'button-play-random') { await this.playRandom(); }
	});
    } // Entry point
    // Setup -------------------------------------------------------------------
    setupMemStorage() {
	const memstorage = new MemStorage()
	      .setDefaults({secretId: uuidv4(), name: randomName()})
	      .recall('secretId', 'name', 'opponentId', 'gameLog', 'opponentName', 'myIdx');
	// TODO. don't dump all stuff into recall. 
	// ---------------------------------------------------------------------
	this.memstorage = memstorage;
	return this;
    }
    async setupHtml() {
	const memstorage = this.memstorage;
	// ---------------------------------------------------------------------
	await includeHtml({selector: '.include', attribute: 'from'});
	document.getElementById('view-client-name').textContent = memstorage.get('name');
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
	// return {popup, tabs};
    }
    async setupServer() {
	const memstorage = this.memstorage;
	// ---------------------------------------------------------------------
	const server = new Server(io());
	const publicId = await server.message('register', memstorage.get('secretId'));
	await server.message('update', {name: memstorage.get('name'), wantToPlay: false});
	// ---------------------------------------------------------------------
	this.server = server;
	this.publicId = publicId;
	return this;
    }
    // Handlers ----------------------------------------------------------------
    async changeName() {
	const popup = this.html.popup;
	const memstorage = this.memstorage;
	const server = this.server;
	// ---------------------------------------------------------------------
	const name  = await [popup].map(async popup => {
	    popup.show(
		`<h3>New name</h3>`,
		`<input id="input-edit-name" value="${memstorage.get('name')}"></input>`,
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
	memstorage.set({name});
	document.getElementById('view-client-name').textContent = memstorage.get('name');
	// ---------------------------------------------------------------------
	await server.message('update', {name: memstorage.get('name')});
	return this;
    }
    // Opponent ----------------------------------------------------------------
    async tryGetRandomOpponent() {
	const memstorage = this.memstorage;
	const server = this.server;
	const publicId = this.publicId;
	const {popup, tabs} = this.html;
	// ---------------------------------------------------------------------
	if (memstorage.get('opponentId')) { // Return if in game
	    //tabs.to('page-game');
	    await popup.show(
		`<h3>Already in game</h3>`,
		`<button onclick="popup.resolve()">OK</button>`
	    ).value();
	    return;
	}
	await server.message('update', {wantToPlay: true}); { // Update UI
	    document.getElementById('view-play-status').textContent = 'searching';
	    document.getElementById('button-play-random').style.display = 'none';
	    document.getElementById('button-stop-play-random').style.display = 'inline-block';
	}

	const promisedInviteeId = new Promise(async resolve => { // Invite
	    const profiles = await server.message('profiles');
	    const inviteeIds = Object.keys(profiles).filter(id => { // Wants to play & is not self
		return profiles[id].wantToPlay && id !== publicId;
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
	const promisedCancel = new Promise(async resolve => {
	    await new Promise(resolveInner => document
			      .getElementById('button-stop-play-random')
			      .addEventListener('click', resolveInner, {once: true}));

	    await server.message('update', {wantToPlay: false});
	    document.getElementById('view-play-status').textContent = 'idle';
	    document.getElementById('button-stop-play-random').style.display = 'none';
	    document.getElementById('button-play-random').style.display = 'inline-block';

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
    // Game --------------------------------------------------------------------
    async startGame(opponentId) {
	const server = this.server;
	const memstorage = this.memstorage;
	const myId = this.publicId;
	const tabs = this.html.tabs;
	// ---------------------------------------------------------------------
	await server.message('update', {wantToPlay: false});
	memstorage.set({opponentId});
	tabs.to('page-game');
	// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	// await server.message('exchange', opponentId, {inGame: false});
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const myName = memstorage.get('name');
	const gameLog = memstorage.get('gameLog') || [];
	// console.log('Loaded:', gameLog.map(td => td.ability))
	const opponentName = memstorage.get('opponentName')
	      || await server.message('exchange', opponentId, myName);
	memstorage.set({opponentName});
	const myIdx = memstorage.get('myIdx') ??
	      await [Math.floor(Math.random()*2)].map(async myNum => {
		  const hisNum = await server.message('exchange', opponentId, myNum);
		  const sortedIds = [myId, opponentId].sort();
		  const playerIds = ((myNum + hisNum) % 2) ? sortedIds : sortedIds.reverse();
		  const myIdx = playerIds.indexOf(myId);
		  return myIdx;
	      })[0];
	memstorage.set({myIdx});	
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++	
	let myTurnFirst = myIdx === 0;
	const [color1, color2] = [myTurnFirst].map(myTurnFirst => {
	    let [color1, color2] = ['#ffff00', '#00aaff'];
	    if (!myTurnFirst) {[color1, color2] = [color2, color1]}
	    return [color1, color2];
	})[0];
	// -------------------------------------------------------------------------
	// console.log('INITIALIZING')
	const game = await new Game().initialize({
	    nrows: 9 , ncols: 9,
	    me: {name: myName, color: color1},
	    opponent: {name: opponentName, color: color2},
	    history: JSON.parse(JSON.stringify(gameLog)), // Ugly
	});
	const exchange = async turnData => {
	    const message = {turnData, inGame: true};
	    const response = await server.message('exchange', opponentId, message);
	    // Check if in sync ------------------------------------------------
	    if (!response.inGame) {
		console.log('Opponent out of sync!');
		return;
	    }
	    // Log and store exchanged moves -------------------------------
	    const deepCopy = obj => JSON.parse(JSON.stringify(obj));
	    gameLog.push(deepCopy(message.turnData || response.turnData));
	    memstorage.set({gameLog});
	    // console.log(gameLog.map(td => td.ability))
	    // -------------------------------------------------------------
	    return response.turnData;
	};
	await game.play(myIdx, exchange);
	// ---------------------------------------------------------------------
	return this;
    }
}
// -----------------------------------------------------------------------------
new Main().run();
