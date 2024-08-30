export class StoredObject {
    constructor(key) {
	this.key = key;
    }
    withDefaults(defaults) {
	this.defaults = defaults;
	
	return this;
    }
    read() {
	const key = this.key;
	// ---------------------------------------------------------------------
	const data = JSON.parse(localStorage.getItem(key));
	
	return {...this.defaults, ...data};
    }
    write(data) {
	const key = this.key;
	// ---------------------------------------------------------------------
	localStorage.setItem(key, JSON.stringify(data));

	return this;
    }
}
