const { CompositeDisposable } = require("atom");
const { StatusPanel } = require("./status");
const { LinterPanel } = require("./linter-panel");
const { BubblePanel } = require("./bubble");

/**
 * Linter UI Controller
 * Manages the UI components for displaying linter messages.
 */
class LinterUI {
  constructor() {
    this.editor = null;
    this.status = null;
    this.linter = null;
    this.bubble = null;
    this.disposables = null;
  }

  /**
   * Activates the UI and initializes components.
   */
  activate() {
    this.status = new StatusPanel(this);
    this.linter = new LinterPanel(this);
    this.bubble = new BubblePanel(this);
    this.disposables = new CompositeDisposable();

    this.disposables.add(
      atom.workspace.observeTextEditors((editor) => {
        this.patchEditor(editor);
      }),
      atom.workspace.observeActiveTextEditor((item) => {
        if (this.editor === item) {
          return;
        } else if (!item) {
          this.setEditor(null);
          this.updateCurrent();
        } else if (atom.workspace.isTextEditor(item)) {
          this.setEditor(item);
          this.updateCurrent();
        }
      }),
      atom.commands.add("atom-workspace", {
        "linter-bundle:toggle-panel": () => this.linter.toggle(),
      }),
      atom.commands.add("atom-text-editor:not([mini])", {
        "linter-bundle:inspect": () => this.bubble.inspect(),
        "linter-bundle:next": () => this.bubble.inspectNext(),
        "linter-bundle:previous": () => this.bubble.inspectPrevious(),
      })
    );
  }

  /**
   * Deactivates the UI and cleans up marker layers.
   */
  deactivate() {
    if (this.disposables) {
      this.disposables.dispose();
    }
    if (this.bubble) {
      this.bubble.destroy();
    }
    if (this.linter) {
      this.linter.destroy();
    }
    if (this.status) {
      this.status.destroy();
    }
    for (let buffer of this.getBuffers()) {
      if (buffer.linterUI) {
        buffer.linterUI.text.error.clear();
        buffer.linterUI.text.error.destroy();
        buffer.linterUI.text.warning.clear();
        buffer.linterUI.text.warning.destroy();
        buffer.linterUI.text.info.clear();
        buffer.linterUI.text.info.destroy();
        buffer.linterUI.high.error.clear();
        buffer.linterUI.high.error.destroy();
        buffer.linterUI.high.warning.clear();
        buffer.linterUI.high.warning.destroy();
        buffer.linterUI.high.info.clear();
        buffer.linterUI.high.info.destroy();
      }
      delete buffer.linterUI;
    }
  }

  /**
   * Renders linter messages - called by core when messages change.
   * @param {Object} args - Object containing added, removed, and all messages
   */
  render(args) {
    this.assignMessages(args);
    this.updateMarkers();
    this.updateCurrent();
  }

  /**
   * Patches an editor with linter marker layers for highlighting.
   * @param {TextEditor} editor - The text editor to patch
   */
  patchEditor(editor) {
    const buffer = editor.getBuffer();
    if (!buffer.linterUI) {
      buffer.linterUI = {
        text: {
          error: buffer.addMarkerLayer(),
          warning: buffer.addMarkerLayer(),
          info: buffer.addMarkerLayer(),
        },
        high: {
          error: buffer.addMarkerLayer(),
          warning: buffer.addMarkerLayer(),
          info: buffer.addMarkerLayer(),
        },
        messages: [],
        updateRequired: false,
      };
    }
    editor.decorateMarkerLayer(buffer.linterUI.text.error, {
      type: "text",
      class: "linter-text error",
    });
    editor.decorateMarkerLayer(buffer.linterUI.text.warning, {
      type: "text",
      class: "linter-text warning",
    });
    editor.decorateMarkerLayer(buffer.linterUI.text.info, {
      type: "text",
      class: "linter-text info",
    });
    editor.decorateMarkerLayer(buffer.linterUI.high.error, {
      type: "highlight",
      class: "linter-high error",
    });
    editor.decorateMarkerLayer(buffer.linterUI.high.warning, {
      type: "highlight",
      class: "linter-high warning",
    });
    editor.decorateMarkerLayer(buffer.linterUI.high.info, {
      type: "highlight",
      class: "linter-high info",
    });
  }

  /**
   * Gets all unique buffers from open text editors.
   * @returns {Set} Set of text buffers
   */
  getBuffers() {
    return new Set(
      atom.workspace.getTextEditors().map((editor) => editor.getBuffer())
    );
  }

