export function coolChain(obj) {
    return {...obj}
}
export const consider = (obj) => ({...obj, but: (func) => consider(func(obj))});

export function chain(obj) {
    obj.set = (dict) => {
	Object.keys(dict).forEach(key => {
	    obj[key] = dict[key];
	});
	return obj;
    };
    obj.get = (func) => {
	func(obj)
	return obj;
    };
    return obj;
}
