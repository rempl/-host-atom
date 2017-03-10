'use babel';

var ElementProto = Object.create(HTMLElement.prototype);

ElementProto.createdCallback = function() {
};

ElementProto.setContent = function(content) {
    this.innerHTML = content;
};

var Element = document.registerElement('rempl-status-bar', { prototype: ElementProto });

export { Element };
export function createElement(model) {
    var element = new Element();

    return model.element = element;
}
export class View {
    setContent(content) {
        this.element.setContent(content);
    }
}
