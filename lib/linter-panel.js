/** @babel */
/** @jsx etch.dom */

const etch = require("etch");

// Static maps to avoid repeated string operations in render loop
const SEVERITY_TEXT = { error: "Error", warning: "Warning", info: "Info" };
const SEVERITY_CLASS = {
  error: "linter-severity text-error icon icon-stop",
  warning: "linter-severity text-warning icon icon-alert",
  info: "linter-severity text-info icon icon-info",
};

class LinterPanel {
  constructor(pkg) {
    this.pkg = pkg;
    this.editor = null;
    this.cwatch = null;
    this.sortMethod =
      atom.config.get("linter-bundle.defaultSortMethod") || "severity";
    this.sortDirection = "asc";
    this.showError = true;
    this.showWarning = true;
    this.showInfo = true;
    // Cache sorted messages to avoid re-sorting on every render
    this._sortedMessagesCache = null;
    this._lastMessages = null;
    this._lastSortMethod = null;
    this._lastSortDirection = null;
    // Track current highlighted row for CSS-only updates
    this._currentRowIndex = -1;
    // Track right-clicked row for context menu
    this._contextRow = null;
    // Bind row click handler once for event delegation
    this._onRowClick = this._onRowClick.bind(this);
    etch.initialize(this);

    // Context menu: track which row was right-clicked
    this.element.addEventListener("contextmenu", (e) => {
      const row = e.target.closest(".linter-row");
      this._contextRow = row;
    });

    // Register context menu command and entry
    this._disposables = atom.commands.add(this.element, {
      "linter-bundle:copy-description": () => this._copyDescription(),
    });
    atom.contextMenu.add({
      ".linter-wrapper .linter-row": [
        { label: "Copy Description", command: "linter-bundle:copy-description" },
      ],
    });
  }

  /**
   * Handle row clicks using event delegation for better performance.
   * Uses data attributes to find message position instead of closures.
   */
  _onRowClick(event) {
    // Check if clicked on log reference link
    const logRef = event.target.closest(".linter-log-ref");
    if (logRef) {
      event.stopPropagation();
      const file = logRef.dataset.file;
      const line = parseInt(logRef.dataset.line, 10);
      const column = parseInt(logRef.dataset.column, 10) || 0;
      if (file) {
        atom.workspace.open(file, {
          initialLine: line,
          initialColumn: column,
          pending: true,
        });
      }
      return;
    }

    // Find the clicked row
    const row = event.target.closest(".linter-row");
    if (!row || !this.editor) return;

    const rowIndex = row.dataset.index;
    if (rowIndex === undefined) return;

    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) return;

    // Get the message from sorted cache
    const sortedMessages = this._getSortedMessages(buffer.linterUI.messages);
    const message = sortedMessages[parseInt(rowIndex, 10)];
    if (!message) return;

