'use babel';

import { CompositeDisposable, Disposable } from 'atom';
import { View as RemplClientView, createElement as createRemplView } from './rempl-view';
import { View as ServerDialogView, createElement as createServerDialog } from './server-dialog-view';
import { View as StatusBarView, createElement as createStatusBar } from './status-bar';
import { createEnv } from 'rempl';

const clients = new Set();
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

        this.initEnv();
        this.activeEditor = {
            instance: null,
            disposable: new CompositeDisposable()
        };

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
        this.disposable.add(atom.workspace.onDidChangeActivePaneItem(item => {
            this.setActiveTextEditor(item);
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

        this.setActiveTextEditor();
    }

    initEnv() {
        if (this.env) {
            return;
        }

        this.env = createEnv('editor');
        this.env.publish({
            name: 'Atom',
            version: atom.getVersion()
        });
        this.updateActiveTab();
        this.env.provide({
            setStatusBarContent: (content) => {
                this.statusBarTile.getItem().setContent(content || '');
            },
            publisherChanged: () => {
                // subscriber.setPublisher(publisher);
                // subscriber.updateTitle();
                // delete subscriber.allowToGetContent;
            },
            openFile: (filePath, selections, callback) => {
                selections = this.normalizeSelections(selections);

                if (!filePath) {
                    return callback({ code: 'NO_FILE_SPECIFIED' });
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

                    callback();
                }.bind(null, selections), () => callback({ code: 'OPEN_FILE_ERROR' }));
            },
            getContent: (callback) => {
                let allow = this.allowToGetContent;
                let editor = atom.workspace.getActiveTextEditor();

                if (!editor || allow === false) {
                    return callback({ code: 'NOT_ALLOWED' });
                }

                if (!allow) {
                    atom.confirm({
                        message: `Rempl subscriber - ???`,
                        detailedMessage: 'Trying to get content of the current file',
                        buttons: {
                            Allow: () => allow = true,
                            Disallow: () => allow = false,
                            'Allow and remember': () => this.allowToGetContent = allow = true,
                            'Disallow and remember': () => this.allowToGetContent = allow = false
                        }
                    });
                }

                if (allow) {
                    callback(null, editor.getText());
                } else {
                    callback({ code: 'NOT_ALLOWED' });
                }
            }
        });
    }

    setActiveTextEditor() {
        let editor = atom.workspace.getActiveTextEditor()

        this.updateActiveTab();

        if (this.activeEditor.instance === editor) {
            return;
        }

        if (this.activeEditor.instance) {
            this.activeEditor.disposable.dispose();
            this.activeEditor.disposable = new CompositeDisposable();
        }

        this.activeEditor.instance = editor;

        if (editor) {
            this.activeEditor.disposable.add(
                editor.onDidChangeSelectionRange(() => this.updateActiveTab()),
                editor.onDidAddSelection(() => this.updateActiveTab()),
                editor.onDidRemoveSelection(() => this.updateActiveTab()),
                editor.onDidChangePath(() => this.updateActiveTab()),
                editor.onDidChangeGrammar(() => this.updateActiveTab())
            );
        }
    }

    updateActiveTab() {
        let activePane = atom.workspace.getActivePaneItem();
        let textEditor = atom.workspace.getActiveTextEditor();
        let info = {
            title: activePane ? activePane.getTitle() : null,
            isEditor: Boolean(textEditor),
            selections: null,
            file: null
        }

        if (textEditor) {
            info.selections = this.getEditorSelections(textEditor);
            info.file = {
                path: textEditor.getPath() || null,
                name: textEditor.getFileName(),
                syntax: textEditor.getGrammar().name
            };
        }

        this.env.ns('activeTab').publish(info);
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

    attachCallbacks(item) {
        let view = atom.views.getView(item);

        view.addEventListener('attached', () => {
            this.env.linkWindow(view.iframe.contentWindow);
        });
        view.addEventListener('detached', () => {
            this.removeClient(item);
        });
    }

    addClient(url) {
        let client = new RemplClientView(url);

        clients.add(client);
        atom.workspace.getActivePane().addItem(client);
        atom.workspace.getActivePane().activateNextItem();

        return client;
    }

    removeClient(client) {
        clients.delete(client);
    }

    normalizeSelections(selections) {
        // normalize selections
        if (!selections) {
            selections = [];
        } else if (!Array.isArray(selections)) {
            selections = [selections];
        }

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

        if (!selections.length) {
            selections.push({
                start: { row: 1, column: 1 },
                end: { row: 1, column: 1 }
            });
        }

        return selections;
    }

    consumeStatusBar(statusBar) {
        this.statusBarTile = statusBar.addLeftTile({ item: new StatusBarView(), priority: 100 });
    }

    deactivate() {
        clients.forEach((api, client) => client.destroy());
        clients.clear();

        this.activeEditor.disposable.dispose();
        this.activeEditor = null;

        if (this.statusBarTile) {
            this.statusBarTile.destroy();
        }

        this.disposable.dispose();
    }

    deserializeClient(state) {
        this.initEnv();

        if (state.url) {
            let client = new RemplClientView(state.url, state.publisher);

            clients.add(client);
            this.attachCallbacks(client);

            return client;
        }
    }
}

module.exports = new RemplClient();
module.exports.config = {
    defaultHost: {
        type: 'string',
        default: 'http://localhost:8177/',
        title: 'Rempl-server url by default'
    }
}
