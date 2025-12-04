const { CompositeDisposable, Disposable } = require("atom");
const Linter = require("./linter-main");
const LinterUI = require("./linter-ui");
const Validate = require("./validate");

let instance;
let ui;
let subscriptions;
let externalUIProviders;

/**
 * Activates the linter-bundle package.
 */
function activate() {
  subscriptions = new CompositeDisposable();
  externalUIProviders = new Set();

  // Initialize core linter and UI
  instance = new Linter();
  ui = new LinterUI();

  // Wire core to UI
  instance.setUIRenderCallback((difference) => {
    ui.render(difference);
    for (const provider of externalUIProviders) {
      if (provider.render) {
        provider.render(difference);
      }
    }
  });

  // Register commands
  subscriptions.add(
    instance,
    ui,
    atom.commands.add("atom-workspace", {
      "linter-bundle:toggle-panel": () => ui.togglePanel(),
    }),
    atom.commands.add("atom-text-editor:not([mini])", {
      "linter-bundle:inspect": () => ui.inspect(),
      "linter-bundle:next": () => ui.inspectNext(),
      "linter-bundle:previous": () => ui.inspectPrevious(),
    })
  );
}

/**
 * Deactivates the linter-bundle package.
 */
function deactivate() {
  subscriptions?.dispose();
}

/**
 * Consumes linter providers from external packages.
 * @param {Object|Array} linter - Linter provider(s) to consume
 * @returns {Disposable}
 */
function consumeLinter(linter) {
  const linters = Array.isArray(linter) ? linter : [linter];
  for (const entry of linters) {
    instance.addLinter(entry);
  }
  return new Disposable(() => {
    for (const entry of linters) {
      instance.deleteLinter(entry);
    }
  });
}

/**
 * Provides the indie linter service.
 * @returns {Function}
 */
function provideIndie() {
  return (indie) => instance.addIndie(indie);
}

/**
 * Consumes the status bar service.
 * @param {Object} statusBar
 */
function consumeStatusBar(statusBar) {
  ui.consumeStatusBar(statusBar);
}

/**
 * Consumes linter-ui providers from external packages.
 * @param {Object} provider - UI provider with render method
 * @returns {Disposable}
 */
function consumeLinterUI(provider) {
  if (!Validate.ui(provider)) {
    return;
  }
  externalUIProviders.add(provider);
  return new Disposable(() => {
    if (provider.dispose) {
      provider.dispose();
    }
    externalUIProviders.delete(provider);
  });
}

let scrollMapLayerClass = null;
let scrollMapService = null;

/**
 * Consumes the scroll-map service to register linter layer.
 * @param {Object} service - The scroll-map service
 * @returns {Disposable}
 */
function consumeScrollMap(service) {
  scrollMapService = service;

  class LinterLayer extends service.ScrollMapLayer {
    constructor(editor) {
      super({ editor: editor, name: "linter", timer: 50 });
      this.messages = [];
      this.threshold = 0;
      this.disposables.add(
        atom.config.observe("linter-bundle.scrollMapThreshold", (value) => {
          this.threshold = value;
          this.update();
        })
      );
    }

    filter({ added, messages, removed }) {
      let editorPath = this.editor.getPath();
      let updateRequired = false;
      if (added.filter((item) => item.location.file === editorPath).length) {
        updateRequired = true;
      } else if (
        removed.filter((item) => item.location.file === editorPath).length
      ) {
        updateRequired = true;
      }
      if (updateRequired) {
        this.messages = messages.filter(
          (item) => item.location.file === editorPath
        );
        this.update();
      }
    }

    recalculate() {
      if (this.threshold && this.threshold < this.messages.length) {
        this.items = [];
        return;
      }
      this.items = this.messages.map((message) => {
        return {
          row: this.editor.screenPositionForBufferPosition(
            message.location.position.start
          ).row,
          cls: message.severity,
        };
      });
    }
  }

  scrollMapLayerClass = LinterLayer;

  // Create an internal UI provider that forwards to scroll-map layers
  const scrollMapUIProvider = {
    name: "scroll-map",
    render: (args) => {
      atom.workspace.getTextEditors().forEach((editor) => {
        const layer = editor.scrollmap?.layers["linter"];
        if (layer) {
          layer.filter(args);
        }
      });
    },
    didBeginLinting() {},
    didFinishLinting() {},
    dispose: () => {
      scrollMapService.unregisterLayer("linter");
    },
  };

  const updateLayer = () => {
    if (atom.config.get("linter-bundle.scrollMapState")) {
      service.registerLayer("linter", LinterLayer);
      externalUIProviders.add(scrollMapUIProvider);
    } else {
      service.unregisterLayer("linter");
      externalUIProviders.delete(scrollMapUIProvider);
    }
  };

  updateLayer();
  const configDisposable = atom.config.observe(
    "linter-bundle.scrollMapState",
    updateLayer
  );

  return new Disposable(() => {
    configDisposable.dispose();
    externalUIProviders.delete(scrollMapUIProvider);
    service.unregisterLayer("linter");
    scrollMapService = null;
    scrollMapLayerClass = null;
  });
}

module.exports = {
  activate,
  deactivate,
  consumeLinter,
  consumeLinterUI,
  provideIndie,
  consumeStatusBar,
  consumeScrollMap,
};
