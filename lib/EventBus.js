export default class EventBus {
    constructor () {
        this._events = {}
    }

    on (name, func) {
        if (!this._events[name]) {
            this._events[name] = []
        }
        if (this._events[name].indexOf(func) > -1) {
            return
        }
        this._events[name].push(func)
    }

    off (name, func) {
        if (!func) {
            this._events[name] = []
            return
        }
        this._events[name] = this._events[name].filter(function (f) {
            return f !== func
        })
    }

    emit (name, ...args) {
        const funcs = this._events[name] || []
        funcs.forEach(func => func(...args))
    }
}
