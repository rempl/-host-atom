'use babel';

import { Emitter } from 'atom';

export default class Panel {
    constructor() {
        this.emitter = new Emitter;
        this.title = 'untitled panel';
    }

    getTitle() {
        return this.title;
    }

    updateTitle() {
        this.emitter.emit('did-change-title', this.getTitle());
    }

    destroy() {
        this.emitter.emit('did-destroy', this);
        this.emitter.dispose();
    }

    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }

    onDidChangeTitle(callback) {
        return this.emitter.on('did-change-title', callback);
    }
}
