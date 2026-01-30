const { CompositeDisposable, Range } = require("atom");
const { StatusPanel } = require("./status");
const { LinterPanel } = require("./linter-panel");
const { BubblePanel } = require("./bubble");

// Default thresholds for large file detection
const DEFAULT_LARGE_FILE_LINE_COUNT = 20000;
const DEFAULT_LONG_LINE_LENGTH = 4000;

/**
 * Linter UI Controller
 * Manages the UI components for displaying linter messages.
 */
class LinterUI {
  constructor() {
    this.editor = null;
    this.largeFileLineCount = DEFAULT_LARGE_FILE_LINE_COUNT;
    this.longLineLength = DEFAULT_LONG_LINE_LENGTH;
    this.idleCallbacks = new Set();
    this.subscriptions = new CompositeDisposable();

    // Initialize UI components
    this.status = new StatusPanel(this);
    this.panel = new LinterPanel(this);

    // Defer hover tooltip initialization - not needed immediately
    const bubbleInitCallbackID = window.requestIdleCallback(() => {
      this.idleCallbacks.delete(bubbleInitCallbackID);
      this.bubble = new BubblePanel(this);
    });
    this.idleCallbacks.add(bubbleInitCallbackID);

    // Observe editors and active editor changes
    this.subscriptions.add(
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
      atom.config.observe("linter-bundle.largeFileLineCount", (value) => {
        this.largeFileLineCount = value || DEFAULT_LARGE_FILE_LINE_COUNT;
      }),
      atom.config.observe("linter-bundle.longLineLength", (value) => {
        this.longLineLength = value || DEFAULT_LONG_LINE_LENGTH;
      })
    );
  }

