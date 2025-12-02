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

  update() {
    if (!this.editor) {
      this.element.style.display = "none";
      this.espan.textContent = 0;
      this.wspan.textContent = 0;
      this.ispan.textContent = 0;
    } else {
      this.element.style.display = "";
      const buffer = this.editor.getBuffer();
      if (!buffer.linterUI) {
        return;
      }
      // Single pass through messages to count all severity types
      let ecount = 0;
      let wcount = 0;
      let icount = 0;
      for (const message of buffer.linterUI.messages) {
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
  }

  onmouseup(e) {
    if (e.which === 1) {
      // left click
      this.pkg.togglePanel();
    } else if (e.which === 3) {
      // right click
      this.pkg.inspectNext();
    }
  }
}

module.exports = { StatusPanel };
