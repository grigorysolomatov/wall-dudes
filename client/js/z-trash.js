{
    spawnWall: async (context) => {
	const {myIdx, exchange, game, turnData} = context;
	turnData.ability = 'spawnWall';		
	const choice = await getChoice({context, options: ['dude', 'ability', 'backclick', 'target']});

	if (choice.backclick) {
	    return 'selectDude';
	}
	if (choice.target) {
	    turnData.steps -= 1;
	    game.spawnWall(turnData.target);
	    await exchange(turnData);
	    turnData.target = null;
	    
	    return 'pass';
	}

	return choice.ability;
    },
    spawnLava: async (context) => {
	const {myIdx, exchange, game, turnData} = context;
	turnData.ability = 'spawnLava';		
	const choice = await getChoice({context, options: ['dude', 'ability', 'backclick', 'target']});

	if (choice.backclick) {
	    return 'selectDude';
	}
	if (choice.target) {
	    turnData.steps -= 1;
	    game.spawnLava(turnData.target);		    
	    await exchange(turnData);
	    turnData.target = null;
	    
	    return 'pass';
	}

	return choice.ability;
    },
    explodeBombDELETE: async (context) => {
	const {myIdx, exchange, game, turnData} = context;
	if (turnData.steps === 3) { return 'selectDude'; }
	
	turnData.ability = 'explodeBomb';

	// turnData.steps -= 1;
	game.explodeBomb(turnData.origin);
	await exchange(turnData);
	turnData.target = null;
	
	return 'pass';
    }
}/
    // -----------------------------------------------------------------------------
