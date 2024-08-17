import { CompStateMachine } from './reusable/comp-state-machine.js';
import { timeout } from './reusable/async.js';
import { Dict } from './reusable/dict.js';

// Config ----------------------------------------------------------------------
const duration = {
    select: 600,
}
// Scene -----------------------------------------------------------------------
class MainScene extends Phaser.Scene {
    constructor() {
	super({ key: 'MainScene' });
    }
    preload() {
	this.load.image('empty', './js/game-assets/empty.svg');
	this.load.image('select', './js/game-assets/select.svg');
	this.load.image('wall', './js/game-assets/wall.png');
	this.load.image('lava', './js/game-assets/lava.png');
	this.load.image('wall-dude', './js/game-assets/wall-dude.svg');
	this.load.image('square', './js/game-assets/square.svg');

	this.load.image('pass', './js/game-assets/pass.svg');
	this.load.image('bomb', './js/game-assets/bomb.svg');
	this.load.image('resign', './js/game-assets/resign.svg');
    }
    create() {
	this.onCreate();
    }
    addText(...args) {
	const text = this.add.text(...args, {
	    font: '32px Times New Roman',
	    fill: '#ffffff',
	}).setOrigin(0.5);
	return text;
    }
}
// Game ------------------------------------------------------------------------
export class Game {
    constructor() {
	this.scene = null
	this.logic = null;
	this.ui = null;

	this.nrows = null;
	this.ncols = null;
    }
    async initialize({me, opponent, nrows, ncols}) {
	this.nrows = nrows;
	this.ncols = ncols;

	this.me = me;
	this.opponent = opponent;	

	this.logic = new GameLogic();

	this.scene = await new Promise(resolve => {
	    const scene = new MainScene();
	    new Phaser.Game({
		width: 900,
		height: 900,
		backgroundColor: '#000000',
		// .................................................................
		parent: 'phaser-window',
		type: Phaser.WEBGL,
		scene: scene,
	    });
	    scene.onCreate = () => resolve(scene);
	});
	this.ui = new GameUI(this.scene);

	this.logic.initialize({nrows, ncols});
	await this.ui.initialize({me, opponent, nrows, ncols});

	await Promise.all([
	    this.ui.replaceTiles(this.logic.tiles),
	    this.ui.makeDudes(this.logic.dudes),
	    this.ui.makeAbilities(),
	    this.ui.makeOpponentAbilities(),
	]);	

	return this;
    }
    async play(myIdx, exchange) {
	const getChoice = async ({context, options}) => {
	    const {myIdx, exchange, game, turnData} = context;
	    
	    const positions = (turnData.origin)? game.logic.getMoves(turnData.origin) : [];
	    const constructors = {
		'dude': () => new Promise(async resolve => resolve(
		    {origin: await game.selectDude(`player${myIdx}`)})),
		'ability': () => new Promise(async resolve => resolve(
		    {ability: await game.selectAbility()})),
		'backclick': () => new Promise(async resolve => resolve(
		    {backclick: await game.selectBackclick() || true})),
		'target': () => new Promise(async resolve => resolve(
		    {target: await game.selectTile(positions)})),
	    };
	    const choices = options.map(option => constructors[option]());
	    const choice = await Promise.race(choices); game.removeAllChoices();

	    // if (choice.ability) { choice.ability = choice.ability.split('-')[0];}
	    turnData.ability = choice.ability || turnData.ability;
	    
	    turnData.origin = choice.origin || turnData.origin;
	    turnData.target = choice.target || null;
	    
	    return choice;
	};
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const makeBombState = type => async (context) => {
	    const {myIdx, exchange, game, turnData} = context;
	    if (turnData.steps === 3) { return 'selectDude'; }
	    
	    turnData.ability = type;
	    const [from, to] = type.split('-').slice(1);
	    
	    game.explodeBomb(turnData.origin, from, to);
	    await exchange(turnData);
	    turnData.target = null; // Needed?

	    game.removeAbilities('me', type);
	    
	    return 'pass';
	};
	const bombStates = [{}].map(bombStates => {
	    this.ui.abilities.list.forEach(ability => {
		const label = ability.abilityLabel;
		if (!label.startsWith('explodeBomb')) {return;}
		bombStates[label] = makeBombState(label);
	    });
	    return bombStates;
	})[0];
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const UIStates = {
	    startAwaitOpponent: async (context) => {
		const {myIdx, exchange, game} = context;
		game.ui.setStepCounter(3, game.opponent.color);
		return 'awaitOpponent';
	    },
	    initStartTurn: async (context) => {
		const {myIdx, exchange, game} = context;
		// game.ui.setStepCounter(3, game.me.color);
		return 'startTurn';
	    },
	    // .................................................................
	    startTurn: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		
		turnData.steps = 3;
		turnData.origin = null;
		turnData.target = null;
		turnData.ability = null;

		game.ui.setStepCounter(3, game.me.color);

		return 'selectDude';
	    },
	    selectDude: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		turnData.ability = 'moveDude';		
		const choice = await getChoice({context, options: ['dude', 'backclick']});

		if (choice.backclick) {
		    return 'selectDude';
		}
		if (turnData.steps < 3 && choice.ability==='pass') {
		    return 'pass';
		}
		if (choice.ability) {
		    return 'selectDude';
		}
		
		return turnData.ability;
	    },
	    moveDude: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		turnData.ability = 'moveDude';
		const options = ['backclick', 'target'];
		options.push((turnData.steps===3)? 'dude' : 'ability');
		const choice = await getChoice({context, options});

