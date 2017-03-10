'use babel';

import { CompositeDisposable, Disposable } from 'atom';
import { View as RemplClientView, createElement as createRemplView } from './rempl-view';
import { View as ServerDialogView, createElement as createServerDialog } from './server-dialog-view';
import { View as StatusBarView, createElement as createStatusBar } from './status-bar';
import { createHost } from 'rempl';

const DEFAULT_SERVER_URL = 'http://localhost:8177/server/client';
const clients = new Map();

atom.views.addViewProvider(RemplClientView, createRemplView);
atom.views.addViewProvider(ServerDialogView, createServerDialog);
atom.views.addViewProvider(StatusBarView, createStatusBar);

class RemplClient {
    activate() {
        let onChooseServer = () => {
            let serverUrl = this.serverInput.item.editor.getText();

            this.addClient(serverUrl);
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
                let view = atom.views.getView(data.item);
                let handleSubscriberMessage = this.handleSubscriberMessage.bind(this);

                clients.set(data.item, null);
                // FIXME: temporary solution
                setTimeout(() => {
                    createHost(view.iframe.contentWindow, api => {
                        clients.set(data.item, api);
                        api.subscribe(handleSubscriberMessage);
                    });
                });
            }
        }));
        this.disposable.add(atom.workspace.onDidDestroyPaneItem(data => {
            if (data.item && data.item instanceof RemplClientView) {
                clients.delete(data.item);
            }
        }));
        this.disposable.add(atom.workspace.onDidChangeActivePaneItem(() => {
            let activePane = atom.workspace.getActivePane();
            let activePaneItem = activePane.getActiveItem();
            let activeEditor = activePane.getActiveEditor();
            let activeTitle = activePaneItem.getTitle();
            let payload = {
                host: 'atom',
                type: 'DidChangeActivePaneItem',
                pane: {
                    title: activeTitle,
                    grammar: activeEditor && activeEditor.getGrammar().name,
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
            if (client) {
                client.send(payload);
            }
        });
    }

    handleSubscriberMessage(payload) {
        switch (payload.data.type) {
            case 'setStatusBarContent':
                this.statusBarTile.getItem().setContent(`Rempl: ${payload.data.content}`);
                break;
        }
    }

    consumeStatusBar(statusBar) {
        this.statusBarTile = statusBar.addLeftTile({ item: new StatusBarView(), priority: 100 });
    }

    deactivate() {
        this.disposable.dispose();
        clients.clear();
    }

    deserializeClient(state) {
        if (state.url) {
            let clientModel = new RemplClientView(state.url);
            let view = atom.views.getView(clientModel);
            let handleSubscriberMessage = this.handleSubscriberMessage.bind(this);

            clients.set(clientModel, null);
            // FIXME: temporary solution
            setTimeout(() => {
                createHost(view.iframe.contentWindow, api => {
                    clients.set(clientModel, api);
                    api.subscribe(handleSubscriberMessage);
                });
            });

            return clientModel;
        }
    }
}

module.exports = new RemplClient();
