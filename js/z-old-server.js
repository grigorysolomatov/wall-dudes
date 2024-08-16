const {ClientManager} = require('./client-manager');

class Server {
    set(dict) {
	Object.keys(dict).forEach(key => {
	    this[key] = dict[key];
	});
	return this;
    }
    constructor(io) {
	this.clientManager = new ClientManager()
	    .set({ io })
	    .set({ clients: {} })
	    .set({ clientCommands: {
		echo: (caller, argument, callback) => {
		    console.log('[echo]', argument);
		    callback();
		},
		becho: (caller, argument, callback) => {
		    console.log('[becho]', argument);
		    callback();
		},
	    } })
	    .init()
	;
    }
}

module.exports = {
    Server,
};