		if (choice.backclick) {
		    return (turnData.steps===3)? 'selectDude' : 'moveDude';
		}
		if (choice.origin) {
		    return 'moveDude';
		}
		if (choice.target) {
		    turnData.steps -= 1;
		    if (turnData.steps > 0) {
			game.ui.setStepCounter(turnData.steps, game.me.color);
		    }
		    game.moveDude(turnData.origin, turnData.target);		    
		    await exchange(turnData);
		    turnData.origin = turnData.target;
		    turnData.target = null;
		    
		    return (turnData.steps > 0)? 'moveDude' : 'pass';
		}

		return choice.ability;
	    },
	    pass: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		if (turnData.steps === 3) { return 'selectDude'; }
		turnData.ability = 'pass';		
		
		await exchange(turnData);
		
		return 'startAwaitOpponent';
	    },
	    awaitOpponent: async (context) => {
		const {myIdx, exchange, game} = context;
		
		const turnData = await exchange(null);
		game.ui.setStepCounter(turnData.steps, game.opponent.color);

		if (turnData.ability === 'pass') {
		    return 'startTurn';
		}
		if (turnData.ability === 'spawnWall') {
		    game.spawnWall(turnData.target);
		    return 'awaitOpponent';
		}
		if (turnData.ability === 'spawnLava') {
		    game.spawnLava(turnData.target);
		    return 'awaitOpponent';
		}
		if (turnData.ability === 'moveDude') {
		    game.moveDude(turnData.origin, turnData.target);
		    return 'awaitOpponent';
		}
		if (turnData.ability.startsWith('explodeBomb')) {
		    // console.log(turnData.ability)
		    const [from, to] = turnData.ability.split('-').slice(1);
		    game.explodeBomb(turnData.origin, from, to);
		    game.removeAbilities('opponent', turnData.ability);
		    return 'awaitOpponent';
		}
		
		return 'awaitOpponent';
	    },
	    ...bombStates,
	};
	await new CompStateMachine(UIStates).run({
	    start: (myIdx===0)? 'startTurn': 'startAwaitOpponent',
	    context: {myIdx, exchange, game: this, turnData: {}},
	});
    }
    // Get user input ----------------------------------------------------------
    async selectDude(playerString) {
	const positions = this.logic.find('dudes', dudes => dudes === playerString);
	const selects = positions.map(([row, col]) => this.ui.selects.list[row*this.ncols + col]);

	const promises = selects.map((select, i) => new Promise(resolve => {
	    this.scene.tweens.add({
		targets: select.setAlpha(1), // ?
		scale: { from: 0, to: select.baseScale },
		alpha: 1, // ?
		duration: duration.select,
		ease: 'Quint.Out',
	    });
	    const [row, col] = positions[i];
	    select.once('pointerup', () => resolve([row, col]));
	}));
	const [row, col] = await Promise.race(promises);

	return [row, col];
    }
    async selectTile(positions) {
	const selects = positions.map(([row, col]) => this.ui.selects.list[row*this.ncols + col]);
	
	const promises = selects.map((select, i) => new Promise(resolve => {
	    this.scene.tweens.add({
		targets: select.setAlpha(1),
		scale: { from: 0, to: select.baseScale },
		alpha: 1,
		duration: duration.select,
		ease: 'Quint.Out',
	    });
	    const [row, col] = positions[i];
	    select.once('pointerup', () => resolve([row, col]));
	}));
	const [row, col] = await Promise.race(promises);
	return [row, col];
    }
    async removeAbilities(owner, ...labels) {
	const abilities = (owner==='me')? this.ui.abilities : this.ui.opponentAbilities;
	
	const promises = abilities.list.map(ability => new Promise(resolve => {
	    if (!labels.includes(ability.abilityLabel)) {resolve(); return;}
	    ability.abilityActive = false;
	    abilities.remove(ability);
	    ability.x += abilities.x
	    ability.y += abilities.y

	    this.scene.tweens.add({
		targets: ability,
		alpha: 0,
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	}));
	await Promise.all(promises);
	return this;
    }
    async selectAbility() {
	const promises  = this.ui.abilities.list.map((ability, i) => new Promise(resolve => {
	    if (!ability.abilityActive) {return;}
	    this.scene.tweens.add({
		targets: ability,
		alpha: 1,
		duration: 1000,
		ease: 'Quint.Out',
	    });
	    ability.on('pointerup', async () => resolve(ability.abilityLabel));
	}));
	const abilityLabel = await Promise.race(promises);
	return abilityLabel;
    }
    async selectBackclick() {
	await new Promise(resolve => this.ui.backclick.once('pointerup', resolve));
    }
    // Animate -----------------------------------------------------------------
    async moveDude(from, to) {
	// Logic ---------------------------------------------------------------
	const logicDude = this.logic.dudes.get(from);
	this.logic.dudes.set(from, undefined);
	this.logic.dudes.set(to, logicDude);
	this.logic.tiles.set(from, 'wall');
	// UI ------------------------------------------------------------------
	const dude = this.ui.dudes.get(from);
	const tile = this.ui.tiles.list[to[0]*this.ncols + to[1]];
	
	this.ui.dudes.set(from, undefined);
	this.ui.dudes.set(to, dude);
	this.ui.replaceTile(from, 'wall');

	await new Promise(resolve => this.scene.tweens.add({ // Animate movement
	    targets: dude,
	    x: tile.x,
	    y: tile.y,
	    duration: 600,
	    ease: 'Quint.Out',
	    onComplete: resolve,
	}));

	return this;
    }
    async spawnWall(pos) {
	this.logic.tiles.set(pos, 'wall');
	await this.ui.replaceTile(pos, 'wall');

	return this;
    }
    async spawnLava(pos) {
	this.logic.tiles.set(pos, 'lava');
	await this.ui.replaceTile(pos, 'lava');

	return this;
    }
    async explodeBomb(pos, from, to) {
	const getLogicTile = pt => this.logic.tiles.get(pt) || 'empty';
	const setLogicTile = (pt, val) => this.logic.tiles.set(pt, (val==='empty')? undefined : val);
	
	new PointSet().box([-1, -1], [1, 1]).points
	    .map(pt => [pt[0] + pos[0], pt[1] + pos[1]])
	    .forEach(async (pt) => {
		if (getLogicTile(pt) === from && !this.logic.dudes.get(pt)) {		    
		    setLogicTile(pt, to);
		    await this.ui.replaceTile(pt, to, tile => {
			if (to === 'empty') { tile.setTint(0xccffcc).setAlpha(0.2); }			
		    });
		}
	    });

	return this;
    }
    async removeAllChoices() {
	const promisesSelects = this.ui.selects.list.map(select => new Promise(resolve => {
	    this.scene.tweens.add({
		targets: select,
		alpha: 0,
		duration: duration.select,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	}));
	const promisesAbilities = this.ui.abilities.list.map(ability => new Promise(resolve => {
	    this.scene.tweens.add({
		targets: ability,
		alpha: 0.5,
		scale: ability.baseScale,
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	}));
	
	await Promise.all([...promisesSelects, ...promisesAbilities]);	
	
	return this;
    } // TODO: Change name to resetOptions
}
class GameLogic {
    constructor() {
	this.tiles = new Dict();
	this.dudes = new Dict();
	// this.actors = ['player0', 'player1', 'environment'];
	// this.turn = 'player0';
    }
    initialize({nrows, ncols}) {
	new PointSet().box([-1, -1], [nrows, ncols]).points.forEach(pos => {
	    return this.tiles.set(pos, 'outwall')
	});
	new PointSet().box([0, 0], [nrows-1, ncols-1]).points.forEach(pos => {
	    return this.tiles.set(pos, 'lava');
	});

	this.dudes.set([Math.floor(nrows/2)+1, Math.floor(ncols/2)-1], 'player0');
	this.dudes.set([Math.floor(nrows/2)+1, Math.floor(ncols/2)+1], 'player0');

	this.dudes.set([Math.floor(nrows/2)-1, Math.floor(ncols/2)-1], 'player1');
	this.dudes.set([Math.floor(nrows/2)-1, Math.floor(ncols/2)+1], 'player1');

	return this;
    }
    // Inquire -----------------------------------------------------------------
    find(where, filter) {
	return this[where].keys().filter(pos => filter(this.dudes.get(pos)));
    }
    collideByRay({origin, dir, offset=0}) {
	let current = origin;
	for (let i = 0; i<100; i++) { // Instead of dangerous while (true)
	    current = [current[0] + dir[0], current[1] + dir[1]];
	    const hit = this.dudes.get(current) || [this.tiles.get(current)].map(tile => {
		return (tile === 'lava')? null : tile;
	    })[0];
	    if (hit) {return [current[0] + offset*dir[0], current[1] + offset*dir[1]];}
	}
    }
    collideByStar({origin, offset=0}) {
	const dirs = [null].map(_ => {
	    return [
		[ 1,  0],
		[ 0,  1],
		[-1,  0],
		[ 0, -1],

		[ 1, -1],
		[-1,  1],
		[ 1,  1],
		[-1, -1],
	    ];
	})[0];
	return dirs.map(dir => this.collideByRay({origin, dir, offset}));
    }
    getMoves(origin) {
	return this
	    .collideByStar({origin, offset: -1})
	    .filter(pos => (pos[0] !== origin[0]) || (pos[1] !== origin[1]));
    }
}
class GameUI {
    constructor(scene) {
	this.scene = scene;
	this.tiles = null;
	this.selects = null;
	this.dudes = null;
	this.abilities = null;
    }
    async initialize({nrows, ncols, me, opponent}) {
	// this.makeBombSprite('empty', 'lava').setOrigin(0.5).x = 0;
	await this.makeTitle(me, opponent);
	await this.makeTiles(nrows, ncols);
	// await this.setStepCounter(3, 0xffff00); // await
	this.makeBackclick();
	this.makeSelects();
    }
    // Make --------------------------------------------------------------------
    async makeTitle(me, opponent) {
	const {width, height} = this.scene.scale;
	const title = this.scene.add.container(0.50*width, 0.50*height);

	[
	    this.scene.addText(-0.25*width, 0, `${me.name}`).setColor(me.color),
	    this.scene.addText(0, 0, `vs`).setColor('#ff4444'),
	    this.scene.addText(0.25*width, 0, `${opponent.name}`).setColor(opponent.color),
	].forEach(text => title.add(text.setAlpha(0)));


	for (const text of title.list) { // Animate text creation
	    await timeout(500);
	    this.scene.tweens.add({
		targets: text.setAlpha(1),
		scale: { from: 0, to: text.scale },
		duration: 1000,
		ease: 'Quint.InOut',
	    });
	}
	await timeout(1000);

	await new Promise(resolve => { // Move title to top
	    this.scene.tweens.add({ // Move title to top
		targets: title,
		y: 0.1*height,
		duration: 1000,
		ease: 'Quint.InOut',
		onComplete: resolve,
	    });
	});
	// ---------------------------------------------------------------------
	this.title = title;
	return this;
    }
    async makeTiles(nrows, ncols) {
	const {width, height} = this.scene.scale;
	const tiles = this.scene.add.container(0.5*width, 0.5*height);

	const points = new Array(nrows*ncols).fill(null)
	      .map((_, i) => [Math.floor(i / ncols), i % ncols]);
	points.forEach(([row, col]) => { // Create sprites
	    const step = 52;
	    const pos = [
		step*col - (ncols-1)*step/2,
		step*row - (nrows-1)*step/2,
	    ];
	    //const pos = [
	    //    step*col - (ncols-1)*step/2 + 0.5*width,
	    //    step*row + this.title.y + 100, // step*row - (nrows-1)*step/2 + 0.5*height,
	    //];
	    const tile = this.makeSprite('empty', ...pos).setAlpha(0.0);
	    tiles.add(tile);
	});

	tiles.y = this.title.y - tiles.list[0].y + 100;

	const promises = tiles.list.map((tile, i) => new Promise(async resolve => { // Animate creation
	    const [row, col] = [Math.floor(i/ncols), i % ncols];
	    const [rowCenter, colCenter] = [Math.floor(nrows/2), Math.floor(ncols/2)];
	    const delay = 50*Math.abs(row - rowCenter) + 50*Math.abs(col - colCenter);
	    await timeout(delay); // TODO: Can be delegated to tween?
	    this.scene.tweens.add({
		targets: tile.setTint(0xccffcc).setAlpha(0.2),
		scale: {from: 0, to: tile.scale},
		duration: 1000,
		ease: 'Quint.InOut',
		onComplete: resolve,
	    });
	}));
	await Promise.all(promises);
	// ---------------------------------------------------------------------
	this.tiles = tiles;
	this.nrows = nrows;
	this.ncols = ncols;
	return this;
    }
    // .........................................................................
    async makeDudes(dudesDict) {
	const container = this.scene.add.container(this.tiles.x, this.tiles.y)
	const dudes = new Dict();
	const promises = dudesDict.keys().map(async ([row, col]) => new Promise(resolve => {
	    const dude = this.makeSprite(dudesDict.get([row, col]));
	    dudes.set([row, col], dude);
	    container.add(dude);
	    const tile = this.tiles.list[row*this.ncols + col];	    
	    this.scene.tweens.add({
		targets: dude.setPosition(tile.x, tile.y),
		scale: {from: 0, to: dude.scale},
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	}));	
	await Promise.all(promises);	
	
	this.dudes = dudes;
	return this;
    }
    // -------------------------------------------------------------------------
    async makeAbilitiesCore(owner) { // TODO: remove owner?
	// Create --------------------------------------------------------------
	const makeAbility = abilityLabel => {
	    const ability = this.makeSprite(abilityLabel).setAlpha(0.5).setInteractive();
	    ability.abilityLabel = abilityLabel;	    
	    ability.on('pointerover', () => this.scene.tweens.add({
		targets: ability,
		scale: (ability.alpha>0.5)? 1.2*ability.baseScale : ability.baseScale, // HACK?
		duration: 300,
		ease: 'Quint.Out',
	    }));
	    ability.on('pointerout', () => this.scene.tweens.add({
		targets: ability,
		scale: ability.baseScale,
		duration: 300,
		ease: 'Quint.Out',
	    }));

	    return ability;
	};
	const makeBomb = (type1, type2) => {
	    const bomb = this.makeBombSprite(type1, type2).setAlpha(0.5).setInteractive();
	    bomb.abilityLabel = `explodeBomb-${type1}-${type2}`;
	    bomb.on('pointerover', () => this.scene.tweens.add({
		targets: bomb,
		scale: (bomb.alpha>0.5)? 1.2*bomb.baseScale : bomb.baseScale, // HACK?
		duration: 300,
		ease: 'Quint.Out',
	    }));
	    bomb.on('pointerout', () => this.scene.tweens.add({
		targets: bomb,
		scale: bomb.baseScale,
		duration: 300,
		ease: 'Quint.Out',
	    }));

	    return bomb;
	};
	
	const abilities = this.scene.add.container(this.tiles.x, this.tiles.y);
	abilities.add([
	    makeAbility('pass'),
	    makeBomb('empty', 'wall'),
	    makeBomb('empty', 'lava'),
	    makeBomb('wall', 'empty'),
	    makeBomb('wall', 'lava'),
	    makeBomb('lava', 'wall'),
	    makeBomb('lava', 'empty'),
	]);
	
	abilities.list.forEach(ability => { // Resize all as first and activate all
	    const first = abilities.list[0];
	    ability.setDisplaySize(first.displayWidth, first.displayHeight);
	    ability.baseScale = ability.scale;
	    ability.abilityActive = true;
	});
	[this.scene.scale].forEach(({width, height}) => { // Centralize
	    abilities.list.forEach((ability, i) => { // Align
		ability.x = [this.tiles.list].map(tiles => {
		    return (owner === 'me')? tiles[0].x - 100 : tiles[tiles.length - 1].x + 100
		})[0];
		ability.y = i*(ability.displayHeight + 10);
	    });
	    const offsetY = 0.5*(abilities.list[abilities.list.length-1].y + abilities.list[0].y);
	    const boardY = [this.tiles.list].map(tiles => 0.5*(tiles[0].y + tiles[tiles.length-1].y))[0];
	    abilities.y = abilities.y - offsetY + boardY;
	});
	const promises = abilities.list.map(ability => new Promise(resolve => { // Animate
	    this.scene.tweens.add({
		targets: ability.setAlpha(0.5),
		scale: {from: 0, to: ability.baseScale},
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	}));
	await Promise.all(promises);
	
	return abilities;
    }
    async makeAbilities() {
	this.abilities = await this.makeAbilitiesCore('me');
	return this;
    }
    async makeOpponentAbilities() {
	this.opponentAbilities = await this.makeAbilitiesCore('opponent');
	return this;
    }
    // .........................................................................
    setStepCounter(steps, inputColor) {
	const color = (typeof inputColor === 'string')
	      ? parseInt(inputColor.replace('#', ''), 16) : inputColor;
	
	if (this.stepCounter) {
	    const stepCounter = this.stepCounter;
	    this.scene.tweens.add({
		targets: stepCounter,
		alpha: 0,
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: () => stepCounter.destroy(),
	    });
	}
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const {width, height} = this.scene.scale;
	const x = 0;
	const y = [this.tiles.list].map(tiles => tiles[tiles.length-1].y + 100)[0];
	
	const background = this.makeSprite('stepCounter', x, y).setTint(color);	
	const text = this.scene.addText(x, y, steps).setTint(0xffffff);

	const container = this.scene.add.container(this.tiles.x, this.tiles.y).add([background, text]);
	container.list.forEach(thing => {
	    this.scene.tweens.add({
		targets: thing,
		...(this.stepCounter)? {alpha: {from: 0, to: 1}} : {scale: {from: 0, to: thing.scale}},
		duration: 1000,
		ease: 'Quint.Out',
	    });
	});
	
	this.stepCounter = container;
	return this;
    }
    makeSelects() {
	const selects = this.scene.add.container(this.tiles.x, this.tiles.y);
	this.tiles.list.forEach((tile, i) => {
	    const select = this.makeSprite('select', tile.x, tile.y).setAlpha(0.0).setInteractive();
	    //select.baseScale = select.scale;
	    //const baseScale = select.scale;
	    const [row, col] = [Math.floor(i / this.ncols), i % this.ncols];
	    select.on('pointerover', () => {
		this.scene.tweens.killTweensOf(select);
		this.scene.tweens.add({
		    targets: select,
		    scale: 1.2*select.baseScale,
		    duration: 300,
		    ease: 'Quint.Out',
		})
	    });
	    select.on('pointerout', () => {
		//this.scene.tweens.killTweensOf(select);
		this.scene.tweens.add({
		    targets: select,
		    scale: select.baseScale,
		    duration: 300,
		    ease: 'Quint.Out',
		})
	    });
	    selects.add(select);
	});
	// ---------------------------------------------------------------------
	this.selects = selects;
	return this;
    }
    makeBackclick() {
	this.backclick = this.makeSprite('backclick').setAlpha(1e-100).setInteractive(); // HACK 1e-100
	//this.backclick.on('pointerup', () => console.log('backclick'));
    }
    // Helpers -----------------------------------------------------------------
    async placeSprite([row, col], sprite, onComplete) {
	const tile = this.tiles.list[row*this.ncols + col];
	await new Promise(resolve => { // Animate creation
	    this.scene.tweens.add({
		targets: sprite.setPosition(tile.x, tile.y),
		scale: {from: 0, to: sprite.scale},
		duration: 1000,
		ease: 'Quint.InOut',
		onComplete: resolve,
	    });
	});
    }
    async replaceTile([row, col], tileType, transform = () => {}) {
	const i = row*this.ncols + col;
	const oldTile = this.tiles.list[i];
	const newTile = this.makeSprite(tileType).setPosition(oldTile.x, oldTile.y);
	transform(newTile);

	this.tiles.remove(oldTile);
	this.tiles.addAt(newTile, i);

	oldTile.setPosition(oldTile.x + this.tiles.x, oldTile.y + this.tiles.y);

	await new Promise(resolve => { // Animate replacement
	    this.scene.tweens.add({
		targets: newTile, //.setPosition(oldTile.x, oldTile.y),
		alpha: {from: 0, to: newTile.alpha},
		scale: {
		    from: newTile.scale * oldTile.displayHeight / newTile.displayHeight,
		    to: newTile.scale
		},
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: resolve,
	    });
	    this.scene.tweens.add({
		targets: oldTile,
		alpha: {from: oldTile.alpha, to: 0},
		scale: {
		    from: oldTile.scale,
		    to: oldTile.scale * newTile.displayHeight / oldTile.displayHeight
		},
		duration: 1000,
		ease: 'Quint.Out',
		onComplete: () => oldTile.destroy(),
	    });
	});
	return this;
    }
    async replaceTiles(tiles) {
	const promises = tiles.keys().map(async pos => {
	    const tileType = tiles.get(pos);
	    if (tileType == null || tileType == 'outwall') {return;}
	    await this.replaceTile(pos, tileType);
	});
	await Promise.all(promises);
	return this;
    }
    makeBombSprite(type1, type2, x, y) {
	const magnify = 10;
	const frame = ['empty']
	      .map(type => this.makeSprite(type, 0, 0).setOrigin(0))
	      .map(sprite => sprite.setScale(1.0*magnify*sprite.baseScale))[0];

	const [sprite1, sprite2] = [type1, type2]
	      .map(type => this.makeSprite(type, 0, 0).setOrigin(0))
	      .map(sprite => sprite.setScale(0.5*magnify*sprite.baseScale))
	      .map(sprite => sprite.setDisplaySize(0.5*frame.displayWidth, 0.5*frame.displayHeight));

	const width = sprite1.displayWidth + sprite2.displayWidth;
	const height = sprite1.displayHeight + sprite2.displayHeight;
	
	let renderTexture = this.scene.add.renderTexture(-1e+9, -1e+9, width, height); // HACK

	const offset = 0.07*sprite1.displayWidth;
	renderTexture.draw(frame, 0, 0);
	renderTexture.draw(sprite1, offset, offset);
	renderTexture.draw(sprite2, sprite1.displayWidth - offset, sprite1.displayHeight - offset);
	
	const combined = this.scene.add.sprite(x, y, renderTexture.texture).setScale(1/magnify);
	combined.baseScale = combined.scale;
	
	[frame, sprite1, sprite2].forEach(x => x.destroy());

	return combined;
    }
    makeSprite(type, x, y) {
	const sprite = [type].map(type => {
	    switch (type) {
	    case 'empty':
		return this.scene.add.sprite(x, y, 'empty').setDisplaySize(45, 45);
	    case 'wall':
		return this.scene.add.sprite(x, y, 'wall').setDisplaySize(50, 50);
	    case 'lava':
		return this.scene.add.sprite(x, y, 'lava').setDisplaySize(45, 45);
	    case 'player0':
		return this.scene.add.sprite(x, y, 'wall-dude').setTint(0xffff00).setDisplaySize(45, 45);
	    case 'player1':
		return this.scene.add.sprite(x, y, 'wall-dude').setTint(0x00aaff).setDisplaySize(45, 45);
	    case 'select':
		return this.scene.add.sprite(x, y, 'select').setTint(0x44ff44).setDisplaySize(50, 50);	    
	    case 'backclick':
		const {width, height} = this.scene.scale;
		return this.scene.add.sprite(0.5*width, 0.5*height, 'square').setDisplaySize(width, height);
	    case 'pass':
		return this.scene.add.sprite(x, y, 'pass').setDisplaySize(50, 50);
	    case 'resign':
		return this.scene.add.sprite(x, y, 'resign').setDisplaySize(50, 50);
	    case 'spawnWall':
		return this.scene.add.sprite(x, y, 'wall').setDisplaySize(50, 50);
	    case 'spawnLava':
		return this.scene.add.sprite(x, y, 'lava').setDisplaySize(50, 50);
	    case 'stepCounter':
		return this.scene.add.sprite(x, y, 'select').setDisplaySize(75, 75);
	    default:
		return;
	    }
	})[0];
	sprite.baseScale = sprite.scale;
	return sprite;
    }
}
// Data structures -------------------------------------------------------------
class PointSet {
    constructor(points=[]) {
	this.points = points;
    }
    ray(source, dir, steps) {
	new Array(steps).fill(null).forEach((_, i) => this.points.push([
	    source[0] + dir[0]*i, source[1] + dir[1]*i,
	]));
	return this;
    }
    box(topLeft, botRight) {
	return this
	    .ray(topLeft,  [ 1,  0], botRight[0] - topLeft[0] + 1)
	    .ray(topLeft,  [ 0,  1], botRight[1] - topLeft[1] + 1)
	    .ray(botRight, [-1,  0], botRight[0] - topLeft[0])
	    .ray(botRight, [ 0, -1], botRight[1] - topLeft[1])
	    .unique();
    }
    grid(topLeft, botRight) { // Deletable
	const nrows = botRight[0] - topLeft[0] + 1;
	const ncols = botRight[1] - topLeft[1] + 1
	new Array(nrows).fill(0).map((_, row) => {
	    this.ray([topLeft[0] + row, topLeft[1]], [0, 1], ncols);
	});
	return this;
    }
    unique() {
	this.points = [...new Set(this.points.map(p => JSON.stringify(p)))].map(sp => JSON.parse(sp));
	return this;
    }
}
