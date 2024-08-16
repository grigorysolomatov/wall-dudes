{
    	invite: async (inviterId, callback) => {
    	    const myProfile = await server.message('profile', publicId);
    	    if (!myProfile.wantToPlay) { return; } // If don't want to play, ignore invites	    
    	    if (popup.resolve) { return; } // If popup on screen, ignore invites
    	    if (memstorage.get('opponentId')) { return; } // If in game, ignore invites

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
    	    if (accept) {
    		await startGame(server, publicId, inviterId);
    		return;
    	    }
    	},
    }

{
    const invited = new Promise(resolve => server.socket.once('invite', (inviterId, callback) => {
	// if (memstorage.get('opponentId')) { return; } // If in game, ignore invites
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
	resolve({accept});
    }));
}

const acceptInvites = async () => {
    return await Promise.race([
	new Promise(resolve => server
		    .socket.once('invite', (inviterId, callback) => {
			callback({accept: true});
			resolve(inviterId);
		    })),
	new Promise(resolve => {
	    document
		.getElementById('button-stop-play-random')
		.addEventListener('click', resolve, {once: true});
	}),
    ]);
};

{
    localStorageGet: (keys, callback) => {
	const response = {};
	keys.forEach(key => {
	    response[key] = localStorage.getItem(key);
	});
	callback(response);
    },
    localStorageSet: (dict) => {
	Object.keys(dict).forEach(key => {
	    localStorage.setItem(key, dict[key]);
	});
    },
}
// -----------------------------------------------------------------------------
async function mainOld() {    
    // localStorage.clear(); return;
    
    const pageFlip = new html.PageFlip('.page');

    const name = localStorage.getItem('clientName') || randomName();
    localStorage.setItem('clientName', name);    
    // Globals -----------------------------------------------------------------
    window.pageFlip = pageFlip;
    // -------------------------------------------------------------------------    
    pageFlip.to('page-home');
    await html.include({
	selector: '.include',
	attribute: 'from',
    });
    // -------------------------------------------------------------------------
    const socket = io();
    const commands = { // Server's interface
	localStorageGet: (keys, callback) => {
	    const response = {};

	    keys.forEach(key => {
		response[key] = localStorage.getItem(key);
	    });

	    callback(response);
	},
	localStorageSet: (dict) => {
	    Object.keys(dict).forEach(key => {
		localStorage.setItem(key, dict[key]);
	    });
	},
    };
    const server = new Server();
    await server.connect({socket, commands});
    // -------------------------------------------------------------------------
    const response = await server.get(['name']);
    // console.log(response);
    // -------------------------------------------------------------------------
    console.log(localStorage)    
}
