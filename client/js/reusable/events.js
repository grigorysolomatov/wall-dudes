export class EventStream {
    constructor(subs) {
	this.subs = subs;
    }
    async *generator() {
	while (true) {
	    const promises = this.subs.map(sub => new Promise(resolve => sub(resolve)));
	    yield await Promise.race(promises);
	}    
    }
    async iterate(func) {
	for await (const event of this.generator()) {
	    func(event);
	}
    }
}
