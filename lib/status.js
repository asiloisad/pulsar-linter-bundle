class StatusPanel {
  constructor(pkg) {
    this.pkg = pkg;
    this.editor = null;

    this.element = document.createElement("div");
    this.element.classList.add("linter-status", "inline-block");

    this.espan = document.createElement("a");
    this.eicon = document.createElement("span");
    this.eicon.classList.add("icon", "icon-stop");
    this.espan.appendChild(this.eicon);
    this.elabel = document.createElement("span");
    this.espan.appendChild(this.elabel);
    this.element.appendChild(this.espan);

    this.wspan = document.createElement("a");
    this.wicon = document.createElement("span");
    this.wicon.classList.add("icon", "icon-alert");
    this.wspan.appendChild(this.wicon);
    this.wlabel = document.createElement("span");
    this.wspan.appendChild(this.wlabel);
    this.element.appendChild(this.wspan);

    this.ispan = document.createElement("a");
    this.iicon = document.createElement("span");
    this.iicon.classList.add("icon", "icon-info");
    this.ispan.appendChild(this.iicon);
    this.ilabel = document.createElement("span");
    this.ispan.appendChild(this.ilabel);
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
    this.elabel.textContent = ecount;
    wcount
      ? this.wspan.classList.add("text-warning")
      : this.wspan.classList.remove("text-warning");
    this.wlabel.textContent = wcount;
    icount
      ? this.ispan.classList.add("text-info")
      : this.ispan.classList.remove("text-info");
    this.ilabel.textContent = icount;
    this.element.classList.toggle(
      "project-mode",
      this.pkg.panel?.viewMode === "project",
    );
  }

  onmouseup(e) {
    if (e.which === 1 && e.ctrlKey) {
      // ctrl+left click
      this.pkg.inspectNext();
    } else if (e.which === 3 && e.ctrlKey) {
      // ctrl+right click
      this.pkg.inspectPrevious();
    } else if (e.which === 1) {
      // left click
      this.pkg.togglePanel();
    } else if (e.which === 2) {
      // middle click
      atom.commands.dispatch(atom.views.getView(atom.workspace), "linter-bundle:clear");
    } else if (e.which === 3) {
      // right click
      const panel = this.pkg.panel;
      if (!panel) return;
      panel.setViewMode(panel.viewMode === "project" ? "file" : "project");
      this.update();
    }
  }
}

module.exports = { StatusPanel };
