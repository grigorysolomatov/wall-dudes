export class Dict {
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
