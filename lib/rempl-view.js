'use babel';

import Panel from './panel';

var ElementProto = Object.create(HTMLElement.prototype);

ElementProto.createdCallback = function () {
    this.iframe = document.createElement('iframe');
    this.iframe.classList.add('rempl-view-iframe');
    this.appendChild(this.iframe);
};

ElementProto.attachedCallback = function () {
    this.dispatchEvent(new CustomEvent('attached'));
};

ElementProto.detachedCallback = function () {
    this.dispatchEvent(new CustomEvent('detached'));
};

ElementProto.setServer = function (url) {
    this.iframe.src = url;
};

var Element = document.registerElement('rempl-view', { prototype: ElementProto });

export { Element };
export function createElement(model) {
    var element = new Element();

    element.setServer(model.url);

    return element;
}

export class View extends Panel {
    constructor(url) {
        super();
        this.url = url;
    }

    getTitle() {
        return `Rempl - ${this.url}`;
    }

    serialize() {
        return { deserializer: 'ClientDeserializer', url: this.url };
    }

    copy() {
        return new View(this.url);
    }
}
