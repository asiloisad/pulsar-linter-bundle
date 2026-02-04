class StatusPanel {
  constructor(pkg) {
    this.pkg = pkg;
    this.editor = null;

    this.element = document.createElement("div");
    this.element.classList.add("linter-status", "inline-block");

    this.espan = document.createElement("a");
    this.espan.classList.add("icon", "icon-stop");
    this.element.appendChild(this.espan);

    this.wspan = document.createElement("a");
    this.wspan.classList.add("icon", "icon-alert");
    this.element.appendChild(this.wspan);

    this.ispan = document.createElement("a");
    this.ispan.classList.add("icon", "icon-info");
    this.element.appendChild(this.ispan);

    this.element.onmouseup = (e) => this.onmouseup(e);

    this.update();
  }

  destroy() {
    this.element.remove();
  }

  setEditor(editor) {
    this.editor = editor;
  }

  _getMessages() {
    if (this.pkg.panel?.viewMode === "project") {
      return this.pkg.allMessages || [];
    }
    if (!this.editor) return [];
    const buffer = this.editor.getBuffer();
    return buffer.linterUI ? buffer.linterUI.messages : [];
  }

  update() {
    let ecount = 0;
    let wcount = 0;
    let icount = 0;
    for (const message of this._getMessages()) {
      if (message.severity === "error") ecount++;
      else if (message.severity === "warning") wcount++;
      else if (message.severity === "info") icount++;
    }
    ecount
      ? this.espan.classList.add("text-error")
      : this.espan.classList.remove("text-error");
    this.espan.textContent = ecount;
    wcount
      ? this.wspan.classList.add("text-warning")
      : this.wspan.classList.remove("text-warning");
    this.wspan.textContent = wcount;
    icount
      ? this.ispan.classList.add("text-info")
      : this.ispan.classList.remove("text-info");
    this.ispan.textContent = icount;
  }

  onmouseup(e) {
    if (e.which === 1) {
      // left click
      this.pkg.togglePanel();
    } else if (e.which === 2) {
      // middle click
      atom.commands.dispatch(atom.views.getView(atom.workspace), "linter-bundle:clear");
    } else if (e.which === 3) {
      // right click
      this.pkg.inspectNext();
    }
  }
}

module.exports = { StatusPanel };
