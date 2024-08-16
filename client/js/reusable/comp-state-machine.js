export class CompStateMachine {
    constructor(funcs) {
	this.funcs = funcs;
    }
    async run({start, context={}}) {
	let state = start;
	while (this.funcs[state]) {
	    state = await this.funcs[state](context);
	}
    }
}
