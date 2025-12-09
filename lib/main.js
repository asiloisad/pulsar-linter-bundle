const { CompositeDisposable, Disposable, Range } = require("atom");
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

let scrollMapHandle = null;
let scrollMapMessages = [];

/**
 * Consumes the scroll-map service to register linter layer.
 * Uses the new functional API (scroll-map v2.0.0+).
 * @param {Object} service - The scroll-map service
 * @returns {Disposable}
 */
function consumeScrollMap(service) {
  // UI provider that updates messages and triggers scroll-map refresh
  const scrollMapUIProvider = {
    name: "scroll-map",
    render: ({ messages }) => {
      scrollMapMessages = messages;
      if (scrollMapHandle) {
        scrollMapHandle.update();
      }
    },
    didBeginLinting() {},
    didFinishLinting() {},
    dispose: () => {
      if (scrollMapHandle) {
        scrollMapHandle.dispose();
        scrollMapHandle = null;
      }
    },
  };

  const updateLayer = () => {
    if (atom.config.get("linter-bundle.scrollMapState")) {
      if (!scrollMapHandle) {
        scrollMapHandle = service.register({
          name: "linter",
          throttle: 50,
          getMarkers(editor) {
            const editorPath = editor.getPath();
            return scrollMapMessages
              .filter((m) => m.location.file === editorPath)
              .map((m) => {
                const range = Range.fromObject(m.location.position);
                return {
                  row: editor.screenPositionForBufferPosition(range.start).row,
                  cls: m.severity,
                };
              });
          },
        });
        externalUIProviders.add(scrollMapUIProvider);
      }
    } else {
      if (scrollMapHandle) {
        scrollMapHandle.dispose();
        scrollMapHandle = null;
      }
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
    if (scrollMapHandle) {
      scrollMapHandle.dispose();
      scrollMapHandle = null;
    }
    scrollMapMessages = [];
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
