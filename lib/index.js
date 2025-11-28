const { CompositeDisposable, Disposable } = require("atom");
const Linter = require("./linter-main");
const LinterUI = require("./ui-main");
const Validate = require("./validate");

let instance;
let uiInstance;
let subscriptions;
let externalUIProviders;

/**
 * Activates the linter-bundle package.
 * Initializes both the core linting infrastructure and the UI.
 */
function activate() {
  subscriptions = new CompositeDisposable();
  externalUIProviders = new Set();

  // Initialize core linter
  instance = new Linter();

  // Initialize UI
  uiInstance = new LinterUI();
  uiInstance.activate();

  // Wire core to UI - direct integration without service layer
  // Also notify external UI providers (like scroll-map)
  instance.setUIRenderCallback((difference) => {
    uiInstance.render(difference);
    // Notify all external UI providers
    for (const ui of externalUIProviders) {
      if (ui.render) {
        ui.render(difference);
      }
    }
  });

  subscriptions.add(instance);
}

/**
 * Deactivates the linter-bundle package.
 * Cleans up both core and UI resources.
 */
function deactivate() {
  if (uiInstance) {
    uiInstance.deactivate();
  }
  if (subscriptions) {
    subscriptions.dispose();
  }
}

/**
 * Consumes linter providers from external packages.
 * This is the service consumer for packages like linter-ruff, linter-eslint, etc.
 * @param {Object|Array} linter - Linter provider(s) to consume
 * @returns {Disposable} Disposable to unregister the linter(s)
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
 * Provides the indie linter service for external packages.
 * @returns {Function} Factory function to create indie linter delegates
 */
function provideIndie() {
  return (indie) => instance.addIndie(indie);
}

/**
 * Consumes the status bar service to display linter status.
 * @param {Object} statusBar - The status bar service
 */
function consumeStatusBar(statusBar) {
  uiInstance.consumeStatusBar(statusBar);
}

/**
 * Consumes linter-ui providers from external packages (like scroll-map).
 * @param {Object} ui - Linter UI provider with render method
 * @returns {Disposable} Disposable to unregister the UI provider
 */
function consumeLinterUI(ui) {
  if (!Validate.ui(ui)) {
    return;
  }
  externalUIProviders.add(ui);
  return new Disposable(() => {
    if (ui.dispose) {
      ui.dispose();
    }
    externalUIProviders.delete(ui);
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
