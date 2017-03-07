'use babel';

import { TextBuffer } from 'atom';

var ElementProto = Object.create(HTMLElement.prototype);

ElementProto.setEditor = function(editor) {
    this.editor = editor;
    this.appendChild(atom.views.getView(editor));
};

var Element = document.registerElement('rempl-server-dialog-view', { prototype: ElementProto });

export { Element };
export function createElement(model) {
    var element = new Element();

    element.setEditor(model.editor);

    return element;
};
export class View {
    constructor() {
        this.editor = atom.workspace.buildTextEditor({
            mini: true,
            tabLength: 2,
            softTabs: true,
            softWrapped: false,
            buffer: new TextBuffer(),
            placeholderText: 'Rempl server URL'
        });
    }

    serialize() {
        return {};
    }
};
