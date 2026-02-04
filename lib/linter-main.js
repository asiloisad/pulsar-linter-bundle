const arrayUnique = require("lodash/uniq");
const { CompositeDisposable } = require("atom");
const IndieRegistry = require("./indie-registry");
const MessageRegistry = require("./message-registry");
const LinterRegistry = require("./linter-registry");
const EditorsRegistry = require("./editor-registry");
const { Commands, showDebug } = require("./commands");
const ToggleView = require("./toggle-view");

class Linter {
  constructor() {
    this.commands = new Commands();
    this.subscriptions = new CompositeDisposable();
    this.idleCallbacks = new Set();
    // UI render callback - will be set by index.js
    this.uiRenderCallback = null;

    this.subscriptions.add(this.commands);

    this.commands.onShouldLint(() => {
      this.registryEditorsInit();
      const textEditor = atom.workspace.getActiveTextEditor();
      if (textEditor === undefined) {
        return;
      }
      const editorLinter = this.registryEditors.get(textEditor);
      if (editorLinter) {
        editorLinter.lint();
      }
    });

    this.commands.onShouldToggleActiveEditor(() => {
      const textEditor = atom.workspace.getActiveTextEditor();
      if (textEditor === undefined) {
        return;
      }
      this.registryEditorsInit();
      const editor = this.registryEditors.get(textEditor);
      if (editor) {
        editor.dispose();
      } else if (textEditor) {
        this.registryEditors.createFromTextEditor(textEditor);
      }
    });

    this.commands.onShouldDebug(async () => {
      this.registryIndieInit();
      this.registryLintersInit();
      await showDebug(
        this.registryLinters.getProviders(),
        this.registryIndie.getProviders()
      );
    });

    this.commands.onShouldToggleLinter(() => {
      this.registryLintersInit();
      const toggleView = new ToggleView(
        arrayUnique(
          this.registryLinters.getProviders().map((linter) => linter.name)
        )
      );
      toggleView.onDidDispose(() => {
        this.subscriptions.remove(toggleView);
      });
      toggleView.onDidDisable((name) => {
        const linter = this.registryLinters
          .getProviders()
          .find((entry) => entry.name === name);
        if (linter) {
          this.registryMessagesInit();
          this.registryMessages.deleteByLinter(linter);
        }
      });
      toggleView.show();
      this.subscriptions.add(toggleView);
    });

    const projectPathChangeCallbackID = window.requestIdleCallback(() => {
      this.idleCallbacks.delete(projectPathChangeCallbackID);
      this.subscriptions.add(
        atom.project.onDidChangePaths(() => {
          this.commands.lint();
        })
      );
    });
    this.idleCallbacks.add(projectPathChangeCallbackID);

    const registryEditorsInitCallbackID = window.requestIdleCallback(() => {
      this.idleCallbacks.delete(registryEditorsInitCallbackID);
      this.registryEditorsInit();
    });
    this.idleCallbacks.add(registryEditorsInitCallbackID);
  }

  dispose() {
    this.idleCallbacks.forEach((callbackID) =>
      window.cancelIdleCallback(callbackID)
    );
    this.idleCallbacks.clear();
    this.subscriptions.dispose();
  }

  // Set the UI render callback for direct integration
  setUIRenderCallback(callback) {
    this.uiRenderCallback = callback;
  }

  // Set callback to switch UI to project view when requested by indie providers
  setUIProjectViewCallback(callback) {
    this.uiProjectViewCallback = callback;
  }

  registryEditorsInit() {
    if (this.registryEditors !== undefined) {
      return;
    }
    this.registryEditors = new EditorsRegistry();
    this.subscriptions.add(this.registryEditors);
    this.registryEditors.observe((editorLinter) => {
      editorLinter.onShouldLint((onChange) => {
        this.registryLintersInit();
        this.registryLinters.lint({
          onChange,
          editor: editorLinter.getEditor(),
        });
      });
      editorLinter.onDidDestroy(() => {
        this.registryMessagesInit();
        if (!this.registryEditors.hasSibling(editorLinter)) {
          this.registryMessages.deleteByBuffer(
            editorLinter.getEditor().getBuffer()
          );
        }
      });
    });
    this.registryEditors.activate();
  }

  registryLintersInit() {
    if (this.registryLinters !== undefined) {
      return;
    }
    this.registryLinters = new LinterRegistry();
    this.subscriptions.add(this.registryLinters);
    this.registryLinters.onDidUpdateMessages(({ linter, messages, buffer }) => {
      this.registryMessagesInit();
      this.registryMessages.set({ linter, messages, buffer });
    });
  }

  registryIndieInit() {
    if (this.registryIndie !== undefined) {
      return;
    }
    this.registryIndie = new IndieRegistry();
    this.subscriptions.add(this.registryIndie);
    this.registryIndie.observe((indieLinter) => {
      indieLinter.onDidDestroy(() => {
        this.registryMessagesInit();
        this.registryMessages.deleteByLinter(indieLinter);
      });
    });
    this.registryIndie.onDidUpdate(({ linter, messages, options }) => {
      this.registryMessagesInit();
      this.registryMessages.set({ linter, messages, buffer: null });
      if (options?.showProjectView && this.uiProjectViewCallback) {
        this.uiProjectViewCallback();
      }
    });
  }

  registryMessagesInit() {
    if (this.registryMessages) {
      return;
    }
    this.registryMessages = new MessageRegistry();
    this.subscriptions.add(this.registryMessages);
    this.registryMessages.onDidUpdateMessages((difference) => {
      // Direct call to UI render callback
      if (this.uiRenderCallback) {
        this.uiRenderCallback(difference);
      }
    });
  }

  addLinter(linter) {
    this.registryLintersInit();
    this.registryLinters.addLinter(linter);
  }

  deleteLinter(linter) {
    this.registryLintersInit();
    this.registryLinters.deleteLinter(linter);
    this.registryMessagesInit();
    this.registryMessages.deleteByLinter(linter);
  }

  addIndie(indie) {
    this.registryIndieInit();
    return this.registryIndie.register(indie, 2);
  }

  clearAll() {
    this.registryMessagesInit();
    this.registryMessages.deleteAll();
    this.registryIndieInit();
    for (const delegate of this.registryIndie.getProviders()) {
      delegate.clearMessages();
    }
  }
}

module.exports = Linter;
