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

const commonSource = fs.readFileSync("js/agent_bridge_common.js", "utf8");
const codexSource = fs.readFileSync("js/agent_bridge_codex.js", "utf8");
vm.runInThisContext(commonSource, {
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
assert.equal(
  firstNonBlank([{ toString: () => "" }, "", "https://downloads.example/runtime"]),
  "https://downloads.example/runtime"
);
assert.equal(pythonDistInfoVersion("mistral_vibe-2.24.3.dist-info", "mistral-vibe"), "2.24.3");
assert.equal(pythonDistInfoVersion("other_package-2.24.3.dist-info", "mistral-vibe"), "");

const basicProxyEnv = proxyEnvironmentFromSettings({
  enabled: true,
  direct: false,
  method: "basic",
  host: "proxy.example",
  port: 3128,
  user: "domain/user",
  password: "p@ss:word",
  noProxy: "localhost,127.0.0.1"
});
assert.equal(basicProxyEnv.HTTPS_PROXY, "http://domain%2Fuser:p%40ss%3Aword@proxy.example:3128");
assert.equal(basicProxyEnv.PIP_PROXY, basicProxyEnv.HTTPS_PROXY);
assert.equal(basicProxyEnv.npm_config_https_proxy, basicProxyEnv.HTTPS_PROXY);
assert.equal(basicProxyEnv.NO_PROXY, "localhost,127.0.0.1");

const ntlmProxyEnv = proxyEnvironmentFromSettings({
  enabled: true,
  direct: false,
  method: "ntlm",
  host: "corporate-proxy.example",
  port: 8080,
  localProxyUrl: "http://127.0.0.1:19128"
});
assert.equal(ntlmProxyEnv.HTTP_PROXY, "http://127.0.0.1:19128");
assert.deepEqual(proxyEnvironmentFromSettings({ enabled: true, direct: true }), {});

assert.equal(
  redirectLocationValue({ getValue: () => "https://release-assets.example/runtime.tar.gz" }),
  "https://release-assets.example/runtime.tar.gz"
);
assert.equal(
  redirectLocationValue("Location: https://release-assets.example/runtime.tar.gz"),
  "https://release-assets.example/runtime.tar.gz"
);
assert.match(commonSource, /validateAbsoluteHttpUrl\(currentUrl\)/);
assert.match(commonSource, /source\.lastModified\(\)\) <= Number\(target\.lastModified\(\)\)/);
assert.match(commonSource, /newestUsableCodexAuthFile/);
assert.match(commonSource, /targetState\.exists && targetState\.expired/);
assert.match(commonSource, /bootstrap && bootstrap\.authenticationImported === true/);
assert.match(commonSource, /checks\["auth\.credentials"\]/);
assert.match(commonSource, /checks\["network\.provider_reachability"\]/);
assert.match(commonSource, /"account\/rateLimits\/read"/);
assert.match(commonSource, /function verifiedCodexAuthentication/);
assert.match(commonSource, /"codex-auth:" \+ hashShort/);
assert.match(commonSource, /return firstExpired !== null \? firstExpired/);
assert.match(commonSource, /"doctor", "--json"/);
assert.match(codexSource, /C8O\.agentBridge\.codexLoginStart/);
assert.match(codexSource, /C8O\.agentBridge\.codexLoginStatus/);
assert.match(codexSource, /authentication\.updatedAt/);
assert.match(codexSource, /entry\.process\.destroy\(\)/);
assert.match(codexSource, /appServerStartMs/);
assert.match(codexSource, /preflightMs/);
assert.match(commonSource, /Bootstrap is required once per agent conversation/);
assert.match(commonSource, /already used successfully in the current conversation/);
assert.match(commonSource, /Common NGX contracts that do not require palette discovery/);
assert.match(commonSource, /optimizeMutations:true/);
assert.match(commonSource, /Do not inspect `ALL_TOOLS`/);

const managedPreflightPrompt = withManagedGuidancePreflight("User message", {
  mcpEndpoint: "http://localhost:18082/convertigo/api/mcp"
});
assert.match(managedPreflightPrompt, /Scoped agent setup status: current/);
assert.match(managedPreflightPrompt, /2026-07-30\.conversation-bootstrap-v4/);
assert.match(managedPreflightPrompt, /Do not call `_setupCodex`/);
assert.equal(
  withManagedGuidancePreflight(managedPreflightPrompt, {}).split("Convertigo managed preflight for this turn").length,
  2,
  "managed guidance preflight must be idempotent"
);

assert.equal(
  managedMcpTransportEndpoint("http://localhost:18082/convertigo/api/mcp"),
  "http://localhost:18082/convertigo/api/mcp?jsonOnly=true"
);
assert.equal(
  managedMcpTransportEndpoint("http://localhost:18082/convertigo/api/mcp?transport=managed&jsonOnly=false#viewer"),
  "http://localhost:18082/convertigo/api/mcp?transport=managed&jsonOnly=true#viewer"
);
const compactCodexConfig = patchCodexMcpConfigText(
  "",
  "http://localhost:18082/convertigo/api/mcp",
  {},
  "/tmp/codex-home"
);
assert.match(compactCodexConfig.text, /url = "http:\/\/localhost:18082\/convertigo\/api\/mcp\?jsonOnly=true"/);
assert.equal(
  buildMcpServers("http://localhost:18082/convertigo/api/mcp")[0].url,
  "http://localhost:18082/convertigo/api/mcp?jsonOnly=true"
);

const pythonSpec = pythonRuntimeSpec({
  pythonVersion: "3.12.13",
  pythonBuildTag: "20260610",
  pythonPlatform: "aarch64-apple-darwin",
  pythonArchiveFlavor: "install_only_stripped",
  pythonInstallDir: "/tmp/convertigo-python"
}, "/tmp/convertigo-workspace");

assert.equal(
  pythonSpec.archiveUrl,
  "https://github.com/astral-sh/python-build-standalone/releases/download/20260610/cpython-3.12.13%2B20260610-aarch64-apple-darwin-install_only_stripped.tar.gz"
);

const vibeProvider = normalizeVibeAcpProviderSettings([
  {
    id: "model",
    currentValue: "zai-glm-5-2",
    options: [
      { value: "vibe-thinking", name: "Vibe Thinking", description: "mistral-vibe-cli-latest" },
      { value: "zai-glm-5-2", name: "Z.ai GLM 5.2", description: "zai-glm-5-2" }
    ]
  },
  {
    id: "thinking",
    currentValue: "high",
    options: ["off", "low", "medium", "high", "max"].map((value) => ({ value, name: value }))
  }
], {
  id: "vibe",
  source: {},
  supports: {}
});

assert.equal(vibeProvider.defaultModel, "zai-glm-5-2");
assert.equal(vibeProvider.models.length, 2);
assert.equal(vibeProvider.models[1].label, "Z.ai GLM 5.2");
assert.equal(vibeProvider.models[1].configuredName, "zai-glm-5-2");
assert.deepEqual(vibeProvider.models[1].reasoningLevels.map((level) => level.id), ["off", "low", "medium", "high", "max"]);
assert.equal(vibeProvider.models[1].defaultReasoning, "high");
assert.equal(vibeProvider.reasoningMode, "runtime_selectable");
assert.equal(vibeProvider.supports.reasoning, true);

const vibeConfigWithPreset = appendManagedVibeModelPresets([
  'active_model = "vibe-thinking"',
  "",
  "[[models]]",
  'name = "mistral-vibe-cli-latest"',
  'provider = "mistral"',
  'alias = "vibe-thinking"',
  "",
  "[[mcp_servers]]",
  'name = "Convertigo"'
].join("\n"));

assert.deepEqual(vibeConfigWithPreset.added, ["zai-glm-5-2"]);
assert.match(vibeConfigWithPreset.text, /name = "zai-glm-5-2"/);
assert.match(vibeConfigWithPreset.text, /input_price = 1\.4/);
assert.ok(vibeConfigWithPreset.text.indexOf('alias = "zai-glm-5-2"') < vibeConfigWithPreset.text.indexOf("[[mcp_servers]]"));
assert.deepEqual(appendManagedVibeModelPresets(vibeConfigWithPreset.text).added, []);

const uncachedProvider = requireCachedProviderConfiguration({
  id: "codex",
  status: "ready",
  ready: true,
  defaultModel: "",
  models: []
});
assert.equal(uncachedProvider.ready, false);
assert.equal(uncachedProvider.status, "configuration_required");

const staleProvider = requireCachedProviderConfiguration({
  id: "codex",
  status: "ready",
  ready: true,
  defaultModel: "gpt-current",
  models: [{ id: "gpt-old" }]
});
assert.equal(staleProvider.ready, false);
assert.equal(staleProvider.status, "configuration_required");

const configuredProvider = requireCachedProviderConfiguration({
  id: "codex",
  status: "ready",
  ready: true,
  defaultModel: "gpt-current",
  models: [{ id: "gpt-current" }]
});
assert.equal(configuredProvider.ready, true);
assert.equal(configuredProvider.status, "ready");

const persistedPreferences = validatedAgentPreferences({
  confirmed: true,
  provider: "codex",
  model: "gpt-current",
  reasoning: "high",
  serviceTier: "priority",
  updatedAt: 123
}, [{
  id: "codex",
  ready: true,
  defaultModel: "gpt-current",
  models: [{
    id: "gpt-current",
    defaultReasoning: "medium",
    reasoningLevels: [{ id: "low" }, { id: "medium" }, { id: "high" }]
  }],
  supports: { reasoning: true }
}]);
assert.deepEqual(persistedPreferences, {
  confirmed: true,
  provider: "codex",
  model: "gpt-current",
  reasoning: "high",
  serviceTier: "priority",
  updatedAt: 123
});
assert.equal(validatedAgentPreferences({ provider: "missing" }, [{ id: "codex", ready: true }]), null);

const unauthenticatedProvider = requireProviderAuthentication({
  id: "codex",
  status: "ready",
  ready: true,
  runtime: { installed: true },
  authentication: authenticationInfo(false, "", "codex_login"),
  source: {}
});
assert.equal(unauthenticatedProvider.ready, false);
assert.equal(unauthenticatedProvider.status, "authentication_required");
assert.equal(unauthenticatedProvider.authentication.action, "codex_login");

const authenticatedProvider = requireProviderAuthentication({
  id: "vibe",
  status: "ready",
  ready: true,
  runtime: { installed: true },
  authentication: authenticationInfo(true, "scoped_home", ""),
  source: {}
});
assert.equal(authenticatedProvider.ready, true);
assert.equal(authenticatedProvider.status, "ready");

console.log("Agent Bridge runtime contract OK");
