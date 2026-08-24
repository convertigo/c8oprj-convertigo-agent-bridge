const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const javaProxy = new Proxy(function () {}, {
  get(_target, property) {
    if (property === Symbol.toPrimitive) {
      return () => "";
    }
    if (property === "isFile" || property === "isDirectory" || property === "exists") {
      return () => false;
    }
    return javaProxy;
  },
  apply() {
    return javaProxy;
  },
  construct() {
    return javaProxy;
  }
});

global.Packages = javaProxy;
global.context = javaProxy;
global.request = javaProxy;
global.log = javaProxy;
global.C8O = { agentBridge: {} };

vm.runInThisContext(fs.readFileSync("js/agent_bridge_common.js", "utf8"), {
  filename: "agent_bridge_common.js"
});

const compactFailure = compactCommandResult({
  command: "python -m pip install mistral-vibe",
  exitCode: 1,
  stdout: "",
  stderr: "x".repeat(5000),
  durationMs: 12,
  ok: false,
  error: ""
}, 512);

assert.equal(compactFailure.stderr.length, 516);
assert.throws(
  () => requireSuccessfulCommand(compactFailure, "Vibe runtime installation"),
  /Vibe runtime installation failed \(exit 1\)/
);
assert.equal(requireSuccessfulCommand({ ok: true }, "ignored").ok, true);

console.log("Agent Bridge runtime contract OK");
