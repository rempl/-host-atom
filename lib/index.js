'use babel';

import { BufferedProcess, CompositeDisposable, Disposable, Range, Point } from 'atom';
import { View as RemplClientView, createElement as createRemplView } from './rempl-view';
import { View as ServerDialogView, createElement as createServerDialog } from './server-dialog-view';

const DEFAULT_SERVER_URL = 'http://localhost:8177/server/client';
const clients = new Map();

atom.views.addViewProvider(RemplClientView, createRemplView);
atom.views.addViewProvider(ServerDialogView, createServerDialog);

class RemplClient {
    activate() {
        let onChooseServer = () => {
            let serverUrl = this.serverInput.item.editor.getText();
            let clientModel = this.addClient(serverUrl);

            this.serverInput.item.editor.setText(DEFAULT_SERVER_URL);
            this.serverInput.hide();
        };
        let onCancelChoose = () => {
            if (this.serverInput.isVisible()) {
                this.serverInput.item.editor.setText(DEFAULT_SERVER_URL);
                this.serverInput.hide();
            }
        };

        this.disposable = new CompositeDisposable();
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
        this.disposable.add(atom.workspace.onDidAddPaneItem(data => {
            if (data.item && data.item instanceof RemplClientView) {
                clients.set(data.item, data.item);
            }
        }));
        this.disposable.add(atom.workspace.onDidDestroyPaneItem(data => {
            if (data.item && data.item instanceof RemplClientView) {
                clients.delete(data.item);
            }
        }));
        this.disposable.add(atom.workspace.onDidChangeActivePaneItem(data => {
            let activePane = atom.workspace.getActivePane();
            let activePaneItem = activePane.getActiveItem();
            let activeEditor = activePane.getActiveEditor();
            let activeTitle = activePaneItem.getTitle();
            let payload = {
                type: 'DidChangeActivePaneItem',
                pane: {
                    title: activeTitle,
                    isEditor: !!activeEditor
                }
            };

            this.broadcast(payload);
        }));
    }

    addClient(url) {
        let clientModel = atom.workspace.getActivePane().addItem(new RemplClientView(url));

        atom.workspace.getActivePane().activateNextItem();

        return clientModel;
    }

    broadcast(payload) {
        clients.forEach(client => {
            let view = atom.views.getView(client);

            if (view) {
                view.sendToSandbox(payload);
            }
        });
    }

    deactivate() {
        this.disposable.dispose();
        clients.clear();
    }

    deserializeClient(state) {
        if (state.url) {
            let clientModel = new RemplClientView(state.url);

            clients.set(clientModel, clientModel);

            return clientModel;
        }
    }
}

module.exports = new RemplClient();
