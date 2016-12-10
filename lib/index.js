'use babel';

import {CompositeDisposable, Disposable} from 'atom';
import {View as RemplView, createElement as createRemplView} from './rempl-view';
import {View as ServerDialogView, createElement as createServerDialog} from './server-dialog-view';

const DEFAULT_SERVER_URL = 'http://localhost:8177';

class RemplClient {
    activate() {
        var onChooseServer = () => {
            var serverUrl = this.serverInput.item.editor.getText();

            atom.workspace.getActivePane().addItem(new RemplView(serverUrl));
            atom.workspace.getActivePane().activateNextItem();
            this.serverInput.item.editor.setText(DEFAULT_SERVER_URL);
            this.serverInput.hide();
        };
        var onCancelChoose = () => {
            if (this.serverInput.isVisible()) {
                this.serverInput.item.editor.setText(DEFAULT_SERVER_URL);
                this.serverInput.hide();
            }
        };

        this.disposable = new CompositeDisposable();
        this.disposable.add(atom.views.addViewProvider(RemplView, createRemplView));
        this.disposable.add(atom.views.addViewProvider(ServerDialogView, createServerDialog));
        this.disposable.add(atom.commands.add('atom-workspace', {
            'rempl:connect': () => {
                this.serverInput.show();
                this.serverInput.item.editor.element.focus();
            }
        }));

        this.serverInput = atom.workspace.addModalPanel({ item: new ServerDialogView(), visible: false });
        this.serverInput.item.editor.setText(DEFAULT_SERVER_URL);
        this.disposable.add(atom.commands.add(this.serverInput.item.editor.element, {
            'core:confirm': onChooseServer
        }));
        this.disposable.add(atom.commands.add(atom.views.getView(atom.workspace), {
            'core:cancel': onCancelChoose
        }));
        this.disposable.add(new Disposable(() => {
            this.serverInput.destroy();
        }));
    }

    deactivate() {
        this.disposable.dispose();
    }

    deserializeRemplView() {
        // todo when sandbox will support postmessage and onmessage
    }
}

module.exports = new RemplClient();
