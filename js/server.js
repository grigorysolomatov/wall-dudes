class Server {
    constructor({io, clients, hasher=(id)=>id}) {
	this.io = io;
	this.clients = clients;
	this.hasher = hasher;
    }
    subscribe(clientCommands) {
	const onRegisterClient = (socket, id, callback) => {
	    const hashedId = this.hasher(id);
	    this.clients[hashedId] =
		new Client({socket, id: hashedId})
		.subscribe(clientCommands);
	    console.log(`${hashedId}`, 'register');
	    callback(hashedId);
	};
	
	this.io.on(
	    'connection',
	    (socket) => socket.on(
		'register',
		(id, callback) => onRegisterClient(socket, id, callback),
	    ),
	);
	return this;
    }
}
class Client {
    constructor({socket, id}) {
	this.socket = socket;
	this.id = id;
	this.profile = {};
    }
    subscribe(commands) {
	Object.keys(commands).forEach(key => {
	    this.socket.on(key, (...args) => {
		console.log(`${this.id}`, key, ...args.slice(0, -1))
		commands[key](this, ...args)
	    });
	});
	return this;
    }
    async message(messageName, ...args) {
	return new Promise(resolve => {
	      this.socket.emit(messageName, ...args, resolve);
	});
    }
}

module.exports = {
    Server,
};
