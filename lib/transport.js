'use babel';

const utils = require('rempl/src/utils');
let DEBUG = false;

function subscribe(target, fn) {
    let mappedSource = this.sources.get(target);

    if (!mappedSource) {
        return;
    }

    mappedSource.subscribers.push({
        fn: fn
    });
}

function apiSend(target, ...args) {
    let mappedSource = this.sources.get(target);
    let callback = false;

    if (!mappedSource || !mappedSource.inited) {
        return;
    }

    if (args.length && typeof args[args.length - 1] === 'function') {
        callback = utils.genUID();
        mappedSource.callbacks[callback] = args.pop();
    }

    this.send(target, mappedSource.channelId, {
        type: 'data',
        endpoint: mappedSource.endpointName,
        callback: callback,
        data: args
    });
}

function addSourceToMap(source) {
    if (!this.sources.has(source)) {
        this.sources.set(source, {
            inited: false,
            callbacks: {},
            subscribers: [],
            channelId: '',
            endpointName: '',
            api: {
                send: apiSend.bind(this, source),
                subscribe: subscribe.bind(this, source)
            }
        });
    }

    return this.sources.get(source);
}

function wrapCallback(target, callback) {
    return (...args) => {
        this.send(target, {
            type: 'callback',
            callback: callback,
            data: args
        });
    };
}

function onConnect(source, payload) {
    let mappedSource = this.sources.get(source);

    if (!payload.input || !payload.name) {
        return;
    }

    if (!mappedSource) {
        mappedSource = addSourceToMap.call(this, source);
    }

    if (mappedSource.endpointName != payload.name) {
        mappedSource.callbacks = [];
    }

    mappedSource.endpointName = payload.name;
    mappedSource.channelId = payload.input;

    if (!mappedSource.inited) {
        let waiting = this.waitingCallbacks.get(source);

        if (waiting) {
            waiting.forEach(fn => {
                fn(mappedSource.api);
            });
            waiting.length = 0;
        }
    }

    mappedSource.inited = true;

    if (!payload.output) {
        this.handshake(source, payload.input);
    }
}

function onData(source, payload) {
    let mappedSource = this.sources.get(source);

    if (!mappedSource) {
        if (DEBUG) {
            utils.error('[rempl][host-event-transport] Unknown source', payload);
        }

        return;
    }

    switch (payload.type) {
        case 'callback':
            if (mappedSource.callbacks.hasOwnProperty(payload.callback)) {
                mappedSource.callbacks[payload.callback].apply(null, payload.data);
                delete mappedSource.callbacks[payload.callback];
            }

            break;

        case 'data': {
            let args = [...payload.data];
            let callback = payload.callback;

            if (callback) {
                args.push(wrapCallback(source, callback));
            }

            mappedSource.subscribers.forEach(subscriber => {
                subscriber.fn(...args);
            });

            break;
        }

        default:
            if (DEBUG) {
                utils.warn(`[rempl][host-event-transport] Unknown message type ${payload.type}`, payload);
            }
    }
}

function HANDLER_ON_MESSAGE(e) {
    let data = e.data || {};

    if (DEBUG) {
        let mappedSource = this.sources.get(e.source);

        if (mappedSource) {
            utils.warn(`[rempl][host-event-transport] message from ${mappedSource.channelId}`, e.data);
        }
    }

    switch (data.channel) {
        case `${this.connectTo}:connect`:
            onConnect.call(this, e.source, data.payload || {});
            break;

        case this.inputChannelId:
            onData.call(this, e.source, data.payload || {});
            break;
    }
}

export class EventTransport {
    constructor(name, connectTo, options) {
        if (!options) {
            options = {};
        }

        this.name = name;
        this.connectTo = connectTo;
        this.inputChannelId = name + ':' + utils.genUID();
        this.sources = new Map();
        this.waitingCallbacks = new Map();
        this.onMessageHandler = HANDLER_ON_MESSAGE.bind(this);
        this.configObserver = atom.config.observe('rempl-host.debug', value => DEBUG = value);

        addEventListener('message', this.onMessageHandler, false);
    }

    handshake(target, output) {
        this.send(target, `${this.name}:connect`, {
            input: this.inputChannelId,
            output
        });
    }

    send(target, channelId, payload) {
        if (typeof target.postMessage === 'function') {
            if (DEBUG) {
                let mappedSource = this.sources.get(target);

                utils.warn(`[rempl][host-event-transport] sending message to ${mappedSource.channelId}`, {
                    channel: channelId,
                    payload: payload
                });
            }

            target.postMessage({
                channel: channelId,
                payload: payload
            }, '*');
        }
    }

    getEnv(target, fn) {
        if (!target) {
            return null;
        }

        let mappedSource = this.sources.get(target);

        if (!mappedSource) {
            let waiting = this.waitingCallbacks.get(target);

            if (!waiting) {
                this.waitingCallbacks.set(target, [fn]);
            } else if (waiting.indexOf(fn) == -1) {
                waiting.push(fn);
            }
        } else {
            fn(mappedSource.api);
        }
    }

    cleanupTargets() {
        let toRemove = [];

        this.sources.forEach((api, source) => {
            if (!source.parent) {
                toRemove.push(source);
            }
        });

        toRemove.forEach(source => this.removeTarget(source));
    }

    removeTarget(target) {
        this.sources.delete(target);
        this.waitingCallbacks.delete(target);
    }

    dispose() {
        removeEventListener('message', this.onMessageHandler, false);
        this.configObserver.dispose();
        this.sources.clear();
    }
}
