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

assert.equal(agentCapabilityProfile({ userId: "studio", assistantSurface: "studio" }).id, "generalist");
assert.equal(agentCapabilityProfile({ userId: "studio", assistantSurface: "studio", agentProfile: "flow" }).id, "flow");
assert.equal(agentCapabilityProfile({ userId: "alice", assistantSurface: "studio", agentProfile: "flow" }).id, "nocode");

const router = buildConvertigoStudioRouterSkill();
assert.match(router, /Both the `convertigo` and `convertigo-flow` MCP servers/);
assert.match(router, /explicit user request for Flow/);
assert.match(router, /conversation profile as a routing hint/);

console.log("Agent Bridge routing contract OK");
