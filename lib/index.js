'use babel';

import { BufferedProcess, CompositeDisposable, Disposable, Range, Point } from 'atom';
import { View as RemplView, createElement as createRemplView } from './rempl-view';
import { View as ServerDialogView, createElement as createServerDialog } from './server-dialog-view';

class RemplClient {
  activate() {
    var onChooseServer = () => {
      var serverUrl = this.serverInput.item.editor.getText();
      var newTab = atom.workspace.getActivePane().addItem(new RemplView(serverUrl));
      
      atom.workspace.getActivePane().activateNextItem();
      this.serverInput.item.editor.setText('');
      this.serverInput.hide();
    };
    var onCancelChoose = () => {
      if (this.serverInput.isVisible()) {
        this.serverInput.item.editor.setText('');
        this.serverInput.hide();
      }
    };

    this.disposable = new CompositeDisposable();
    this.disposable.add(atom.deserializers.add({
      name: 'RemplView',
      deserialize(state) {
        // fixme: why deserialize is not calling? :(
        return RemplView.deserialize(state);
      }
    }));
    this.disposable.add(atom.views.addViewProvider(RemplView, createRemplView));
    this.disposable.add(atom.views.addViewProvider(ServerDialogView, createServerDialog));
    this.disposable.add(atom.commands.add('atom-workspace', {
      'rempl:connect': () => {
        this.serverInput.show()
        this.serverInput.item.editor.element.focus();
      }
    }));

    this.serverInput = atom.workspace.addModalPanel({item: new ServerDialogView(), visible: false});
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
}


module.exports = new RemplClient();