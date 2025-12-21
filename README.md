# linter-bundle

A unified linting package that combines linting infrastructure with an integrated UI.

- **Unified Package**: Combines linter core functionality with UI in a single package
- **Status Bar Integration**: Shows error, warning, and info counts in the status bar
- **Linter Panel**: Sortable table view of all linter messages with filtering
- **Inline Bubbles**: Hover-style message display at cursor position
- **Editor Highlighting**: Underline and highlight decorations for linted ranges
- **Multiple Sort Methods**: Sort by severity, position, or provider
- **Linter Management**: Enable/disable individual linter providers

## Installation

To install `linter-bundle` search for [linter-bundle](https://web.pulsar-edit.dev/packages/linter-bundle) in the Install pane of the Pulsar settings or run `ppm install linter-bundle`. Alternatively, you can run `ppm install asiloisad/pulsar-linter-bundle` to install a package directly from the GitHub repository.

## Commands

| Command                              | Description                                  |
| ------------------------------------ | -------------------------------------------- |
| `linter-bundle:lint`                 | Manually trigger linting on the current file |
| `linter-bundle:toggle-panel`         | Toggle the linter panel visibility           |
| `linter-bundle:inspect`              | Show message bubble at cursor position       |
| `linter-bundle:next`                 | Jump to next linter message                  |
| `linter-bundle:previous`             | Jump to previous linter message              |
| `linter-bundle:debug`                | Show debug information about active linters  |
| `linter-bundle:enable-linter`        | Enable a disabled linter provider            |
| `linter-bundle:disable-linter`       | Disable a linter provider                    |
| `linter-bundle:toggle-active-editor` | Toggle linting for the current editor        |

## Configuration

| Setting                | Description                                             | Default             |
| ---------------------- | ------------------------------------------------------- | ------------------- |
| `lintPreviewTabs`      | Lint tabs while in preview status                       | `true`              |
| `lintOnOpen`           | Lint files when opened                                  | `true`              |
| `lintOnChange`         | Lint while typing (if supported by provider)            | `true`              |
| `lintOnChangeInterval` | Debounce interval for lint-on-change (ms)               | `300`               |
| `ignoreGlob`           | Glob pattern for files to ignore                        | `**/*.min.{js,css}` |
| `disabledProviders`    | List of disabled linter provider names                  | `[]`                |
| `defaultSortMethod`    | Default sort method for linter panel                    | `position`          |
| `showHoverTooltip`     | Show linter messages when hovering over issues          | `true`              |
| `largeFileLineCount`   | Skip inline decorations for files with more lines       | `20000`             |
| `longLineLength`       | Skip inline decorations if any line exceeds this length | `4000`              |
| `scrollMapState`       | Display linter markers on scroll bar                    | `true`              |

## Services

### Consumed Services

#### `linter` (v2.0.0)

Standard linter provider interface. Packages like `linter-eslint`, `linter-ruff`, etc. provide this service.

```javascript
// Provider example
module.exports = {
  provideLinter() {
    return {
      name: "my-linter",
      scope: "file", // or 'project'
      lintsOnChange: true,
      grammarScopes: ["source.js"],
      lint(editor) {
        return [
          {
            severity: "error", // 'error' | 'warning' | 'info'
            location: {
              file: editor.getPath(),
              position: [
                [0, 0],
                [0, 1],
              ],
            },
            excerpt: "Error message",
          },
        ];
      },
    };
  },
};
```

#### `linter-ui` (v1.0.0)

External UI providers that want to display linter messages. Used by packages like `linter-bundle` to show linter markers on the scrollbar.

```javascript
// UI provider example
module.exports = {
  provideLinterUI() {
    return {
      name: "my-ui",
      render({ added, removed, messages }) {
        // Handle message updates
      },
      didBeginLinting({ linter, filePath }) {},
      didFinishLinting({ linter, filePath }) {},
      dispose() {},
    };
  },
};
```

### Provided Services

#### `linter-indie` (v2.0.0)

Indie linter delegate for custom integrations. Allows packages to push linter messages directly without implementing the full linter provider interface.

```javascript
// Consumer example
module.exports = {
  consumeIndie(registerIndie) {
    const indie = registerIndie({ name: "my-indie-linter" });

    // Set messages for a specific file
    indie.setMessages("/path/to/file.js", [
      {
        severity: "warning",
        location: {
          file: "/path/to/file.js",
          position: [
            [0, 0],
            [0, 1],
          ],
        },
        excerpt: "Warning message",
      },
    ]);

    // Or set all messages at once
    indie.setAllMessages([
      /* messages */
    ]);

    // Clear all messages
    indie.clearMessages();
  },
};
```

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!

# Credits

Fork of [linter](https://github.com/steelbrain/linter) and [linter-ui-default](https://github.com/steelbrain/linter-ui-default) packages.
