'use babel';

import { Emitter } from 'atom';

export default class Panel {
    constructor() {
        this.emitter = new Emitter;
    }

    destroy() {
        this.emitter.emit('did-destroy', this);
        this.emitter.dispose();
    }

    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
};
