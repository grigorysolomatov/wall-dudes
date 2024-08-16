import * as storage from './storage.js';

export class MemStorage {
    setDefaults(defaults) {
	this.defaults = defaults;
	return this;
    }
    recall(...keys) {
	this.memory = {...storage.getByKeys(...keys), ...this.memory};
	
	Object.keys(this.defaults).forEach(key => {
	    this.memory[key] = this.memory[key] || this.defaults[key];
	});
	storage.set(this.memory);
	return this;
    }
    set(dict) {
	this.memory = {...this.memory, ...dict};
	storage.set(this.memory);
	return this;
    }
    get(key) {
	return this.memory[key];
    }
}
