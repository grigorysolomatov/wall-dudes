function timeout(ms, value) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export class Server {
    constructor(socket) {
	this.socket = socket;
    }
    subscribe(commands) {
	Object.keys(commands).forEach(key => this.socket.on(key, commands[key]));
	return this;
    }
    unsubscribe(...keys) {
	keys.forEach(key => this.socket.removeAllListeners(key));
	return this;
    }
    async message(messageName, ...args) {
	return new Promise(resolve => this.socket.emit(messageName, ...args, resolve));
    }
}
