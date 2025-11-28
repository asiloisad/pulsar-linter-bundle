const { Emitter, CompositeDisposable } = require("atom");
const Validate = require("./validate");
const { normalizeMessages, mergeArray } = require("./helpers");

class IndieDelegate {
  constructor(indie, version) {
    this.scope = "project";
    this.emitter = new Emitter();
    this.messages = new Map();
    this.subscriptions = new CompositeDisposable();
    this.indie = indie;
    this.version = version;
    this.subscriptions.add(this.emitter);
  }

  get name() {
    return this.indie.name;
  }

  getMessages() {
    const out = [];
    this.messages.forEach((m) => {
      mergeArray(out, m);
    });
    return out;
  }

  clearMessages() {
    if (!this.subscriptions.disposed) {
      this.emitter.emit("did-update", []);
      this.messages.clear();
    }
  }

  setMessages(filePath, messages = null) {
    if (typeof filePath !== "string" || !Array.isArray(messages)) {
      throw new Error("Invalid Parameters to setMessages()");
    }
    if (
      this.subscriptions.disposed ||
      !Validate.messages(this.name, messages)
    ) {
      return;
    }
    messages.forEach(function (message) {
      if (message.location.file !== filePath) {
        console.debug(
          "[Linter-UI-Default] Expected File",
          filePath,
          "Message",
          message
        );
        throw new Error(
          "message.location.file does not match the given filePath"
        );
      }
    });
    normalizeMessages(this.name, messages);
    this.messages.set(filePath, messages);
    this.emitter.emit("did-update", this.getMessages());
  }

  setAllMessages(messages) {
    if (this.subscriptions.disposed) {
      return;
    }
    if (!Array.isArray(messages) || atom.inDevMode()) {
      if (!Validate.messages(this.name, messages)) {
        return;
      }
    }
    normalizeMessages(this.name, messages);
    this.messages.clear();
    for (let i = 0, { length } = messages; i < length; ++i) {
      const message = messages[i];
      const filePath = message.location.file;
      let fileMessages = this.messages.get(filePath);
      if (!fileMessages) {
        this.messages.set(filePath, (fileMessages = []));
      }
      fileMessages.push(message);
    }
    this.emitter.emit("did-update", this.getMessages());
  }

  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }

  dispose() {
    this.emitter.emit("did-destroy");
    this.subscriptions.dispose();
    this.messages.clear();
  }
}

module.exports = IndieDelegate;