    // Navigate to the message location
    this.editor.setCursorBufferPosition(message.location.position.start, {
      autoscroll: true,
    });
    this.editor.element.focus();
  }

  setEditor(editor) {
    this.editor = editor;
    // Invalidate cache when editor changes
    this._sortedMessagesCache = null;
    this._lastMessages = null;
    this._currentRowIndex = -1;
    this.observe();
  }

  /**
   * Updates only the current row highlight using CSS classes.
   * Avoids full etch re-render for cursor position changes.
   */
  _updateCurrentRowHighlight() {
    if (!this.editor || !this.element) return;

    const buffer = this.editor.getBuffer();
    if (!buffer.linterUI) return;

    const curpos = this.editor.getCursorBufferPosition();
    const sortedMessages = this._getSortedMessages(buffer.linterUI.messages);

    // Find which row (in visible filtered order) contains cursor
    let newRowIndex = -1;
    let visibleIndex = 0;
    for (let i = 0; i < sortedMessages.length; i++) {
      const message = sortedMessages[i];
      // Apply same visibility filters as render
      if (!this.showError && message.severity === "error") continue;
      if (!this.showWarning && message.severity === "warning") continue;
      if (!this.showInfo && message.severity === "info") continue;

      const range = message.location.displayRange || message.location.position;
      if (range.containsPoint(curpos)) {
        newRowIndex = visibleIndex;
        break;
      }
      visibleIndex++;
    }

    // No change needed
    if (newRowIndex === this._currentRowIndex) return;

    const tbody = this.element.querySelector("tbody");
    if (!tbody) return;

    // Remove current class from old row
    if (this._currentRowIndex >= 0) {
      const oldRow = tbody.children[this._currentRowIndex];
      if (oldRow) {
        oldRow.classList.remove("current");
      }
    }

    // Add current class to new row
    if (newRowIndex >= 0) {
      const newRow = tbody.children[newRowIndex];
      if (newRow) {
        newRow.classList.add("current");
      }
    }

    this._currentRowIndex = newRowIndex;
    this.scrollToCurrent();
  }

  /**
   * Returns sorted messages, using cache if inputs haven't changed.
   * Avoids re-sorting on every cursor move (which triggers render).
   */
  _getSortedMessages(messages) {
    // Check if we can use cached result
    if (
      this._sortedMessagesCache &&
      this._lastMessages === messages &&
      this._lastSortMethod === this.sortMethod &&
      this._lastSortDirection === this.sortDirection
    ) {
      return this._sortedMessagesCache;
    }

    // Need to re-sort
    let sortedMessages;
    if (this.sortMethod === "severity") {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      sortedMessages = [...messages].sort((a, b) => {
        const severityDiff =
          severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) {
          return this.sortDirection === "asc" ? severityDiff : -severityDiff;
        }
        return a.location.position.start.row - b.location.position.start.row;
      });
    } else if (this.sortMethod === "provider") {
      sortedMessages = [...messages].sort((a, b) => {
        // Use < > comparison instead of localeCompare for better performance
        if (a.linterName < b.linterName) return this.sortDirection === "asc" ? -1 : 1;
        if (a.linterName > b.linterName) return this.sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      sortedMessages = [...messages].sort((a, b) => {
        const val = a.location.position.start.row - b.location.position.start.row;
        return this.sortDirection === "asc" ? val : -val;
      });
    }

    // Update cache
    this._sortedMessagesCache = sortedMessages;
    this._lastMessages = messages;
    this._lastSortMethod = this.sortMethod;
    this._lastSortDirection = this.sortDirection;

    return sortedMessages;
  }

  _copyDescription() {
    if (!this._contextRow) return;
    const desc = this._contextRow.querySelector(".linter-description");
    if (desc) {
      atom.clipboard.write(desc.textContent.trim());
    }
  }

  destroy() {
    if (this.cwatch) {
      this.cwatch.dispose();
      this.cwatch = null;
    }
    if (this._disposables) {
      this._disposables.dispose();
    }
    etch.destroy(this);
  }

  update() {
    // Reset current row tracking on full re-render
    this._currentRowIndex = -1;
    etch.update(this);
  }

  readAfterUpdate() {
    // After full re-render, update current row highlight
    this._updateCurrentRowHighlight();
  }

  setSortMethod(method) {
    if (this.sortMethod === method) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortMethod = method;
      this.sortDirection = "asc";
    }
    this.update();
  }

  toggleVisibility(type) {
    if (type === "error") this.showError = !this.showError;
    if (type === "warning") this.showWarning = !this.showWarning;
    if (type === "info") this.showInfo = !this.showInfo;
    this.update();
  }

  render() {
    const severityClass =
      this.sortMethod === "severity"
        ? "linter-header-sortable linter-header-active"
        : "linter-header-sortable";
    const providerClass =
      this.sortMethod === "provider"
        ? "linter-header-sortable linter-header-active"
        : "linter-header-sortable";
    const positionClass =
      this.sortMethod === "position"
        ? "linter-header-sortable linter-header-active"
        : "linter-header-sortable";

    const head = (
      <tr class="linter-header">
        <th
          class={severityClass}
          on={{ click: () => this.setSortMethod("severity") }}
        >
          Severity{" "}
          {this.sortMethod === "severity"
            ? this.sortDirection === "asc"
              ? "▼"
              : "▲"
            : ""}
        </th>
        <th
          class={providerClass}
          on={{ click: () => this.setSortMethod("provider") }}
        >
          Provider{" "}
          {this.sortMethod === "provider"
            ? this.sortDirection === "asc"
              ? "▼"
              : "▲"
            : ""}
        </th>
        <th
          class={positionClass}
          on={{ click: () => this.setSortMethod("position") }}
        >
          Position{" "}
          {this.sortMethod === "position"
            ? this.sortDirection === "asc"
              ? "▼"
              : "▲"
            : ""}
        </th>
        <th>
          <span class="linter-header-title">Description</span>
          <span class="linter-toggles">
            <label class="input-label error">
              <input
                class="input-toggle"
                type="checkbox"
                checked={this.showError}
                on={{ change: () => this.toggleVisibility("error") }}
              />
            </label>
            <label class="input-label warning">
              <input
                class="input-toggle"
                type="checkbox"
                checked={this.showWarning}
                on={{ change: () => this.toggleVisibility("warning") }}
              />
            </label>
            <label class="input-label info">
              <input
                class="input-toggle"
                type="checkbox"
                checked={this.showInfo}
                on={{ change: () => this.toggleVisibility("info") }}
              />
            </label>
          </span>
        </th>
      </tr>
    );
    const data = [];
    if (this.editor) {
      const buffer = this.editor.getBuffer();

      if (buffer.linterUI) {
        // Use cached sorted messages if inputs haven't changed
        const sortedMessages = this._getSortedMessages(buffer.linterUI.messages);

        // Track visible index for data-index attribute
        let visibleIndex = 0;
        for (let i = 0; i < sortedMessages.length; i++) {
          const message = sortedMessages[i];
          if (!this.showError && message.severity === "error") continue;
          if (!this.showWarning && message.severity === "warning") continue;
          if (!this.showInfo && message.severity === "info") continue;

          const scls = SEVERITY_CLASS[message.severity];
          const stxt = SEVERITY_TEXT[message.severity];
          // Don't compute isCurrent here - handled by _updateCurrentRowHighlight()

          // Build position cell content with optional log reference
          const positionContent = [];
          positionContent.push(
            <span>
              {message.location.position.start.row + 1}:
              {message.location.position.start.column + 1}
            </span>
          );

          // Add log reference link if available
          if (message.reference && message.reference.file) {
            const refLine = Array.isArray(message.reference.position)
              ? message.reference.position[0]
              : message.reference.position?.row ?? 0;
            const refColumn = Array.isArray(message.reference.position)
              ? message.reference.position[1]
              : message.reference.position?.column ?? 0;
            positionContent.push(
              <a
                class="linter-log-ref"
                dataset={{ file: message.reference.file, line: refLine, column: refColumn }}
                title={`Open log at line ${refLine + 1}`}
              >
                log:{refLine + 1}
              </a>
            );
          }

          const item = (
            <tr
              class={"linter-row " + message.severity}
              dataset={{ index: i, visibleIndex: visibleIndex }}
            >
              <td class={scls}>{stxt}</td>
              <td class="linter-provider">{message.linterName}</td>
              <td class="linter-position">{positionContent}</td>
              <td
                class="linter-description"
                innerHTML={atom.ui.markdown.render(message.excerpt)}
              />
            </tr>
          );

          data.push(item);
          visibleIndex++;
        }
      }
    }
    return (
      <div class="linter-wrapper">
        <table class="linter-table">
          <thead>{head}</thead>
          <tbody on={{ click: this._onRowClick }}>{data}</tbody>
        </table>
      </div>
    );
  }

  getTitle() {
    return "Linter";
  }

  getDefaultLocation() {
    return "bottom";
  }

  getAllowedLocations() {
    return ["center", "bottom"];
  }

  toggle() {
    const refocus = atom.workspace.getActivePaneItem() != this;
    let prev = document.activeElement;
    atom.workspace.toggle(this).then(() => {
      if (refocus) {
        prev.focus();
      }
      this.scrollToCurrent();
    });
  }

  observe() {
    if (this.cwatch) {
      this.cwatch.dispose();
      this.cwatch = null;
    }
    if (this.editor) {
      // Use CSS-only highlight update instead of full re-render
      // This is much faster as it only updates 2 DOM elements instead of entire table
      this.cwatch = this.editor.onDidChangeCursorPosition(
        throttle(() => {
          this._updateCurrentRowHighlight();
        }, 100)
      );
    }
  }

  scrollToCurrent() {
    const currentRow = this.element.querySelector(".linter-row.current");
    if (!currentRow) return;

    const wrapper = this.element;
    const header = wrapper.querySelector("thead");
    const headerHeight = header ? header.offsetHeight : 0;

    const rowTop = currentRow.offsetTop;
    const rowBottom = rowTop + currentRow.offsetHeight;
    const visibleTop = wrapper.scrollTop + headerHeight;
    const visibleBottom = wrapper.scrollTop + wrapper.clientHeight;

    if (rowTop < visibleTop) {
      // Row is above visible area (under sticky header)
      wrapper.scrollTop = rowTop - headerHeight;
    } else if (rowBottom > visibleBottom) {
      // Row is below visible area
      wrapper.scrollTop = rowBottom - wrapper.clientHeight;
    }
  }
}

function throttle(func, timeout) {
  let timer = false;
  return function (...args) {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      func.apply(this, args);
      timer = false;
    }, timeout);
  };
}

module.exports = { LinterPanel };