  /**
   * Disposes of all UI resources.
   */
  dispose() {
    // Cancel any pending idle callbacks
    this.idleCallbacks.forEach((callbackID) =>
      window.cancelIdleCallback(callbackID)
    );
    this.idleCallbacks.clear();

    this.subscriptions.dispose();

    if (this.bubble) {
      this.bubble.destroy();
    }
    if (this.panel) {
      this.panel.destroy();
    }
    if (this.status) {
      this.status.destroy();
    }

    // Cleanup marker layers from all buffers
    for (const buffer of this.getBuffers()) {
      if (buffer.linterUI) {
        if (buffer.linterUI.markerMap) {
          buffer.linterUI.markerMap.clear();
        }
        buffer.linterUI.error.clear();
        buffer.linterUI.error.destroy();
        buffer.linterUI.warning.clear();
        buffer.linterUI.warning.destroy();
        buffer.linterUI.info.clear();
        buffer.linterUI.info.destroy();
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
   * Checks if a buffer is considered "large" based on line count or line length.
   * @param {TextBuffer} buffer - The buffer to check
   * @returns {boolean} True if the buffer is large
   */
  isLargeBuffer(buffer) {
    const lineCount = buffer.getLineCount();
    if (lineCount > this.largeFileLineCount) {
      return true;
    }
    // Check for very long lines (sample first 100 lines for performance)
    const linesToCheck = Math.min(lineCount, 100);
    for (let i = 0; i < linesToCheck; i++) {
      if (buffer.lineLengthForRow(i) > this.longLineLength) {
        return true;
      }
    }
    return false;
  }

  /**
   * Patches an editor with linter marker layers for highlighting.
   * @param {TextEditor} editor - The text editor to patch
   */
  patchEditor(editor) {
    const buffer = editor.getBuffer();
    if (!buffer.linterUI) {
      const isLarge = this.isLargeBuffer(buffer);
      buffer.linterUI = {
        error: buffer.addMarkerLayer(),
        warning: buffer.addMarkerLayer(),
        info: buffer.addMarkerLayer(),
        markerMap: new Map(),
        messages: [],
        updateRequired: false,
        isLargeFile: isLarge,
      };
    }
    // Text decorations (wavy underlines)
    editor.decorateMarkerLayer(buffer.linterUI.error, {
      type: "text",
      class: "linter-text error",
    });
    editor.decorateMarkerLayer(buffer.linterUI.warning, {
      type: "text",
      class: "linter-text warning",
    });
    editor.decorateMarkerLayer(buffer.linterUI.info, {
      type: "text",
      class: "linter-text info",
    });
    // Line-number decorations (gutter styling)
    editor.decorateMarkerLayer(buffer.linterUI.error, {
      type: "line-number",
      class: "linter-line-number error",
    });
    editor.decorateMarkerLayer(buffer.linterUI.warning, {
      type: "line-number",
      class: "linter-line-number warning",
    });
    editor.decorateMarkerLayer(buffer.linterUI.info, {
      type: "line-number",
      class: "linter-line-number info",
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
   * @param {Object} args - Object containing added, removed, and all messages
   */
  assignMessages(args) {
    const addedByPath = new Map();
    for (const message of args.added) {
      const path = message.location.file;
      if (!addedByPath.has(path)) {
        addedByPath.set(path, []);
      }
      addedByPath.get(path).push(message);
    }

    const removedByPath = new Map();
    for (const message of args.removed) {
      const path = message.location.file;
      if (!removedByPath.has(path)) {
        removedByPath.set(path, []);
      }
      removedByPath.get(path).push(message);
    }

    const affectedPaths = new Set([...addedByPath.keys(), ...removedByPath.keys()]);

    const messagesByPath = new Map();
    for (const message of args.messages) {
      const path = message.location.file;
      if (!messagesByPath.has(path)) {
        messagesByPath.set(path, []);
      }
      messagesByPath.get(path).push(message);
    }

    for (const buffer of this.getBuffers()) {
      if (!buffer.linterUI) {
        continue;
      }
      const bufferPath = buffer.getPath();
      if (!affectedPaths.has(bufferPath)) {
        continue;
      }
      const addedMessages = addedByPath.get(bufferPath) || [];
      // Create displayRange for new messages
      for (const message of addedMessages) {
        if (!message.location.displayRange) {
          const { start, end } = message.location.position;
          const lineLength = buffer.lineLengthForRow(start.row);
          // If range spans from line end to next line start, mark entire line
          if (
            start.column >= lineLength &&
            end.row === start.row + 1 &&
            end.column === 0
          ) {
            message.location.displayRange = new Range(
              [start.row, 0],
              [start.row, lineLength]
            );
          } else {
            message.location.displayRange = message.location.position;
          }
        }
      }
      buffer.linterUI.addedMessages = addedMessages;
      buffer.linterUI.removedMessages = removedByPath.get(bufferPath) || [];
      buffer.linterUI.messages = messagesByPath.get(bufferPath) || [];
      buffer.linterUI.messages.sort((a, b) => {
        return a.location.position.start.compare(b.location.position.start);
      });
    }
  }

  /**
   * Updates marker decorations incrementally.
   */
  updateMarkers() {
    for (const buffer of this.getBuffers()) {
      if (!buffer.linterUI) {
        continue;
      }
      const { addedMessages, removedMessages, isLargeFile, markerMap } = buffer.linterUI;

      if (!addedMessages?.length && !removedMessages?.length) {
        continue;
      }

      // Skip inline decorations for large files
      if (isLargeFile) {
        buffer.linterUI.addedMessages = null;
        buffer.linterUI.removedMessages = null;
        continue;
      }

      // Remove markers using O(1) markerMap lookup
      if (removedMessages?.length) {
        for (const message of removedMessages) {
          const marker = markerMap.get(message.key);
          if (marker) {
            marker.destroy();
            markerMap.delete(message.key);
          }
        }
      }

      // Add markers for added messages
      if (addedMessages?.length) {
        for (const message of addedMessages) {
          const marker = buffer.linterUI[message.severity].markRange(
            message.location.displayRange,
            { invalidate: "inside" }
          );
          markerMap.set(message.key, marker);
        }
      }

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
    this.panel.setEditor(editor);
  }

  /**
   * Updates all UI components to reflect current state.
   */
  updateCurrent() {
    this.status.update();
    this.panel.update();
  }

  /**
   * Consumes the status bar service.
   * @param {Object} statusBar - The status bar service
   */
  consumeStatusBar(statusBar) {
    statusBar.addLeftTile({ item: this.status, priority: 0 });
  }

  // Panel commands
  togglePanel() {
    this.panel.toggle();
  }

  // Bubble commands
  inspect() {
    this.bubble?.inspect();
  }

  inspectNext() {
    this.bubble?.inspectNext();
  }

  inspectPrevious() {
    this.bubble?.inspectPrevious();
  }

  clearMessages() {
    if (!this.editor) {
      return;
    }
    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) {
      return;
    }
    // Clear markers
    for (const marker of buffer.linterUI.markerMap.values()) {
      marker.destroy();
    }
    buffer.linterUI.markerMap.clear();
    buffer.linterUI.messages = [];
    this.updateCurrent();
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
    const cursorPosition = this.editor.getCursorBufferPosition();
    for (const message of buffer.linterUI.messages) {
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
    const cursorPos = this.editor.getCursorBufferPosition();
    for (const message of buffer.linterUI.messages) {
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
