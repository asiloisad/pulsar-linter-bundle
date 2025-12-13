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

module.exports = {
  activate,
  deactivate,
  consumeLinter,
  consumeLinterUI,
  provideIndie,
  consumeStatusBar,
};
