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
        this.activeEditor = {
            instance: null,
            disposable: new CompositeDisposable()
        };
        this.disposable.add(this.activeEditor.disposable);
        this.disposable.add(atom.workspace.onDidChangeActivePaneItem(item => {
            let editor = atom.workspace.getActiveTextEditor()

            this.sendPaneItemInfo(item);

            if (this.activeEditor.instance == editor) {
                return;
            }

            if (this.activeEditor.instance) {
                this.activeEditor.disposable.dispose();
                this.activeEditor.disposable = new CompositeDisposable();
            }

            this.activeEditor.instance = editor;

            if (!editor) {
                return;
            }

            let broadcast = this.broadcast.bind(this);

            this.activeEditor.disposable.add(
                editor.onDidChangeSelectionRange(sr => this.sendSelectionsInfo(sr.selection.editor)),
                editor.onDidAddSelection(s => this.sendSelectionsInfo(s.editor)),
                editor.onDidRemoveSelection(s => this.sendSelectionsInfo(s.editor)),
                editor.onDidChangePath(path => broadcast({ type: 'patchChanged', path })),
                editor.onDidChangeGrammar(({ name: syntax }) => broadcast({ type: 'syntaxChanged', syntax }))
            );
        }));
    }

    sendPaneItemInfo(item) {
        let editor = atom.workspace.getActiveTextEditor()

        let payload = {
            type: 'activeTabChanged',
            tab: null
        };

        if (item) {
            let activeTitle = item.getTitle();

            payload.tab = {
                title: activeTitle,
                isEditor: !!editor
            }

            if (editor) {
                payload.file = {
                    path: editor.getPath(),
                    name: editor.getFileName(),
                    syntax: editor.getGrammar().name,
                    exists: !!editor.getPath()
                };
                payload.selections = this.getEditorSelections(editor);
            }
        }

        this.broadcast(payload);

    }

    sendSelectionsInfo(editor) {
        if (editor) {
            let payload = {
                type: 'selectionChanged',
                selections: this.getEditorSelections(editor)
            };

            this.broadcast(payload);
        }
    }

    getEditorSelections(editor) {
        if (!editor) {
            return [];
        }

        return editor.getSelectedBufferRanges()
            .map(range => {
                return {
                    start: {
                        line: range.start.row + 1,
                        column: range.start.column + 1
                    },
                    end: {
                        line: range.end.row + 1,
                        column: range.end.column + 1
                    }
                }
            });
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
            if (this.transport) {
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
            }
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

        if (this.transport) {
            this.transport.cleanupTargets();
        }
    }

    broadcast(payload) {
        clients.forEach(client => {
            client.send(payload);
        });
    }

    handleSubscriberMessage(subscriber, payload, callback = () => true) {
        switch (payload.type) {
            case 'setStatusBarContent':
                this.statusBarTile.getItem().setContent(payload.content || '');
                break;
            case 'publisherChanged': {
                subscriber.setPublisher(payload.publisher);
                subscriber.updateTitle();
                delete subscriber.allowToGetContent;
                break;
            }
            case 'getHostInfo': {
                let api = clients.get(subscriber);

                if (api) {
                    api.send(this.getHostInfo());
                }
                break;
            }
            case 'openFile': {
                let filePath = payload.path;
                let selections = payload.selections;

                if (!filePath) {
                    return callback({ ok: false, error: { code: 'NO_FILE_SPECIFIED' } });
                }

                // normalize selections
                if (Array.isArray(selections)) {
                    selections = selections
                        .filter(range => range && range.start && range.start.line)
                        .map(range => {
                            let { start, end } = range;

                            if (!end || !end.line) {
                                end = Object.assign(start);
                            }

                            start.column = start.column || 1;
                            end.column = end.column || 1;

                            range.start = {
                                row: +start.line - 1,
                                column: +start.column - 1
                            };
                            range.end = {
                                row: +end.line - 1,
                                column: +end.column - 1
                            };

                            return range;
                        });
                } else {
                    selections = null;
                }

                // this is insane (function + bind), but without it we're getting error: 'Undefined label _loop'
                // seems like some bug in babel
                atom.workspace.open(filePath).then(function (selections) {
                    if (selections) {
                        let editor = atom.workspace.getActiveTextEditor();

                        if (editor) {
                            editor.setSelectedBufferRanges(selections);
                        }
                    }

                    callback({ ok: true });
                }.bind(null, selections), () => callback({ ok: false, error: { code: 'OPEN_FILE_ERROR' } }));
                break;
            }
            case 'getContent': {
                let allow = subscriber.allowToGetContent;
                let editor = atom.workspace.getActiveTextEditor();

                if (!editor || allow === false) {
                    return callback({ ok: false, error: { code: 'NOT_ALLOWED' } });
                }

                if (!allow) {
                    atom.confirm({
                        message: `Rempl subscriber - ${subscriber.getTitle()}`,
                        detailedMessage: 'Trying to get content of the current file',
                        buttons: {
                            Allow: () => allow = true,
                            Disallow: () => allow = false,
                            'Allow and remember': () => subscriber.allowToGetContent = allow = true,
                            'Disallow and remember': () => subscriber.allowToGetContent = allow = false
                        }
                    });
                }

                if (allow) {
                    callback({ ok: true, content: editor.getText() });
                } else {
                    callback({ ok: false, error: { code: 'NOT_ALLOWED' } });
                }
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
        this.activeEditor.instance = null;

        if (this.statusBarTile) {
            this.statusBarTile.destroy();
        }

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
