export function set(dict) {
    Object.keys(dict).forEach(key => {
	localStorage.setItem(key, JSON.stringify(dict[key]));
    });
}
export function getByKeys(...keys) {
    const res = {};
    keys.forEach(key => {
	res[key] = JSON.parse(localStorage.getItem(key));
    });
    return res;
}
export function getByKey(key) {
    return getByKeys(key)[key];
}
