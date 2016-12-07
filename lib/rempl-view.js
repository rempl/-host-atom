'use babel';

export function createElement(model) {
    var element = new Element();
    
    element.setServer(model.url);

    return element;
}

var ElementProto = Object.create(HTMLElement.prototype);

ElementProto.setServer = function(url) {
    this.iframe.src = url;
};
ElementProto.createdCallback = function() {
    this.iframe = document.createElement('iframe');
    this.iframe.classList.add('rempl-view-iframe');
    this.appendChild(this.iframe);
}

var Element = document.registerElement('rempl-view', { prototype: ElementProto });

export {Element};
export class View {
    constructor(url) {
        this.url = url;
    }
    getTitle() {
        return `Rempl - ${this.url}`;
    }
    serialize() {
        return { url: this.url };
    }
    static deserialize(state) {
        return new View(state.url);
    }
}