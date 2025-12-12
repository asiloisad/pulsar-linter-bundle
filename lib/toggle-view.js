const { CompositeDisposable, Emitter, Disposable } = require("atom");
const SelectListView = require("pulsar-select-list");

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
    const selectListView = new SelectListView({
      items: this.getItems(),
      className: "linter-bundle toggle-view",
      emptyMessage: "No matches found",

      willShow: () => {
        this.previouslyFocusedElement = document.activeElement;
      },

      elementForItem: (item, options) => {
        const li = document.createElement("li");
        if (!options.visible) {
          return li;
        }

        const query = selectListView.processedQuery || "";
        const matches = query.length > 0
          ? atom.ui.fuzzyMatcher.match(item, query, { recordMatchIndexes: true }).matchIndexes
          : [];

        li.appendChild(SelectListView.highlightMatches(item, matches));
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
    });
    this.panel = atom.workspace.addModalPanel({ item: selectListView });
    selectListView.focus();
    this.subscriptions.add(
      new Disposable(() => {
        this.panel.destroy();
        this.panel = null;
        if (this.previouslyFocusedElement) {
          this.previouslyFocusedElement.focus();
          this.previouslyFocusedElement = null;
        }
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
