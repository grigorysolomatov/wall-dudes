import { Server } from './js/reusable/server.js';
import { PageFlip, includeHtml, StyledPopup, Tabs } from './js/reusable/html.js';
import { randomName } from './js/random-name.js';
import { MemStorage } from './js/reusable/memory.js';
import { EventStream } from './js/reusable/events.js';

import { Game } from './js/wall-dudes.js';

async function main() {
    localStorage.clear();
    // Recall self -------------------------------------------------------------
    window.memstorage = new MemStorage()
    	.setDefaults({secretId: uuidv4(), name: randomName()})
    	.recall('secretId', 'name', 'opponentId');
    // HTML --------------------------------------------------------------------
    await includeHtml({selector: '.include', attribute: 'from'});
    document.getElementById('view-client-name').textContent = memstorage.get('name');
    window.popup = new StyledPopup({outer: 'popup-outer', inner: 'popup-inner', visible: 'popup-visible'});
    window.tabs = new Tabs({containerId: 'tabs-main', tabClass: 'tab', openClass: 'tab-open'})
	.add({label: 'Home', destId: 'page-home'},
    	     {label: 'Game', destId: 'page-game'},
    	     {label: 'Rules', destId: 'page-rules'})
	.setSelector('.page').to('page-home');
    // Server ------------------------------------------------------------------
    const server = new Server(io());
    const publicId = await server.message('register', memstorage.get('secretId'));
    await server.message('update', {name: memstorage.get('name'), wantToPlay: false});
    // Input stream ------------------------------------------------------------
    const buttonSubs = [...document.querySelectorAll('.stream')]
	  .map(element => handler => element.addEventListener('click', handler, {once: true}));
    new EventStream(buttonSubs).iterate(async event => {
	if (event.target.id === 'button-change-name') {
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
    	    
    	    await server.message('update', {name: memstorage.get('name')});
	}
	if (event.target.id === 'button-play-random') {
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
	    
	    const promisedInviteeId = new Promise(async resolve => {
		const profiles = await server.message('profiles');
		const inviteeIds = Object.keys(profiles).filter(id => { // Wants to play & is not self
    		    return profiles[id].wantToPlay && id !== publicId;
    		});

		for (const inviteeId of inviteeIds) {
		    const response = await server.message('relay', inviteeId, 'invite');
		    if (response.accept) {resolve(inviteeId); return;}
		}				
	    });
	    const promisedInviterId = new Promise(async resolve => {
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

	    if (opponentId) { startGame(server, publicId, opponentId); }
	}
    });
    // -------------------------------------------------------------------------
}
async function startGame(server, myId, opponentId) {
    await server.message('update', {wantToPlay: false});    
    memstorage.set({opponentId});
    tabs.to('page-game');
    
    const myName = memstorage.get('name');
    const opponentName = await server.message('exchange', opponentId, myName);
    
    const myIdx = await [Math.floor(Math.random()*2)].map(async myNum => {
	const hisNum = await server.message('exchange', opponentId, myNum);
	const sortedIds = [myId, opponentId].sort();
	const playerIds = ((myNum + hisNum) % 2) ? sortedIds : sortedIds.reverse();
	const myIdx = playerIds.indexOf(myId);
	return myIdx;
    })[0];
    let myTurn = myIdx === 0;
    
    const [color1, color2] = [myTurn].map(myTurn => {
	let [color1, color2] = ['#ffff00', '#00aaff'];
	if (!myTurn) {[color1, color2] = [color2, color1]}
	return [color1, color2];
    })[0];
    
    const game = await new Game().initialize({
	nrows: 9 , ncols: 9,
	me: {name: myName, color: color1},
	opponent: {name: opponentName, color: color2},
    });
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    await game.play(
	myIdx,
	async data => await server.message('exchange', opponentId, data),
    );
}

main();
