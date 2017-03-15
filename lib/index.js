'use babel';

import { CompositeDisposable, Disposable } from 'atom';
import { View as RemplClientView, createElement as createRemplView } from './rempl-view';
import { View as ServerDialogView, createElement as createServerDialog } from './server-dialog-view';
import { View as StatusBarView, createElement as createStatusBar } from './status-bar';
import { EventTransport as Transport } from './transport';

const clients = new Map();
let DEFAULT_SERVER_URL = '';

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

        if (!this.transport) {
            this.transport = new Transport('rempl-host', 'rempl-env');
        }

        this.transport.onConnect(api => api.send(this.getHostInfo()));

        this.disposable.add(this.transport);
        this.disposable.add(atom.config.observe('rempl-host.debug', value => this.transport.setDebug(value)));
        this.disposable.add(atom.config.observe('rempl-host.defaultHost', value => DEFAULT_SERVER_URL = value));
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
                this.attachCallbacks(data.item);
            }
        }));
        this.disposable.add(atom.workspace.onDidDestroyPaneItem(data => {
            if (data.item && data.item instanceof RemplClientView) {
                this.removeClient(data.item);
            }
        }));
        this.disposable.add(atom.workspace.onDidChangeActivePaneItem(() => {
            let activePane = atom.workspace.getActivePane();
            let activeEditor = activePane.getActiveEditor();
            let activePaneItem = activePane.getActiveItem();

            if (activePaneItem) {
                let activeTitle = activePaneItem.getTitle();
                let payload = {
                    type: 'activeTabChanged',
                    tab: {
                        title: activeTitle,
                        grammar: activeEditor && activeEditor.getGrammar().name,
                        isEditor: !!activeEditor
                    }
                };

                this.broadcast(payload);
            }
        }));
    }

    getHostInfo() {
        return {
            type: 'hostInfo',
            host: {
                name: 'Atom',
                version: atom.getVersion()
            },
        };
    }

    attachCallbacks(item) {
        let view = atom.views.getView(item);

        view.addEventListener('attached', () => {
            this.transport.getEnv(view.iframe.contentWindow, api => {
                clients.set(item, api);
                api.subscribe(this.handleSubscriberMessage.bind(this, item));
                if (item.publisher.id) {
                    api.send({
                        type: 'setPublisher',
                        publisher: item.publisher
                    });
                }
            });
        });
        view.addEventListener('detached', () => this.removeClient(item));
    }

    addClient(url) {
        let clientModel = atom.workspace.getActivePane().addItem(new RemplClientView(url));

        atom.workspace.getActivePane().activateNextItem();

        return clientModel;
    }

    removeClient(model) {
        clients.delete(model);
        this.transport.cleanupTargets();
    }

    broadcast(payload) {
        clients.forEach(client => {
            client.send(payload);
        });
    }

    handleSubscriberMessage(subscriber, payload) {
        switch (payload.type) {
            case 'setStatusBarContent':
                this.statusBarTile.getItem().setContent(`Rempl: ${payload.content}`);
                break;
            case 'publisherChanged': {
                // fixme: maybe storeing pane item in clients-map is better solution
                let subscriberTab = atom.workspace.getPaneItems().filter(item => item == subscriber).pop();

                if (subscriberTab) {
                    subscriber.setPublisher(payload.publisher);
                    subscriber.updateTitle();
                }
                break;
            }
            case 'getHostInfo': {
                let api = clients.get(subscriber);

                if (api) {
                    api.send(this.getHostInfo());
                }
                break;
            }
        }
    }

    consumeStatusBar(statusBar) {
        this.statusBarTile = statusBar.addLeftTile({ item: new StatusBarView(), priority: 100 });
    }

    deactivate() {
        clients.forEach((api, client) => client.destroy());
        clients.clear();
        this.transport = null;
        this.statusBarTile.destroy();
        this.disposable.dispose();
    }

    deserializeClient(state) {
        if (!this.transport) {
            this.transport = new Transport('rempl-host', 'rempl-env');
        }

        if (state.url) {
            let clientModel = new RemplClientView(state.url, state.publisher);

            this.attachCallbacks(clientModel);

            return clientModel;
        }
    }
}

module.exports = new RemplClient();
module.exports.config = {
    defaultHost: {
        type: 'string',
        default: 'http://localhost:8177/',
        title: 'Rempl-server url by default'
    },
    debug: {
        type: 'boolean',
        default: false,
        title: 'Addition output to the devtools console'
    }
}