class UIStatesOld {
    constructor(game) {
	this.game = game;
    }
    // -------------------------------------------------------------------------
    startTurn() {
	return {startTurn: async (context) => {
	    const {myIdx, exchange} = context;	    
	    context.steps = 3;
	    context.origin = null;
	    context.target = null;
	    context.ability = null;
	    context.backclick = null; // Should be false instead of null?

	    const choice = await Promise.race([
		new Promise(async resolve => resolve({origin: await this.game.selectDude(`player${myIdx}`)})),
		new Promise(async resolve => resolve({ability: await this.game.selectAbility()})),
	    ]); this.game.removeAllChoices();
	    Object.assign(context, choice);
	    
	    if (choice.origin) {
		return 'selectTile';
	    }
	    if (choice.ability === 'pass') {
		await exchange(context);		    
		return awaitOpponent;
	    }
	    
	    return 'startTurn';
	}};
    }
    pass() {
	return {pass: async (context) => {
	    const {myIdx, exchange} = context;
	    await exchange(context);
	    return 'awaitOpponent';
	}};
    }
    spawnWall() {
	return {spawnWall: async (context) => {
	    const {myIdx, exchange} = context;
	    const positions = this.game.logic.getMoves(context.origin);
	    const choice = await Promise.race([
		new Promise(async resolve => resolve({target: await this.game.selectTile(positions)})),
		new Promise(async resolve => resolve({origin: await this.game.selectDude(`player${myIdx}`)})),
		new Promise(async resolve => resolve({ability: await this.game.selectAbility()})),
		new Promise(async resolve => resolve({backclick: await this.game.selectBackclick() || true})),
	    ]); this.game.removeAllChoices();
	    Object.assign(context, choice); context.backclick = undefined;

	    if (choice.backclick) {
		return 'startTurn';
	    }
	    if (choice.origin) {
		return 'selectTile';
	    }
	    if (choice.target) {
		this.game.spawnWall(context.target);
		await exchange(context);
		context.target = null;
		return 'selectTile';
	    }
	    if (choice.ability) {
		return choice.ability;
	    }
	}};
    }
    spawnLava() {
	return {spawnLava: async (context) => {
	    const {myIdx, exchange} = context;
	    const positions = this.game.logic.getMoves(context.origin);
	    const choice = await Promise.race([
		new Promise(async resolve => resolve({target: await this.game.selectTile(positions)})),
		new Promise(async resolve => resolve({origin: await this.game.selectDude(`player${myIdx}`)})),
		new Promise(async resolve => resolve({ability: await this.game.selectAbility()})),
		new Promise(async resolve => resolve({backclick: await this.game.selectBackclick() || true})),
	    ]); this.game.removeAllChoices();
	    Object.assign(context, choice); context.backclick = undefined;

	    if (choice.backclick) {
		return 'startTurn';
	    }
	    if (choice.origin) {
		return 'selectTile';
	    }
	    if (choice.target) {
		this.game.spawnLava(context.target);
		await exchange(context);
		context.target = null;
		return 'selectTile';
	    }
	    if (choice.ability) {
		return choice.ability;
	    }
	}};
    }
    selectTile() {
	return {selectTile: async (context) => {
	    const {myIdx, exchange} = context;
	    const positions = this.game.logic.getMoves(context.origin);
	    const choice = await Promise.race([
		new Promise(async resolve => resolve({target: await this.game.selectTile(positions)})),
		new Promise(async resolve => resolve({origin: await this.game.selectDude(`player${myIdx}`)})),
		new Promise(async resolve => resolve({ability: await this.game.selectAbility()})),
		new Promise(async resolve => resolve({backclick: await this.game.selectBackclick() || true})),
	    ]); this.game.removeAllChoices();
	    Object.assign(context, choice);

	    if (choice.backclick) {
		return 'startTurn';
	    }
	    if (choice.origin) {
		return 'selectTile';
	    }
	    if (choice.target) {
		this.game.moveDude(context.origin, context.target);
		await exchange(context);
		context.origin = context.target;
		context.target = null;
		return 'selectTile';
	    }
	    if (choice.ability) {
		return choice.ability;
	    }
	}};
    }
    awaitOpponent() {
	return {awaitOpponent: async (context) => {
	    const {myIdx, exchange} = context;
	    // Object.keys(context).forEach(key => context[key] = null);
	    const context2 = await exchange(null);
	    
	    if (context2.ability === 'pass') {
		return 'startTurn';
	    }
	    if (context2.ability === 'spawnWall') {
		this.game.spawnWall(context2.target);
		return 'awaitOpponent';
	    }
	    if (context2.ability === 'spawnLava') {
		this.game.spawnLava(context2.target);
		return 'awaitOpponent';
	    }
	    if (context2.origin && context2.target) {
		this.game.moveDude(context2.origin, context2.target);
		return 'awaitOpponent';
	    }
	    
	    // return 'awaitOpponent';
	}};
    }
}
// -----------------------------------------------------------------------------
async DELETE_play(myIdx, exchange) {
    const state = {
	myTurn: myIdx === 0,
	steps: 3,
	origin: null,
	target: null,
	action: null,
    };
    const swapTurn = () => {
	state.myTurn = !state.myTurn;
	state.steps = 3;
	state.origin = null;
	state.target = null;
	state.action = null;
    };
    await new CompStateMachine({
	'select-action': async () => {
	    // Player action -----------------------------------------------
	    const promises = [];

	    // Available actions
	    if (state.steps === 3) {
		promises.push(new Promise(
		    async resolve => resolve({origin: await this.selectDude(`player${myIdx}`)})));
	    }
	    if (state.origin) {
		const positions = this.logic.getMoves(state.origin);
		promises.push(new Promise(
		    async resolve => resolve({target: await this.selectTile(positions)})));
	    }
	    if (state.steps < 3) {
		promises.push(new Promise(
		    async resolve => resolve({ability: await this.selectAbility()})));
	    }
	    if (this.ui.backclick) {
		promises.push(new Promise(
		    resolve => this.ui.backclick.once('pointerdown', () => resolve({unselect: true}))));
	    }
	    
	    const choice = await Promise.race(promises);
	    this.removeAllChoices();
	    // Consequences ------------------------------------------------
	    if (choice.unselect && state.steps === 3) {
		state.origin = null;
		return 'select-action';
	    }
	    if (choice.origin) {
		state.origin = choice.origin;
	    }
	    if (choice.target) {
		state.target = choice.target;
		state.steps -= 1;
		this.moveDude(state.origin, state.target);
		await exchange(state);
		state.origin = state.target;		    
	    }
	    if (state.steps === 0 || choice.ability === 0) {
		swapTurn();
		await exchange(state);
		return 'await';
	    }
	    // -------------------------------------------------------------
	    return 'select-action';
	},
	'await': async () => {
	    const receivedState = await exchange(null);
	    if (receivedState.origin !== null && receivedState.target !== null) {
		this.moveDude(receivedState.origin, receivedState.target);
	    }

	    if (!receivedState.myTurn) {
		swapTurn();
		return 'select-action';
	    }
	    return 'await';
	},
    }).run((state.myTurn)? 'select-action': 'await');
}