  /**
   * Assigns linter messages to their corresponding buffers.
   * Tracks added/removed messages per buffer for incremental marker updates.
   * @param {Object} args - Object containing added, removed, and all messages
   */
  assignMessages(args) {
    // Index added messages by file path
    const addedByPath = new Map();
    for (const message of args.added) {
      const path = message.location.file;
      if (!addedByPath.has(path)) {
        addedByPath.set(path, []);
      }
      addedByPath.get(path).push(message);
    }

    // Index removed messages by file path
    const removedByPath = new Map();
    for (const message of args.removed) {
      const path = message.location.file;
      if (!removedByPath.has(path)) {
        removedByPath.set(path, []);
      }
      removedByPath.get(path).push(message);
    }

    // Get all affected paths
    const affectedPaths = new Set([...addedByPath.keys(), ...removedByPath.keys()]);

    // Pre-index all messages by file path for the full message list
    const messagesByPath = new Map();
    for (const message of args.messages) {
      const path = message.location.file;
      if (!messagesByPath.has(path)) {
        messagesByPath.set(path, []);
      }
      messagesByPath.get(path).push(message);
    }

    // Process only buffers that have changes
    for (const buffer of this.getBuffers()) {
      if (!buffer.linterUI) {
        continue;
      }
      const bufferPath = buffer.getPath();
      if (!affectedPaths.has(bufferPath)) {
        continue;
      }
      // Store incremental changes for marker updates
      buffer.linterUI.addedMessages = addedByPath.get(bufferPath) || [];
      buffer.linterUI.removedMessages = removedByPath.get(bufferPath) || [];
      buffer.linterUI.messages = messagesByPath.get(bufferPath) || [];
      buffer.linterUI.messages.sort((a, b) => {
        return a.location.position.start.compare(b.location.position.start);
      });
    }
  }

  /**
   * Updates marker decorations incrementally - only adds/removes changed markers.
   */
  updateMarkers() {
    for (const buffer of this.getBuffers()) {
      if (!buffer.linterUI) {
        continue;
      }
      const { addedMessages, removedMessages } = buffer.linterUI;

      // Skip if no changes
      if (!addedMessages?.length && !removedMessages?.length) {
        continue;
      }

      // Remove markers for removed messages
      if (removedMessages?.length) {
        // Build a Set of keys for removed messages for O(1) lookup
        const removedKeys = new Set(removedMessages.map((m) => m.key));

        // Find and destroy markers that match removed messages
        for (const severity of ["error", "warning", "info"]) {
          for (const marker of buffer.linterUI.text[severity].getMarkers()) {
            const messageKey = marker._linterMessageKey;
            if (messageKey && removedKeys.has(messageKey)) {
              marker.destroy();
            }
          }
          for (const marker of buffer.linterUI.high[severity].getMarkers()) {
            const messageKey = marker._linterMessageKey;
            if (messageKey && removedKeys.has(messageKey)) {
              marker.destroy();
            }
          }
        }
      }

      // Add markers for added messages
      if (addedMessages?.length) {
        for (const message of addedMessages) {
          const textMarker = buffer.linterUI.text[message.severity].markRange(
            message.location.position,
            { invalidate: "inside" }
          );
          textMarker._linterMessageKey = message.key;

          const highMarker = buffer.linterUI.high[message.severity].markRange(
            message.location.position,
            { invalidate: "inside" }
          );
          highMarker._linterMessageKey = message.key;
        }
      }

      // Clear the incremental change tracking
      buffer.linterUI.addedMessages = null;
      buffer.linterUI.removedMessages = null;
    }
  }

  /**
   * Sets the current editor for all UI components.
   * @param {TextEditor} editor - The text editor to set
   */
  setEditor(editor) {
    this.editor = editor;
    this.status.setEditor(editor);
    this.linter.setEditor(editor);
  }

  /**
   * Updates all UI components to reflect current state.
   */
  updateCurrent() {
    this.status.update();
    this.linter.update();
  }

  /**
   * Consumes the status bar service to display linter status.
   * @param {Object} statusBar - The status bar service
   */
  consumeStatusBar(statusBar) {
    statusBar.addLeftTile({ item: this.status, priority: 0 });
  }

  /**
   * Gets the linter message at the current cursor position.
   * @returns {Object|undefined} The message at cursor or undefined
   */
  getCurrentMessage() {
    if (!this.editor) {
      return;
    }
    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) {
      return;
    }
    let cursorPosition = this.editor.getCursorBufferPosition();
    for (let message of buffer.linterUI.messages) {
      if (message.location.position.containsPoint(cursorPosition)) {
        return message;
      }
    }
  }

  /**
   * Gets the next linter message after the cursor position.
   * @returns {Object|undefined} The next message or first message if at end
   */
  getNextMessage() {
    if (!this.editor) {
      return;
    }
    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) {
      return;
    }
    let cursorPos = this.editor.getCursorBufferPosition();
    for (let message of buffer.linterUI.messages) {
      if (message.location.position.start.isGreaterThan(cursorPos)) {
        return message;
      }
    }
    if (buffer.linterUI.messages.length) {
      return buffer.linterUI.messages[0];
    }
  }

  /**
   * Gets the previous linter message before the cursor position.
   * @returns {Object|undefined} The previous message or last message if at start
   */
  getPreviousMessage() {
    if (!this.editor) {
      return;
    }
    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) {
      return;
    }
    const messages = buffer.linterUI.messages;
    const cursorPos = this.editor.getCursorBufferPosition();
    // Iterate in reverse without creating a copy
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].location.position.start.isLessThan(cursorPos)) {
        return messages[i];
      }
    }
    if (messages.length) {
      return messages[messages.length - 1];
    }
  }
}

module.exports = LinterUI;
