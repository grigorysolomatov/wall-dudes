export class Dict {
    constructor() {
	this.dict = {};
    }
    get(key) {
	return this.dict[JSON.stringify(key)]
    }
    set(key, value) {
	this.dict[JSON.stringify(key)] = value;
	if (value === undefined) { this.remove(key); } // Hack?
	return this;
    }
    remove(key) {
	delete this.dict[JSON.stringify(key)];
	return this;
    }
    keys() {
	return Object.keys(this.dict).map(strKey => JSON.parse(strKey));
    }
    values() {
	return this.keys().map(key => this.get(key));
    }
}
