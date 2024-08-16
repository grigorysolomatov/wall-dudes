function makeSprite(scene, type, x, y) {
    switch (type) {
    case 'empty':	
	return scene.add.sprite(x, y, 'empty').setDisplaySize(45, 45);
    case 'wall':
	return scene.add.sprite(x, y, 'wall').setDisplaySize(50, 50);
    case 'lava':
	return scene.add.sprite(x, y, 'lava').setDisplaySize(45, 45);
    case 'player0':
	return scene.add.sprite(x, y, 'wall-dude').setTint(0xffff00).setDisplaySize(45, 45);
    case 'player1':
	return scene.add.sprite(x, y, 'wall-dude').setTint(0x00aaff).setDisplaySize(45, 45);
    case 'select':
	return scene.add.sprite(x, y, 'select').setTint(0x44ff44).setDisplaySize(50, 50);
    default:
	return;
    }
}
