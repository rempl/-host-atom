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
    constructor(url, publisher) {
        super();
        this.url = url;
        this.host = url.match(/https?:\/\/([^\/]+)/);

        if (this.host && this.host[1]) {
            this.host = this.host[1];
        } else {
            this.host = 'unknown rempl host';
        }

        this.setPublisher(publisher);
        this.updateTitle();
    }

    getTitle() {
        let publisher = this.publisher.name || '';

        if (publisher) {
            publisher = '/' + publisher;
        }

        return this.host + publisher;
    }

    setPublisher(publisher) {
        this.publisher = publisher || {};
    }

    serialize() {
        return { deserializer: 'ClientDeserializer', url: this.url, publisher: this.publisher };
    }

    copy() {
        let view = new View(this.url, this.publisher);

        view.allowToGetContent = this.allowToGetContent;

        return view;
    }
}
