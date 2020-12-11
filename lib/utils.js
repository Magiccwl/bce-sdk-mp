// It replaces pick in lodash
export function pick(object, keys) {
    return keys.reduce((obj, key) => {
       if (object && object.hasOwnProperty(key)) {
          obj[key] = object[key];
       }
       return obj;
    }, {});
}

// It replaces pickBy in lodash
export function pickBy(object) {
    const obj = {};
    for (const key in object) {
        if (object[key]) {
            obj[key] = object[key];
        }
    }
    return obj;
}

// It replaces fromPairs in lodash
export function fromPairs(arr) {
    return arr.reduce(function(accumulator, value) {
        accumulator[value[0]] = value[1];
        return accumulator;
    }, {});
}
