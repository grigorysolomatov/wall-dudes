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
    }
    create() {
	this.onCreate(this);
    }
    addText(...args) {
	const text = this.add.text(...args, {
            font: '32px Times New Roman',
            fill: '#ffffff',
	}).setOrigin(0.5);
	return text;
    }
}

// Classes ---------------------------------------------------------------------
class Game {
    constructor() {
	this.scene = null
	this.logic = null;
	this.ui = null;
    }
    async makeScene() {
	this.scene = new MainScene();
	new Phaser.Game({
	    width: 900,
	    height: 900,
	    backgroundColor: '#000000',
	    // .................................................................
	    parent: 'phaser-window',
	    type: Phaser.WEBGL,
	    scene: this.scene,
	});
	await new Promise(resolve => {
	    this.scene.onCreate = resolve;
	});
	return this;
    }
    makeLogic() {
	this.logic = new GameLogic();
	return this;
    }
    makeUI() {
	this.ui = new GameUI(this.scene);
	return this;
    }    
}
// .............................................................................
class GameLogic {
    constructor() {
	this.tiles = new Dict();
	this.dudes = new Dict();
    }
}
class GameUI {
    constructor(scene) {
	this.scene = scene;
	this.tiles = null;
	this.selects = null;
	//this.dudes = null;
    }
    async makeTitle(me, opponent) {
	const {height, width} = this.scene.scale;
	const title = this.scene.add.container();

	[this.scene.addText(0.25*width, 0.5*height, `${me.name}`)
	 .setColor(me.color),
	 this.scene.addText(0.75*width, 0.5*height, `${opponent.name}`)
	 .setColor(opponent.color),
	 this.scene.addText(0.50*width, 0.5*height, `vs`)
	 .setColor('#ffff44'),
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
		y: -0.5*height + 0.1*height,
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
	const {height, width} = this.scene.scale;
	const tiles = this.scene.add.container();

	const points = new Array(nrows*ncols).fill(null)
	      .map((_, i) => [Math.floor(i / ncols), i % ncols]);
	points.forEach(([row, col]) => { // Create sprites
	    const step = 52;
	    const tile = makeSprite(
		this.scene,
		'empty',
		step*col + 0.5*width - (ncols-1)*step/2, // Is this correct?
		step*row + 0.5*height - (nrows-1)*step/2, // Is this correct?
	    ).setAlpha(0.0);
	    tiles.add(tile);
	});

	const promises = tiles.list.map(async (tile, i) => { // Animate creation
	    const [row, col] = [Math.floor(i/ncols), i % ncols];
	    const [rowCenter, colCenter] = [Math.floor(nrows/2), Math.floor(ncols/2)];
	    const delay = 50*Math.abs(row - rowCenter) + 50*Math.abs(col - colCenter);
	    await timeout(delay);
	    return new Promise(resolve => { // Animate creation
		this.scene.tweens.add({
		    targets: tile.setTint(0xccffcc).setAlpha(0.2),
		    scale: {from: 0, to: tile.scale},
		    duration: 1000,
		    ease: 'Quint.InOut',
		    onComplete: resolve,
		});
	    });
	});
	await Promise.all(promises);
	// ---------------------------------------------------------------------
	this.tiles = tiles;
	this.nrows = nrows;
	this.ncols = ncols;
	return this;
    }
    async replaceTile([row, col], tile) {
	const i = row*this.ncols + col;
	const oldTile = this.tiles.list[i];
	const newTile = tile;
	
	this.tiles.remove(oldTile);
	this.tiles.addAt(newTile, i);

	await new Promise(resolve => {
	    this.scene.tweens.add({
		targets: newTile.setPosition(oldTile.x, oldTile.y),
		alpha: {from: 0, to: newTile.alpha},
		scale: {
		    from: newTile.scale * oldTile.displayHeight / newTile.displayHeight,
		    to: newTile.scale
		},
		duration: 1000,
		ease: 'Quint.InOut',
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
		ease: 'Quint.InOut',
		onComplete: () => oldTile.destroy(),
	    });
	});
	return this;
    }
    placeSprite([row, col], sprite) {
	const tile = this.tiles.list[row*this.ncols + col];	
	this.scene.tweens.add({
	    targets: sprite.setPosition(tile.x, tile.y),
	    scale: {from: 0, to: sprite.scale},
	    duration: 1000,
	    ease: 'Quint.InOut',
	});
    }
    async replaceTiles(tiles) {
	const promises = tiles.keys().map(async pos => {
	    const tileType = tiles.get(pos);
	    if (tileType == null || tileType == 'outwall') {return;}
	    const newTile = makeSprite(this.scene, tileType);
	    await this.replaceTile(pos, newTile);
	    return;
	});
	await Promise.all(promises);
	
	return this;
    }
    makeDudes(dudes) {
	dudes.keys().forEach(pos => {
	    const dude = makeSprite(this.scene, dudes.get(pos));
	    this.placeSprite(pos, dude);
	});
	return this;
    }
    makeSelects() {
	const selects = this.scene.add.container();
	this.tiles.list.forEach(tile => {
	    const select = this.scene.add.sprite(tile.x, tile.y, 'select')
		  .setDisplaySize(50, 50).setTint(0x44ff44).setAlpha(0.0);
	    selects.add(select);
	});
	// ---------------------------------------------------------------------
	this.selects = selects;
	return this;
    }
}
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
class Dict {
    constructor() {
	this.dict = {};
    }
    get(key) {
	return this.dict[JSON.stringify(key)]
    }
    set(key, value) {
	this.dict[JSON.stringify(key)] = value;
	return this;
    }
    keys() {
	return Object.keys(this.dict).map(strKey => JSON.parse(strKey));
    }
}
// Functions -------------------------------------------------------------------
function timeout(ms, value) {
    return new Promise(
	resolve => setTimeout(() => resolve(value), ms)
    );    
}
function makeSprite(scene, type, x, y) {
    switch (type) {
    case 'empty':	
	return scene.add.sprite(x, y, 'empty').setDisplaySize(45, 45);
    case 'wall':
	return scene.add.sprite(x, y, 'wall').setDisplaySize(50, 50);
    case 'lava':
	return scene.add.sprite(x, y, 'lava').setDisplaySize(45, 45);
    case 'player0':
	return scene.add.sprite(0, 0, 'wall-dude').setTint(0xffff00).setDisplaySize(50, 50);
    case 'player1':
	return scene.add.sprite(0, 0, 'wall-dude').setTint(0x00aaff).setDisplaySize(50, 50);
    default:
	return;
    }
}
// Export ----------------------------------------------------------------------
export async function start({me, opponent, nrows=7, ncols=9}) {
    const game = [(await new Game().makeScene()).makeLogic().makeUI()].map(game => {
	// const {nrows, ncols} = settings;
	[game.logic].map(gameLogic => {
	    new PointSet().box([-1, -1], [nrows, ncols]).points.forEach(pos => {
		return gameLogic.tiles.set(pos, 'outwall')
	    });
	    new PointSet().box([0, 0], [nrows-1, ncols-1]).points.forEach(pos => {
		return gameLogic.tiles.set(pos, 'lava');
	    });

	    gameLogic.dudes.set([Math.floor(nrows/2)+1, Math.floor(ncols/2)-1], 'player0');
	    gameLogic.dudes.set([Math.floor(nrows/2)+1, Math.floor(ncols/2)+1], 'player0');
	    
	    gameLogic.dudes.set([Math.floor(nrows/2)-1, Math.floor(ncols/2)-1], 'player1');
	    gameLogic.dudes.set([Math.floor(nrows/2)-1, Math.floor(ncols/2)+1], 'player1');
	    
	    return gameLogic;
	});
	[game.ui].map(async gameUI => {
	    await gameUI.makeTitle(me, opponent);
	    await gameUI.makeTiles(nrows, ncols);
	    gameUI
		.replaceTiles(game.logic.tiles)
		.makeDudes(game.logic.dudes)
		.makeSelects();
	    return gameUI;
	});
	
	return game;
    })[0];
    return game;
}
