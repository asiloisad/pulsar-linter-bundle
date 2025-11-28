const { CompositeDisposable } = require("atom");

/**
 * BubblePanel - Shows linter messages on mouse hover over issues
 * Also handles keyboard-triggered inspect commands
 * Uses a single window-level mouse listener for efficiency.
 */
class BubblePanel {
  constructor(pkg) {
    this.pkg = pkg;
    this.tooltip = null;
    this.disposables = new CompositeDisposable();
    this.hoverTimeout = null;
    this.hideTimeout = null;
    this.currentPosition = null;
    this.currentEditor = null;
    this.enabled = atom.config.get("linter-bundle.showHoverTooltip");
    this.tooltipListeners = null; // Track tooltip event listeners for cleanup
    this.lastMoveTime = 0; // For throttling mousemove
    this.lastEditorElement = null; // Track last hovered editor element

    // Bind event handlers
    this.onMouseMove = this.onMouseMove.bind(this);

    // Observe config changes
    this.disposables.add(
      atom.config.observe("linter-bundle.showHoverTooltip", (value) => {
        this.enabled = value;
        if (value) {
          this.attachWindowListener();
        } else {
          this.destroyTooltip();
          this.detachWindowListener();
        }
      })
    );

    // Attach window listener if enabled
    if (this.enabled) {
      this.attachWindowListener();
    }
  }

  destroy() {
    this.destroyTooltip();
    this.detachWindowListener();
    this.disposables.dispose();
    this.currentEditor = null;
  }

  /**
   * Attaches a single mousemove listener to the window.
   */
  attachWindowListener() {
    if (this.windowListenerAttached) return;
    window.addEventListener("mousemove", this.onMouseMove);
    this.windowListenerAttached = true;
  }

  /**
   * Detaches the window mousemove listener.
   */
  detachWindowListener() {
    if (!this.windowListenerAttached) return;
    window.removeEventListener("mousemove", this.onMouseMove);
    this.windowListenerAttached = false;
  }

  onMouseMove(event) {
    // Throttle mousemove to ~30fps (33ms) to reduce CPU load
    const now = Date.now();
    if (now - this.lastMoveTime < 33) {
      return;
    }
    this.lastMoveTime = now;

    // Ignore if mouse is over the tooltip itself
    if (this.tooltip && this.tooltip.contains(event.target)) {
      return;
    }

    // Check if we're hovering over a linter-text decoration
    const linterText = event.target.closest(".linter-text");
    if (!linterText) {
      if (this.lastEditorElement) {
        this.lastEditorElement = null;
        this.onMouseLeave();
      }
      return;
    }

    // Find the editor element
    const editorElement = event.target.closest("atom-text-editor:not([mini])");
    if (!editorElement) {
      if (this.lastEditorElement) {
        this.lastEditorElement = null;
        this.onMouseLeave();
      }
      return;
    }

    this.lastEditorElement = editorElement;

    // Get the editor model from the element
    const editor = editorElement.getModel();
    if (!editor || !editor.component) return;

    this.currentEditor = editor;

    // Get buffer position from mouse coordinates
    const screenPosition = editor.component.screenPositionForMouseEvent(event);
    if (!screenPosition) return;

    const bufferPosition = editor.bufferPositionForScreenPosition(screenPosition);

    // Get all messages at this exact position (overlapping issues)
    const buffer = editor.getBuffer();
    const messages = this.getMessagesAtPosition(bufferPosition, buffer);

    if (messages.length === 0) {
      this.hideTooltip();
      this.currentMessages = null;
      return;
    }

    // Build a key from message keys to compare
    const messagesKey = messages.map((m) => m.key).join(",");

    // If tooltip is visible and showing the same messages, just move it
    if (this.tooltip && this.currentMessages === messagesKey) {
      this.moveTooltip(event);
      return;
    }

    this.currentMessages = messagesKey;

    // Clear any pending timeouts
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Immediately destroy any existing/hiding tooltip
    this.destroyTooltip();

    // Store last event position for the delayed show
    this.lastMouseEvent = event;

    // Show tooltip after a short delay
    this.hoverTimeout = setTimeout(() => {
      this.showTooltipForMessages(messages, this.lastMouseEvent, editor);
    }, 200);
  }

