const { CompositeDisposable, Emitter, Disposable } = require("atom");

let SelectListView;

class ToggleView {
  constructor(action, providers) {
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.disabledProviders = [];
    this.action = action;
    this.providers = providers;
    this.subscriptions.add(
      this.emitter,
      atom.config.observe(
        "linter-bundle.disabledProviders",
        (disabledProviders) => {
          this.disabledProviders = disabledProviders;
        }
      )
    );
  }

  getItems() {
    if (this.action === "disable") {
      return this.providers.filter(
        (name) => !this.disabledProviders.includes(name)
      );
    }
    return this.disabledProviders;
  }

  process(name) {
    if (this.action === "disable") {
      this.disabledProviders.push(name);
      this.emitter.emit("did-disable", name);
    } else {
      const index = this.disabledProviders.indexOf(name);
      if (index !== -1) {
        this.disabledProviders.splice(index, 1);
      }
    }
    atom.config.set("linter-bundle.disabledProviders", this.disabledProviders);
  }

  show() {
    if (!SelectListView) {
      try {
        SelectListView = require("atom-select-list");
      } catch (error) {
        console.error(
          "[Linter] Failed to load atom-select-list module:",
          error
        );
        atom.notifications.addError("Linter: Failed to load toggle view", {
          detail:
            "The atom-select-list module could not be loaded. Please ensure the linter-bundle package dependencies are properly installed.",
          dismissable: true,
        });
        return;
      }
    }
    const selectListView = new SelectListView({
      items: this.getItems(),
      emptyMessage: "No matches found",
      elementForItem: (item) => {
        const li = document.createElement("li");
        li.textContent = item;
        return li;
      },
      didConfirmSelection: (item) => {
        try {
          this.process(item);
          this.dispose();
        } catch (e) {
          console.error("[Linter] Unable to process toggle:", e);
        }
      },
      didCancelSelection: () => {
        this.dispose();
      },
      didConfirmEmptySelection: () => {
        this.dispose();
      },
    });
    const panel = atom.workspace.addModalPanel({ item: selectListView });
    selectListView.focus();
    this.subscriptions.add(
      new Disposable(function () {
        panel.destroy();
      })
    );
  }

  onDidDispose(callback) {
    return this.emitter.on("did-dispose", callback);
  }

  onDidDisable(callback) {
    return this.emitter.on("did-disable", callback);
  }

  dispose() {
    this.emitter.emit("did-dispose");
    this.subscriptions.dispose();
  }
}

module.exports = ToggleView;
