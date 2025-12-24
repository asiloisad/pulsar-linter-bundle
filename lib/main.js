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

/**
 * Provides MCP tools for claude-chat integration.
 * @returns {Object} Provider with getTools method
 */
function provideMcpTools() {
  return {
    getTools() {
      return [
        {
          name: "GetLinterMessages",
          description:
            "Get linter diagnostics (errors, warnings, info). Returns array of messages with severity, excerpt, location, and linterName. If path is omitted, returns messages for the active editor. Use path='*' to get all messages.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description:
                  "File path to get messages for. Omit for active editor, use '*' for all files.",
              },
            },
            required: [],
          },
          impl: ({ path }) => {
            if (!instance || !instance.registryMessages) {
              return [];
            }

            const allMessages = instance.registryMessages.messages || [];

            // Return all messages
            if (path === "*") {
              return allMessages.map(formatMessage);
            }

            // Filter by specific path
            if (path) {
              return allMessages
                .filter((msg) => msg.location?.file === path)
                .map(formatMessage);
            }

            // Default: active editor
            const editor = atom.workspace.getActiveTextEditor();
            if (!editor) {
              return [];
            }
            const editorPath = editor.getPath();
            if (!editorPath) {
              return [];
            }
            return allMessages
              .filter((msg) => msg.location?.file === editorPath)
              .map(formatMessage);
          },
          // Renderer configuration for claude-chat UI
          renderer: {
            name: "GetLinterMessages",
            className: "mcp-linter",
            getInfo: (input, result) => {
              const data = Array.isArray(result) ? result : [];
              const errors = data.filter((m) => m.severity === "error").length;
              const warnings = data.filter((m) => m.severity === "warning").length;
              return {
                path: input?.path === "*" ? null : input?.path,
                count: data.length,
                countLabel: "issues",
                resultInfo: data.length > 0 ? `${errors}E ${warnings}W` : null,
              };
            },
            hasExpandable: (input, result) => Array.isArray(result) && result.length > 0,
            contentType: "linter-messages",
          },
        },
      ];
    },
  };
}

/**
 * Format a linter message for MCP output.
 * @param {Object} msg - Linter message
 * @returns {Object} Formatted message
 */
function formatMessage(msg) {
  const position = msg.location?.position;
  return {
    severity: msg.severity,
    excerpt: msg.excerpt,
    linterName: msg.linterName,
    file: msg.location?.file || null,
    range: position
      ? {
          start: { row: position.start?.row, column: position.start?.column },
          end: { row: position.end?.row, column: position.end?.column },
        }
      : null,
    url: msg.url || null,
  };
}

module.exports = {
  activate,
  deactivate,
  consumeLinter,
  consumeLinterUI,
  provideIndie,
  consumeStatusBar,
  provideMcpTools,
};
