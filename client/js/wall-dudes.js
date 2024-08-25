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
	// this.load.image('bomb', './js/game-assets/bomb.svg');
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
    async initialize({me, opponent, nrows, ncols, history}) {
	this.nrows = nrows;
	this.ncols = ncols;

	this.me = me;
	this.opponent = opponent;

	this.history = history;
	
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

	this.logic = new GameLogic().initialize({nrows, ncols}).withHistory(history);
	this.ui = await new GameUI(this.scene).initialize({me, opponent, nrows, ncols});
	
	await Promise.all([
	    this.ui.replaceTiles(this.logic.tiles),
	    this.ui.makeDudes(this.logic.dudes),
	    this.ui.makeAbilities(),
	    this.ui.makeOpponentAbilities(),
	]);

	return this;
    }
    async play(myIdx, exchange) {
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	const myTurn = [myIdx].map(myIdx => {
	    const myTurnFirst = myIdx === 0;
	    const numPasses = this.history.filter(turnData => turnData.ability === 'pass').length;
	    return ((myTurnFirst + numPasses) % 2) == 1;
	})[0];
	// console.log({myTurn, myIdx})
	// console.log(this.history.map(td => td.ability))
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
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
	    game.ui.setStepCounter(turnData.steps, game.me.color);
	    const choice = await Promise.race(choices); game.removeAllChoices();

	    // if (choice.ability) { choice.ability = choice.ability.split('-')[0];}
	    turnData.ability = choice.ability || turnData.ability;
	    
	    turnData.origin = choice.origin || turnData.origin;
	    turnData.target = choice.target || null;
	    
	    return choice;
	};
	const makeTransformTile = type => async (context) => {
	    const {myIdx, exchange, game, turnData} = context;
	    if (turnData.steps === 3) { return 'selectDude'; }

	    
	    await exchange(turnData);
	    // const {outOfSync} = await exchange(turnData); if (outOfSync) {return;}
	    turnData.ability = type;
	    const [from, to] = type.split('-').slice(1);
	    game.transformTiles(turnData.origin, from, to);
	    
	    turnData.target = null; // Needed? Is nice ot have for logging, but maybe have at a different place

	    game.removeAbilities('me', type);
	    
	    return 'pass';
	};
	const transformTileStates = [{}].map(transformTileStates => {
	    this.ui.abilities.list.forEach(ability => {
		const label = ability.abilityLabel;
		if (!label.startsWith('transformTiles')) {return;}
		transformTileStates[label] = makeTransformTile(label);
	    });
	    return transformTileStates;
	})[0];
	// ---------------------------------------------------------------------
	const UIStates = {
	    // My turn ---------------------------------------------------------
	    startOrResumeTurn: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		
		if (Object.keys(turnData).length === 0) { return 'startTurn'; }
		if (turnData.steps === 3) { return 'selectDude'; }
		if (turnData.steps < 3) {
		    turnData.origin = turnData.target || turnData.origin;
		    turnData.target = null;
		    return 'moveDude';
		}

		return; // Fail?
	    },
	    startTurn: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		
		turnData.steps = 3;
		turnData.origin = null;
		turnData.target = null;
		turnData.ability = null;

		// game.ui.setStepCounter(3, game.me.color);

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
		// game.ui.setStepCounter(turnData.steps, game.me.color);
		const choice = await getChoice({context, options});

		if (choice.backclick) {
		    return (turnData.steps===3)? 'selectDude' : 'moveDude';
		}
		if (choice.origin) {
		    return 'moveDude';
		}
		if (choice.target) {
		    turnData.steps -= 1;
		    await exchange(turnData);
		    // const {outOfSync} = await exchange(turnData); if (outOfSync) {return;}
		    game.moveDude(turnData.origin, turnData.target);
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
		turnData.steps = 3;

		await exchange(turnData);
		// const {outOfSync} = await exchange(turnData); if (outOfSync) {return;}
		
		return 'startAwaitOpponent';
	    },
	    ...transformTileStates,
	    // Opponent turn ---------------------------------------------------
	    startAwaitOpponent: async (context) => {
		const {myIdx, exchange, game, turnData} = context;
		game.ui.setStepCounter(turnData.steps, game.opponent.color);
		// game.ui.setStepCounter(3, game.opponent.color);
		return 'awaitOpponent';
	    },
	    awaitOpponent: async (context) => {
		const {myIdx, exchange, game} = context;

		const turnData = await exchange(null);
		//const turnData = await exchange(null); if (turnData.outOfSync) { return; }
		game.ui.setStepCounter(turnData.steps, game.opponent.color);

		if (turnData.ability === 'pass') {
		    return 'startTurn';
		}
		if (turnData.ability === 'moveDude') {
		    game.moveDude(turnData.origin, turnData.target);
		    return 'awaitOpponent';
		}
		if (turnData.ability.startsWith('transformTiles')) {
		    const [from, to] = turnData.ability.split('-').slice(1);
		    game.transformTiles(turnData.origin, from, to);
		    game.removeAbilities('opponent', turnData.ability);
		    return 'awaitOpponent';
		}
		
		return 'awaitOpponent';
	    },
	};	
	await new CompStateMachine(UIStates).run({
	    start: (myTurn)? 'startOrResumeTurn': 'startAwaitOpponent',
	    context: {myIdx, exchange, game: this,
		      turnData: this.history[this.history.length-1] || {}},
	    // Remove myIdx?
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
    // .........................................................................
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
    }
    // Do stuff ----------------------------------------------------------------
    async moveDude(origin, target) {
	// Logic ---------------------------------------------------------------
	this.logic.moveDude(origin, target);
	// UI ------------------------------------------------------------------
	const dude = this.ui.dudes.get(origin);
	const tile = this.ui.tiles.list[target[0]*this.ncols + target[1]];
	
	this.ui.dudes.remove(origin);
	this.ui.dudes.set(target, dude);
	this.ui.replaceTile(origin, 'wall');

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
    async transformTiles(pos, fromType, toType) {
	this.logic.transformTiles(pos, fromType, toType)
	    .forEach(async (pt) => {
		const newTileType = this.logic.tiles.get(pt) || 'empty';
		await this.ui.replaceTile(pt, newTileType);
	    });

	return this;
    }
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
    withHistory(history) {
	history.forEach(turnData => {
	    if (turnData.ability === 'moveDude') {
		this.moveDude(turnData.origin, turnData.target);
	    }
	    if (turnData.ability.startsWith('transformTiles')) {
		const [fromType, toType] = turnData.ability.split('-').slice(1);
		this.transformTiles(turnData.origin, fromType, toType);
	    }
	});
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
    // Do stuff ----------------------------------------------------------------
    moveDude(origin, target) {
	const logicDude = this.dudes.get(origin);
	this.dudes.remove(origin);
	this.dudes.set(target, logicDude);
	this.tiles.set(origin, 'wall');
	
	return this;
    }
    transformTiles([row, col], fromType, toType) {
	const canChange = pos => {
	    const currentType = this.tiles.get(pos) || 'empty';
	    return currentType === fromType && !this.dudes.get(pos);
	};
	const transformedPoints = new PointSet()
	      .box([row-1, col-1], [row+1, col+1]).points
	      .filter(canChange)
	      .map(pos => {
		  this.tiles.set(pos, (toType==='empty')? undefined : toType);
		  return pos;
	      });
	
	return transformedPoints;
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
	// this.makeTransformTile('empty', 'lava').setOrigin(0.5).x = 0;
	await this.makeTitle(me, opponent);
	await this.makeTiles(nrows, ncols);
	// await this.setStepCounter(3, 0xffff00); // await
	this.makeBackclick();
	this.makeSelects();
	
	return this;
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
	// console.log({dudesDict})
	
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
	const makeTransformTile = (type1, type2) => {
	    const transformTile = this.makeTransformTile(type1, type2).setAlpha(0.5).setInteractive();
	    transformTile.abilityLabel = `transformTiles-${type1}-${type2}`;
	    transformTile.on('pointerover', () => this.scene.tweens.add({
		targets: transformTile,
		scale: (transformTile.alpha>0.5)? 1.2*transformTile.baseScale : transformTile.baseScale, // HACK?
		duration: 300,
		ease: 'Quint.Out',
	    }));
	    transformTile.on('pointerout', () => this.scene.tweens.add({
		targets: transformTile,
		scale: transformTile.baseScale,
		duration: 300,
		ease: 'Quint.Out',
	    }));

	    return transformTile;
	};
	
	const abilities = this.scene.add.container(this.tiles.x, this.tiles.y);
	abilities.add([
	    makeAbility('pass'),
	    makeTransformTile('empty', 'lava'),
	    makeTransformTile('empty', 'wall'),
	    makeTransformTile('wall', 'lava'),
	    makeTransformTile('wall', 'empty'),
	    makeTransformTile('lava', 'wall'),
	    makeTransformTile('lava', 'empty'),
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
    makeTransformTile(type1, type2, x, y) {
	const magnify = 10;
	const frame = ['empty']
	      .map(type => this.makeSprite(type, 0, 0).setOrigin(0))
	      .map(sprite => sprite.setAlpha(1))
	      .map(sprite => sprite.setScale(1.0*magnify*sprite.baseScale))[0];

	const [sprite1, sprite2] = [type1, type2]
	      .map(type => this.makeSprite(type, 0, 0).setOrigin(0))
	      .map(sprite => sprite.setAlpha(1))
	      .map(sprite => sprite.setTint(0xffffff))
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
		return this.scene.add.sprite(x, y, 'empty').setDisplaySize(45, 45).setAlpha(0.2);
	    case 'wall':
		return this.scene.add.sprite(x, y, 'wall').setDisplaySize(50, 50);
	    case 'lava':
		return this.scene.add.sprite(x, y, 'lava').setDisplaySize(45, 45).setTint(0xcccccc);
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