  onMouseLeave() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hideTooltip();
    this.currentMessages = null;
  }

  /**
   * Gets all messages that contain the given buffer position.
   * Returns messages sorted by severity (error > warning > info).
   */
  getMessagesAtPosition(bufferPosition, buffer) {
    if (!buffer.linterUI || !buffer.linterUI.messages) return [];

    const messages = buffer.linterUI.messages;
    const result = [];
    const targetRow = bufferPosition.row;

    for (const message of messages) {
      const range = message.location.position;
      // Check if message contains this position
      if (range.containsPoint(bufferPosition)) {
        result.push(message);
      }
      // Early exit if we've passed this row (messages are sorted by start)
      if (range.start.row > targetRow) {
        break;
      }
    }

    // Sort by severity: error first, then warning, then info
    const severityOrder = { error: 0, warning: 1, info: 2 };
    result.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return result;
  }

  /**
   * Shows tooltip for multiple messages on a row.
   */
  showTooltipForMessages(messages, event, editor) {
    if (messages.length === 0) return;

    this.destroyTooltip();

    const targetEditor = editor || this.currentEditor;
    if (!targetEditor) return;

    // Create tooltip container
    this.tooltip = document.createElement("div");
    this.tooltip.classList.add("linter-bubble-tooltip");
    // Use first message's severity for border color
    this.tooltip.classList.add(messages[0].severity);

    // Add each message
    for (const message of messages) {
      const item = document.createElement("div");
      item.classList.add("linter-bubble-item", message.severity);

      // Add linter name
      const sidebar = document.createElement("div");
      sidebar.classList.add("linter-bubble-sidebar");
      sidebar.textContent = message.linterName;
      item.appendChild(sidebar);

      // Add message content
      const content = document.createElement("div");
      content.classList.add("linter-bubble-content");
      content.innerHTML = atom.ui.markdown.render(message.excerpt);
      item.appendChild(content);

      this.tooltip.appendChild(item);
    }

    // Position the tooltip near the mouse or cursor
    document.body.appendChild(this.tooltip);

    // Calculate position
    const tooltipRect = this.tooltip.getBoundingClientRect();
    let left, top;

    if (event) {
      // Mouse hover - position near mouse
      left = event.clientX + 10;
      top = event.clientY + 15;
    } else {
      // Keyboard trigger - position near cursor
      const cursorPos = targetEditor.getCursorScreenPosition();
      const pixelPos = targetEditor.element.pixelPositionForScreenPosition(cursorPos);
      const editorRect = targetEditor.element.getBoundingClientRect();
      const scrollTop = targetEditor.element.getScrollTop();
      const scrollLeft = targetEditor.element.getScrollLeft();

      left = editorRect.left + pixelPos.left - scrollLeft + 10;
      top = editorRect.top + pixelPos.top - scrollTop + 20;
    }

    // Adjust if tooltip would go off-screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = (event ? event.clientY : top) - tooltipRect.height - 10;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.tooltip) {
        this.tooltip.classList.add("visible");
      }
    });

    // Track listeners for proper cleanup
    const tooltipLeaveHandler = () => this.hideTooltip();
    this.tooltip.addEventListener("mouseleave", tooltipLeaveHandler);

    const scrollView = targetEditor.element.querySelector(".scroll-view");
    let scrollHandler = null;
    if (scrollView) {
      scrollHandler = () => this.destroyTooltip();
      scrollView.addEventListener("scroll", scrollHandler, { passive: true, once: true });
    }

    // Hide on window resize
    const resizeHandler = () => this.destroyTooltip();
    window.addEventListener("resize", resizeHandler, { once: true });

    // Hide on buffer changes (text edits)
    const buffer = targetEditor.getBuffer();
    const bufferChangeHandler = buffer.onDidChange(() => {
      bufferChangeHandler.dispose();
      this.destroyTooltip();
    });

    // Store references for cleanup
    this.tooltipListeners = {
      tooltip: this.tooltip,
      tooltipLeaveHandler,
      scrollView,
      scrollHandler,
      resizeHandler,
      bufferChangeHandler,
    };
  }

  /**
   * Shows tooltip for a single message (used by keyboard commands).
   */
  showTooltip(message, event, editor) {
    this.showTooltipForMessages([message], event, editor);
  }

  moveTooltip(event) {
    if (!this.tooltip) return;

    const tooltipRect = this.tooltip.getBoundingClientRect();
    let left = event.clientX + 10;
    let top = event.clientY + 15;

    // Adjust if tooltip would go off-screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = event.clientY - tooltipRect.height - 10;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    if (!this.tooltip) return;

    // Start hide animation
    this.tooltip.classList.remove("visible");
    this.tooltip.classList.add("hiding");

    // Remove after animation completes
    this.hideTimeout = setTimeout(() => {
      this.destroyTooltip();
    }, 150);
  }

  destroyTooltip() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    // Clean up tracked event listeners to prevent memory leaks
    if (this.tooltipListeners) {
      const { tooltip, tooltipLeaveHandler, scrollView, scrollHandler, resizeHandler, bufferChangeHandler } = this.tooltipListeners;
      if (tooltip && tooltipLeaveHandler) {
        tooltip.removeEventListener("mouseleave", tooltipLeaveHandler);
      }
      if (scrollView && scrollHandler) {
        scrollView.removeEventListener("scroll", scrollHandler);
      }
      if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
      }
      if (bufferChangeHandler) {
        bufferChangeHandler.dispose();
      }
      this.tooltipListeners = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  // Commands (replacing BubblePanel functionality)

  inspect() {
    this.destroyTooltip();
    const editor = this.pkg.editor;
    if (!editor) return;

    const message = this.pkg.getCurrentMessage();
    if (!message) return;

    this.currentEditor = editor;
    this.showTooltip(message, null, editor);

    // Hide on cursor movement
    const signal = editor.onDidChangeCursorPosition(() => {
      signal.dispose();
      this.hideTooltip();
    });
  }

  inspectNext() {
    this.destroyTooltip();
    const editor = this.pkg.editor;
    if (!editor) return;

    const message = this.pkg.getNextMessage();
    if (!message) return;

    editor.setCursorBufferPosition(message.location.position.start, {
      autoscroll: true,
    });
    editor.element.focus();
    this.currentEditor = editor;
    this.showTooltip(message, null, editor);

    // Hide on cursor movement
    const signal = editor.onDidChangeCursorPosition(() => {
      signal.dispose();
      this.hideTooltip();
    });
  }

  inspectPrevious() {
    this.destroyTooltip();
    const editor = this.pkg.editor;
    if (!editor) return;

    const message = this.pkg.getPreviousMessage();
    if (!message) return;

    editor.setCursorBufferPosition(message.location.position.start, {
      autoscroll: true,
    });
    editor.element.focus();
    this.currentEditor = editor;
    this.showTooltip(message, null, editor);

    // Hide on cursor movement
    const signal = editor.onDidChangeCursorPosition(() => {
      signal.dispose();
      this.hideTooltip();
    });
  }
}

module.exports = { BubblePanel };
