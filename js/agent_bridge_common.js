// Common runtime, process registry, event buffer and shared helpers.
// Loaded by vibe_agent_bridge.js inside one Rhino scope.
  var REGISTRY_KEY = "ConvertigoAgentBridge.agentProcessRegistry.v1";
  var SESSION_HANDLE_ATTR = "ConvertigoAgentBridge.currentHandle";
  var SESSION_CONVERSATION_ATTR = "ConvertigoAgentBridge.currentConversationId";
  var FALLBACK_MCP_PATH = "/api/mcp";
  var DEFAULT_TTL_SECONDS = 3600;
  var RUNTIME_UPDATE_CACHE_KEY = "ConvertigoAgentBridge.runtimeUpdateCache.v1";
  var RUNTIME_UPDATE_CACHE_FILE = "runtime-update-checks.json";
  var DEFAULT_RUNTIME_UPDATE_CACHE_MS = 21600000;
  var STORAGE_CLEANUP_FILE = "storage-cleanup.json";
  var DEFAULT_STORAGE_CLEANUP_INTERVAL_MS = 21600000;
  var DEFAULT_STORAGE_ORPHAN_GRACE_MS = 86400000;
  var DEFAULT_EVENT_LIMIT = 100;
  var MAX_EVENT_LIMIT = 500;
  var MAX_EVENT_BUFFER = 5000;
  var NOCODE_MCP_TOKEN_ENV = "C8O_NOCODE_MCP_TOKEN";
  var MCP_GUIDANCE_VERSION = "2026-07-29.convergent-workflow-v3";

  var File = Packages.java.io.File;
  var FileOutputStream = Packages.java.io.FileOutputStream;
  var RandomAccessFile = Packages.java.io.RandomAccessFile;
  var BufferedReader = Packages.java.io.BufferedReader;
  var InputStreamReader = Packages.java.io.InputStreamReader;
  var OutputStreamWriter = Packages.java.io.OutputStreamWriter;
  var BufferedWriter = Packages.java.io.BufferedWriter;
  var ProcessBuilder = Packages.java.lang.ProcessBuilder;
  var ProcessHandle = Packages.java.lang.ProcessHandle;
  var Runnable = Packages.java.lang.Runnable;
  var Thread = Packages.java.lang.Thread;
  var System = Packages.java.lang.System;
  var UUID = Packages.java.util.UUID;
  var ArrayList = Packages.java.util.ArrayList;
  var HashMap = Packages.java.util.HashMap;
  var ConcurrentHashMap = Packages.java.util.concurrent.ConcurrentHashMap;
  var LinkedHashMap = Packages.java.util.LinkedHashMap;
  var Collections = Packages.java.util.Collections;
  var TimeUnit = Packages.java.util.concurrent.TimeUnit;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var StandardCopyOption = Packages.java.nio.file.StandardCopyOption;
  var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
  var MessageDigest = Packages.java.security.MessageDigest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var ProcessUtils = Packages.com.twinsoft.convertigo.engine.util.ProcessUtils;
  var NetworkUtils = Packages.com.twinsoft.convertigo.engine.util.NetworkUtils;

  var DEFAULT_PYTHON_VERSION = "3.12.13";
  var DEFAULT_PYTHON_BUILD_TAG = "20260610";
  var DEFAULT_PYTHON_ARCHIVE_FLAVOR = "install_only_stripped";
  var DEFAULT_PYTHON_ASSET_PREFIX = "https://github.com/astral-sh/python-build-standalone/releases/download/{tag}";

  function now() {
    return System.currentTimeMillis();
  }

  function trim(value) {
    if (value === null || typeof value === "undefined") {
      return "";
    }
    return String(value).replace(/^\s+|\s+$/g, "");
  }

  function requestParameter(name) {
    try {
      var request = context && context.httpServletRequest ? context.httpServletRequest : null;
      if (request !== null) {
        return trim(request.getParameter(String(name)));
      }
    } catch (_ignoreRequestParameter) {}
    return "";
  }

  function optionOrRequest(options, name) {
    options = options || {};
    var value = trim(options[name]);
    if (value.length) {
      return value;
    }
    return requestParameter(name);
  }

  function optionsWithRequestFallbacks(options) {
    options = options || {};
    var copy = {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        copy[key] = options[key];
      }
    }
    [
      "provider", "agent", "agentProvider", "targetProject", "projectName", "projectId", "primaryProject",
      "conversationId", "threadid", "handle",
      "userId", "agentProfile", "skillProfile", "assistantContext", "assistantSurface", "profile",
      "currentUrl", "currentRoute", "currentPath", "currentFormId", "currentFormUrl",
      "nocodeCurrentUrl", "nocodeCurrentRoute", "nocodeCurrentFormId", "nocodeCurrentFormUrl",
      "formId", "pageId", "applicationId", "currentPage", "currentApplicationId",
      "codexHomeScope", "vibeHomeScope", "homeScope", "codexHome", "vibeHome", "agentHome",
      "mcpEndpoint", "workspaceRoot", "settingsTimeoutMs", "modelsTimeoutMs",
      "checkUpdates", "refreshUpdateCheck", "updateCheckTimeoutMs", "updateCheckCacheMs", "runtimePresenceOnly",
      "codexRuntimeMode", "codexProtocol",
      "agentRevealMode", "convertigoRevealMode", "uiRevealMode", "revealMode",
      "nocodeMcpToken", "noCodeMcpToken", "mcpBearerToken",
      "nocodeMcpTokenHandle", "noCodeMcpTokenHandle", "mcpBearerTokenHandle",
      "browserDebugUrl", "browserDevToolsJsonUrl", "browserDevToolsWebSocketUrl",
      "playwrightCdpEndpoint", "playwrightMcpEndpoint", "viewerCdpEndpoint", "viewerDebugPort"
    ].forEach(function (name) {
      if (!trim(copy[name]).length) {
        var value = requestParameter(name);
        if (value.length) {
          copy[name] = value;
        }
      }
    });
    return copy;
  }

  function boolValue(value, defaultValue) {
    if (value === null || typeof value === "undefined" || trim(value) === "") {
      return defaultValue === true;
    }
    if (value === true || value === false) {
      return value === true;
    }
    var text = trim(value).toLowerCase();
    return text === "true" || text === "1" || text === "yes" || text === "on";
  }

  function revealModeEnabled(options, entry) {
    options = options || {};
    var values = [
      options.agentRevealMode,
      options.convertigoRevealMode,
      options.uiRevealMode,
      options.revealMode,
      options.reveal
    ];
    for (var i = 0; i < values.length; i++) {
      if (values[i] !== null && typeof values[i] !== "undefined" && trim(values[i]).length) {
        return boolValue(values[i], false);
      }
    }
    if (entry && entry.convertigoRevealMode === true) {
      return true;
    }
    return false;
  }

  function firstDefinedOption(options, names) {
    options = options || {};
    for (var i = 0; i < names.length; i++) {
      var value = options[names[i]];
      if (value !== null && typeof value !== "undefined" && trim(value).length) {
        return value;
      }
    }
    return "";
  }

  function withRevealModePrompt(promptText, enabled) {
    var text = String(promptText || "");
    if (enabled !== true) {
      return text;
    }
    var marker = "Convertigo runtime reveal mode is enabled";
    if (text.indexOf(marker) !== -1) {
      return text;
    }
    return [
      marker + ".",
      "When calling supported Convertigo MCP mutation/viewer tools that should visibly move Studio or No Code Studio, pass `reveal:true`: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.",
      "For `mobile-builder-open`, use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless the user specifically needs UI focus.",
      "Do not pass `reveal:true` on read-only calls. Treat skipped, unsupported, or intent reveal results as UI hints, not mutation failures.",
      "",
      text
    ].join("\n");
  }

  function intValue(value, defaultValue, minValue, maxValue) {
    var parsed = parseInt(trim(value), 10);
    if (isNaN(parsed)) {
      parsed = defaultValue;
    }
    if (typeof minValue === "number" && parsed < minValue) {
      parsed = minValue;
    }
    if (typeof maxValue === "number" && parsed > maxValue) {
      parsed = maxValue;
    }
    return parsed;
  }

  function parseObject(value, defaultValue) {
    if (value === null || typeof value === "undefined" || trim(value) === "") {
      return defaultValue || {};
    }
    var className = "";
    try {
      if (value && value.getClass) {
        className = String(value.getClass().getName());
      }
    } catch (_ignoreClassName) {}
    var text = trim(value);
    if (className.indexOf("String") >= 0 || text.indexOf("{") === 0 || text.indexOf("[") === 0) {
      return JSON.parse(String(value));
    }
    if (typeof value === "object") {
      return value;
    }
    return JSON.parse(String(value));
  }

  function parseCommand(value, fallback) {
    if (value === null || typeof value === "undefined" || trim(value) === "") {
      return fallback;
    }
    if (typeof value === "object" && value.length) {
      var fromArray = [];
      for (var i = 0; i < value.length; i++) {
        fromArray.push(String(value[i]));
      }
      return fromArray;
    }
    var text = trim(value);
    if (text.indexOf("[") === 0) {
      var parsed = JSON.parse(text);
      var arr = [];
      for (var j = 0; j < parsed.length; j++) {
        arr.push(String(parsed[j]));
      }
      return arr;
    }
    return [text];
  }

  function toJavaList(values) {
    var list = new ArrayList();
    for (var i = 0; i < values.length; i++) {
      list.add(String(values[i]));
    }
    return list;
  }

  function envObjectToMap(pbEnv, env) {
    if (!env) {
      return;
    }
    for (var key in env) {
      if (Object.prototype.hasOwnProperty.call(env, key) && env[key] !== null && typeof env[key] !== "undefined") {
        pbEnv.put(String(key), String(env[key]));
      }
    }
  }

  function filePath(file) {
    return String(file.getCanonicalPath());
  }

  function childPath(parent, name) {
    return filePath(new File(parent, name));
  }

  function parentPath(path) {
    var parent = new File(String(path)).getParentFile();
    return parent === null ? "" : filePath(parent);
  }

  function pathListAppend(paths, path) {
    var value = trim(path);
    if (!value.length) {
      return;
    }
    for (var i = 0; i < paths.length; i++) {
      if (paths[i] === value) {
        return;
      }
    }
    paths.push(value);
  }

  function commandPathStartsWith(command, directory) {
    var path = trim(command && command.path);
    var root = trim(directory);
    if (!path.length || !root.length) {
      return false;
    }
    try {
      path = filePath(new File(path));
      root = filePath(new File(root));
    } catch (_ignoreCommandPathStartsWith) {}
    return path === root || path.indexOf(root + File.separator) === 0 || path.indexOf(root + "/") === 0;
  }

  function nodeRuntimeSearchPath(options) {
    options = options || {};
    var paths = [];
    var addNodeDir = function (dir) {
      var value = trim(dir);
      if (!value.length) {
        return;
      }
      pathListAppend(paths, value);
      try {
        pathListAppend(paths, childPath(value, "bin"));
      } catch (_ignoreNodeBinPath) {}
    };
    addNodeDir(options.nodeDir || options.nodeInstallDir);
    try {
      addNodeDir(filePath(ProcessUtils.getDefaultNodeDir()));
    } catch (_ignoreDefaultNodeDir) {}
    pathListAppend(paths, "/opt/homebrew/bin");
    pathListAppend(paths, "/usr/local/bin");
    return paths.join(String(File.pathSeparator));
  }

  function normalizeConvertigoBaseUrl(value) {
    var text = trim(value).replace(/\/+$/g, "");
    if (!text.length) {
      return "";
    }
    var marker = text.toLowerCase().indexOf("/convertigo");
    if (marker >= 0) {
      return text.substring(0, marker + "/convertigo".length);
    }
    return text + "/convertigo";
  }

  function engineConvertigoBaseUrl() {
    try {
      var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
      var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
      var localUrl = normalizeConvertigoBaseUrl(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
      if (localUrl.length) {
        return localUrl;
      }
      var endpoint = normalizeConvertigoBaseUrl(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_ENDPOINT));
      if (endpoint.length) {
        return endpoint;
      }
    } catch (_ignoreEngineConvertigoUrl) {}
    try {
      if (context && context.httpServletRequest) {
        var request = context.httpServletRequest;
        var port = request.getServerPort();
        var portPart = (port === 80 || port === 443) ? "" : ":" + port;
        var requestUrl = normalizeConvertigoBaseUrl(request.getScheme() + "://" + request.getServerName() + portPart + request.getContextPath());
        if (requestUrl.length) {
          return requestUrl;
        }
      }
    } catch (_ignoreRequestConvertigoUrl) {}
    try {
      return "http://localhost:" + (Packages.com.twinsoft.convertigo.engine.Engine.isStudioMode() ? "18080" : "28080") + "/convertigo";
    } catch (_ignoreStudioMode) {
      return "http://localhost:18080/convertigo";
    }
  }

  function defaultMcpEndpoint() {
    return engineConvertigoBaseUrl().replace(/\/+$/g, "") + FALLBACK_MCP_PATH;
  }

  function resolveMcpEndpoint(options) {
    return trim(options && options.mcpEndpoint) || defaultMcpEndpoint();
  }

  function isWindows() {
    return String(System.getProperty("os.name") || "").toLowerCase().indexOf("win") >= 0;
  }

  function venvBinPath(venvDir, command) {
    var name = String(command || "python");
    if (isWindows()) {
      if (name.indexOf(".") < 0) {
        name += ".exe";
      }
      return childPath(childPath(venvDir, "Scripts"), name);
    }
    return childPath(childPath(venvDir, "bin"), name);
  }

  function ensureDirectory(file) {
    Files.createDirectories(file.toPath());
  }

  function normalizeWorkspaceRootPath(value) {
    var text = trim(value);
    if (!text.length) {
      return "";
    }
    var root = new File(text);
    var studioWorkspace = new File(root, ".metadata/.plugins/com.twinsoft.convertigo.studio");
    if (studioWorkspace.isDirectory()) {
      return filePath(studioWorkspace);
    }
    return filePath(root);
  }

  function engineWorkspaceRoot() {
    try {
      var workspace = normalizeWorkspaceRootPath(Packages.com.twinsoft.convertigo.engine.Engine.USER_WORKSPACE_PATH);
      if (workspace.length) {
        return workspace;
      }
    } catch (_ignoreEngineWorkspace) {}
    try {
      var propertyWorkspace = normalizeWorkspaceRootPath(System.getProperty("convertigo.cems.user_workspace_path"));
      if (propertyWorkspace.length) {
        return propertyWorkspace;
      }
    } catch (_ignoreEngineWorkspaceProperty) {}
    return "";
  }

  function workspaceRootFromProjectDir(projectDir) {
    if (projectDir === null || typeof projectDir === "undefined") {
      return "";
    }
    var dir = projectDir && projectDir.getParentFile ? projectDir : new File(String(projectDir));
    var parent = dir.getParentFile();
    if (parent === null) {
      return "";
    }
    var studioWorkspace = new File(parent, ".metadata/.plugins/com.twinsoft.convertigo.studio");
    if (studioWorkspace.isDirectory()) {
      return filePath(studioWorkspace);
    }
    if (String(parent.getName()) === "projects" && parent.getParentFile() !== null) {
      return filePath(parent.getParentFile());
    }
    return "";
  }

  function readTextFile(file) {
    if (!file.exists()) {
      return "";
    }
    return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
  }

  function writeTextFile(file, text) {
    var parent = file.getParentFile();
    if (parent !== null) {
      ensureDirectory(parent);
    }
    var bytes = new java.lang.String(String(text)).getBytes(StandardCharsets.UTF_8);
    Files.write(
      file.toPath(),
      bytes,
      StandardOpenOption.CREATE,
      StandardOpenOption.TRUNCATE_EXISTING,
      StandardOpenOption.WRITE
    );
    return bytes.length;
  }

  function readJsonFile(file) {
    try {
      var text = readTextFile(file);
      return trim(text).length ? JSON.parse(text) : null;
    } catch (_ignoreReadJsonFile) {
      return null;
    }
  }

  function writeJsonFile(file, value) {
    writeTextFile(file, JSON.stringify(value || {}, null, 2));
  }

  function copyFileBinary(source, target) {
    var parent = target.getParentFile();
    if (parent !== null) {
      ensureDirectory(parent);
    }
    Files.copy(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
  }

  function copyDirectoryTree(source, target) {
    if (source.isDirectory()) {
      ensureDirectory(target);
      var children = source.listFiles();
      if (children === null) {
        return;
      }
      for (var i = 0; i < children.length; i++) {
        copyDirectoryTree(children[i], new File(target, children[i].getName()));
      }
      return;
    }
    if (source.isFile()) {
      copyFileBinary(source, target);
    }
  }

  function migrateLegacyHiddenCodexHome(homeDir, report) {
    if (String(homeDir.getName()) !== "codex-home" || homeDir.exists()) {
      return;
    }
    var parent = homeDir.getParentFile();
    if (parent === null) {
      return;
    }
    var legacy = new File(parent, ".codex-home");
    if (!legacy.isDirectory()) {
      return;
    }
    try {
      if (legacy.renameTo(homeDir)) {
        report.reused.push("legacy .codex-home migrated to codex-home");
        return;
      }
    } catch (_ignoreLegacyRename) {}
    copyDirectoryTree(legacy, homeDir);
    report.copied.push("legacy .codex-home copied to codex-home");
  }

  function projectDirectoryByName(projectName) {
    var name = trim(projectName);
    if (!name.length) {
      return null;
    }
    try {
      var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
      var project = manager.getOriginalProjectByName(name);
      if (project === null || typeof project === "undefined") {
        project = manager.getProjectByName(name);
      }
      if (project && project.getDirFile) {
        var dirFile = project.getDirFile();
        if (dirFile !== null && typeof dirFile !== "undefined") {
          return dirFile;
        }
      }
      if (project && project.getDirPath) {
        var dirPath = project.getDirPath();
        if (trim(dirPath).length) {
          return new File(String(dirPath));
        }
      }
    } catch (_ignoreProjectDirectoryByName) {}
    return null;
  }

  function callLocalSequence(project, sequence, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    var sequenceArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = String(project);
    sequenceArray[0] = String(sequence);
    params.put("__project", projectArray);
    params.put("__sequence", sequenceArray);
    params.put("__context", "agentBridge_" + String(now()));
    variables = variables || {};
    for (var key in variables) {
      if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== null && typeof variables[key] !== "undefined") {
        params.put(String(key), String(variables[key]));
      }
    }
    var requester = null;
    try {
      requester = new InternalRequester(params, context.httpServletRequest);
    } catch (_ignoreHttpRequest) {
      requester = new InternalRequester(params);
    }
    var response = requester.processRequest();
    try {
      var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
      return json;
    } finally {
      try {
        var ctx2 = requester.getContext();
        Engine.theApp.contextManager.remove(ctx2);
      } catch (_ignoreContextCleanup) {}
    }
  }

  function findSetupCodexResult(value, depth) {
    if (value === null || typeof value === "undefined" || typeof value !== "object" || depth > 8) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(value, "skillStatus") &&
        (Object.prototype.hasOwnProperty.call(value, "resolvedCodexHome") || Object.prototype.hasOwnProperty.call(value, "skillPath"))) {
      return value;
    }
    var preferred = ["setupCodexResult", "result", "document", "doc", "payload", "response"];
    for (var i = 0; i < preferred.length; i++) {
      if (Object.prototype.hasOwnProperty.call(value, preferred[i])) {
        var found = findSetupCodexResult(value[preferred[i]], depth + 1);
        if (found !== null) {
          return found;
        }
      }
    }
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        var nested = value[key];
        if (nested !== null && typeof nested === "object") {
          var nestedFound = findSetupCodexResult(nested, depth + 1);
          if (nestedFound !== null) {
            return nestedFound;
          }
        }
      }
    }
    return null;
  }

  function setupCodexFromMcpProject(options, codexHome, mcpEndpoint, profile) {
    var normalizedProfile = normalizeSkillProfile({ agentProfile: profile });
    var skillKey = normalizedProfile === "nocode" ? "nocode" : "generalist";
    var skillLabel = managedSkillLabel(normalizedProfile);
    var report = {
      attempted: false,
      ok: false,
      source: "ConvertigoMCP._setupCodex",
      skillStatus: "",
      configStatus: "",
      resolvedCodexHome: filePath(codexHome),
      resolvedMcpUrl: trim(mcpEndpoint) || resolveMcpEndpoint(options),
      skillPath: "",
      warnings: [],
      dryRun: boolValue(options.dryRun, false),
      message: "",
      error: ""
    };
    if (projectDirectoryByName("ConvertigoMCP") === null) {
      report.message = "ConvertigoMCP project not loaded; using bridge fallback skill generator";
      return report;
    }
    report.attempted = true;
    try {
      var response = callLocalSequence("ConvertigoMCP", "_setupCodex", {
        codexHome: filePath(codexHome),
        mcpUrl: report.resolvedMcpUrl,
        dryRun: report.dryRun ? "true" : "false"
      });
      var result = findSetupCodexResult(response, 0);
      if (result === null) {
        throw new Error("ConvertigoMCP._setupCodex did not return a setup result");
      }
      var skillInfo = result.skills && result.skills[skillKey] ? result.skills[skillKey] : null;
      if (normalizedProfile === "nocode" && skillInfo === null) {
        throw new Error("ConvertigoMCP._setupCodex did not return convertigo-nocode skill details");
      }
      var skillPaths = result.skillPaths && typeof result.skillPaths === "object" ? result.skillPaths : {};
      report.ok = true;
      report.skillStatus = trim(skillInfo && skillInfo.status) || trim(result.skillStatus) || "unknown";
      report.configStatus = trim(result.configStatus) || "unknown";
      report.resolvedCodexHome = trim(result.resolvedCodexHome) || report.resolvedCodexHome;
      report.resolvedMcpUrl = trim(result.resolvedMcpUrl) || report.resolvedMcpUrl;
      report.skillPath = trim(skillInfo && skillInfo.path) || trim(skillPaths[skillKey]) || trim(result.skillPath);
      if (result.warnings && typeof result.warnings.length !== "undefined") {
        for (var i = 0; i < result.warnings.length; i++) {
          var warning = trim(result.warnings[i]);
          if (warning.length) {
            report.warnings.push(warning);
          }
        }
      }
      report.message = skillLabel + " skill synchronized from ConvertigoMCP._setupCodex";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to synchronize from ConvertigoMCP._setupCodex; using bridge fallback skill generator";
    }
    return report;
  }

  function mcpSkillSourceCandidate(options) {
    var explicit = trim(options.mcpSkillsSourceDir || options.skillsSourceDir || options.convertigoMcpDir);
    if (explicit.length) {
      return new File(explicit);
    }
    var projectDir = projectDirectoryByName("ConvertigoMCP");
    if (projectDir !== null) {
      return projectDir;
    }
    var home = String(System.getProperty("user.home"));
    var candidates = [
      new File(home, "git/c8oprj-c8o-mcp"),
      new File(home, "git/c8oprj-convertigo-mcp")
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (isMcpSkillSource(candidates[i])) {
        return candidates[i];
      }
    }
    return null;
  }

  function isMcpSkillSource(dir) {
    return dir !== null && dir.exists() && dir.isDirectory() &&
      new File(dir, "AGENT.md").isFile() &&
      new File(dir, "TOOLS.md").isFile();
  }

  function shouldCopySkillFile(file) {
    var name = String(file.getName());
    if (name === "AGENT.md" || name === "TOOLS.md" || name === "SKILL.md") {
      return true;
    }
    return name.toLowerCase().lastIndexOf(".md") === name.length - 3;
  }

  function copySkillTree(source, target, relative, report) {
    var sourceEntry = new File(source, relative);
    if (!sourceEntry.exists()) {
      return;
    }
    if (sourceEntry.isFile()) {
      if (shouldCopySkillFile(sourceEntry)) {
        var destination = new File(target, relative);
        writeTextFile(destination, readTextFile(sourceEntry));
        report.copied.push(relative);
      }
      return;
    }
    if (!sourceEntry.isDirectory()) {
      return;
    }
    var children = sourceEntry.listFiles();
    if (children === null) {
      return;
    }
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var childRelative = relative.length ? relative + "/" + child.getName() : String(child.getName());
      if (child.isDirectory()) {
        copySkillTree(source, target, childRelative, report);
      } else if (shouldCopySkillFile(child)) {
        var destination = new File(target, childRelative);
        writeTextFile(destination, readTextFile(child));
        report.copied.push(childRelative);
      }
    }
  }

  function noCodeSkillSourceFile(options) {
    options = options || {};
    var candidates = [];
    var explicit = trim(options.mcpSkillsSourceDir || options.skillsSourceDir || options.convertigoMcpDir);
    if (explicit.length) {
      var explicitFile = new File(explicit);
      candidates.push(new File(explicitFile, "SKILL.md"));
      candidates.push(new File(new File(explicitFile, "convertigo-nocode"), "SKILL.md"));
      candidates.push(new File(new File(new File(explicitFile, "resources"), "convertigo-nocode"), "SKILL.md"));
    }
    var sourceRoot = mcpSkillSourceCandidate(options);
    if (sourceRoot !== null) {
      candidates.push(new File(new File(new File(sourceRoot, "resources"), "convertigo-nocode"), "SKILL.md"));
    }
    var home = String(System.getProperty("user.home"));
    candidates.push(new File(home, "git/c8oprj-c8o-mcp/resources/convertigo-nocode/SKILL.md"));
    candidates.push(new File(home, "git/c8oprj-convertigo-mcp/resources/convertigo-nocode/SKILL.md"));
    for (var i = 0; i < candidates.length; i++) {
      var file = candidates[i];
      if (file !== null && file.isFile()) {
        return file;
      }
    }
    return null;
  }

  function normalizeNoCodeSkillContent(content, mcpEndpoint) {
    var text = String(content == null ? "" : content);
    var versionLine = "- Skill guidance version: `" + MCP_GUIDANCE_VERSION + "`.";
    var endpointLine = "- Expected MCP endpoint: `" + trim(mcpEndpoint) + "`.";
    if (/^- Skill guidance version: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Skill guidance version: `[^`]*`\./m, versionLine);
    }
    if (/^- Expected MCP endpoint: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Expected MCP endpoint: `[^`]*`\./m, endpointLine);
    }
    return text;
  }

  function managedSkillContent(options, profile, mcpEndpoint) {
    var normalizedProfile = normalizeSkillProfile({ agentProfile: profile });
    if (normalizedProfile === "nocode") {
      var noCodeFile = noCodeSkillSourceFile(options);
      if (noCodeFile !== null) {
        return {
          content: normalizeNoCodeSkillContent(readTextFile(noCodeFile), mcpEndpoint),
          source: filePath(noCodeFile),
          copied: true
        };
      }
      return {
        content: buildConvertigoNoCodeSkill(mcpEndpoint),
        source: "generated fallback",
        copied: false
      };
    }
    return {
      content: buildConvertigoGeneralistSkill(mcpEndpoint),
      source: "generated",
      copied: false
    };
  }

  function normalizeSkillProfile(options) {
    options = options || {};
    var value = trim(
      optionOrRequest(options, "agentProfile") ||
      optionOrRequest(options, "skillProfile") ||
      optionOrRequest(options, "assistantContext") ||
      optionOrRequest(options, "assistantSurface") ||
      optionOrRequest(options, "profile")
    ).toLowerCase();
    var project = trim(
      optionOrRequest(options, "targetProject") ||
      optionOrRequest(options, "projectName") ||
      optionOrRequest(options, "projectId") ||
      optionOrRequest(options, "primaryProject") ||
      resolveProjectIdOption(options)
    ).toLowerCase();
    if (value === "nocode" || value === "no-code" || value === "c8oforms" || value === "forms" || project === "c8oforms") {
      return "nocode";
    }
    return "generalist";
  }

  function managedSkillSlug(profile) {
    return normalizeSkillProfile({ agentProfile: profile }) === "nocode" ? "convertigo-nocode" : "convertigo-generalist";
  }

  function managedSkillLabel(profile) {
    return normalizeSkillProfile({ agentProfile: profile }) === "nocode" ? "Convertigo NoCode" : "Convertigo Generalist";
  }

  function agentSkillInstructions(provider, profile) {
    var isNoCode = normalizeSkillProfile({ agentProfile: profile }) === "nocode";
    return [
      "# Convertigo Agent Instructions",
      "",
      "You are running inside a Convertigo-integrated local agent session.",
      "",
      isNoCode ? "- Automatically follow the Convertigo NoCode workflow for C8Oforms / No-Code Studio work." : "- Automatically follow the Convertigo Generalist workflow for Convertigo project work.",
      "- Use the Convertigo MCP/tools whenever you need to inspect, modify, save, reload, or validate Convertigo projects.",
      "- When `mobile-builder-open` returns `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, treat it as the visible Studio mobile viewer and prefer inspecting or driving that viewer over opening a separate browser.",
      "- If `mobile-builder-open(stateOnly=true)` returns `status:\"stopped\"`, immediately call it once with `stateOnly=false, wait=false`; do not spend a timeout polling an inactive builder.",
      "- Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. Reuse it and do not create, open, close, select, or navigate tabs/pages.",
      "- For viewer automation, use the Playwright MCP tools exposed by the managed Codex configuration. Do not run ad hoc shell scripts with `require('playwright')`, and do not launch a separate browser unless explicitly needed.",
      "- Use Playwright only after `mobile-builder-open` reports both `browserDebugPortMatched:true` and `browserControlReady:true`.",
      "- Known-good fast check: call `playwright.browser_tabs` only to list and confirm the single current viewer URL, use `playwright.browser_find` for visible UI, and use `playwright.browser_evaluate` only for DOM state or timing. Do not probe unsupported browser features first.",
      "- If the browser target is `about:blank` while builder status is `building`, poll `mobile-builder-open(stateOnly=true, wait=true)` before Playwright. If status is `stopped`, launch asynchronously instead.",
      "- If `mobile-builder-open` reports `browserControlReady:true` but the Playwright/browser-control MCP tools are unavailable, disabled, still on `about:blank`, or attached to another endpoint, report the configuration problem to the user instead of bypassing it with Node scripts, raw CDP WebSocket code, or a new browser.",
      "- If a prompt says Convertigo runtime reveal mode is enabled, pass `reveal:true` only on supported Convertigo mutation/viewer tools that should visibly move Studio or No Code Studio; do not add it to read-only calls.",
      "- For `mobile-builder-open`, use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless the user specifically needs UI focus.",
      isNoCode ? "- You are in the C8Oforms / No-Code Studio surface, not in Eclipse Studio. A selected Convertigo project is optional in this surface." : "- Work on the selected project unless the user explicitly asks for another project.",
      isNoCode ? "" : "- If no project is selected and the user explicitly asks to create a new project or application, derive a concise valid technical name when needed, check for collisions through Convertigo MCP, and proceed without asking for a project selection.",
      isNoCode ? "- Discover forms, applications, pages, data sources, roles, publication state, and permissions through the NoCode/C8Oforms MCP context before falling back to generic Studio project inspection." : "",
      isNoCode ? "- If the current NoCode URL, form id, route, or page id is supplied in the prompt, treat it as the default target for edits unless the user names another target." : "",
      isNoCode ? "- If a first tool discovery attempt does not show `nocode-form-*` tools, retry with exact searches for `Convertigo NoCode form contract get edit update validate compile C8Oforms`, `nocode-form-contract-get nocode-form-edit nocode-form-update`, and `mcp__convertigo nocode_form_contract_get nocode_form_edit nocode_form_update` before reporting a blocker." : "",
      isNoCode ? "- If no no-code form/application is selected, answer from the C8Oforms workspace or ask which form/application to target; do not assume an unrelated Studio project." : "",
      "- Prefer Convertigo objects and MCP operations. Do not edit generated folders such as `_private/ionic`, `DisplayObjects`, `dist`, or build outputs.",
      "- Reply to the user in their language. Keep progress updates short and factual, and never expose hidden reasoning.",
      "- When you change a project, validate the result with the available Convertigo tools before claiming completion.",
      isNoCode ? "- Keep the user-facing vocabulary no-code oriented: forms, applications, pages, fields, data sources, roles, publication, and permissions." : "",
      "",
      "The synchronized Convertigo MCP knowledge pack is available in `skills/convertigo-mcp/`.",
      "Start with `skills/convertigo-mcp/AGENT.md` and `skills/convertigo-mcp/TOOLS.md`, then read only the prompt or resource files relevant to the task.",
      isNoCode ? "The managed NoCode skill is available in `skills/convertigo-nocode/SKILL.md` and should be preferred for this surface." : "",
      "",
      "Provider: " + providerLabel(provider)
    ].filter(function(line) { return line !== ""; }).join("\n");
  }

  function defaultCodexHomePath() {
    return childPath(String(System.getProperty("user.home")), ".codex");
  }

  function effectiveCodexHomePath(homePath) {
    var home = trim(homePath);
    return home.length ? home : defaultCodexHomePath();
  }

  function tomlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function splitTextLines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function findTomlSectionRange(lines, sectionName) {
    var header = "[" + sectionName + "]";
    var start = -1;
    var end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) === header) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      return { found: false, start: -1, end: -1 };
    }
    for (var j = start + 1; j < lines.length; j++) {
      if (/^\s*\[.+\]\s*$/.test(lines[j])) {
        end = j;
        break;
      }
    }
    return { found: true, start: start, end: end };
  }

  function serverSecretGet(handle) {
    var text = trim(handle);
    if (!text.length) {
      return "";
    }
    try {
      var store = getServerStore();
      if (store !== null && store.get) {
        var value = store.get(text);
        return value === null || typeof value === "undefined" ? "" : trim(value);
      }
    } catch (_ignoreServerSecretGet) {}
    return "";
  }

  function noCodeMcpBearerToken(options) {
    options = options || {};
    if (normalizeSkillProfile(options) !== "nocode") {
      return "";
    }
    var direct = trim(options.nocodeMcpToken || options.noCodeMcpToken || options.mcpBearerToken);
    if (direct.length) {
      return direct;
    }
    var fromHandle = serverSecretGet(options.nocodeMcpTokenHandle || options.noCodeMcpTokenHandle || options.mcpBearerTokenHandle);
    if (fromHandle.length) {
      return fromHandle;
    }
    return noCodeMcpBearerTokenFromFile(options);
  }

  function noCodeMcpBearerTokenFromFile(options) {
    options = options || {};
    var userId = trim(optionOrRequest(options, "userId"));
    if (!userId.length) {
      return "";
    }
    try {
      var tokenFile = new File(new File(new File(new File(resolveWorkspaceRoot(options), "agents"), "nocode"), "users"), userPathSlug(userId));
      tokenFile = new File(tokenFile, "mcp-token.json");
      if (!tokenFile.isFile()) {
        return "";
      }
      var record = JSON.parse(readTextFile(tokenFile));
      return trim(record && record.token);
    } catch (_ignoreNoCodeTokenFile) {
      return "";
    }
  }

  function tomlArray(values) {
    var parts = [];
    for (var i = 0; i < values.length; i++) {
      parts.push('"' + tomlEscape(values[i]) + '"');
    }
    return "[" + parts.join(", ") + "]";
  }

  function removeTomlSection(lines, sectionName) {
    var range = findTomlSectionRange(lines, sectionName);
    if (!range.found) {
      return {
        lines: lines,
        removed: false
      };
    }
    return {
      lines: lines.slice(0, range.start).concat(lines.slice(range.end)),
      removed: true
    };
  }

  function removeTrailingPlaywrightConfigComments(lines) {
    lines = lines || [];
    var end = lines.length;
    var i = end - 1;
    while (i >= 0 && !trim(lines[i]).length) {
      i--;
    }
    var lastContent = i;
    while (i >= 0) {
      var line = trim(lines[i]);
      if (line === "# The Studio JxBrowser CDP endpoint is supplied by the Codex process environment." ||
          line === "# Do not hardcode it here; several conversations may target different builders." ||
          line === "# The Studio JxBrowser CDP endpoint is scoped to this Codex home and refreshed per conversation." ||
          line === "# This scoped home may target a different builder than another conversation." ||
          line === "# The Studio JxBrowser CDP endpoint is written here because this Codex home is viewer-scoped." ||
          line === "# If a shared/user home is forced, Playwright MCP stays disabled to avoid opening an external browser.") {
        i--;
        continue;
      }
      break;
    }
    if (i < lastContent) {
      return lines.slice(0, i + 1);
    }
    return lines;
  }

  function npmPackageNameFromSpec(spec) {
    var text = trim(spec);
    if (!text.length) {
      return "";
    }
    var slash = text.indexOf("/");
    var at = text.lastIndexOf("@");
    if (at > 0 && at > slash) {
      return text.substring(0, at);
    }
    return text;
  }

  function resolvePlaywrightMcpCdpEndpoint(options) {
    options = options || {};
    var viewerDebugPort = intValue(options.viewerDebugPort, 0, 0, 65535);
    if (viewerDebugPort >= 1024) {
      return "http://localhost:" + viewerDebugPort;
    }
    var endpoint = trim(
      options.playwrightCdpEndpoint ||
      options.viewerCdpEndpoint ||
      options.browserDebugUrl ||
      options.browserDevToolsWebSocketUrl ||
      options.browserDevToolsJsonUrl ||
      options.playwrightMcpEndpoint
    );
    if (endpoint.match(/\/json\/?$/)) {
      return endpoint.replace(/\/json\/?$/, "");
    }
    return endpoint;
  }

  function viewerDebugPortLeaseFile(options) {
    options = options || {};
    var conversationId = trim(options.conversationId || options.threadid || options.handle);
    if (!conversationId.length) {
      return null;
    }
    var root = new File(new File(new File(resolveWorkspaceRoot(options), "agents"), "codex"), "viewer-debug-ports");
    return new File(root, safePathPart(conversationId) + ".json");
  }

  function stableViewerDebugPortBase(value) {
    var text = String(value || "");
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash * 31) + text.charCodeAt(i)) & 0x7fffffff;
    }
    return 40000 + (hash % 10000);
  }

  function leasedViewerDebugPorts(leaseFile) {
    var used = {};
    if (leaseFile === null || leaseFile.getParentFile() === null || !leaseFile.getParentFile().isDirectory()) {
      return used;
    }
    var currentPath = filePath(leaseFile);
    var files = leaseFile.getParentFile().listFiles();
    if (files === null) {
      return used;
    }
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file.isFile() || filePath(file) === currentPath) {
        continue;
      }
      try {
        var lease = parseObject(readTextFile(file), {});
        var port = intValue(lease.port, 0, 0, 65535);
        if (port >= 1024) {
          used[String(port)] = true;
        }
      } catch (_ignoreViewerDebugPortLease) {}
    }
    return used;
  }

  function ensureManagedViewerDebugPort(options) {
    options = options || {};
    var explicitPort = intValue(options.viewerDebugPort, 0, 0, 65535);
    if (explicitPort >= 1024) {
      options.viewerDebugPort = explicitPort;
      return explicitPort;
    }
    if (boolValue(options.disableViewerDebugPortReservation || options.skipViewerDebugPortReservation, false)) {
      return 0;
    }
    if (normalizeSkillProfile(options) === "nocode") {
      return 0;
    }
    var leaseFile = viewerDebugPortLeaseFile(options);
    if (leaseFile === null) {
      return 0;
    }
    var leasedPorts = leasedViewerDebugPorts(leaseFile);
    try {
      if (leaseFile.isFile()) {
        var lease = parseObject(readTextFile(leaseFile), {});
        var leasedPort = intValue(lease.port, 0, 0, 65535);
        if (leasedPort >= 1024 && leasedPorts[String(leasedPort)] !== true) {
          options.viewerDebugPort = leasedPort;
          return leasedPort;
        }
      }
    } catch (_ignoreViewerDebugPortLeaseRead) {}

    var conversationId = trim(options.conversationId || options.threadid || options.handle);
    var basePort = stableViewerDebugPortBase(conversationId);
    var port = 0;
    for (var offset = 0; offset < 10000; offset++) {
      var candidate = 40000 + ((basePort - 40000 + offset) % 10000);
      if (leasedPorts[String(candidate)] !== true && Number(NetworkUtils.nextAvailable(candidate)) === candidate) {
        port = candidate;
        break;
      }
    }
    if (port < 1024 || port > 65535) {
      throw new Error("Unable to reserve a Studio viewer debug port");
    }
    ensureDirectory(leaseFile.getParentFile());
    writeTextFile(leaseFile, JSON.stringify({
      conversationId: conversationId,
      port: port,
      createdAt: now()
    }, null, 2) + "\n");
    options.viewerDebugPort = port;
    return port;
  }

  function codexPlaywrightMcpPackageSpec(options) {
    options = options || {};
    var name = trim(
      options.codexPlaywrightMcpPackage ||
      options.playwrightMcpPackage ||
      options.codexPlaywrightPackage ||
      options.playwrightPackage
    ) || "@playwright/mcp";
    var version = trim(
      options.codexPlaywrightMcpVersion ||
      options.playwrightMcpVersion ||
      options.codexPlaywrightVersion ||
      options.playwrightVersion
    ) || "latest";
    if (!version.length) {
      return name;
    }
    return name + "@" + version;
  }

  function codexPlaywrightMcpBinaryName(options) {
    return trim(options && (options.codexPlaywrightMcpBinary || options.playwrightMcpBinary)) || "playwright-mcp";
  }

  function detectNpxRuntime(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var userHome = String(System.getProperty("user.home"));
    var localNodeDir = normalizeDirectory(options.nodeDir || options.nodeInstallDir, filePath(ProcessUtils.getDefaultNodeDir()), workspaceRoot);
    var npxName = scriptCommandName("npx");
    var candidates = [
      trim(options.npxPath),
      childPath(localNodeDir, npxName),
      childPath(childPath(localNodeDir, "bin"), npxName)
    ];
    try {
      var npmRuntime = detectNpmRuntime(options);
      if (npmRuntime.npm && npmRuntime.npm.found) {
        var npmParent = parentPath(npmRuntime.npm.path);
        if (npmParent.length) {
          candidates.push(childPath(npmParent, npxName));
          candidates.push(childPath(parentPath(npmParent), npxName));
        }
      }
    } catch (_ignoreNpxNpmCandidate) {}
    candidates.push(childPath(childPath(userHome, ".local"), "bin/" + npxName));
    candidates.push("/opt/homebrew/bin/npx");
    candidates.push("/usr/local/bin/npx");
    candidates.push("npx");
    return firstWorkingCommand(candidates, ["--version"], nodeRuntimeSearchPath(options));
  }

  function codexPlaywrightMcpCommand(options, installDir) {
    var npx = detectNpxRuntime(options || {});
    return npx.found ? npx.path : "npx";
  }

  function codexPlaywrightMcpInlineCdpEndpointEnabled(options) {
    options = options || {};
    if (!resolvePlaywrightMcpCdpEndpoint(options).length) {
      return false;
    }
    if (boolValue(options.disablePlaywrightMcpCdpEndpoint || options.skipPlaywrightMcpCdpEndpoint, false)) {
      return false;
    }
    if (boolValue(options.inlinePlaywrightMcpCdpEndpoint || options.hardcodePlaywrightMcpCdpEndpoint, false)) {
      return true;
    }
    if (trim(options.codexHome || options.agentHome).length) {
      return true;
    }
    var scopeOption = trim(options.codexHomeScope || options.homeScope || options.scope);
    if (!scopeOption.length) {
      return true;
    }
    return normalizeCodexHomeScope(scopeOption) === "conversation";
  }

  function codexPlaywrightMcpArgs(options, installDir) {
    options = options || {};
    var args = ["--prefix", codexNpmPrefix(installDir), codexPlaywrightMcpBinaryName(options)];
    var endpoint = resolvePlaywrightMcpCdpEndpoint(options);
    if (endpoint.length && codexPlaywrightMcpInlineCdpEndpointEnabled(options)) {
      args.push("--cdp-endpoint");
      args.push(endpoint);
      args.push("--shared-browser-context");
    }
    return args;
  }

  function patchCodexPlaywrightMcpConfigText(existingText, options, installDir) {
    options = options || {};
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = trim(text).length ? splitTextLines(text) : [];
    var removed = removeTomlSection(lines, "mcp_servers.playwright");
    lines = removeTrailingPlaywrightConfigComments(removed.lines);
    var endpoint = resolvePlaywrightMcpCdpEndpoint(options);
    var scopedEndpoint = codexPlaywrightMcpInlineCdpEndpointEnabled(options);
    var enabled = endpoint.length > 0 && scopedEndpoint && !boolValue(options.disablePlaywrightMcp || options.skipPlaywrightMcpConfig, false);
    if (typeof options.playwrightMcpEnabled !== "undefined" && trim(options.playwrightMcpEnabled).length) {
      enabled = boolValue(options.playwrightMcpEnabled, enabled);
    }
    if (lines.length && trim(lines[lines.length - 1]).length) {
      lines.push("");
    }
    if (enabled) {
      lines.push("# The Studio JxBrowser CDP endpoint is written here because this Codex home is viewer-scoped.");
      lines.push("# If a shared/user home is forced, Playwright MCP stays disabled to avoid opening an external browser.");
    }
    lines.push("[mcp_servers.playwright]");
    lines.push('command = "' + tomlEscape(codexPlaywrightMcpCommand(options, installDir)) + '"');
    lines.push("args = " + tomlArray(codexPlaywrightMcpArgs(options, installDir)));
    lines.push("startup_timeout_sec = 30");
    lines.push("enabled = " + (enabled ? "true" : "false"));
    var nextText = lines.join("\n").replace(/\n+$/, "\n");
    return {
      status: nextText === text.replace(/\n+$/, "\n") ? "unchanged" : (text.length ? "updated" : "created"),
      text: nextText,
      enabled: enabled,
      endpoint: endpoint
    };
  }

  function patchCodexMcpConfigText(existingText, mcpEndpoint, options) {
    options = options || {};
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = trim(text).length ? splitTextLines(text) : [];
    var range = findTomlSectionRange(lines, "mcp_servers.convertigo");
    var urlLine = 'url = "' + tomlEscape(mcpEndpoint) + '"';
    var timeoutLine = "startup_timeout_sec = 60";
    var enabledLine = "enabled = true";
    var guidanceHeaderEntry = '"X-Convertigo-Guidance-Version" = "' + tomlEscape(MCP_GUIDANCE_VERSION) + '"';
    var viewerDebugPort = intValue(options.viewerDebugPort, 0, 0, 65535);
    var viewerDebugPortHeaderEntry = viewerDebugPort >= 1024
      ? '"X-Convertigo-Viewer-Debug-Port" = "' + tomlEscape(String(viewerDebugPort)) + '"'
      : "";
    var managedHeadersLine = "http_headers = { " + guidanceHeaderEntry
      + (viewerDebugPortHeaderEntry.length ? ", " + viewerDebugPortHeaderEntry : "") + " }";
    var useBearer = normalizeSkillProfile(options || {}) === "nocode";
    var bearerLine = 'bearer_token_env_var = "' + tomlEscape(NOCODE_MCP_TOKEN_ENV) + '"';
    var status = "unchanged";

    var mergeManagedHeaders = function (line) {
      var source = String(line || "");
      var open = source.indexOf("{");
      var close = source.lastIndexOf("}");
      if (open < 0 || close <= open) {
        return managedHeadersLine;
      }
      var body = trim(source.substring(open + 1, close));
      var guidancePattern = /(["']X-Convertigo-Guidance-Version["']\s*=\s*)["'][^"']*["']/;
      var viewerDebugPortPattern = /(["']X-Convertigo-Viewer-Debug-Port["']\s*=\s*)["'][^"']*["']/;
      if (guidancePattern.test(body)) {
        body = body.replace(guidancePattern, guidanceHeaderEntry);
      } else {
        body = body.length ? body + ", " + guidanceHeaderEntry : guidanceHeaderEntry;
      }
      if (viewerDebugPortHeaderEntry.length) {
        if (viewerDebugPortPattern.test(body)) {
          body = body.replace(viewerDebugPortPattern, viewerDebugPortHeaderEntry);
        } else {
          body = body.length ? body + ", " + viewerDebugPortHeaderEntry : viewerDebugPortHeaderEntry;
        }
      } else if (viewerDebugPortPattern.test(body)) {
        body = body.replace(viewerDebugPortPattern, "");
        body = body.replace(/^\s*,\s*|\s*,\s*$/g, "").replace(/\s*,\s*,\s*/g, ", ");
      }
      return "http_headers = { " + body + " }";
    };

    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[mcp_servers.convertigo]");
      lines.push(urlLine);
      lines.push(timeoutLine);
      lines.push(enabledLine);
      lines.push(managedHeadersLine);
      if (useBearer) {
        lines.push(bearerLine);
      }
      status = text.length ? "updated" : "created";
      var withCreatedPlaywright = patchCodexPlaywrightMcpConfigText(lines.join("\n").replace(/\n+$/, "\n"), options, normalizeDirectory(options.installDir, childPath(resolveWorkspaceRoot(options), "agents/codex"), resolveWorkspaceRoot(options)));
      if (withCreatedPlaywright.status !== "unchanged" && status !== "created") {
        status = "updated";
      }
      return {
        status: status,
        text: withCreatedPlaywright.text
      };
    }

    var sectionLines = lines.slice(range.start, range.end);
    var replacedUrl = false;
    var replacedTimeout = false;
    var replacedEnabled = false;
    var replacedGuidanceHeaders = false;
    var replacedBearer = false;
    for (var i = 1; i < sectionLines.length; i++) {
      if (/^\s*url\s*=/.test(sectionLines[i])) {
        if (trim(sectionLines[i]) !== urlLine) {
          sectionLines[i] = urlLine;
          status = "updated";
        }
        replacedUrl = true;
        continue;
      }
      if (/^\s*startup_timeout_sec\s*=/.test(sectionLines[i])) {
        if (trim(sectionLines[i]) !== timeoutLine) {
          sectionLines[i] = timeoutLine;
          status = "updated";
        }
        replacedTimeout = true;
        continue;
      }
      if (/^\s*enabled\s*=/.test(sectionLines[i])) {
        if (trim(sectionLines[i]) !== enabledLine) {
          sectionLines[i] = enabledLine;
          status = "updated";
        }
        replacedEnabled = true;
        continue;
      }
      if (/^\s*http_headers\s*=/.test(sectionLines[i])) {
        var mergedGuidanceHeaders = mergeManagedHeaders(sectionLines[i]);
        if (trim(sectionLines[i]) !== mergedGuidanceHeaders) {
          sectionLines[i] = mergedGuidanceHeaders;
          status = "updated";
        }
        replacedGuidanceHeaders = true;
        continue;
      }
      if (/^\s*bearer_token_env_var\s*=/.test(sectionLines[i])) {
        if (useBearer) {
          if (trim(sectionLines[i]) !== bearerLine) {
            sectionLines[i] = bearerLine;
            status = "updated";
          }
          replacedBearer = true;
        } else {
          sectionLines.splice(i, 1);
          i -= 1;
          status = "updated";
        }
      }
    }
    if (!replacedUrl) {
      sectionLines.splice(1, 0, urlLine);
      status = "updated";
    }
    if (!replacedTimeout) {
      sectionLines.splice(replacedUrl ? 2 : 2, 0, timeoutLine);
      status = "updated";
    }
    if (!replacedEnabled) {
      var enabledIndex = sectionLines.length;
      for (var e = 1; e < sectionLines.length; e++) {
        if (/^\s*startup_timeout_sec\s*=/.test(sectionLines[e])) {
          enabledIndex = e + 1;
          break;
        }
      }
      sectionLines.splice(enabledIndex, 0, enabledLine);
      status = "updated";
    }
    if (!replacedGuidanceHeaders) {
      sectionLines.push(managedHeadersLine);
      status = "updated";
    }
    if (useBearer && !replacedBearer) {
      var bearerIndex = sectionLines.length;
      for (var k = 1; k < sectionLines.length; k++) {
        if (/^\s*startup_timeout_sec\s*=/.test(sectionLines[k])) {
          bearerIndex = k + 1;
          break;
        }
      }
      sectionLines.splice(bearerIndex, 0, bearerLine);
      status = "updated";
    }
    var nextText = lines.slice(0, range.start).concat(sectionLines).concat(lines.slice(range.end)).join("\n").replace(/\n+$/, "\n");
    if (nextText === text.replace(/\n+$/, "\n")) {
      status = "unchanged";
    }
    var withPlaywright = patchCodexPlaywrightMcpConfigText(nextText, options, normalizeDirectory(options.installDir, childPath(resolveWorkspaceRoot(options), "agents/codex"), resolveWorkspaceRoot(options)));
    if (withPlaywright.status !== "unchanged" && status === "unchanged") {
      status = "updated";
    }
    return {
      status: status,
      text: withPlaywright.text
    };
  }

  function writeManagedTextFile(file, content, dryRun) {
    var existed = file.isFile();
    var previous = readTextFile(file);
    var next = String(content == null ? "" : content);
    if (previous === next) {
      return {
        status: "unchanged",
        existed: existed
      };
    }
    if (dryRun !== true) {
      writeTextFile(file, next);
    }
    return {
      status: existed ? "updated" : "created",
      existed: existed
    };
  }

  function convertigoGeneralistReferenceLines() {
    return [
      "- `convertigo://capabilities` - Convertigo MCP capabilities: Core MCP capabilities and recommended authoring flow.",
      "- `convertigo://recipes/quickstart` - Convertigo MCP quickstart recipes: Minimal MCP-first recipes for fast project delivery.",
      "- `convertigo://resources/convertigo-start` - Convertigo Start Guide: Canonical entry guide for tree-first Convertigo MCP work.",
      "- `convertigo://resources/convertigo-crud-fastpath` - Convertigo CRUD Fast Path: Recommended mono-agent path for deterministic SQL CRUD plus starter NGX UI work.",
      "- `convertigo-quickstart` - Convertigo MCP Quickstart: Bootstrap guide selection and route standard SQL CRUD + starter NGX work to the fast path.",
      "- `convertigo-crud-fastpath` - Convertigo CRUD Fast Path: Recommended mono-agent rail for deterministic SQL CRUD plus starter NGX UI work."
    ];
  }

  function buildConvertigoGeneralistSkill(mcpEndpoint) {
    return [
      "---",
      "name: convertigo-generalist",
      "description: Bootstrap Codex for general Convertigo work. Use it to discover Convertigo MCP guides first, choose between exploratory work and the CRUD fast path, and apply the correct naming and viewer rules.",
      "---",
      "",
      "# Convertigo Generalist",
      "",
      "Use this skill for general Convertigo work. Keep it procedural and rely on the MCP guides for the detailed knowledge.",
      "",
      "## Skill freshness",
      "",
      "- Skill guidance version: `" + MCP_GUIDANCE_VERSION + "`.",
      "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun the Studio Codex setup for the current MCP endpoint or ask before project mutation.",
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before project mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.",
      "",
      "## Mandatory bootstrap",
      "",
      "1. Read `convertigo://capabilities` directly and verify the skill freshness rule above.",
      "2. Do not call `resources/list`, `resources/templates/list`, or `prompts/list` when this skill already names the required URI or tool. Use catalog discovery only when the task cannot be routed from this skill, a named resource is missing, or the MCP reports a guidance mismatch.",
      "3. Select the smallest matching route and read only its entry recipe before mutation:",
      "   - Standard SQL CRUD + starter NGX UI: read `convertigo://resources/convertigo-crud-fastpath` and use `convertigo-crud-fastpath`.",
      "   - Existing deterministic CRUD project edits: also read `convertigo://resources/convertigo-crud-edit-fastpath`, then stay on the CRUD rail without replaying the new-project bootstrap.",
      "   - New starter NGX app outside the CRUD rail: read `convertigo://resources/convertigo-recipe-starter-extension` before import, then if the app has backend or open-data results, read `convertigo://resources/convertigo-recipe-ngx-data-page` before any page mutation.",
      "   - NGX / Ionic UI creation or edits outside the CRUD rail: read `convertigo://resources/convertigo-recipe-ngx-data-page` for data-backed pages. Read `convertigo://resources/convertigo-frontend-ngx` only when the recipe and live palette contract leave an implementation question.",
      "   - Other tasks: read `convertigo://resources/convertigo-start`, then the smallest matching recipe. Read `convertigo://recipes/quickstart` only when route selection remains ambiguous.",
      "4. Do not call `rag-query` before the chosen recipe was tried.",
      "5. If the user explicitly wants MCP-only work or the starting workspace is empty/non-relevant, do not inspect the local shell workspace before the MCP route decision is made.",
      "",
      "## Tool economy and convergence",
      "",
      "- Treat every tool round trip and large response as part of the task cost. Prefer targeted reads and request only the depth, properties, logs, or detail needed for the next decision.",
      "- Do not repeat catalog, guide, palette, tree, builder, or browser reads whose answer is already present in the current conversation.",
      "- Use `palette-list` to locate an unfamiliar object type and `palette-describe` only for properties that remain uncertain. Group independent descriptions when the caller can do so safely.",
      "- Build one coherent mutation plan before the first write. Prefer one optimized `batch-call` for independent or ordered source-object changes, followed by one targeted readback.",
      "- Start the viewer asynchronously once UI work is known. Finish the source mutations while it builds, then perform one readiness check and one acceptance-oriented browser proof. Add another cycle only when the proof identifies a concrete defect.",
      "- A browser proof should evaluate all relevant acceptance criteria together when practical: visible content, layout/style, interaction or timed state, and console/runtime errors.",
      "- Stop after the requested behavior is green. Do not add an unsolicited polish pass or repeat proof that cannot change the conclusion.",
      "",
      "## NGX authoring invariants",
      "",
      "- Use the exact SmartType shape reported by the live palette or a successful readback. Do not invent aliases such as `JS`, `SCRIPT`, `PLAIN`, `expression`, or `value` interchangeably.",
      "- For page state changed outside an Angular/Ionic event, such as timers, external callbacks, or third-party subscriptions, ensure Angular change detection is triggered through the supported page context before claiming live updates.",
      "- Scope page CSS to the element that actually paints the visible area. Do not assume a class or CSS variable crosses an Ionic shadow boundary; include background coverage in the first browser proof.",
      "- When a mutation result reports skipped or normalized properties, repair them before browser proof instead of relying on runtime trial and error.",
      "",
      "## CRUD routing",
      "",
      "- Do not ask the user to choose `upsert-crud`.",
      "- Decide it yourself: use the CRUD rail only when the task is a standard SQL CRUD + starter NGX UI fit.",
      "- Generic CRUD UI default: `ui.variant=entity-pages`.",
      "- CRM-specific UI default: `ui.variant=master-detail`.",
      "- For a new UI project, validate the name, run `marketplace-import` with that exact name, open the viewer immediately with `mobile-builder-open(wait=false)`, then continue with `upsert-crud` and the staged UI kit while the builder warms up.",
      "- For an existing deterministic CRUD project that is already green, use the edit rail: `crud-status` -> optional early `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open(stateOnly=true, wait=true)` -> final `crud-proof(viewerUrl)` -> optional `project-save`.",
      "- For a low-detail CRUD prompt, stop after the first green scaffold + demo data: starter import, viewer open, `upsert-crud`, backend proof, `upsert-ngx-crud-kit` bootstrap/final, final UI proof, optional `project-save`, then return.",
      "- When relations are obvious, declare them explicitly in `spec.relations[]` instead of relying only on flat FK fields. Prefer entity UI hints such as `ui.relationFields` over direct edits on generated CRUD-kit components.",
      "- Prefer `seed.data` for explicit business demo rows. Do not patch `init_schema` manually after generation when `seed.data` can express the dataset in the spec.",
      "- Once the CRUD guides already documented the contract, do not grep the local workspace to rediscover the shapes of `relations[]`, `ui.relationFields`, or `seed.data`.",
      "- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated UI now initializes that session once through a `Login` page that calls `auth_login(username,password)` and then redirects to the visible home page; the business pages should only bootstrap the CRUD data they need.",
      "- Do not start a second refinement pass on screens, layout, labels, or field-level UX unless the user explicitly asked for it.",
      "- Once the CRUD fast path is chosen, do not call `rag-query` unless the built-in guides and CRUD tools are no longer sufficient.",
      "- Prefer best-case-first generated code. Trust the standard error bubble for normal failures instead of adding defensive wrappers by default.",
      "",
      "## Project naming",
      "",
      "- Use exactly the project name requested by the user when it is technically valid.",
      "- If no project is selected and the user explicitly asks to create a new project or application without giving a technical name, derive one concise valid name from the requested product or function, check `project-list` for collisions, then proceed without asking the user to select a project.",
      "- Do not invent prefixes, suffixes, or dates.",
      "- If the requested name collides with an existing project, surface the collision explicitly instead of renaming it.",
      "",
      "## Viewer rule",
      "",
      "- In dev, `mobile-builder-open` serves the live app from the viewer root. Prefer `viewerHomeUrl`, or fall back to `viewerBaseUrl`.",
      "- For frontend work, call `mobile-builder-open` with `wait=false` as soon as the UI project is known, continue other work while it starts, then call `mobile-builder-open(stateOnly=true, wait=true)` or a normal waited call before browser smoke or final proof.",
      "- If `mobile-builder-open` returns `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, attach the Playwright MCP browser tools to that visible Studio JxBrowser endpoint and verify the actual feature there.",
      "- If a state-only call returns `status:\"stopped\"`, do not poll it again: immediately call `mobile-builder-open(stateOnly=false, wait=false)` once, continue other work while it starts, then poll readiness.",
      "- Use Playwright MCP only after `mobile-builder-open` reports both `browserDebugPortMatched:true` and `browserControlReady:true`.",
      "- Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. Do not create, open, close, select, or navigate tabs/pages; reuse the current page.",
      "- In managed Codex sessions, browser automation is exposed through the Playwright MCP server configured in `codex-home/config.toml`. Use the MCP browser tools; do not run ad hoc shell scripts with `require('playwright')` or raw WebSocket CDP snippets.",
      "- Known-good fast check on this JxBrowser target: call `playwright.browser_tabs` only to list and confirm the single current viewer URL, use `playwright.browser_find` for visible UI, and use `playwright.browser_evaluate` only when DOM state or timing must be measured. Do not probe unsupported browser features before this minimal check.",
      "- An `about:blank` target means the loader is not ready. If the builder status is `building`, poll `mobile-builder-open(stateOnly=true, wait=true)`; if it is `stopped`, launch it asynchronously as described above.",
      "- If Playwright/browser-control MCP tools are missing, disabled, on `about:blank`, stale, or not attached to the returned Studio JxBrowser endpoint, stop the browser proof and tell the user that the managed Playwright MCP configuration must be refreshed. Do not work around it with Node scripts, raw CDP, or a new browser.",
      "- Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
      "- In prod, the application URL is `.../DisplayObjects/mobile/home`.",
      "- If `mobile-builder-open` reports `compile_error`, treat that as a generator or source-object issue. Do not patch generated runtime sources.",
      "",
      "## Optional UI reveal mode",
      "",
      "- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.",
      "- Do not add `reveal:true` to every read-only call. Use it for object creation/patches, mobile builder opening/polling when focusing the builder is useful, and no-code form mutations that should switch the visible No Code editor.",
      "- For `mobile-builder-open`, use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless the user specifically needs UI focus.",
      "- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a project mutation failure.",
      "",
      "## MCP-only boundary",
      "",
      "- Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
      "- Generated artifacts are diagnostic-only surfaces. Fix the Convertigo source objects or the MCP generator instead.",
      "- Do not run `npm run build` or other manual frontend builds outside MCP to close a task.",
      "",
      "## Seed and visible data",
      "",
      "- Prefer realistic seed data by default.",
      "- Prefer semantic preview fields such as `name`, `title`, `city`, `email`, or `comment` over `id` when a visible choice exists.",
      "",
      "## Current public references",
      ""
    ].concat(convertigoGeneralistReferenceLines()).concat([
      "",
      "## Local MCP endpoint",
      "",
      "- Expected local MCP entry: `" + trim(mcpEndpoint) + "`",
      "- If Codex is not yet configured for Convertigo, run the local Studio sequence `_setupCodex` from the ConvertigoMCP project.",
      ""
    ]).join("\n");
  }

  function buildConvertigoNoCodeSkill(mcpEndpoint) {
    return [
      "---",
      "name: convertigo-nocode",
      "description: Work with Convertigo No-Code Studio / C8Oforms through Convertigo MCP. Use for forms, no-code apps, pages, fields, data sources, roles, publication, and C8Oforms administration.",
      "---",
      "",
      "# Convertigo NoCode",
      "",
      "Use this skill when the Assistant is embedded in C8Oforms or any Convertigo No-Code Studio surface.",
      "",
      "## Skill freshness",
      "",
      "- Skill guidance version: `" + MCP_GUIDANCE_VERSION + "`.",
      "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, rerun the Studio Codex setup for the current MCP endpoint before using no-code mutation tools.",
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before no-code mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.",
      "",
      "## Mandatory workflow",
      "",
      "1. Read `convertigo://capabilities` directly to verify guidance freshness. Skip catalog and prompt lists when this skill already names the required no-code tools.",
      "2. Treat the selected no-code context as the source of truth. In C8Oforms, target the `C8Oforms` project unless the user explicitly names another no-code project.",
      "3. Use Convertigo MCP tools to inspect, edit, save, reload, and validate. Do not edit generated folders such as `_private/ionic`, `DisplayObjects`, `dist`, or build outputs.",
      "4. Prefer one contract read, one coherent mutation, and one compile/validation pass. Repeat only to repair a concrete failed criterion.",
      "5. Keep explanations no-code oriented: applications, forms, pages, fields, data sources, roles, permissions, publication, and user-facing behavior.",
      "6. Reply to the user in their language. Keep progress updates short, factual, and user-safe.",
      "",
      "## Convertigo MCP entry",
      "",
      "- Expected MCP endpoint: `" + trim(mcpEndpoint) + "`",
      "- Prefer MCP tools over filesystem edits for Convertigo objects.",
      "- Use the synchronized MCP knowledge pack in `skills/convertigo-mcp/` only for additional tool/resource details.",
      "",
      "## Optional UI reveal mode",
      "",
      "- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported no-code mutation tools that should visibly move No Code Studio while you work: `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.",
      "- Do not add `reveal:true` to read-only calls such as contract, compile, validate, catalog, or log tools.",
      "- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a no-code mutation failure.",
      "",
      "## Tool discovery fallback",
      "",
      "- The NoCode tools can appear as `nocode-form-contract-get`, `nocode-form-edit`, `nocode-form-update`, `nocode-form-validate`, and `nocode-form-compile`.",
      "- Some providers expose tool names with underscores, such as `nocode_form_contract_get` or `mcp__convertigo.nocode_form_update`; treat these as the same NoCode tools.",
      "- If `tool_search` returns no NoCode tools on the first try, retry with exact queries for `Convertigo NoCode form contract get edit update validate compile C8Oforms` and `nocode-form-contract-get nocode-form-edit nocode-form-update` before declaring the tools unavailable.",
      "- If a current NoCode form id or URL is provided by the host application, use it as the default target for form edits unless the user explicitly names another form."
    ].join("\n");
  }

  function setupCodexGeneralist(options, homePath, mcpEndpoint) {
    var profile = normalizeSkillProfile(options);
    var skillSlug = managedSkillSlug(profile);
    var skillLabel = managedSkillLabel(profile);
    var report = {
      attempted: false,
      ok: true,
      provider: "codex",
      source: skillLabel + " setup",
      target: "",
      skillStatus: "skipped",
      configStatus: "skipped",
      resolvedCodexHome: "",
      resolvedMcpUrl: trim(mcpEndpoint) || resolveMcpEndpoint(options),
      skillPath: "",
      warnings: [],
      nextSteps: [
        "Restart Codex to pick up the updated skill list.",
        "Start a fresh Codex session in the Convertigo workspace.",
        "Use the generated " + skillSlug + " skill for this Convertigo surface."
      ],
      dryRun: boolValue(options.dryRun, false),
      skipped: false,
      message: "",
      error: "",
      generated: [],
      reused: [],
      copied: []
    };
    if (boolValue(options.skipSkillsInstall || options.skipSkillSync, false)) {
      report.skipped = true;
      report.message = skillLabel + " setup disabled by request";
      return report;
    }
    report.attempted = true;
    try {
      var codexHome = new File(effectiveCodexHomePath(homePath));
      var skillFile = new File(new File(new File(codexHome, "skills"), skillSlug), "SKILL.md");
      var configFile = new File(codexHome, "config.toml");
      if (!boolValue(options.skipMcpProjectSkillSync || options.skipSetupCodexDelegate, false)) {
        var delegated = setupCodexFromMcpProject(options, codexHome, report.resolvedMcpUrl, profile);
        if (delegated.attempted === true && delegated.ok === true) {
          var delegatedConfig = readTextFile(configFile);
          var delegatedPatch = patchCodexMcpConfigText(delegatedConfig, delegated.resolvedMcpUrl, options);
          if (delegatedPatch.status !== "unchanged" && report.dryRun !== true) {
            writeTextFile(configFile, delegatedPatch.text);
          }
          report.skillStatus = delegated.skillStatus;
          report.configStatus = delegatedPatch.status !== "unchanged" ? delegatedPatch.status : delegated.configStatus;
          report.resolvedCodexHome = delegated.resolvedCodexHome || filePath(codexHome);
          report.resolvedMcpUrl = delegated.resolvedMcpUrl || report.resolvedMcpUrl;
          report.target = report.resolvedCodexHome;
          report.skillPath = delegated.skillPath || filePath(skillFile);
          report.source = delegated.source;
          report.warnings = report.warnings.concat(delegated.warnings || []);
          if (report.skillStatus === "unchanged") {
            report.reused.push("skills/" + skillSlug + "/SKILL.md");
          } else {
            report.generated.push("skills/" + skillSlug + "/SKILL.md");
          }
          if (report.configStatus === "unchanged") {
            report.reused.push("config.toml");
          } else {
            report.generated.push("config.toml");
          }
          report.message = delegated.message;
          return report;
        }
        if (delegated.attempted === true && delegated.message) {
          report.warnings.push(delegated.message + (delegated.error ? ": " + delegated.error : ""));
        }
      }
      var skillSource = managedSkillContent(options, profile, report.resolvedMcpUrl);
      var skillWrite = writeManagedTextFile(skillFile, skillSource.content, report.dryRun);
      var existingConfig = readTextFile(configFile);
      var patchedConfig = patchCodexMcpConfigText(existingConfig, report.resolvedMcpUrl, options);
      if (patchedConfig.status !== "unchanged" && report.dryRun !== true) {
        writeTextFile(configFile, patchedConfig.text);
      }
      report.skillStatus = skillWrite.status;
      report.configStatus = patchedConfig.status;
      report.resolvedCodexHome = filePath(codexHome);
      report.target = report.resolvedCodexHome;
      report.skillPath = filePath(skillFile);
      report.source = skillSource.source || report.source;
      if (skillWrite.status === "unchanged") {
        report.reused.push("skills/" + skillSlug + "/SKILL.md");
      } else if (skillSource.copied === true) {
        report.copied.push("skills/" + skillSlug + "/SKILL.md");
      } else {
        report.generated.push("skills/" + skillSlug + "/SKILL.md");
      }
      if (patchedConfig.status === "unchanged") {
        report.reused.push("config.toml");
      } else {
        report.generated.push("config.toml");
      }
      report.message = skillLabel + " skill configured";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to configure " + skillLabel + " skill";
    }
    return report;
  }

  function installAgentSkills(options, provider, homePath) {
    options = options || {};
    if (normalizeProvider(provider) === "codex") {
      return setupCodexGeneralist(options, homePath, resolveMcpEndpoint(options));
    }
    var profile = normalizeSkillProfile(options);
    var report = {
      attempted: false,
      ok: true,
      provider: normalizeProvider(provider),
      source: "",
      target: "",
      copied: [],
      generated: [],
      reused: [],
      skipped: false,
      message: "",
      error: ""
    };
    if (boolValue(options.skipSkillsInstall || options.skipSkillSync, false)) {
      report.skipped = true;
      report.message = "Skill synchronization disabled by request";
      return report;
    }
    var home = trim(homePath);
    if (!home.length) {
      report.skipped = true;
      report.message = "Using the default agent home; skill synchronization skipped";
      return report;
    }
    report.attempted = true;
    try {
      var source = mcpSkillSourceCandidate(options);
      if (!isMcpSkillSource(source)) {
        report.ok = false;
        report.skipped = true;
        report.message = "ConvertigoMCP skill source not found";
        return report;
      }
      var homeDir = new File(home);
      ensureDirectory(homeDir);
      var target = new File(new File(homeDir, "skills"), "convertigo-mcp");
      ensureDirectory(target);
      report.source = filePath(source);
      report.target = filePath(target);
      copySkillTree(source, target, "AGENT.md", report);
      copySkillTree(source, target, "TOOLS.md", report);
      copySkillTree(source, target, "prompts", report);
      copySkillTree(source, target, "resources", report);
      if (profile === "nocode") {
        var noCodeSkillFile = new File(new File(new File(homeDir, "skills"), "convertigo-nocode"), "SKILL.md");
        var noCodeSkill = managedSkillContent(options, profile, resolveMcpEndpoint(options));
        var noCodeWrite = writeManagedTextFile(noCodeSkillFile, noCodeSkill.content, false);
        if (noCodeWrite.status === "unchanged") {
          report.reused.push("skills/convertigo-nocode/SKILL.md");
        } else if (noCodeSkill.copied === true) {
          report.copied.push("skills/convertigo-nocode/SKILL.md");
        } else {
          report.generated.push("skills/convertigo-nocode/SKILL.md");
        }
      }
      writeTextFile(new File(homeDir, "AGENTS.md"), agentSkillInstructions(provider, profile));
      report.generated.push("AGENTS.md");
      report.message = profile === "nocode" ? "Convertigo NoCode skills synchronized" : "Convertigo MCP skills synchronized";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to synchronize Convertigo MCP skills";
    }
    return report;
  }

  function appendCodexConvertigoMcpConfig(configFile, mcpEndpoint, options) {
    var endpoint = trim(mcpEndpoint) || resolveMcpEndpoint({});
    var text = configFile.exists() ? readTextFile(configFile) : "";
    if (!text.length) {
      text = [
        "# Generated by ConvertigoAgentBridge.",
        'preferred_auth_method = "chat"',
        ""
      ].join("\n");
    }
    var patched = patchCodexMcpConfigText(text, endpoint, options || {});
    if (patched.status === "unchanged") {
      return false;
    }
    writeTextFile(configFile, patched.text);
    return true;
  }

  function copyCodexUserFileIfMissing(sourceDir, targetDir, filename, report) {
    var source = new File(sourceDir, filename);
    if (!source.isFile()) {
      return;
    }
    var target = new File(targetDir, filename);
    if (target.exists()) {
      report.reused.push(filename);
      return;
    }
    writeTextFile(target, readTextFile(source));
    report.copied.push(filename);
  }

  function syncCodexUserFile(sourceDir, targetDir, filename, report) {
    var source = new File(sourceDir, filename);
    if (!source.isFile()) {
      return;
    }
    var target = new File(targetDir, filename);
    try {
      if (filePath(source) === filePath(target)) {
        report.reused.push(filename);
        return;
      }
    } catch (_ignoreSameCodexFile) {}
    if (target.exists()) {
      try {
        if (sha256File(source) === sha256File(target)) {
          report.reused.push(filename);
          return;
        }
      } catch (_ignoreCodexHash) {}
      copyFileBinary(source, target);
      if (!report.refreshed) {
        report.refreshed = [];
      }
      report.refreshed.push(filename);
      return;
    }
    copyFileBinary(source, target);
    report.copied.push(filename);
  }

  function bootstrapCodexHome(options, homePath, mcpEndpoint) {
    var report = {
      attempted: false,
      ok: true,
      home: trim(homePath),
      copied: [],
      reused: [],
      refreshed: [],
      generated: [],
      message: "",
      error: ""
    };
    if (!report.home.length) {
      report.message = "Default CODEX_HOME selected; bootstrap skipped";
      return report;
    }
    report.attempted = true;
    try {
      var homeDir = new File(report.home);
      migrateLegacyHiddenCodexHome(homeDir, report);
      ensureDirectory(homeDir);
      var userCodex = new File(String(System.getProperty("user.home")), ".codex");
      syncCodexUserFile(userCodex, homeDir, "auth.json", report);
      syncCodexUserFile(userCodex, homeDir, "auth.json.api", report);
      syncCodexUserFile(userCodex, homeDir, "installation_id", report);
      var configFile = new File(homeDir, "config.toml");
      if (appendCodexConvertigoMcpConfig(configFile, mcpEndpoint, options)) {
        report.generated.push("config.toml");
      } else {
        report.reused.push("config.toml");
      }
      report.message = "Scoped CODEX_HOME bootstrapped";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to bootstrap scoped CODEX_HOME";
    }
    return report;
  }

  function readEnvFile(file) {
    var result = {
      path: filePath(file),
      exists: file.exists(),
      keys: [],
      values: {}
    };
    if (!result.exists) {
      return result;
    }
    var lines = readTextFile(file).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = trim(lines[i]);
      if (!line.length || line.indexOf("#") === 0) {
        continue;
      }
      if (line.indexOf("export ") === 0) {
        line = trim(line.substring(7));
      }
      var eq = line.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      var key = trim(line.substring(0, eq));
      var value = trim(line.substring(eq + 1));
      if ((value.indexOf('"') === 0 && value.lastIndexOf('"') === value.length - 1) ||
          (value.indexOf("'") === 0 && value.lastIndexOf("'") === value.length - 1)) {
        value = value.substring(1, value.length - 1);
      }
      if (key.length) {
        result.values[key] = value;
        result.keys.push(key);
      }
    }
    result.keys.sort();
    return result;
  }

  function projectWorkspaceRoot(projectName) {
    var name = trim(projectName);
    if (!name.length) {
      return "";
    }
    try {
      var project = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getProjectByName(name);
      if (project && project.getDirFile) {
        var workspace = workspaceRootFromProjectDir(project.getDirFile());
        if (workspace.length) {
          return workspace;
        }
      }
    } catch (_ignoreTargetProjectDir) {}
    try {
      var project2 = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getProjectByName(name);
      if (project2 && project2.getDirPath) {
        var workspace2 = workspaceRootFromProjectDir(project2.getDirPath());
        if (workspace2.length) {
          return workspace2;
        }
      }
    } catch (_ignoreTargetProjectPath) {}
    return "";
  }

  function defaultWorkspaceRoot(projectName) {
    var engineWorkspace = engineWorkspaceRoot();
    if (engineWorkspace.length) {
      return engineWorkspace;
    }
    var targetWorkspace = projectWorkspaceRoot(projectName);
    if (targetWorkspace.length) {
      return targetWorkspace;
    }
    try {
      if (context && context.project && context.project.getDirFile) {
        var contextWorkspace = workspaceRootFromProjectDir(context.project.getDirFile());
        if (contextWorkspace.length) {
          return contextWorkspace;
        }
      }
    } catch (_ignoreProjectDir) {}
    try {
      if (context && context.project && context.project.getDirPath) {
        var contextWorkspace2 = workspaceRootFromProjectDir(context.project.getDirPath());
        if (contextWorkspace2.length) {
          return contextWorkspace2;
        }
      }
    } catch (_ignoreProjectPath) {}
    return filePath(new File(System.getProperty("user.home"), "convertigo"));
  }

  function workspaceProjectName(options) {
    options = options || {};
    return trim(options.projectId || options.projectName || options.targetProject || options.primaryProject);
  }

  function resolveWorkspaceRoot(options) {
    options = options || {};
    var explicit = trim(options.workspaceRoot);
    if (explicit.length) {
      return normalizeWorkspaceRootPath(explicit);
    }
    return defaultWorkspaceRoot(workspaceProjectName(options));
  }

  function normalizeDirectory(value, fallback, baseDir) {
    var text = trim(value);
    if (!text.length) {
      text = fallback;
    }
    var file = new File(text);
    if (!file.isAbsolute()) {
      file = new File(trim(baseDir) || trim(fallback), text);
    }
    return filePath(file);
  }

  function normalizeScope(value) {
    var scope = trim(value).toLowerCase();
    if (!scope.length) {
      return "shared";
    }
    if (scope === "conv" || scope === "chat" || scope === "thread") {
      return "conversation";
    }
    if (scope === "global" || scope === "studio") {
      return "shared";
    }
    if (scope === "explicit" || scope === "shared" || scope === "user" || scope === "conversation") {
      return scope;
    }
    return "shared";
  }

  function normalizeCodexHomeScope(value) {
    var scope = trim(value).toLowerCase();
    if (!scope.length) {
      return "user";
    }
    if (scope === "none" || scope === "user-home" || scope === "user_home" || scope === "home") {
      return "default";
    }
    if (scope === "conv" || scope === "chat" || scope === "thread") {
      return "conversation";
    }
    if (scope === "global" || scope === "studio") {
      return "shared";
    }
    if (scope === "explicit" || scope === "default" || scope === "shared" || scope === "user" || scope === "conversation") {
      return scope;
    }
    return "user";
  }

  function normalizeProvider(value) {
    var provider = trim(value).toLowerCase();
    if (provider === "codex-cli" || provider === "openai-codex") {
      return "codex";
    }
    if (provider === "mistral-vibe" || provider === "vibe-acp") {
      return "vibe";
    }
    return provider.length ? provider.replace(/[^a-z0-9_.-]/g, "_") : "vibe";
  }

  function providerLabel(value) {
    var provider = normalizeProvider(value);
    if (provider === "codex") {
      return "Codex";
    }
    if (provider === "vibe") {
      return "Vibe";
    }
    return provider;
  }

  function stableId(prefix, value) {
    var text = trim(value) || "default";
    var uuid = UUID.nameUUIDFromBytes(new java.lang.String(text).getBytes(StandardCharsets.UTF_8));
    return String(prefix) + "-" + String(uuid);
  }

  function hashShort(value) {
    var md = MessageDigest.getInstance("SHA-256");
    var bytes = md.digest(new java.lang.String(String(value || "")).getBytes(StandardCharsets.UTF_8));
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      var n = Number(bytes[i]);
      if (n < 0) {
        n += 256;
      }
      if (n < 16) {
        out += "0";
      }
      out += n.toString(16);
    }
    return out.substring(0, 16);
  }

  function safePathPart(value) {
    var text = String(value || "").replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return text.length ? text : "_";
  }

  function userPathSlug(value) {
    var text = trim(value);
    if (!text.length || text.toLowerCase() === "studio") {
      return "studio";
    }
    var readable = safePathPart(text.toLowerCase());
    if (!readable.length || readable === "_") {
      readable = "user";
    }
    if (readable.length > 80) {
      readable = readable.substring(0, 80).replace(/[_.-]+$/g, "");
    }
    return readable + "--" + hashShort(text);
  }

  function getSessionAttribute(name) {
    try {
      if (context && context.httpSession) {
        var value = context.httpSession.getAttribute(name);
        if (value !== null && typeof value !== "undefined") {
          return String(value);
        }
      }
    } catch (_ignoreSessionAttr) {}
    return "";
  }

  function setSessionAttribute(name, value) {
    try {
      if (context && context.httpSession) {
        context.httpSession.setAttribute(name, String(value));
      }
    } catch (_ignoreSessionAttrSet) {}
  }

  function contextUserId() {
    try {
      if (context && typeof context.getAuthenticatedUser === "function") {
        var authenticated = context.getAuthenticatedUser();
        if (authenticated !== null && typeof authenticated !== "undefined" && trim(authenticated).length) {
          return String(authenticated);
        }
      }
    } catch (_ignoreGetAuthenticatedUser) {}
    try {
      if (context && typeof context.authenticatedUser !== "undefined" && trim(context.authenticatedUser).length) {
        return String(context.authenticatedUser);
      }
    } catch (_ignoreAuthenticatedUser) {}
    return trim(getSessionAttribute("authenticatedUser") || getSessionAttribute("user") || getSessionAttribute("username"));
  }

  function resolveConversationIdOption(options) {
    var id = trim(options.conversationId);
    if (id.length) {
      setSessionAttribute(SESSION_CONVERSATION_ATTR, id);
      return id;
    }
    var stored = getSessionAttribute(SESSION_CONVERSATION_ATTR);
    if (stored.length) {
      return stored;
    }
    id = "conversation-" + String(UUID.randomUUID());
    setSessionAttribute(SESSION_CONVERSATION_ATTR, id);
    return id;
  }

  function resolveProjectIdOption(options) {
    options = options || {};
    var id = trim(options.projectId || options.projectName || options.targetProject || options.primaryProject);
    if (id.length) {
      return id;
    }
    try {
      if (context && context.project && context.project.getName) {
        var contextProject = String(context.project.getName());
        if (!/^(ConvertigoAgentBridge|ConvertigoAssistant|ConvertigoMCP)$/.test(contextProject)) {
          return contextProject;
        }
      }
    } catch (_ignoreProjectName) {}
    return "";
  }

  function appendProjectPath(basePath, id) {
    if (!trim(id).length) {
      return basePath;
    }
    return childPath(childPath(basePath, "projects"), stableId("project", id));
  }

  function resolveVibeHome(options, installDir) {
    options = options || {};
    var explicit = trim(options.vibeHome);
    if (explicit.length) {
      return {
        scope: "explicit",
        path: filePath(new File(explicit)),
        explicit: true,
        userId: trim(options.userId),
        conversationId: trim(options.conversationId),
        projectId: trim(options.projectId),
        error: ""
      };
    }

    var scope = normalizeScope(options.vibeHomeScope || options.homeScope || options.scope);
    var project = resolveProjectIdOption(options);
    if (scope === "shared") {
      return {
        scope: "shared",
        path: childPath(installDir, ".vibe-home"),
        explicit: false,
        userId: "",
        conversationId: "",
        projectId: project,
        error: ""
      };
    }

    var root = childPath(installDir, "homes");
    var user = trim(options.userId) || contextUserId();
    if (scope === "user") {
      if (!user.length) {
        return {
          scope: "user",
          path: "",
          explicit: false,
          userId: "",
          conversationId: "",
          projectId: project,
          error: "userId is required for user scoped VIBE_HOME"
        };
      }
      var userBase = childPath(childPath(root, "users"), userPathSlug(user));
      return {
        scope: "user",
        path: childPath(userBase, ".vibe-home"),
        explicit: false,
        userId: user,
        conversationId: "",
        projectId: project,
        error: ""
      };
    }

    var conv = resolveConversationIdOption(options);
    var convBase;
    if (user.length) {
      convBase = childPath(childPath(root, "users"), userPathSlug(user));
      convBase = childPath(childPath(convBase, "conversations"), stableId("conversation", conv));
    } else {
      convBase = childPath(childPath(root, "conversations"), stableId("conversation", conv));
    }
    return {
      scope: "conversation",
      path: childPath(convBase, ".vibe-home"),
      explicit: false,
      userId: user,
      conversationId: conv,
      projectId: project,
      error: ""
    };
  }

  function resolveCodexHome(options, installDir) {
    options = options || {};
    var explicit = trim(options.codexHome || options.agentHome);
    if (explicit.length) {
      return {
        scope: "explicit",
        path: filePath(new File(explicit)),
        explicit: true,
        userId: trim(options.userId),
        conversationId: trim(options.conversationId),
        projectId: trim(options.projectId),
        error: ""
      };
    }

    var scopeOption = trim(options.codexHomeScope || options.homeScope || options.scope);
    if (!scopeOption.length && resolvePlaywrightMcpCdpEndpoint(options).length) {
      scopeOption = "conversation";
    }
    var scope = normalizeCodexHomeScope(scopeOption);
    var project = resolveProjectIdOption(options);
    if (scope === "default") {
      return {
        scope: "default",
        path: "",
        explicit: false,
        userId: "",
        conversationId: "",
        projectId: project,
        error: ""
      };
    }
    if (scope === "shared") {
      return {
        scope: "shared",
        path: childPath(installDir, "codex-home"),
        explicit: false,
        userId: "",
        conversationId: "",
        projectId: project,
        error: ""
      };
    }

    var root = childPath(installDir, "homes");
    var user = trim(options.userId) || contextUserId();
    if (scope === "user") {
      if (!user.length) {
        return {
          scope: "user",
          path: "",
          explicit: false,
          userId: "",
          conversationId: "",
          projectId: project,
          error: "userId is required for user scoped CODEX_HOME"
        };
      }
      var userBase = childPath(childPath(root, "users"), userPathSlug(user));
      return {
        scope: "user",
        path: childPath(userBase, "codex-home"),
        explicit: false,
        userId: user,
        conversationId: "",
        projectId: project,
        error: ""
      };
    }

    var conv = resolveConversationIdOption(options);
    var convBase;
    if (user.length) {
      convBase = childPath(childPath(root, "users"), userPathSlug(user));
      convBase = childPath(childPath(convBase, "conversations"), stableId("conversation", conv));
    } else {
      convBase = childPath(childPath(root, "conversations"), stableId("conversation", conv));
    }
    return {
      scope: "conversation",
      path: childPath(convBase, "codex-home"),
      explicit: false,
      userId: user,
      conversationId: conv,
      projectId: project,
      error: ""
    };
  }

  function getServerStore() {
    try {
      if (context && context.server) {
        return context.server;
      }
    } catch (_ignoreContextServer) {}
    try {
      if (typeof server !== "undefined" && server) {
        return server;
      }
    } catch (_ignoreServer) {}
    return null;
  }

  function getRegistry() {
    var store = getServerStore();
    if (store !== null) {
      var registry = store.get(REGISTRY_KEY);
      if (registry === null || typeof registry === "undefined") {
        registry = new ConcurrentHashMap();
        store.set(REGISTRY_KEY, registry);
      }
      return registry;
    }
    if (!C8O.agentBridge._fallbackRegistry) {
      C8O.agentBridge._fallbackRegistry = new ConcurrentHashMap();
    }
    return C8O.agentBridge._fallbackRegistry;
  }

  function getRuntimeUpdateCache() {
    var store = getServerStore();
    if (store !== null) {
      var cache = store.get(RUNTIME_UPDATE_CACHE_KEY);
      if (cache === null || typeof cache === "undefined") {
        cache = new ConcurrentHashMap();
        store.set(RUNTIME_UPDATE_CACHE_KEY, cache);
      }
      return cache;
    }
    if (!C8O.agentBridge._fallbackRuntimeUpdateCache) {
      C8O.agentBridge._fallbackRuntimeUpdateCache = new ConcurrentHashMap();
    }
    return C8O.agentBridge._fallbackRuntimeUpdateCache;
  }

  function runtimeUpdateCacheFile(workspaceRoot) {
    var root = trim(workspaceRoot);
    return root.length ? new File(childPath(root, "agents"), RUNTIME_UPDATE_CACHE_FILE) : null;
  }

  function readPersistentRuntimeUpdateCache(workspaceRoot) {
    var file = runtimeUpdateCacheFile(workspaceRoot);
    var value = file !== null ? readJsonFile(file) : null;
    if (value === null || typeof value !== "object") {
      value = {};
    }
    if (value.checks === null || typeof value.checks !== "object") {
      value.checks = {};
    }
    if (value.providers === null || typeof value.providers !== "object") {
      value.providers = {};
    }
    value.version = 2;
    return {
      file: file,
      value: value
    };
  }

  function providerDefaultReasoning(provider) {
    provider = provider || {};
    var models = provider.models || [];
    var defaultModel = trim(provider.defaultModel);
    for (var i = 0; i < models.length; i++) {
      if (trim(models[i] && models[i].id) === defaultModel) {
        return trim(models[i] && models[i].defaultReasoning);
      }
    }
    return models.length ? trim(models[0] && models[0].defaultReasoning) : "";
  }

  function compactProviderSettingsCache(provider) {
    provider = provider || {};
    return {
      cachedAt: now(),
      defaults: {
        model: trim(provider.defaultModel),
        reasoning: providerDefaultReasoning(provider)
      },
      models: provider.models || [],
      reasoningMode: String(provider.reasoningMode || ""),
      supports: provider.supports || {}
    };
  }

  function readPersistentProviderSettingsCache(workspaceRoot, providerId) {
    try {
      var persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
      var cached = persistent.value.providers[normalizeProvider(providerId)];
      if (cached && cached.models && cached.models.length) {
        return cached;
      }
    } catch (_ignorePersistentProviderSettingsCacheRead) {}
    return null;
  }

  function writePersistentProviderSettingsCache(workspaceRoot, providers) {
    var persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
    if (persistent.file === null) {
      return;
    }
    var lock = null;
    try {
      lock = acquireFileLock(new File(persistent.file.getParentFile(), RUNTIME_UPDATE_CACHE_FILE + ".lock"), 5000);
      persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
      providers = providers || [];
      for (var i = 0; i < providers.length; i++) {
        var provider = providers[i] || {};
        var providerId = normalizeProvider(provider.id);
        if (providerId.length && provider.models && provider.models.length) {
          persistent.value.providers[providerId] = compactProviderSettingsCache(provider);
        }
      }
      writeTextFile(persistent.file, JSON.stringify(persistent.value, null, 2) + "\n");
    } catch (_ignorePersistentProviderSettingsCacheWrite) {
    } finally {
      if (lock !== null) {
        lock.release();
      }
    }
  }

  function hydrateProviderSettingsFromCache(workspaceRoot, provider) {
    provider = provider || {};
    if (provider.models && provider.models.length) {
      return provider;
    }
    var cached = readPersistentProviderSettingsCache(workspaceRoot, provider.id);
    if (cached === null) {
      return provider;
    }
    provider.models = cached.models || [];
    provider.defaultModel = trim(cached.defaults && cached.defaults.model);
    provider.reasoningMode = String(cached.reasoningMode || provider.reasoningMode || "");
    provider.supports = cached.supports || provider.supports || {};
    provider.source = provider.source || {};
    provider.source.settingsCached = true;
    provider.source.settingsCachedAt = Number(cached.cachedAt || 0);
    return provider;
  }

  function writePersistentRuntimeUpdateCache(workspaceRoot, cacheKey, loaded, nextCheckAt) {
    var persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
    if (persistent.file === null) {
      return;
    }
    var lock = null;
    try {
      lock = acquireFileLock(new File(persistent.file.getParentFile(), RUNTIME_UPDATE_CACHE_FILE + ".lock"), 5000);
      persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
      persistent.value.checks[cacheKey] = {
        checkedAt: Number(loaded.checkedAt || 0),
        nextCheckAt: Number(nextCheckAt || 0),
        result: loaded
      };
      writeTextFile(persistent.file, JSON.stringify(persistent.value, null, 2) + "\n");
    } catch (_ignorePersistentRuntimeUpdateCacheWrite) {
    } finally {
      if (lock !== null) {
        lock.release();
      }
    }
  }

  function readCachedRuntimeUpdate(cacheKey, workspaceRoot) {
    var cache = getRuntimeUpdateCache();
    var currentTime = now();
    try {
      var cachedText = cache.get(cacheKey);
      if (cachedText !== null && typeof cachedText !== "undefined") {
        var cached = parseJsonSafe(String(cachedText), null);
        if (cached !== null && Number(cached.nextCheckAt || 0) > currentTime) {
          cached.cached = true;
          return cached;
        }
      }
    } catch (_ignoreRuntimeUpdateCacheRead) {}
    try {
      var persistent = readPersistentRuntimeUpdateCache(workspaceRoot);
      var stored = persistent.value.checks[cacheKey];
      if (stored && Number(stored.nextCheckAt || 0) > currentTime && stored.result) {
        var persisted = stored.result;
        persisted.checkedAt = Number(stored.checkedAt || persisted.checkedAt || 0);
        persisted.nextCheckAt = Number(stored.nextCheckAt || 0);
        persisted.cached = true;
        cache.put(cacheKey, JSON.stringify(persisted));
        return persisted;
      }
    } catch (_ignorePersistentRuntimeUpdateCacheRead) {}
    return null;
  }

  function cachedRuntimeUpdate(key, options, workspaceRoot, loader) {
    options = options || {};
    var cache = getRuntimeUpdateCache();
    var cacheKey = String(key || "");
    var refresh = boolValue(options.refreshUpdateCheck, false);
    var cacheMs = intValue(options.updateCheckCacheMs, DEFAULT_RUNTIME_UPDATE_CACHE_MS, 0, 86400000);
    var currentTime = now();
    if (!refresh && cacheMs > 0) {
      var cached = readCachedRuntimeUpdate(cacheKey, workspaceRoot);
      if (cached !== null) {
        return cached;
      }
    }
    var loaded = loader();
    loaded.checkedAt = currentTime;
    loaded.nextCheckAt = cacheMs > 0 ? currentTime + cacheMs : currentTime;
    loaded.cached = false;
    try {
      cache.put(cacheKey, JSON.stringify(loaded));
    } catch (_ignoreRuntimeUpdateCacheWrite) {}
    writePersistentRuntimeUpdateCache(workspaceRoot, cacheKey, loaded, loaded.nextCheckAt);
    return loaded;
  }

  function rememberSessionHandle(handle) {
    try {
      if (context && context.httpSession) {
        context.httpSession.setAttribute(SESSION_HANDLE_ATTR, String(handle));
      }
    } catch (_ignoreSessionSet) {}
  }

  function forgetSessionHandle(handle) {
    try {
      if (context && context.httpSession) {
        var current = context.httpSession.getAttribute(SESSION_HANDLE_ATTR);
        if (current !== null && String(current) === String(handle)) {
          context.httpSession.removeAttribute(SESSION_HANDLE_ATTR);
        }
      }
    } catch (_ignoreSessionRemove) {}
  }

  function resolveHandle(handle) {
    var text = trim(handle);
    if (text.length) {
      return text;
    }
    try {
      if (context && context.httpSession) {
        var stored = context.httpSession.getAttribute(SESSION_HANDLE_ATTR);
        if (stored !== null && typeof stored !== "undefined") {
          return String(stored);
        }
      }
    } catch (_ignoreSessionGet) {}
    return "";
  }

  function makeHandle(provider) {
    return normalizeProvider(provider) + "-" + String(now()) + "-" + String(UUID.randomUUID()).substring(0, 8);
  }

  function runCommand(args, options) {
    var startedAt = now();
    var result = {
      command: args.join(" "),
      exitCode: -1,
      stdout: "",
      stderr: "",
      durationMs: 0,
      ok: false,
      error: ""
    };
    try {
      var pb = new ProcessBuilder(toJavaList(args));
      if (options && options.cwd) {
        pb.directory(new File(String(options.cwd)));
      }
      if (options && options.env) {
        envObjectToMap(pb.environment(), options.env);
      }
      var process = pb.start();
      var outReader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
      var errReader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8));
      var finished = process.waitFor(options && options.timeoutMs ? options.timeoutMs : 15000, TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        try { process.waitFor(2, TimeUnit.SECONDS); } catch (_ignoreDestroyedWait) {}
        result.error = "timeout";
      }
      try {
        result.exitCode = process.exitValue();
      } catch (_ignoreExitValue) {
        result.exitCode = -1;
      }
      result.stdout = drainReader(outReader, 16000);
      result.stderr = drainReader(errReader, 16000);
      result.ok = finished && result.exitCode === 0;
    } catch (e) {
      result.error = String(e);
    }
    result.durationMs = now() - startedAt;
    return result;
  }

  function runCommandCaptured(args, options) {
    var startedAt = now();
    var result = {
      command: args.join(" "),
      exitCode: -1,
      stdout: "",
      stderr: "",
      durationMs: 0,
      ok: false,
      error: ""
    };
    var outFile = null;
    var errFile = null;
    try {
      outFile = File.createTempFile("c8o-agent-bridge-out-", ".log");
      errFile = File.createTempFile("c8o-agent-bridge-err-", ".log");
      var pb = new ProcessBuilder(toJavaList(args));
      if (options && options.cwd) {
        pb.directory(new File(String(options.cwd)));
      }
      if (options && options.env) {
        envObjectToMap(pb.environment(), options.env);
      }
      pb.redirectOutput(outFile);
      pb.redirectError(errFile);
      var process = pb.start();
      var finished = process.waitFor(options && options.timeoutMs ? options.timeoutMs : 15000, TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        try { process.waitFor(2, TimeUnit.SECONDS); } catch (_ignoreCapturedDestroyedWait) {}
        result.error = "timeout";
      }
      try {
        result.exitCode = process.exitValue();
      } catch (_ignoreCapturedExitValue) {
        result.exitCode = -1;
      }
      result.stdout = readTextFile(outFile);
      result.stderr = readTextFile(errFile);
      result.ok = finished && result.exitCode === 0;
    } catch (e) {
      result.error = String(e);
    } finally {
      try { if (outFile !== null) { Files.deleteIfExists(outFile.toPath()); } } catch (_ignoreOutDelete) {}
      try { if (errFile !== null) { Files.deleteIfExists(errFile.toPath()); } } catch (_ignoreErrDelete) {}
    }
    result.durationMs = now() - startedAt;
    return result;
  }

  function parseJsonSafe(text, fallback) {
    try {
      return JSON.parse(String(text || ""));
    } catch (_ignoreJsonParse) {
      return fallback;
    }
  }

  function runProcessBuilder(pb, options) {
    var startedAt = now();
    var result = {
      command: String(pb.command()),
      exitCode: -1,
      stdout: "",
      stderr: "",
      durationMs: 0,
      ok: false,
      error: ""
    };
    try {
      if (options && options.cwd) {
        pb.directory(new File(String(options.cwd)));
      }
      if (options && options.env) {
        envObjectToMap(pb.environment(), options.env);
      }
      var process = pb.start();
      var outReader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
      var errReader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8));
      var finished = process.waitFor(options && options.timeoutMs ? options.timeoutMs : 15000, TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        result.error = "timeout";
      }
      result.exitCode = process.exitValue();
      result.stdout = drainReader(outReader, 16000);
      result.stderr = drainReader(errReader, 16000);
      result.ok = result.exitCode === 0;
    } catch (e) {
      result.error = String(e);
    }
    result.durationMs = now() - startedAt;
    return result;
  }

  function copyStreamToFile(input, file) {
    var parent = file.getParentFile();
    if (parent !== null) {
      ensureDirectory(parent);
    }
    var out = new FileOutputStream(file);
    var total = 0;
    try {
      var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024 * 1024);
      var n;
      while ((n = input.read(buffer)) !== -1) {
        out.write(buffer, 0, n);
        total += n;
      }
    } finally {
      try { out.close(); } catch (_ignoreOutClose) {}
      try { input.close(); } catch (_ignoreInputClose) {}
    }
    return total;
  }

  function downloadFile(url, file) {
    var startedAt = now();
    var result = {
      url: String(url),
      path: filePath(file),
      bytes: 0,
      durationMs: 0,
      ok: false,
      statusCode: 0,
      error: ""
    };
    try {
      var get = new Packages.org.apache.http.client.methods.HttpGet(String(url));
      var response = Packages.com.twinsoft.convertigo.engine.Engine.theApp.httpClient4.execute(get);
      try {
        result.statusCode = response.getStatusLine().getStatusCode();
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error("HTTP " + result.statusCode + " while downloading " + url);
        }
        result.bytes = copyStreamToFile(response.getEntity().getContent(), file);
        result.ok = true;
      } finally {
        try { response.close(); } catch (_ignoreResponseClose) {}
      }
    } catch (e) {
      result.error = String(e);
    }
    result.durationMs = now() - startedAt;
    return result;
  }

  function sha256File(file) {
    var digest = MessageDigest.getInstance("SHA-256");
    var input = Files.newInputStream(file.toPath());
    try {
      var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024 * 1024);
      var n;
      while ((n = input.read(buffer)) !== -1) {
        digest.update(buffer, 0, n);
      }
    } finally {
      try { input.close(); } catch (_ignoreDigestClose) {}
    }
    var bytes = digest.digest();
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      var value = bytes[i];
      if (value < 0) {
        value += 256;
      }
      var hex = value.toString(16);
      if (hex.length < 2) {
        hex = "0" + hex;
      }
      out.push(hex);
    }
    return out.join("");
  }

  function acquireFileLock(file, timeoutMs) {
    var startedAt = now();
    var parent = file.getParentFile();
    if (parent !== null) {
      ensureDirectory(parent);
    }
    var raf = new RandomAccessFile(file, "rw");
    var channel = raf.getChannel();
    while (true) {
      var lock = null;
      try {
        lock = channel.tryLock();
      } catch (_ignoreLockBusy) {}
      if (lock !== null) {
        return {
          path: filePath(file),
          release: function () {
            try { lock.release(); } catch (_ignoreLockRelease) {}
            try { channel.close(); } catch (_ignoreChannelClose) {}
            try { raf.close(); } catch (_ignoreRafClose) {}
          }
        };
      }
      if (now() - startedAt > timeoutMs) {
        try { channel.close(); } catch (_ignoreChannelCloseTimeout) {}
        try { raf.close(); } catch (_ignoreRafCloseTimeout) {}
        throw new Error("Timeout while waiting for install lock: " + filePath(file));
      }
      Thread.sleep(250);
    }
  }

  function pythonPlatformTag() {
    var os = String(System.getProperty("os.name") || "").toLowerCase();
    var arch = String(System.getProperty("os.arch") || "").toLowerCase();
    if (arch === "amd64") {
      arch = "x86_64";
    } else if (arch === "arm64") {
      arch = "aarch64";
    }
    if (os.indexOf("win") >= 0) {
      return arch + "-pc-windows-msvc";
    }
    if (os.indexOf("mac") >= 0 || os.indexOf("darwin") >= 0) {
      return arch + "-apple-darwin";
    }
    if (os.indexOf("linux") >= 0) {
      return arch + "-unknown-linux-gnu";
    }
    return arch + "-unknown-" + os.replace(/[^a-z0-9]+/g, "-");
  }

  function pythonRuntimeSpec(options, workspaceRoot) {
    options = options || {};
    var version = trim(options.pythonVersion) || DEFAULT_PYTHON_VERSION;
    var buildTag = trim(options.pythonBuildTag || options.pythonBuild) || DEFAULT_PYTHON_BUILD_TAG;
    var platform = trim(options.pythonPlatform) || pythonPlatformTag();
    var flavor = trim(options.pythonArchiveFlavor) || DEFAULT_PYTHON_ARCHIVE_FLAVOR;
    var runtimeId = "cpython-" + version + "-" + buildTag + "-" + platform;
    var installDir = normalizeDirectory(options.pythonInstallDir, childPath(childPath(childPath(workspaceRoot, "agents"), "runtimes/python"), runtimeId), workspaceRoot);
    var asset = "cpython-" + version + "+" + buildTag + "-" + platform + "-" + flavor + ".tar.gz";
    var archiveUrl = trim(options.pythonArchiveUrl);
    if (!archiveUrl.length) {
      var prefix = trim(options.pythonAssetUrlPrefix || options.pythonMirrorBaseUrl || DEFAULT_PYTHON_ASSET_PREFIX);
      prefix = prefix.replace(/\{tag\}/g, buildTag);
      archiveUrl = prefix.replace(/\/+$/g, "") + "/" + asset.replace(/\+/g, "%2B");
    }
    return {
      version: version,
      buildTag: buildTag,
      platform: platform,
      flavor: flavor,
      id: runtimeId,
      installDir: installDir,
      archiveUrl: archiveUrl,
      archiveName: asset,
      lockFile: childPath(childPath(workspaceRoot, "agents/runtimes/python"), runtimeId + ".lock")
    };
  }

  function pythonBinaryCandidates(runtimeDir) {
    return [
      childPath(childPath(runtimeDir, "python/bin"), "python3"),
      childPath(childPath(runtimeDir, "python/bin"), "python"),
      childPath(childPath(runtimeDir, "python"), "python.exe"),
      childPath(childPath(runtimeDir, "bin"), "python3"),
      childPath(childPath(runtimeDir, "bin"), "python"),
      childPath(runtimeDir, "python.exe")
    ];
  }

  function detectPythonRuntime(options, localPython) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var runtime = pythonRuntimeSpec(options, workspaceRoot);
    var userHome = String(System.getProperty("user.home"));
    var homeLocalBin = childPath(userHome, ".local/bin");
    var pythonEnv = "";
    try {
      pythonEnv = String(System.getenv("PYTHON") || "");
    } catch (_ignorePythonEnv) {}
    var candidates = [
      trim(options.pythonPath || options.commandPath),
      pythonEnv,
      trim(localPython)
    ].concat(pythonBinaryCandidates(runtime.installDir), [
      childPath(homeLocalBin, "python3"),
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
      "python3",
      "python"
    ]);
    return {
      workspaceRoot: workspaceRoot,
      runtime: runtime,
      command: firstWorkingCommand(candidates, ["--version"])
    };
  }

  function ensurePythonRuntime(options) {
    options = options || {};
    var detected = detectPythonRuntime(options, "");
    var runtime = detected.runtime;
    var forceOption = typeof options.force !== "undefined" ? options.force : options.forcePythonInstall;
    var force = boolValue(forceOption, false);
    if (detected.command.found && !force) {
      return {
        attempted: false,
        installed: false,
        reused: true,
        runtime: runtime,
        python: detected.command,
        steps: [],
        timestamp: now()
      };
    }
    var allowDownloadOption = typeof options.allowDownload !== "undefined" ? options.allowDownload : options.allowPythonDownload;
    var allowDownload = boolValue(allowDownloadOption, true);
    if (!allowDownload) {
      throw new Error("Python is missing and downloads are disabled");
    }

    var lock = acquireFileLock(new File(runtime.lockFile), intValue(options.pythonInstallLockTimeoutMs, 600000, 10000, 3600000));
    var steps = [];
    try {
      detected = detectPythonRuntime(options, "");
      if (detected.command.found && !force) {
        return {
          attempted: true,
          installed: false,
          reused: true,
          runtime: runtime,
          python: detected.command,
          steps: steps,
          timestamp: now()
        };
      }
      var target = new File(runtime.installDir);
      ensureDirectory(target);
      var archiveFile = new File(target.getParentFile(), runtime.archiveName);
      var download = downloadFile(runtime.archiveUrl, archiveFile);
      steps.push({ action: "download", result: download });
      if (!download.ok) {
        throw new Error(download.error || ("Unable to download " + runtime.archiveUrl));
      }
      var expectedSha256 = trim(options.pythonArchiveSha256 || options.pythonSha256);
      if (expectedSha256.length) {
        var actualSha256 = sha256File(archiveFile);
        steps.push({ action: "sha256", expected: expectedSha256, actual: actualSha256, ok: expectedSha256.toLowerCase() === actualSha256.toLowerCase() });
        if (expectedSha256.toLowerCase() !== actualSha256.toLowerCase()) {
          throw new Error("Python archive checksum mismatch");
        }
      }
      steps.push({ action: "extract", result: runCommand(["tar", "-xzf", filePath(archiveFile), "-C", filePath(target)], { timeoutMs: intValue(options.pythonExtractTimeoutMs, 300000, 30000, 1800000) }) });
      if (!steps[steps.length - 1].result.ok) {
        throw new Error("Unable to extract Python archive: " + (steps[steps.length - 1].result.stderr || steps[steps.length - 1].result.error));
      }
      try { Files.deleteIfExists(archiveFile.toPath()); } catch (_ignoreArchiveDelete) {}
      detected = detectPythonRuntime(options, "");
      if (!detected.command.found) {
        throw new Error("Python archive was extracted but no runnable python executable was found");
      }
      return {
        attempted: true,
        installed: true,
        reused: false,
        runtime: runtime,
        python: detected.command,
        steps: steps,
        timestamp: now()
      };
    } finally {
      lock.release();
    }
  }

  function executableName(name) {
    var value = String(name || "");
    if (isWindows() && value.indexOf(".") < 0) {
      return value + ".exe";
    }
    return value;
  }

  function scriptCommandName(name) {
    var value = String(name || "");
    if (isWindows() && value.indexOf(".") < 0) {
      return value + ".cmd";
    }
    return value;
  }

  function detectNpmRuntime(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var nodeVersion = trim(options.nodeVersion) || String(ProcessUtils.getDefaultNodeVersion());
    var userHome = String(System.getProperty("user.home"));
    var localNodeDir = normalizeDirectory(options.nodeDir || options.nodeInstallDir, filePath(ProcessUtils.getDefaultNodeDir()), workspaceRoot);
    var npmName = scriptCommandName("npm");
    var candidates = [
      trim(options.npmPath),
      childPath(localNodeDir, npmName),
      childPath(childPath(localNodeDir, "bin"), npmName),
      childPath(childPath(userHome, ".local/bin"), npmName),
      "/opt/homebrew/bin/npm",
      "/usr/local/bin/npm",
      "npm"
    ];
    return {
      workspaceRoot: workspaceRoot,
      nodeVersion: nodeVersion,
      nodeDir: localNodeDir,
      npm: firstWorkingCommand(candidates, ["--version"])
    };
  }

  function detectNodeRuntime(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var userHome = String(System.getProperty("user.home"));
    var localNodeDir = normalizeDirectory(options.nodeDir || options.nodeInstallDir, filePath(ProcessUtils.getDefaultNodeDir()), workspaceRoot);
    var nodeName = executableName("node");
    var candidates = [
      trim(options.nodePath || options.nodeCommand || options.nodeExecutable),
      childPath(localNodeDir, nodeName),
      childPath(childPath(localNodeDir, "bin"), nodeName)
    ];
    try {
      var defaultNodeDir = filePath(ProcessUtils.getDefaultNodeDir());
      candidates.push(childPath(defaultNodeDir, nodeName));
      candidates.push(childPath(childPath(defaultNodeDir, "bin"), nodeName));
    } catch (_ignoreDefaultNodeCandidate) {}
    try {
      var npmRuntime = detectNpmRuntime(options);
      if (npmRuntime.npm && npmRuntime.npm.found) {
        var npmParent = parentPath(npmRuntime.npm.path);
        if (npmParent.length) {
          candidates.push(childPath(npmParent, nodeName));
          candidates.push(childPath(parentPath(npmParent), nodeName));
        }
      }
    } catch (_ignoreNpmNodeCandidate) {}
    candidates.push(childPath(childPath(userHome, ".local"), "bin/" + nodeName));
    candidates.push("/opt/homebrew/bin/" + nodeName);
    candidates.push("/usr/local/bin/" + nodeName);
    candidates.push("node");
    return firstWorkingCommand(candidates, ["--version"], nodeRuntimeSearchPath(options));
  }

  function ensureNpmRuntime(options) {
    options = options || {};
    var detected = detectNpmRuntime(options);
    if (detected.npm.found) {
      return {
        attempted: false,
        installedNode: false,
        reused: true,
        nodeVersion: detected.nodeVersion,
        nodeDir: detected.nodeDir,
        npm: detected.npm,
        steps: [],
        timestamp: now()
      };
    }
    var allowDownloadOption = typeof options.allowNodeDownload !== "undefined" ? options.allowNodeDownload : true;
    if (!boolValue(allowDownloadOption, true)) {
      throw new Error("npm is missing and Node.js downloads are disabled");
    }
    var nodeVersion = trim(options.nodeVersion) || String(ProcessUtils.getDefaultNodeVersion());
    var nodeDir = ProcessUtils.getNodeDir(nodeVersion);
    var nodeDirPath = filePath(nodeDir);
    var npm = firstWorkingCommand([
      childPath(nodeDirPath, scriptCommandName("npm")),
      childPath(childPath(nodeDirPath, "bin"), scriptCommandName("npm"))
    ], ["--version"]);
    if (!npm.found) {
      throw new Error("Node.js was installed but npm was not found in " + nodeDirPath);
    }
    return {
      attempted: true,
      installedNode: true,
      reused: false,
      nodeVersion: nodeVersion,
      nodeDir: nodeDirPath,
      npm: npm,
      steps: [{ action: "node_install", nodeVersion: nodeVersion, nodeDir: nodeDirPath }],
      timestamp: now()
    };
  }

  function codexLocalBin(installDir) {
    return childPath(childPath(childPath(installDir, "npm"), "node_modules/.bin"), scriptCommandName("codex"));
  }

  function codexNpmPrefix(installDir) {
    return childPath(installDir, "npm");
  }

  function codexNodeModulesPath(installDir) {
    return childPath(codexNpmPrefix(installDir), "node_modules");
  }

  function codexPackageSpec(options) {
    var name = trim(options.codexPackage || options.packageName) || "@openai/codex";
    var version = trim(options.codexVersion || options.packageVersion || options.version) || "latest";
    if (!version.length) {
      return name;
    }
    return name + "@" + version;
  }

  function codexPlaywrightEnv(options, installDir) {
    var env = {};
    var path = nodeRuntimeSearchPath(options || {});
    if (path.length) {
      env.PATH = path + String(File.pathSeparator) + String(System.getenv("PATH") || "");
    }
    env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    return env;
  }

  function detectCodexPlaywrightRuntime(options, installDir) {
    options = options || {};
    var packageSpec = codexPlaywrightMcpPackageSpec(options);
    var packageName = npmPackageNameFromSpec(packageSpec);
    var nodeModules = codexNodeModulesPath(installDir);
    var packagePath = childPath(childPath(nodeModules, packageName), "package.json");
    var binPath = childPath(childPath(nodeModules, ".bin"), codexPlaywrightMcpBinaryName(options));
    var node = detectNodeRuntime(options);
    var npx = detectNpxRuntime(options);
    var runtime = {
      found: false,
      package: packageName,
      packageSpec: packageSpec,
      packagePath: packagePath,
      packageExists: new File(packagePath).exists(),
      binPath: binPath,
      binExists: new File(binPath).exists(),
      nodeModules: nodeModules,
      version: "",
      node: node,
      npx: npx,
      probe: {
        checked: false,
        ok: false,
        stdout: "",
        stderr: "",
        error: ""
      },
      env: {
        nodePath: nodeModules,
        skipBrowserDownload: true
      }
    };
    if (!runtime.packageExists) {
      runtime.probe.error = packageName + " is not installed";
      return runtime;
    }
    try {
      var packageJson = JSON.parse(readTextFile(new File(packagePath)));
      runtime.version = trim(packageJson.version);
    } catch (_ignorePlaywrightMcpPackageJson) {}
    if (!npx.found) {
      runtime.probe.error = "npx is not available";
      return runtime;
    }
    if (!node.found) {
      runtime.probe.error = "node is not available";
      return runtime;
    }
    var probe = runCommand([npx.path, "--prefix", codexNpmPrefix(installDir), codexPlaywrightMcpBinaryName(options), "--version"], {
      timeoutMs: 15000,
      env: codexPlaywrightEnv(options, installDir)
    });
    runtime.probe.checked = true;
    runtime.probe.ok = probe.ok;
    runtime.probe.stdout = probe.stdout;
    runtime.probe.stderr = probe.stderr;
    runtime.probe.error = probe.error;
    runtime.found = probe.ok;
    if (!runtime.version.length) {
      runtime.version = trim((probe.stdout || "") + "\n" + (probe.stderr || "")).replace(/^Version\s+/i, "").split(/\r?\n/)[0] || "";
    }
    return runtime;
  }

  function ensureCodexPlaywrightRuntime(options, installDir) {
    options = options || {};
    var before = detectCodexPlaywrightRuntime(options, installDir);
    if (boolValue(options.skipCodexPlaywrightInstall || options.skipPlaywrightInstall, false)) {
      return {
        attempted: false,
        installed: false,
        reused: before.found,
        skipped: true,
        method: "skipped",
        package: "",
        before: before,
        playwright: before,
        steps: [],
        timestamp: now()
      };
    }
    var force = boolValue(options.forceCodexPlaywrightInstall || options.forcePlaywrightInstall || options.forceCodexInstall || options.forceInstall || options.force, false);
    if (before.found && !force) {
      return {
        attempted: false,
        installed: false,
        reused: true,
        skipped: false,
        method: "existing",
        package: "",
        before: before,
        playwright: before,
        steps: [],
        timestamp: now()
      };
    }
    var npmPrefix = codexNpmPrefix(installDir);
    ensureDirectory(new File(npmPrefix));
    var npmRuntime = ensureNpmRuntime(options);
    var packageSpec = codexPlaywrightMcpPackageSpec(options);
    var installEnv = {
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
    };
    var install = runNpmInstall(npmRuntime.npm, packageSpec, npmPrefix, options, installEnv);
    var steps = [{ action: "npm_install", package: packageSpec, prefix: npmPrefix, env: installEnv, result: install }];
    if (!install.ok) {
      throw new Error("Unable to install Playwright MCP for Codex with npm: " + (install.stderr || install.stdout || install.error));
    }
    var after = detectCodexPlaywrightRuntime(options, installDir);
    if (!after.found) {
      throw new Error("Playwright MCP package was installed but cannot be executed from " + codexNodeModulesPath(installDir));
    }
    return {
      attempted: true,
      installed: true,
      reused: false,
      skipped: false,
      method: "npm",
      package: packageSpec,
      npm: npmRuntime,
      before: before,
      playwright: after,
      steps: steps,
      timestamp: now()
    };
  }

  function runNpmInstall(npm, packageSpec, prefixDir, options, extraEnv) {
    return runNpmCommand(npm, ["install", "--prefix", prefixDir, packageSpec], {
      cwd: prefixDir,
      env: extraEnv || null,
      timeoutMs: intValue(options.codexInstallTimeoutMs || options.npmInstallTimeoutMs, 600000, 30000, 1800000)
    });
  }

  function runNpmCommand(npm, args, options) {
    var npmDir = parentPath(npm.path);
    var paths = npmDir.length ? npmDir : "";
    var normalizedNpmDir = npmDir.replace(/\\/g, "/");
    var npmMarker = "/lib/node_modules/npm/bin";
    var markerIndex = normalizedNpmDir.indexOf(npmMarker);
    if (markerIndex > 0) {
      var nodeBinDir = normalizedNpmDir.substring(0, markerIndex) + "/bin";
      paths = nodeBinDir + (paths.length ? String(File.pathSeparator) + paths : "");
    }
    var commandArgs = ["npm"];
    for (var i = 0; i < args.length; i++) {
      commandArgs.push(String(args[i]));
    }
    var command = toJavaList(commandArgs);
    var pb = ProcessUtils.getNpmProcessBuilder(paths, command);
    return runProcessBuilder(pb, {
      cwd: options && options.cwd ? options.cwd : null,
      env: options && options.env ? options.env : null,
      timeoutMs: options && options.timeoutMs ? options.timeoutMs : 15000
    });
  }

  function ensureCodexRuntime(options) {
    options = options || {};
    var before = detectCodexRuntime(options);
    var force = boolValue(options.forceCodexInstall || options.forceInstall || options.force, false);
    var workspaceFirstOption = typeof options.workspaceInstallFirst !== "undefined" ? options.workspaceInstallFirst : options.preferWorkspaceInstall;
    var workspaceFirst = boolValue(typeof workspaceFirstOption === "undefined" ? true : workspaceFirstOption, true);
    if (before.codex.found && !force && (!workspaceFirst || commandPathStartsWith(before.codex, before.installDir))) {
      var existingPlaywright = commandPathStartsWith(before.codex, before.installDir) ? ensureCodexPlaywrightRuntime(options, before.installDir) : {
        attempted: false,
        installed: false,
        reused: false,
        skipped: true,
        method: "external_codex",
        package: "",
        before: detectCodexPlaywrightRuntime(options, before.installDir),
        playwright: detectCodexPlaywrightRuntime(options, before.installDir),
        steps: [],
        timestamp: now()
      };
      return {
        attempted: false,
        installed: false,
        reused: true,
        method: "existing",
        package: "",
        npm: null,
        before: before.codex,
        codex: before.codex,
        playwright: existingPlaywright,
        steps: [],
        timestamp: now()
      };
    }
    var method = trim(options.codexInstallMethod || options.installMethod) || "npm";
    if (method !== "npm") {
      throw new Error("Unsupported Codex install method: " + method);
    }
    var lock = acquireFileLock(new File(childPath(before.installDir, "codex-install.lock")), intValue(options.codexInstallLockTimeoutMs, 600000, 10000, 3600000));
    var steps = [];
    try {
      before = detectCodexRuntime(options);
      if (before.codex.found && !force && (!workspaceFirst || commandPathStartsWith(before.codex, before.installDir))) {
        var lockedPlaywright = commandPathStartsWith(before.codex, before.installDir) ? ensureCodexPlaywrightRuntime(options, before.installDir) : {
          attempted: false,
          installed: false,
          reused: false,
          skipped: true,
          method: "external_codex",
          package: "",
          before: detectCodexPlaywrightRuntime(options, before.installDir),
          playwright: detectCodexPlaywrightRuntime(options, before.installDir),
          steps: [],
          timestamp: now()
        };
        return {
          attempted: true,
          installed: false,
          reused: true,
          method: "existing",
          package: "",
          npm: null,
          before: before.codex,
          codex: before.codex,
          playwright: lockedPlaywright,
          steps: steps,
          timestamp: now()
        };
      }
      var fallbackCodex = before.codex.found && !commandPathStartsWith(before.codex, before.installDir) ? before.codex : null;
      try {
        ensureDirectory(new File(before.installDir));
        var npmPrefix = codexNpmPrefix(before.installDir);
        ensureDirectory(new File(npmPrefix));
        var npmRuntime = ensureNpmRuntime(options);
        var packageSpec = codexPackageSpec(options);
        var install = runNpmInstall(npmRuntime.npm, packageSpec, npmPrefix, options);
        steps.push({ action: "npm_install", package: packageSpec, prefix: npmPrefix, result: install });
        if (!install.ok) {
          throw new Error("Unable to install Codex CLI with npm: " + (install.stderr || install.stdout || install.error));
        }
        var afterOptions = {};
        for (var key in options) {
          if (Object.prototype.hasOwnProperty.call(options, key)) {
            afterOptions[key] = options[key];
          }
        }
        afterOptions.codexPath = codexLocalBin(before.installDir);
        var after = detectCodexRuntime(afterOptions);
        if (!after.codex.found) {
          throw new Error("Codex CLI package was installed but no runnable codex executable was found");
        }
        var playwright = ensureCodexPlaywrightRuntime(options, before.installDir);
        return {
          attempted: true,
          installed: true,
          reused: false,
          method: "npm",
          package: packageSpec,
          npm: npmRuntime,
          before: before.codex,
          codex: after.codex,
          codexPath: after.codex.path,
          playwright: playwright,
          steps: steps,
          timestamp: now()
        };
      } catch (installError) {
        if (workspaceFirst && fallbackCodex !== null && !force) {
          return {
            attempted: true,
            installed: false,
            reused: true,
            method: "workspace_install_failed_user_fallback",
            package: codexPackageSpec(options),
            npm: null,
            before: before.codex,
            codex: fallbackCodex,
            codexPath: fallbackCodex.path,
            playwright: {
              attempted: false,
              installed: false,
              reused: false,
              skipped: true,
              method: "workspace_install_failed_user_fallback",
              package: "",
              before: detectCodexPlaywrightRuntime(options, before.installDir),
              playwright: detectCodexPlaywrightRuntime(options, before.installDir),
              steps: [],
              timestamp: now()
            },
            steps: steps,
            error: String(installError),
            timestamp: now()
          };
        }
        throw installError;
      }
    } finally {
      lock.release();
    }
  }

  function drainReader(reader, maxChars) {
    var sb = new java.lang.StringBuilder();
    var line;
    while ((line = reader.readLine()) !== null) {
      if (sb.length() < maxChars) {
        if (sb.length() > 0) {
          sb.append("\n");
        }
        sb.append(line);
      }
    }
    return String(sb.toString());
  }

  function firstWorkingCommand(candidates, versionArgs, extraPath) {
    var attempts = [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = trim(candidates[i]);
      if (!candidate.length) {
        continue;
      }
      var args = [candidate].concat(versionArgs || ["--version"]);
      var env = {};
      var candidateParent = "";
      try {
        candidateParent = parentPath(candidate);
      } catch (_ignoreCandidateParent) {}
      var pathPrefix = "";
      if (candidateParent.length) {
        pathPrefix = candidateParent;
        var npmMarker = "/lib/node_modules/npm/bin";
        var normalizedParent = candidateParent.replace(/\\/g, "/");
        var markerIndex = normalizedParent.indexOf(npmMarker);
        if (markerIndex > 0) {
          pathPrefix = pathPrefix + String(File.pathSeparator) + normalizedParent.substring(0, markerIndex) + "/bin";
        }
      }
      if (trim(extraPath).length) {
        pathPrefix = pathPrefix.length ? pathPrefix + String(File.pathSeparator) + trim(extraPath) : trim(extraPath);
      }
      if (pathPrefix.length) {
        env.PATH = pathPrefix + String(File.pathSeparator) + String(System.getenv("PATH") || "");
      }
      var probe = runCommand(args, { timeoutMs: 10000, env: env });
      var versionText = trim((probe.stdout || "") + "\n" + (probe.stderr || ""));
      attempts.push({
        path: candidate,
        ok: probe.ok,
        exitCode: probe.exitCode,
        version: versionText.split(/\r?\n/)[0] || "",
        error: probe.error
      });
      if (probe.ok) {
        return {
          found: true,
          path: candidate,
          version: versionText.split(/\r?\n/)[0] || "",
          attempts: attempts
        };
      }
    }
    return {
      found: false,
      path: "",
      version: "",
      attempts: attempts
    };
  }

  function existingCommandFile(candidate) {
    var value = trim(candidate);
    if (!value.length) {
      return null;
    }
    var file = new File(value);
    if (file.isFile()) {
      return file;
    }
    if (!isWindows() || /\.[A-Za-z0-9]+$/.test(value)) {
      return null;
    }
    var extensions = [".exe", ".cmd", ".bat"];
    for (var i = 0; i < extensions.length; i++) {
      file = new File(value + extensions[i]);
      if (file.isFile()) {
        return file;
      }
    }
    return null;
  }

  function firstExistingCommand(candidates, extraPath) {
    var search = [];
    var seen = {};
    var add = function (value) {
      var candidate = trim(value);
      if (candidate.length && !seen[candidate]) {
        seen[candidate] = true;
        search.push(candidate);
      }
    };
    candidates = candidates || [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = trim(candidates[i]);
      if (!candidate.length) {
        continue;
      }
      if (candidate.indexOf("/") >= 0 || candidate.indexOf("\\") >= 0 || new File(candidate).isAbsolute()) {
        add(candidate);
        continue;
      }
      var pathValue = trim(extraPath);
      var systemPath = String(System.getenv("PATH") || "");
      pathValue = pathValue.length ? pathValue + String(File.pathSeparator) + systemPath : systemPath;
      var directories = pathValue.split(String(File.pathSeparator));
      for (var p = 0; p < directories.length; p++) {
        if (trim(directories[p]).length) {
          add(childPath(directories[p], candidate));
        }
      }
    }
    for (var j = 0; j < search.length; j++) {
      var file = existingCommandFile(search[j]);
      if (file !== null) {
        return {
          found: true,
          path: filePath(file),
          version: "",
          attempts: []
        };
      }
    }
    return {
      found: false,
      path: "",
      version: "",
      attempts: []
    };
  }

  function installedNpmPackageVersion(installDir, packageName) {
    try {
      var packageFile = new File(childPath(childPath(codexNodeModulesPath(installDir), packageName), "package.json"));
      var descriptor = readJsonFile(packageFile);
      return descriptor && descriptor.version ? extractRuntimeVersion(descriptor.version) : "";
    } catch (_ignoreInstalledNpmPackageVersion) {
      return "";
    }
  }

  function inspectVibeConfig(file) {
    var info = {
      path: filePath(file),
      exists: file.exists(),
      hasMcpServers: false,
      hasConvertigoServer: false,
      hasHttpTransport: false,
      endpoint: "",
      valid: false
    };
    if (!info.exists) {
      return info;
    }
    var text = readTextFile(file);
    info.hasMcpServers = text.indexOf("[[mcp_servers]]") >= 0;
    var blockPattern = /\[\[mcp_servers\]\]([\s\S]*?)(?=\n\[\[|\n\[|$)/g;
    var blockMatch;
    while ((blockMatch = blockPattern.exec(text)) !== null) {
      var block = blockMatch[1];
      var isConvertigo = /name\s*=\s*["']Convertigo["']|name\s*=\s*["']convertigo["']/.test(block);
      if (!isConvertigo) {
        continue;
      }
      info.hasConvertigoServer = true;
      info.hasHttpTransport = /transport\s*=\s*["']http["']/.test(block);
      var match = block.match(/url\s*=\s*["']([^"']+)["']/);
      info.endpoint = match ? match[1] : "";
      break;
    }
    info.valid = info.hasMcpServers && info.hasConvertigoServer && info.hasHttpTransport && info.endpoint.length > 0;
    return info;
  }

  function tomlString(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function vibeModelSpec(value) {
    var model = trim(value);
    var lower = model.toLowerCase();
    if (!model.length || lower === "default" || lower === "auto") {
      model = "vibe-thinking";
      lower = model;
    }
    if (lower === "vibe-thinking") {
      return {
        activeModel: "vibe-thinking",
        name: "mistral-vibe-cli-latest",
        alias: "vibe-thinking",
        thinking: "high",
        temperature: "1.0",
        inputPrice: "1.5",
        outputPrice: "7.5"
      };
    }
    if (lower === "mistral-medium-3.5") {
      return {
        activeModel: "mistral-medium-3.5",
        name: "mistral-vibe-cli-latest",
        alias: "mistral-medium-3.5",
        thinking: "high",
        temperature: "1.0",
        inputPrice: "1.5",
        outputPrice: "7.5"
      };
    }
    return {
      activeModel: model,
      name: model,
      alias: model,
      thinking: "",
      temperature: "1.0",
      inputPrice: "0.0",
      outputPrice: "0.0"
    };
  }

  function writeLocalVibeConfig(vibeHome, mcpEndpoint, model) {
    var configDir = new File(vibeHome);
    ensureDirectory(configDir);
    var configFile = new File(configDir, "config.toml");
    var spec = vibeModelSpec(model);
    var text = [
      '# Generated by ConvertigoAgentBridge.',
      'active_model = "' + tomlString(spec.activeModel) + '"',
      'api_timeout = 720.0',
      'auto_compact_threshold = 200000',
      '',
      '[[providers]]',
      'name = "mistral"',
      'api_base = "https://api.mistral.ai/v1"',
      'api_key_env_var = "MISTRAL_API_KEY"',
      'browser_auth_base_url = "https://console.mistral.ai"',
      'browser_auth_api_base_url = "https://console.mistral.ai/api"',
      'api_style = "openai"',
      'backend = "mistral"',
      'reasoning_field_name = "reasoning_content"',
      'project_id = ""',
      'region = ""',
      '',
      '[providers.extra_headers]',
      '',
      '[[models]]',
      'name = "' + tomlString(spec.name) + '"',
      'provider = "mistral"',
      'alias = "' + tomlString(spec.alias) + '"',
      'temperature = ' + spec.temperature,
      'input_price = ' + spec.inputPrice,
      'output_price = ' + spec.outputPrice,
      spec.thinking.length ? 'thinking = "' + tomlString(spec.thinking) + '"' : '',
      'auto_compact_threshold = 200000',
      '',
      '[[mcp_servers]]',
      'name = "Convertigo"',
      'transport = "http"',
      'url = "' + tomlString(mcpEndpoint) + '"',
      'startup_timeout_sec = 60.0',
      ''
    ].join("\n");
    return {
      path: filePath(configFile),
      model: spec.activeModel,
      bytes: writeTextFile(configFile, text)
    };
  }

  function detectRuntime(options) {
    var workspaceRoot = resolveWorkspaceRoot(options);
    var installDir = normalizeDirectory(options.installDir, childPath(workspaceRoot, "agents/vibe"), workspaceRoot);
    var venvDir = childPath(installDir, ".venv");
    var localPython = venvBinPath(venvDir, "python");
    var localVibe = venvBinPath(venvDir, "vibe");
    var localVibeAcp = venvBinPath(venvDir, "vibe-acp");
    var home = resolveVibeHome(options, installDir);
    var vibeHome = home.path;
    var mcpEndpoint = resolveMcpEndpoint(options);
    var model = vibeModelSpec(options.model || options.agentModel);
    var userHome = String(System.getProperty("user.home"));

    var homeLocalBin = childPath(userHome, ".local/bin");
    var pythonRuntime = detectPythonRuntime(options, localPython);

    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      venvDir: venvDir,
      vibeHome: vibeHome,
      home: publicHomeInfo(home),
      mcpEndpoint: mcpEndpoint,
      model: model.activeModel,
      python: pythonRuntime.command,
      pythonRuntime: pythonRuntime.runtime,
      uv: firstWorkingCommand([
        childPath(homeLocalBin, "uv"),
        "/opt/homebrew/bin/uv",
        "/usr/local/bin/uv",
        "uv"
      ], ["--version"]),
      vibe: firstWorkingCommand([
        localVibe,
        childPath(homeLocalBin, "vibe"),
        "/opt/homebrew/bin/vibe",
        "/usr/local/bin/vibe",
        "vibe"
      ], ["--version"]),
      vibeAcp: firstWorkingCommand([
        localVibeAcp,
        childPath(homeLocalBin, "vibe-acp"),
        "/opt/homebrew/bin/vibe-acp",
        "/usr/local/bin/vibe-acp",
        "vibe-acp"
      ], ["--version"]),
      config: {
        selected: vibeHome.length ? inspectVibeConfig(new File(vibeHome, "config.toml")) : {
          path: "",
          exists: false,
          hasMcpServers: false,
          hasConvertigoServer: false,
          hasHttpTransport: false,
          endpoint: "",
          valid: false
        },
        user: inspectVibeConfig(new File(new File(userHome, ".vibe"), "config.toml"))
      }
    };
  }

  function detectCodexRuntime(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var installDir = normalizeDirectory(options.installDir, childPath(workspaceRoot, "agents/codex"), workspaceRoot);
    var codexHome = resolveCodexHome(options, installDir);
    var userHome = String(System.getProperty("user.home"));
    var command = firstWorkingCommand([
      trim(options.codexPath || options.commandPath),
      codexLocalBin(installDir),
      "/Applications/Codex.app/Contents/Resources/codex",
      childPath(childPath(userHome, ".local"), "bin/codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "codex"
    ], ["--version"], nodeRuntimeSearchPath(options));
    var mcp = {
      checked: false,
      ok: false,
      hasConvertigo: false,
      hasPlaywright: false,
      stdout: "",
      stderr: "",
      error: ""
    };
    if (command.found) {
      var env = codexRuntimeEnv(options, codexHome.path);
      var mcpProbe = runCommand([command.path, "mcp", "list"], { timeoutMs: 15000, env: env });
      mcp.checked = true;
      mcp.ok = mcpProbe.ok;
      mcp.stdout = mcpProbe.stdout;
      mcp.stderr = mcpProbe.stderr;
      mcp.error = mcpProbe.error;
      var mcpText = String((mcpProbe.stdout || "") + "\n" + (mcpProbe.stderr || "")).toLowerCase();
      mcp.hasConvertigo = mcpText.indexOf("convertigo") >= 0;
      mcp.hasPlaywright = mcpText.indexOf("playwright") >= 0;
    }
    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      codexHome: codexHome.path,
      home: publicHomeInfo(codexHome),
      mcpEndpoint: resolveMcpEndpoint(options),
      codex: command,
      playwright: detectCodexPlaywrightRuntime(options, installDir),
      mcp: mcp
    };
  }

  function inspectCodexMcpConfig(codexHome) {
    var result = {
      checked: true,
      ok: false,
      hasConvertigo: false,
      hasPlaywright: false,
      stdout: "",
      stderr: "",
      error: ""
    };
    try {
      var configFile = new File(codexHome, "config.toml");
      if (!configFile.isFile()) {
        result.error = "config.toml not found";
        return result;
      }
      var text = readTextFile(configFile).toLowerCase();
      result.hasConvertigo = text.indexOf("convertigo") >= 0 && text.indexOf("mcp") >= 0;
      result.hasPlaywright = text.indexOf("playwright") >= 0 && text.indexOf("mcp") >= 0;
      result.ok = result.hasConvertigo;
    } catch (error) {
      result.error = String(error);
    }
    return result;
  }

  function detectCodexRuntimePresence(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var installDir = normalizeDirectory(options.installDir, childPath(workspaceRoot, "agents/codex"), workspaceRoot);
    var codexHome = resolveCodexHome(options, installDir);
    var userHome = String(System.getProperty("user.home"));
    var command = firstExistingCommand([
      trim(options.codexPath || options.commandPath),
      codexLocalBin(installDir),
      "/Applications/Codex.app/Contents/Resources/codex",
      childPath(childPath(userHome, ".local"), "bin/codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "codex"
    ], nodeRuntimeSearchPath(options));
    if (command.found && commandPathStartsWith(command, installDir)) {
      var version = installedNpmPackageVersion(installDir, npmPackageNameFromSpec(codexPackageSpec(options)));
      command.version = version.length ? "codex-cli " + version : "";
    }
    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      codexHome: codexHome.path,
      home: publicHomeInfo(codexHome),
      mcpEndpoint: resolveMcpEndpoint(options),
      codex: command,
      playwright: {
        installed: new File(childPath(codexNodeModulesPath(installDir), "@playwright/mcp/package.json")).isFile()
      },
      mcp: inspectCodexMcpConfig(codexHome.path)
    };
  }

  function detectRuntimePresence(options) {
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var installDir = normalizeDirectory(options.installDir, childPath(workspaceRoot, "agents/vibe"), workspaceRoot);
    var venvDir = childPath(installDir, ".venv");
    var vibeHomeInfo = resolveVibeHome(options, installDir);
    var vibeHome = vibeHomeInfo.path;
    var userHome = String(System.getProperty("user.home"));
    var homeLocalBin = childPath(userHome, ".local/bin");
    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      venvDir: venvDir,
      vibeHome: vibeHome,
      home: publicHomeInfo(vibeHomeInfo),
      mcpEndpoint: resolveMcpEndpoint(options),
      model: vibeModelSpec(options.model || options.agentModel).activeModel,
      python: firstExistingCommand([
        venvBinPath(venvDir, "python"),
        childPath(homeLocalBin, "python3"),
        childPath(homeLocalBin, "python"),
        "python3",
        "python"
      ], ""),
      pythonRuntime: {},
      uv: firstExistingCommand([
        venvBinPath(venvDir, "uv"),
        childPath(homeLocalBin, "uv"),
        "uv"
      ], ""),
      vibe: firstExistingCommand([
        venvBinPath(venvDir, "vibe"),
        childPath(homeLocalBin, "vibe"),
        "vibe"
      ], ""),
      vibeAcp: firstExistingCommand([
        venvBinPath(venvDir, "vibe-acp"),
        childPath(homeLocalBin, "vibe-acp"),
        "vibe-acp"
      ], ""),
      config: {
        selected: vibeHome.length ? inspectVibeConfig(new File(vibeHome, "config.toml")) : {
          path: "",
          exists: false,
          hasMcpServers: false,
          hasConvertigoServer: false,
          hasHttpTransport: false,
          endpoint: "",
          valid: false
        },
        user: inspectVibeConfig(new File(new File(userHome, ".vibe"), "config.toml"))
      }
    };
  }

  function codexRuntimeEnv(options, codexHomePath) {
    var env = {};
    options = options || {};
    var workspaceRoot = resolveWorkspaceRoot(options);
    var installDir = normalizeDirectory(options.installDir, childPath(workspaceRoot, "agents/codex"), workspaceRoot);
    var path = nodeRuntimeSearchPath(options);
    if (path.length) {
      env.PATH = path + String(File.pathSeparator) + String(System.getenv("PATH") || "");
    }
    if (trim(codexHomePath).length) {
      env.CODEX_HOME = trim(codexHomePath);
    }
    var cdpEndpoint = resolvePlaywrightMcpCdpEndpoint(options);
    if (cdpEndpoint.length) {
      env.PLAYWRIGHT_MCP_CDP_ENDPOINT = cdpEndpoint;
      env.PLAYWRIGHT_MCP_SHARED_BROWSER_CONTEXT = "1";
    }
    var noCodeToken = noCodeMcpBearerToken(options);
    if (noCodeToken.length) {
      env[NOCODE_MCP_TOKEN_ENV] = noCodeToken;
    }
    return env;
  }

  function normalizeCodexReasoningEffort(value) {
    var effort = trim(value).toLowerCase();
    if (!effort.length || effort === "default" || effort === "auto") {
      return "";
    }
    if (effort === "very-high" || effort === "very_high" || effort === "extra-high" || effort === "extra_high") {
      return "xhigh";
    }
    if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
      return effort;
    }
    return effort;
  }

  function codexReasoningLabel(effort) {
    var value = normalizeCodexReasoningEffort(effort);
    if (value === "low") {
      return "Low";
    }
    if (value === "medium") {
      return "Medium";
    }
    if (value === "high") {
      return "High";
    }
    if (value === "xhigh") {
      return "Very high";
    }
    return value;
  }

  function normalizeCodexReasoningLevels(levels) {
    var out = [];
    var seen = {};
    levels = levels || [];
    for (var i = 0; i < levels.length; i++) {
      var item = levels[i] || {};
      var effort = normalizeCodexReasoningEffort(item.effort || item.id || item.name);
      if (!effort.length || seen[effort]) {
        continue;
      }
      seen[effort] = true;
      out.push({
        id: effort,
        label: codexReasoningLabel(effort),
        description: String(item.description || "")
      });
    }
    return out;
  }

  function normalizeCodexServiceTiers(model) {
    var tiers = [];
    var seen = {};
    var raw = (model && model.service_tiers) || [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i] || {};
      var id = trim(item.id || item.name);
      if (!id.length || seen[id]) {
        continue;
      }
      seen[id] = true;
      tiers.push({
        id: id,
        label: String(item.name || id),
        description: String(item.description || "")
      });
    }
    return tiers;
  }

  function normalizeCodexModelCatalog(catalog) {
    var models = [];
    var raw = catalog && catalog.models ? catalog.models : [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i] || {};
      var id = trim(item.slug || item.id || item.name);
      if (!id.length || trim(item.visibility).toLowerCase() === "hide") {
        continue;
      }
      var reasoning = normalizeCodexReasoningLevels(item.supported_reasoning_levels || item.supportedReasoningLevels);
      var defaultReasoning = normalizeCodexReasoningEffort(item.default_reasoning_level || item.defaultReasoningLevel);
      models.push({
        id: id,
        label: String(item.display_name || item.displayName || id),
        description: String(item.description || ""),
        defaultReasoning: defaultReasoning,
        reasoningLevels: reasoning,
        serviceTiers: normalizeCodexServiceTiers(item),
        speedTiers: item.additional_speed_tiers || item.additionalSpeedTiers || [],
        priority: intValue(item.priority, 9999, -9999, 999999)
      });
    }
    models.sort(function (a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    });
    return models;
  }

  function compactCommandStatus(command) {
    command = command || {};
    return {
      found: command.found === true,
      path: String(command.path || ""),
      version: String(command.version || ""),
      error: String(command.error || "")
    };
  }

  function compactVibeConfig(config) {
    config = config || {};
    return {
      path: String(config.path || ""),
      exists: config.exists === true,
      hasConvertigoServer: config.hasConvertigoServer === true,
      hasHttpTransport: config.hasHttpTransport === true,
      endpoint: String(config.endpoint || ""),
      valid: config.valid === true
    };
  }

  function compactCodexSetup(setup) {
    setup = setup || {};
    var mcp = setup.mcp || {};
    return {
      workspaceRoot: String(setup.workspaceRoot || ""),
      installDir: String(setup.installDir || ""),
      codexHome: String(setup.codexHome || ""),
      home: setup.home || {},
      mcpEndpoint: String(setup.mcpEndpoint || ""),
      codex: compactCommandStatus(setup.codex),
      mcp: {
        checked: mcp.checked === true,
        ok: mcp.ok === true,
        hasConvertigo: mcp.hasConvertigo === true,
        error: String(mcp.error || "")
      }
    };
  }

  function compactVibeSetup(setup) {
    setup = setup || {};
    var config = setup.config || {};
    return {
      workspaceRoot: String(setup.workspaceRoot || ""),
      installDir: String(setup.installDir || ""),
      venvDir: String(setup.venvDir || ""),
      vibeHome: String(setup.vibeHome || ""),
      home: setup.home || {},
      mcpEndpoint: String(setup.mcpEndpoint || ""),
      model: String(setup.model || ""),
      python: compactCommandStatus(setup.python),
      uv: compactCommandStatus(setup.uv),
      vibe: compactCommandStatus(setup.vibe),
      vibeAcp: compactCommandStatus(setup.vibeAcp),
      config: {
        selected: compactVibeConfig(config.selected),
        user: compactVibeConfig(config.user)
      }
    };
  }

  function extractRuntimeVersion(value) {
    var match = String(value || "").match(/(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/);
    return match ? match[1] : "";
  }

  function compareRuntimeVersions(left, right) {
    var leftVersion = extractRuntimeVersion(left);
    var rightVersion = extractRuntimeVersion(right);
    if (!leftVersion.length || !rightVersion.length) {
      return 0;
    }
    var leftCore = leftVersion.split(/[+-]/)[0].split(".");
    var rightCore = rightVersion.split(/[+-]/)[0].split(".");
    var length = Math.max(leftCore.length, rightCore.length);
    for (var i = 0; i < length; i++) {
      var leftPart = parseInt(leftCore[i] || "0", 10);
      var rightPart = parseInt(rightCore[i] || "0", 10);
      if (leftPart < rightPart) {
        return -1;
      }
      if (leftPart > rightPart) {
        return 1;
      }
    }
    var leftPrerelease = leftVersion.indexOf("-") >= 0;
    var rightPrerelease = rightVersion.indexOf("-") >= 0;
    if (leftPrerelease !== rightPrerelease) {
      return leftPrerelease ? -1 : 1;
    }
    return 0;
  }

  function runtimeUpdateStatus(provider, command, latest, source) {
    command = command || {};
    latest = latest || {};
    var installedVersion = extractRuntimeVersion(command.version);
    var latestVersion = extractRuntimeVersion(latest.latestVersion);
    return {
      provider: provider,
      installed: command.found === true,
      managed: command.found === true && latest.managedPathPrefix && commandPathStartsWith(command, latest.managedPathPrefix),
      path: String(command.path || ""),
      installedVersion: installedVersion,
      latestVersion: latestVersion,
      checked: latest.checked === true,
      cached: latest.cached === true,
      updateAvailable: installedVersion.length > 0 && latestVersion.length > 0 && compareRuntimeVersions(installedVersion, latestVersion) < 0,
      source: source,
      error: String(latest.error || ""),
      checkedAt: Number(latest.checkedAt || 0),
      nextCheckAt: Number(latest.nextCheckAt || 0)
    };
  }

  function codexLatestVersion(options, setup) {
    options = options || {};
    if (!setup.codex || setup.codex.found !== true) {
      return {
        checked: false,
        latestVersion: "",
        error: "",
        checkedAt: 0,
        managedPathPrefix: String(setup.installDir || "")
      };
    }
    var packageName = npmPackageNameFromSpec(codexPackageSpec(options));
    var cacheKey = "codex:" + packageName;
    if (!boolValue(options.checkUpdates, false)) {
      var cachedLatest = readCachedRuntimeUpdate(cacheKey, setup.workspaceRoot);
      if (cachedLatest !== null) {
        cachedLatest.managedPathPrefix = String(setup.installDir || "");
        return cachedLatest;
      }
      return {
        checked: false,
        latestVersion: "",
        error: "",
        checkedAt: 0,
        managedPathPrefix: String(setup.installDir || "")
      };
    }
    var latest = cachedRuntimeUpdate(cacheKey, options, setup.workspaceRoot, function () {
      var npmRuntime = detectNpmRuntime(options);
      if (!npmRuntime.npm.found) {
        return {
          checked: true,
          latestVersion: "",
          error: "npm not found"
        };
      }
      var probe = runNpmCommand(npmRuntime.npm, ["view", packageName, "version", "--json"], {
        timeoutMs: intValue(options.updateCheckTimeoutMs, 20000, 1000, 120000)
      });
      var parsed = parseJsonSafe(probe.stdout, "");
      var value = typeof parsed === "string" ? parsed : probe.stdout;
      return {
        checked: true,
        latestVersion: extractRuntimeVersion(value),
        error: probe.ok ? "" : String(probe.stderr || probe.error || "npm version check failed")
      };
    });
    latest.managedPathPrefix = String(setup.installDir || "");
    return latest;
  }

  function vibeLatestVersion(options, setup) {
    options = options || {};
    if (!setup.vibe || setup.vibe.found !== true) {
      return {
        checked: false,
        latestVersion: "",
        error: "",
        checkedAt: 0,
        managedPathPrefix: String(setup.venvDir || "")
      };
    }
    var cacheKey = "vibe:mistral-vibe";
    if (!boolValue(options.checkUpdates, false)) {
      var cachedLatest = readCachedRuntimeUpdate(cacheKey, setup.workspaceRoot);
      if (cachedLatest !== null) {
        cachedLatest.managedPathPrefix = String(setup.venvDir || "");
        return cachedLatest;
      }
      return {
        checked: false,
        latestVersion: "",
        error: "",
        checkedAt: 0,
        managedPathPrefix: String(setup.venvDir || "")
      };
    }
    var latest = cachedRuntimeUpdate(cacheKey, options, setup.workspaceRoot, function () {
      if (!setup.python || !setup.python.found) {
        return {
          checked: true,
          latestVersion: "",
          error: "Python not found"
        };
      }
      var probe = runCommandCaptured([setup.python.path, "-m", "pip", "index", "versions", "mistral-vibe"], {
        timeoutMs: intValue(options.updateCheckTimeoutMs, 20000, 1000, 120000)
      });
      var text = String((probe.stdout || "") + "\n" + (probe.stderr || ""));
      var match = text.match(/mistral-vibe\s*\(([^)]+)\)/i) || text.match(/Available versions:\s*([^\s,]+)/i);
      return {
        checked: true,
        latestVersion: match ? extractRuntimeVersion(match[1]) : "",
        error: probe.ok ? "" : String(probe.stderr || probe.error || "PyPI version check failed")
      };
    });
    latest.managedPathPrefix = String(setup.venvDir || "");
    return latest;
  }

  function codexSettings(options) {
    options = optionsWithRequestFallbacks(options);
    var presenceOnly = boolValue(options.runtimePresenceOnly, false);
    var setup = presenceOnly ? detectCodexRuntimePresence(options) : detectCodexRuntime(options);
    var runtime = runtimeUpdateStatus("codex", setup.codex, codexLatestVersion(options, setup), "npm");
    var source = {
      type: presenceOnly ? "presence" : "cli",
      command: presenceOnly ? String(setup.codex.path || "") : (setup.codex.found ? setup.codex.path + " debug models" : "codex debug models"),
      ok: presenceOnly && setup.codex.found === true,
      exitCode: -1,
      error: "",
      stderr: ""
    };
    var models = [];
    var bootstrap = null;
    var skills = null;
    if (setup.codex.found && !presenceOnly) {
      try {
        if (trim(setup.codexHome).length) {
          bootstrap = bootstrapCodexHome(options, setup.codexHome, resolveMcpEndpoint(options));
          skills = installAgentSkills(options, "codex", setup.codexHome);
          setup = detectCodexRuntime(options);
        }
      } catch (_ignoreCodexHomePrepare) {}
      var probe = runCommandCaptured([setup.codex.path, "debug", "models"], {
        timeoutMs: intValue(options.settingsTimeoutMs || options.modelsTimeoutMs, 60000, 1000, 180000),
        env: codexRuntimeEnv(options, setup.codexHome)
      });
      source.ok = probe.ok;
      source.exitCode = probe.exitCode;
      source.error = probe.error;
      source.stderr = probe.stderr;
      if (probe.ok) {
        models = normalizeCodexModelCatalog(parseJsonSafe(probe.stdout, {}));
      }
    } else if (!setup.codex.found) {
      source.error = "Codex CLI not found";
    }
    var defaultModel = models.length ? models[0].id : "";
    return {
      id: "codex",
      label: "Codex",
      status: setup.codex.found ? "ready" : "missing",
      ready: setup.codex.found === true,
      runtime: runtime,
      setup: compactCodexSetup(setup),
      bootstrap: bootstrap,
      skills: skills,
      source: source,
      defaultModel: defaultModel,
      models: models,
      reasoningMode: "per_model",
      supports: {
        resume: true,
        stop: true,
        images: true,
        mcp: setup.mcp.hasConvertigo === true,
        reasoning: true,
        serviceTier: true
      }
    };
  }

  function parseTomlValue(text, key) {
    var pattern = new RegExp("^\\s*" + key + "\\s*=\\s*['\\\"]?([^'\\\"\\n#]+)", "m");
    var match = String(text || "").match(pattern);
    return match ? trim(match[1]) : "";
  }

  function parseVibeModelsFromConfig(file) {
    var result = {
      path: filePath(file),
      exists: file.exists(),
      activeModel: "",
      models: []
    };
    if (!result.exists) {
      return result;
    }
    var text = readTextFile(file);
    result.activeModel = parseTomlValue(text, "active_model");
    var blockPattern = /\[\[models\]\]([\s\S]*?)(?=\n\[\[|\n\[|$)/g;
    var blockMatch;
    while ((blockMatch = blockPattern.exec(text)) !== null) {
      var block = blockMatch[1];
      var name = parseTomlValue(block, "name");
      var alias = parseTomlValue(block, "alias");
      var provider = parseTomlValue(block, "provider");
      var thinking = parseTomlValue(block, "thinking");
      var id = alias || name;
      if (!id.length) {
        continue;
      }
      result.models.push({
        id: id,
        label: id,
        configuredName: name,
        provider: provider,
        defaultReasoning: thinking,
        reasoningLevels: thinking.length ? [{
          id: thinking,
          label: thinking,
          description: "Configured by Vibe model"
        }] : [],
        serviceTiers: [],
        speedTiers: []
      });
    }
    return result;
  }

  function vibeSettings(options) {
    options = optionsWithRequestFallbacks(options);
    var setup = boolValue(options.runtimePresenceOnly, false) ? detectRuntimePresence(options) : detectRuntime(options);
    var runtime = runtimeUpdateStatus("vibe", setup.vibe, vibeLatestVersion(options, setup), "pypi");
    var selectedFile = setup.vibeHome.length ? new File(setup.vibeHome, "config.toml") : null;
    var selected = selectedFile !== null ? parseVibeModelsFromConfig(selectedFile) : { path: "", exists: false, activeModel: "", models: [] };
    var user = parseVibeModelsFromConfig(new File(new File(String(System.getProperty("user.home")), ".vibe"), "config.toml"));
    var config = selected.exists ? selected : user;
    var models = config.models;
    if (!models.length && setup.model) {
      var spec = vibeModelSpec(setup.model);
      models = [{
        id: spec.activeModel,
        label: spec.activeModel,
        configuredName: spec.name,
        provider: "mistral",
        defaultReasoning: spec.thinking,
        reasoningLevels: spec.thinking.length ? [{
          id: spec.thinking,
          label: spec.thinking,
          description: "Configured by Vibe model"
        }] : [],
        serviceTiers: [],
        speedTiers: []
      }];
    }
    var defaultModel = config.activeModel || setup.model || (models.length ? models[0].id : "");
    return {
      id: "vibe",
      label: "Vibe",
      status: setup.vibe.found && setup.vibeAcp.found ? "ready" : "missing",
      ready: setup.vibe.found === true && setup.vibeAcp.found === true,
      runtime: runtime,
      setup: compactVibeSetup(setup),
      source: {
        type: config.exists ? "config" : "fallback",
        path: config.path,
        ok: config.exists || models.length > 0,
        error: config.exists || models.length > 0 ? "" : "Vibe config has no models"
      },
      defaultModel: defaultModel,
      models: models,
      reasoningMode: "model_bound",
      supports: {
        resume: true,
        stop: true,
        images: false,
        mcp: setup.config.selected.valid || setup.config.user.hasConvertigoServer,
        reasoning: false,
        serviceTier: false
      }
    };
  }

  function canonicalFilePath(file) {
    if (file === null || typeof file === "undefined") {
      return "";
    }
    try {
      return String(file.getCanonicalPath());
    } catch (_ignoreCanonicalPath) {
      return filePath(file);
    }
  }

  function deleteDirectoryTree(file, removed, errors, nested) {
    if (file === null || !file.exists()) {
      return true;
    }
    if (file.isDirectory()) {
      var children = file.listFiles();
      if (children !== null) {
        for (var i = 0; i < children.length; i++) {
          if (!deleteDirectoryTree(children[i], removed, errors, true)) {
            return false;
          }
        }
      }
    }
    try {
      if (file["delete"]()) {
        if (nested !== true) {
          removed.push(filePath(file));
        }
        return true;
      }
    } catch (e) {
      errors.push({ path: filePath(file), error: String(e) });
      return false;
    }
    errors.push({ path: filePath(file), error: "delete returned false" });
    return false;
  }

  function removeDirectoryWhenEmpty(file, removed) {
    try {
      if (file !== null && file.isDirectory()) {
        var children = file.listFiles();
        if (children !== null && children.length === 0 && file["delete"]()) {
          removed.push(filePath(file));
        }
      }
    } catch (_ignoreRemoveEmptyDirectory) {}
  }

  function homeContainerPath(value) {
    var raw = trim(value);
    if (!raw.length) {
      return "";
    }
    var path = canonicalFilePath(new File(raw));
    if (!path.length) {
      return "";
    }
    var file = new File(path);
    var name = String(file.getName());
    if (name === "codex-home" || name === ".codex-home") {
      return canonicalFilePath(file.getParentFile());
    }
    return path;
  }

  function addProtectedHome(paths, value) {
    var path = homeContainerPath(value);
    if (path.length) {
      paths[path] = true;
    }
  }

  function homeContainsReferencedSession(file, sessionIds, depth) {
    if (file === null || !file.exists() || depth > 10) {
      return false;
    }
    if (file.isFile()) {
      var name = String(file.getName());
      for (var sessionId in sessionIds) {
        if (Object.prototype.hasOwnProperty.call(sessionIds, sessionId) && name.indexOf(sessionId) >= 0) {
          return true;
        }
      }
      return false;
    }
    var children = file.listFiles();
    if (children === null) {
      return false;
    }
    for (var i = 0; i < children.length; i++) {
      if (homeContainsReferencedSession(children[i], sessionIds, depth + 1)) {
        return true;
      }
    }
    return false;
  }

  function activeAgentStorageReferences(workspaceRoot) {
    var references = {
      conversationIds: {},
      homePaths: {},
      sessionIds: {},
      tombstones: []
    };
    var providers = ["codex", "vibe"];
    for (var providerIndex = 0; providerIndex < providers.length; providerIndex++) {
      var provider = providers[providerIndex];
      var usersRoot = new File(new File(new File(workspaceRoot, "agents"), provider), "users");
      if (!usersRoot.isDirectory()) {
        continue;
      }
      var userDirs = usersRoot.listFiles();
      if (userDirs === null) {
        continue;
      }
      for (var userIndex = 0; userIndex < userDirs.length; userIndex++) {
        var userDir = userDirs[userIndex];
        var conversationsDir = new File(userDir, "conversations");
        if (!conversationsDir.isDirectory()) {
          continue;
        }
        var conversationDirs = conversationsDir.listFiles();
        if (conversationDirs === null) {
          continue;
        }
        for (var conversationIndex = 0; conversationIndex < conversationDirs.length; conversationIndex++) {
          var conversationDir = conversationDirs[conversationIndex];
          var record = readJsonFile(new File(conversationDir, "conversation.json"));
          if (record === null) {
            continue;
          }
          if (record.deleted === true || trim(record.status).toLowerCase() === "deleted") {
            references.tombstones.push({
              dir: conversationDir,
              updatedAt: Number(record.updatedAt || record.createdAt || conversationDir.lastModified() || 0)
            });
            continue;
          }
          var conversationId = trim(record.conversationId || record.threadid || conversationDir.getName());
          if (conversationId.length) {
            references.conversationIds[conversationId] = true;
          }
          var externalSessionId = trim(record.externalSessionId || record.codexThreadId || record.sessionId);
          if (externalSessionId.length) {
            references.sessionIds[externalSessionId] = true;
          }
          if (provider === "codex" && conversationId.length) {
            var expected = new File(
              new File(
                new File(
                  new File(
                    new File(workspaceRoot, "agents/codex"),
                    "homes/users"
                  ),
                  userDir.getName()
                ),
                "conversations"
              ),
              stableId("conversation", conversationId)
            );
            addProtectedHome(references.homePaths, expected);
          }
          addProtectedHome(references.homePaths, record.codexHome || record.agentHome || "");
        }
      }
    }

    var registry = getRegistry();
    var iterator = registry.keySet().iterator();
    while (iterator.hasNext()) {
      var handle = String(iterator.next());
      var entry = registry.get(handle);
      if (entry && processAlive(entry.process)) {
        references.conversationIds[trim(entry.conversationId || handle)] = true;
        if (entry.home && entry.home.path) {
          addProtectedHome(references.homePaths, entry.home.path);
        }
      }
    }

    var pidDir = codexPidRegistryDir(workspaceRoot);
    if (pidDir !== null && pidDir.isDirectory()) {
      var pidFiles = pidDir.listFiles();
      if (pidFiles !== null) {
        for (var pidIndex = 0; pidIndex < pidFiles.length; pidIndex++) {
          var pidFile = pidFiles[pidIndex];
          var pidRecord = readJsonFile(pidFile);
          var pid = pidRecord === null ? 0 : Number(pidRecord.pid || 0);
          if (pid > 0 && processHandleAlive(pid)) {
            references.conversationIds[trim(pidRecord.handle)] = true;
            addProtectedHome(references.homePaths, pidRecord.codexHome || "");
          } else {
            try { pidFile["delete"](); } catch (_ignoreDeadCleanupPidFile) {}
          }
        }
      }
    }
    return references;
  }

  function cleanupConversationArtifacts(options, report) {
    var workspaceRoot = resolveWorkspaceRoot(options);
    var conversationId = trim(options.conversationId || options.threadid || options.handle);
    var handle = trim(options.handle || conversationId);
    var externalSessionId = trim(options.externalSessionId || options.codexThreadId || options.sessionId);
    var registry = getRegistry();
    var entry = handle.length ? registry.get(handle) : null;
    if (entry !== null && typeof entry !== "undefined") {
      stopEntry(entry, true);
    }

    if (handle.length) {
      var pidFile = codexPidFile(workspaceRoot, handle);
      if (pidFile !== null && pidFile.isFile()) {
        var pidRecord = readJsonFile(pidFile);
        var pid = pidRecord === null ? 0 : Number(pidRecord.pid || 0);
        if (pid > 0 && processHandleAlive(pid)) {
          destroyPidTree(pid);
        }
        deleteDirectoryTree(pidFile, report.removed, report.errors);
      }
    }

    var leaseFile = viewerDebugPortLeaseFile({
      workspaceRoot: workspaceRoot,
      conversationId: conversationId
    });
    if (leaseFile !== null) {
      deleteDirectoryTree(leaseFile, report.removed, report.errors);
    }

    var userSlugs = {};
    var hasUserSlug = false;
    var userId = trim(options.userId);
    if (userId.length) {
      userSlugs[userPathSlug(userId)] = true;
      hasUserSlug = true;
    }
    var explicitUserKey = trim(options.userKey);
    if (explicitUserKey.length) {
      userSlugs[safePathPart(explicitUserKey)] = true;
      hasUserSlug = true;
    }
    if (!hasUserSlug) {
      userSlugs.studio = true;
    }
    var sessionIds = {};
    if (externalSessionId.length) {
      sessionIds[externalSessionId] = true;
    }

    for (var userSlug in userSlugs) {
      if (!Object.prototype.hasOwnProperty.call(userSlugs, userSlug)) {
        continue;
      }
      var conversationsRoot = new File(
        new File(
          new File(
            new File(workspaceRoot, "agents/codex"),
            "homes/users"
          ),
          userSlug
        ),
        "conversations"
      );
      if (!conversationsRoot.isDirectory()) {
        continue;
      }
      var homes = conversationsRoot.listFiles();
      if (homes === null) {
        continue;
      }
      var expectedName = conversationId.length ? stableId("conversation", conversationId) : "";
      for (var homeIndex = 0; homeIndex < homes.length; homeIndex++) {
        var home = homes[homeIndex];
        var matchesConversation = expectedName.length && String(home.getName()) === expectedName;
        var matchesSession = externalSessionId.length && homeContainsReferencedSession(home, sessionIds, 0);
        if (matchesConversation || matchesSession) {
          deleteDirectoryTree(home, report.removed, report.errors);
        }
      }
      removeDirectoryWhenEmpty(conversationsRoot, report.removed);
    }
  }

  function cleanupOrphanedAgentStorage(options, report) {
    var workspaceRoot = resolveWorkspaceRoot(options);
    var current = now();
    var graceMs = intValue(
      options.orphanGraceSeconds,
      Math.floor(DEFAULT_STORAGE_ORPHAN_GRACE_MS / 1000),
      300,
      2592000
    ) * 1000;
    var references = activeAgentStorageReferences(workspaceRoot);
    var homesUsersRoot = new File(
      new File(
        new File(
          new File(workspaceRoot, "agents"),
          "codex"
        ),
        "homes"
      ),
      "users"
    );
    if (homesUsersRoot.isDirectory()) {
      var users = homesUsersRoot.listFiles();
      if (users !== null) {
        for (var userIndex = 0; userIndex < users.length; userIndex++) {
          var conversationsRoot = new File(users[userIndex], "conversations");
          if (!conversationsRoot.isDirectory()) {
            continue;
          }
          var homes = conversationsRoot.listFiles();
          if (homes === null) {
            continue;
          }
          for (var homeIndex = 0; homeIndex < homes.length; homeIndex++) {
            var home = homes[homeIndex];
            var homePath = canonicalFilePath(home);
            var protectedHome = references.homePaths[homePath] === true ||
              homeContainsReferencedSession(home, references.sessionIds, 0);
            var age = current - Number(home.lastModified() || 0);
            if (!protectedHome && age >= graceMs) {
              deleteDirectoryTree(home, report.removed, report.errors);
            } else {
              report.kept.push({
                path: filePath(home),
                reason: protectedHome ? "referenced" : "grace",
                ageMs: age
              });
            }
          }
          removeDirectoryWhenEmpty(conversationsRoot, report.removed);
        }
      }
    }

    for (var tombstoneIndex = 0; tombstoneIndex < references.tombstones.length; tombstoneIndex++) {
      var tombstone = references.tombstones[tombstoneIndex];
      if (current - tombstone.updatedAt >= graceMs) {
        deleteDirectoryTree(tombstone.dir, report.removed, report.errors);
      }
    }

    var leasesDir = new File(new File(new File(workspaceRoot, "agents"), "codex"), "viewer-debug-ports");
    if (leasesDir.isDirectory()) {
      var leases = leasesDir.listFiles();
      if (leases !== null) {
        for (var leaseIndex = 0; leaseIndex < leases.length; leaseIndex++) {
          var leaseFile = leases[leaseIndex];
          var lease = readJsonFile(leaseFile);
          var leaseConversationId = trim(lease && lease.conversationId);
          var leaseAge = current - Number((lease && lease.createdAt) || leaseFile.lastModified() || 0);
          if (references.conversationIds[leaseConversationId] !== true && leaseAge >= graceMs) {
            deleteDirectoryTree(leaseFile, report.removed, report.errors);
          }
        }
      }
      removeDirectoryWhenEmpty(leasesDir, report.removed);
    }
  }

  C8O.agentBridge.cleanupStorage = function (options) {
    options = optionsWithRequestFallbacks(options || {});
    var workspaceRoot = resolveWorkspaceRoot(options);
    var report = {
      ok: true,
      status: "cleaned",
      workspaceRoot: workspaceRoot,
      removed: [],
      kept: [],
      errors: [],
      timestamp: now()
    };
    var exactConversation = trim(options.conversationId || options.threadid || options.handle).length > 0;
    var force = boolValue(options.force, exactConversation);
    var intervalMs = intValue(
      options.intervalSeconds,
      Math.floor(DEFAULT_STORAGE_CLEANUP_INTERVAL_MS / 1000),
      300,
      2592000
    ) * 1000;
    var marker = new File(new File(new File(workspaceRoot, "agents"), "codex"), STORAGE_CLEANUP_FILE);
    if (!exactConversation && !force) {
      var markerState = readJsonFile(marker);
      var nextCleanupAt = markerState === null ? 0 : Number(markerState.nextCleanupAt || 0);
      if (nextCleanupAt > report.timestamp) {
        report.status = "skipped";
        report.nextCleanupAt = nextCleanupAt;
        return report;
      }
    }
    if (exactConversation) {
      cleanupConversationArtifacts(options, report);
    } else {
      cleanupOrphanedAgentStorage(options, report);
      try {
        writeJsonFile(marker, {
          lastCleanupAt: report.timestamp,
          nextCleanupAt: report.timestamp + intervalMs,
          removedCount: report.removed.length,
          errorCount: report.errors.length
        });
        report.nextCleanupAt = report.timestamp + intervalMs;
      } catch (markerError) {
        report.errors.push({ path: filePath(marker), error: String(markerError) });
      }
    }
    report.ok = report.errors.length === 0;
    report.status = report.ok ? "cleaned" : "partial";
    return report;
  };

  C8O.agentBridge.settings = function (options) {
    options = optionsWithRequestFallbacks(options);
    var presenceOnly = boolValue(options.runtimePresenceOnly, false);
    var rawProvider = trim(options.provider || options.agent || "").toLowerCase();
    var provider = (!rawProvider.length || rawProvider === "all" || rawProvider === "*" || rawProvider === "any") ? "" : normalizeProvider(rawProvider);
    var providers = [];
    if (!provider.length || provider === "codex") {
      providers.push(codexSettings(options));
    }
    if (!provider.length || provider === "vibe") {
      providers.push(vibeSettings(options));
    }
    var settingsWorkspaceRoot = trim(options.workspaceRoot);
    if (!settingsWorkspaceRoot.length) {
      for (var workspaceIndex = 0; workspaceIndex < providers.length; workspaceIndex++) {
        settingsWorkspaceRoot = trim(providers[workspaceIndex] && providers[workspaceIndex].setup && providers[workspaceIndex].setup.workspaceRoot);
        if (settingsWorkspaceRoot.length) {
          break;
        }
      }
    }
    if (presenceOnly) {
      for (var cachedProviderIndex = 0; cachedProviderIndex < providers.length; cachedProviderIndex++) {
        providers[cachedProviderIndex] = hydrateProviderSettingsFromCache(settingsWorkspaceRoot, providers[cachedProviderIndex]);
      }
    } else {
      writePersistentProviderSettingsCache(settingsWorkspaceRoot, providers);
    }
    var defaultProvider = providers.length ? providers[0] : null;
    for (var i = 0; i < providers.length; i++) {
      if (providers[i].ready === true) {
        defaultProvider = providers[i];
        break;
      }
    }
    var defaults = {
      provider: defaultProvider !== null ? defaultProvider.id : "",
      model: defaultProvider !== null ? defaultProvider.defaultModel : "",
      reasoning: ""
    };
    if (defaultProvider !== null) {
      defaults.reasoning = providerDefaultReasoning(defaultProvider);
    }
    var storageCleanup = C8O.agentBridge.cleanupStorage({
      workspaceRoot: settingsWorkspaceRoot
    });
    return {
      ok: providers.length > 0,
      status: providers.length ? "ready" : "empty",
      defaults: defaults,
      providers: providers,
      storageCleanup: {
        status: storageCleanup.status,
        removedCount: storageCleanup.removed.length,
        errorCount: storageCleanup.errors.length,
        nextCleanupAt: storageCleanup.nextCleanupAt || 0
      },
      timestamp: now()
    };
  };

  function envKeys(env) {
    var keys = [];
    for (var key in env) {
      if (Object.prototype.hasOwnProperty.call(env, key)) {
        keys.push(String(key));
      }
    }
    keys.sort();
    return keys;
  }

  function normalizeCredentialsPolicy(value) {
    var policy = trim(value).toLowerCase();
    if (!policy.length) {
      return "explicit";
    }
    if (policy === "user" || policy === "home" || policy === "user_home" || policy === "userhome") {
      return "user-home";
    }
    if (policy === "vibe" || policy === "vibe_home" || policy === "vibehome") {
      return "vibe-home";
    }
    if (policy === "none" || policy === "off") {
      return "explicit";
    }
    if (policy === "explicit" || policy === "user-home" || policy === "vibe-home" || policy === "auto") {
      return policy;
    }
    return "explicit";
  }

  function mergeEnvFile(env, file, sourceName) {
    var parsed = readEnvFile(file);
    var source = {
      source: sourceName,
      path: parsed.path,
      exists: parsed.exists,
      keys: parsed.keys,
      injectedKeys: []
    };
    for (var i = 0; i < parsed.keys.length; i++) {
      var key = parsed.keys[i];
      if (!Object.prototype.hasOwnProperty.call(env, key) || env[key] === null || typeof env[key] === "undefined" || String(env[key]).length === 0) {
        env[key] = parsed.values[key];
        source.injectedKeys.push(key);
      }
    }
    return source;
  }

  function applyCredentialsPolicy(env, options, vibeHome) {
    var policy = normalizeCredentialsPolicy(options.credentialsPolicy || options.envPolicy);
    var report = {
      policy: policy,
      sources: [],
      injectedKeys: []
    };
    var userHome = String(System.getProperty("user.home"));
    if (policy === "vibe-home" || policy === "auto") {
      report.sources.push(mergeEnvFile(env, new File(vibeHome, ".env"), "vibe-home"));
    }
    if (policy === "user-home" || policy === "auto") {
      report.sources.push(mergeEnvFile(env, new File(new File(userHome, ".vibe"), ".env"), "user-home"));
    }
    var collected = {};
    for (var i = 0; i < report.sources.length; i++) {
      var injected = report.sources[i].injectedKeys || [];
      for (var j = 0; j < injected.length; j++) {
        collected[injected[j]] = true;
      }
    }
    for (var key in collected) {
      if (Object.prototype.hasOwnProperty.call(collected, key)) {
        report.injectedKeys.push(key);
      }
    }
    report.injectedKeys.sort();
    return report;
  }

  function publicHomeInfo(home) {
    home = home || {};
    return {
      scope: home.scope || "",
      path: home.path || "",
      explicit: home.explicit === true,
      userIdSet: !!trim(home.userId),
      conversationId: home.conversationId || "",
      projectId: home.projectId || "",
      error: home.error || ""
    };
  }

  function createEntry(handle, provider, protocol, command, cwd, env, ttlMillis, home, credentials, model) {
    return {
      handle: handle,
      provider: normalizeProvider(provider),
      model: trim(model),
      protocol: protocol || "acp",
      command: command.slice(0),
      cwd: cwd,
      envKeys: envKeys(env),
      home: publicHomeInfo(home),
      credentials: credentials || { policy: "explicit", sources: [], injectedKeys: [] },
      process: null,
      pid: 0,
      pidFile: "",
      workspaceRoot: "",
      writer: null,
      stdoutThread: null,
      stderrThread: null,
      codexSessionWatcherThread: null,
      codexSessionFile: "",
      codexSessionFileLineCount: 0,
      codexSessionWatchStartedAt: 0,
      codexSeenLineKeys: {},
      codexSeenLineOrder: [],
      events: Collections.synchronizedList(new ArrayList()),
      firstIndex: 0,
      nextIndex: 0,
      nextRequestId: 1,
      pending: new ConcurrentHashMap(),
      createdAt: now(),
      lastAccess: now(),
      ttlMillis: ttlMillis,
      status: "starting",
      phase: "spawn",
      sessionId: "",
      codexThreadId: "",
      codexRuntimeMode: "",
      activeTurnId: "",
      init: null,
      session: null,
      lastError: "",
      lastCodexProgressMessage: "",
      lastCodexAnswerChunk: "",
      codexTurnEnded: false,
      closedAt: 0
    };
  }

  function pushEvent(entry, type, data) {
    var event = {
      index: entry.nextIndex++,
      at: now(),
      type: String(type),
      data: data || {}
    };
    entry.events.add(event);
    while (entry.events.size() > MAX_EVENT_BUFFER) {
      entry.events.remove(0);
      entry.firstIndex++;
    }
    entry.lastAccess = now();
    return event;
  }

  function processAlive(process) {
    if (process === null || typeof process === "undefined") {
      return false;
    }
    try {
      return process.isAlive();
    } catch (_ignoreIsAlive) {
      try {
        process.exitValue();
        return false;
      } catch (_notExited) {
        return true;
      }
    }
  }

  function processPid(process) {
    try {
      if (process !== null && typeof process !== "undefined" && process.pid) {
        return Number(process.pid());
      }
    } catch (_ignoreProcessPid) {}
    return 0;
  }

  function processHandleForPid(pid) {
    var numericPid = Number(pid || 0);
    if (!numericPid) {
      return null;
    }
    try {
      var optional = ProcessHandle.of(java.lang.Long.valueOf(String(Math.floor(numericPid))));
      if (optional !== null && optional.isPresent()) {
        return optional.get();
      }
    } catch (_ignoreProcessHandleForPid) {}
    return null;
  }

  function processHandleAlive(pid) {
    var handle = processHandleForPid(pid);
    if (handle === null) {
      return false;
    }
    try {
      return handle.isAlive();
    } catch (_ignoreProcessHandleAlive) {
      return false;
    }
  }

  function destroyProcessHandle(handle, force) {
    if (handle === null) {
      return false;
    }
    try {
      if (force === true) {
        return handle.destroyForcibly();
      }
      return handle.destroy();
    } catch (_ignoreDestroyProcessHandle) {
      return false;
    }
  }

  function destroyPidTree(pid) {
    var handle = processHandleForPid(pid);
    if (handle === null) {
      return false;
    }
    var descendants = new ArrayList();
    try {
      var iterator = handle.descendants().iterator();
      while (iterator.hasNext()) {
        descendants.add(iterator.next());
      }
    } catch (_ignoreDescendants) {}
    for (var i = descendants.size() - 1; i >= 0; i--) {
      destroyProcessHandle(descendants.get(i), false);
    }
    destroyProcessHandle(handle, false);
    try {
      Thread.sleep(500);
    } catch (_ignoreDestroySleep) {}
    for (var j = descendants.size() - 1; j >= 0; j--) {
      var child = descendants.get(j);
      try {
        if (child.isAlive()) {
          destroyProcessHandle(child, true);
        }
      } catch (_ignoreForceChild) {}
    }
    try {
      if (handle.isAlive()) {
        destroyProcessHandle(handle, true);
      }
    } catch (_ignoreForceHandle) {}
    return true;
  }

  function codexPidRegistryDir(workspaceRoot) {
    var root = trim(workspaceRoot);
    if (!root.length) {
      root = engineWorkspaceRoot();
    }
    if (!root.length) {
      return null;
    }
    return new File(new File(new File(root, "agents"), "codex"), "app-server-pids");
  }

  function codexPidFile(workspaceRoot, handle) {
    var dir = codexPidRegistryDir(workspaceRoot);
    if (dir === null) {
      return null;
    }
    return new File(dir, safePathPart(handle) + ".json");
  }

  function registryContainsPid(pid) {
    var registry = getRegistry();
    var iterator = registry.keySet().iterator();
    while (iterator.hasNext()) {
      var key = String(iterator.next());
      var entry = registry.get(key);
      if (entry && Number(entry.pid || 0) === Number(pid || 0) && processAlive(entry.process)) {
        return true;
      }
    }
    return false;
  }

  function writeEntryPidFile(entry) {
    if (!entry || entry.protocol !== "codex-app-server") {
      return;
    }
    var pid = processPid(entry.process);
    if (!pid) {
      return;
    }
    entry.pid = pid;
    if (!trim(entry.pidFile).length) {
      var file = codexPidFile(entry.workspaceRoot || "", entry.handle);
      entry.pidFile = file === null ? "" : filePath(file);
    }
    if (!trim(entry.pidFile).length) {
      return;
    }
    writeJsonFile(new File(entry.pidFile), {
      provider: entry.provider,
      protocol: entry.protocol,
      handle: entry.handle,
      pid: pid,
      command: entry.command,
      cwd: entry.cwd,
      workspaceRoot: entry.workspaceRoot || "",
      codexHome: entry.home && entry.home.path ? entry.home.path : "",
      createdAt: entry.createdAt,
      lastAccess: entry.lastAccess,
      ttlMs: entry.ttlMillis
    });
  }

  function deleteEntryPidFile(entry) {
    try {
      if (entry && trim(entry.pidFile).length) {
        new File(entry.pidFile)["delete"]();
      }
    } catch (_ignoreDeleteEntryPidFile) {}
  }

  function sweepCodexAppServerPidFiles(workspaceRoot, maxIdleMs) {
    var dir = codexPidRegistryDir(workspaceRoot);
    var result = { stopped: [], kept: [] };
    if (dir === null || !dir.isDirectory()) {
      return result;
    }
    var files = dir.listFiles();
    if (files === null) {
      return result;
    }
    var current = now();
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file.isFile() || String(file.getName()).indexOf(".json") === -1) {
        continue;
      }
      var record = readJsonFile(file);
      var pid = record ? Number(record.pid || 0) : 0;
      if (!pid || !processHandleAlive(pid)) {
        try { file["delete"](); } catch (_ignoreDeleteDeadPidFile) {}
        continue;
      }
      if (registryContainsPid(pid)) {
        result.kept.push({ pid: pid, handle: record.handle || "", reason: "registered" });
        continue;
      }
      var lastAccess = Number(record.lastAccess || record.createdAt || file.lastModified() || 0);
      var idle = current - lastAccess;
      if (maxIdleMs <= 0 || idle > maxIdleMs) {
        destroyPidTree(pid);
        try { file["delete"](); } catch (_ignoreDeleteStoppedPidFile) {}
        result.stopped.push({ pid: pid, handle: record.handle || "", idleMs: idle, reason: "orphan" });
      } else {
        result.kept.push({ pid: pid, handle: record.handle || "", idleMs: idle, reason: "grace" });
      }
    }
    return result;
  }

  function writeJson(entry, message) {
    if (entry && entry.protocol === "codex-app-server" && message && message.jsonrpc) {
      delete message.jsonrpc;
    }
    var text = JSON.stringify(message);
    entry.writer.write(text);
    entry.writer.newLine();
    entry.writer.flush();
  }

  function sendJsonResponse(entry, id, result) {
    try {
      writeJson(entry, {
        jsonrpc: "2.0",
        id: id,
        result: result || {}
      });
      pushEvent(entry, "acp/client_response", { id: id, result: result || {} });
    } catch (e) {
      entry.lastError = String(e);
      pushEvent(entry, "error", { message: String(e), phase: "client_response" });
    }
  }

  function sendJsonError(entry, id, code, message) {
    try {
      writeJson(entry, {
        jsonrpc: "2.0",
        id: id,
        error: {
          code: code,
          message: String(message)
        }
      });
    } catch (e) {
      entry.lastError = String(e);
    }
  }

  function choosePermissionOption(options) {
    if (!options || !options.length) {
      return "";
    }
    var first = "";
    var preferred = "";
    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      var optionId = String(option.optionId || option.option_id || option.id || "");
      var name = String(option.name || "").toLowerCase();
      var kind = String(option.kind || "").toLowerCase();
      if (!first.length) {
        first = optionId;
      }
      if (optionId === "allow_once" || optionId === "allow") {
        return optionId;
      }
      if (!preferred.length && (kind.indexOf("allow") >= 0 || name.indexOf("allow") >= 0 || name.indexOf("approve") >= 0)) {
        preferred = optionId;
      }
    }
    return preferred || first;
  }

  function handleAgentRequest(entry, message) {
    var method = String(message.method || "");
    var params = message.params || {};
    pushEvent(entry, "acp/request_from_agent", { method: method, id: message.id || null, params: params });

    if (method === "session/request_permission") {
      var optionId = choosePermissionOption(params.options || []);
      if (optionId.length) {
        pushEvent(entry, "permission/selected", {
          optionId: optionId,
          toolCall: params.toolCall || params.tool_call || null
        });
        sendJsonResponse(entry, message.id, {
          outcome: {
            outcome: "selected",
            optionId: optionId
          }
        });
      } else {
        pushEvent(entry, "permission/cancelled", {
          toolCall: params.toolCall || params.tool_call || null
        });
        sendJsonResponse(entry, message.id, {
          outcome: {
            outcome: "cancelled"
          }
        });
      }
      return;
    }

    if (method === "fs/read_text_file" || method === "fs/write_text_file" || method.indexOf("terminal/") === 0) {
      sendJsonError(entry, message.id, -32601, "ACP client capability is disabled: " + method);
      return;
    }

    sendJsonError(entry, message.id, -32601, "Unsupported ACP client method: " + method);
  }

  function extractContentText(content) {
    if (content === null || typeof content === "undefined") {
      return "";
    }
    if (typeof content === "string") {
      return content;
    }
    if (typeof content.text !== "undefined") {
      return String(content.text);
    }
    if (content.content && typeof content.content.text !== "undefined") {
      return String(content.content.text);
    }
    try {
      return JSON.stringify(content);
    } catch (_ignoreStringify) {
      return String(content);
    }
  }

  function normalizeSessionUpdate(entry, params) {
    var update = params.update || params.sessionUpdate || params;
    var kind = String(update.sessionUpdate || update.session_update || "");
    var eventData = {
      sessionId: params.sessionId || params.session_id || entry.sessionId || "",
      update: update
    };

    if (kind === "agent_message_chunk") {
      eventData.text = extractContentText(update.content);
      pushEvent(entry, "answer/chunk", eventData);
      return;
    }
    if (kind === "agent_thought_chunk") {
      eventData.text = extractContentText(update.content);
      pushEvent(entry, "reasoning/chunk", eventData);
      return;
    }
    if (kind === "user_message_chunk") {
      eventData.text = extractContentText(update.content);
      pushEvent(entry, "user/chunk", eventData);
      return;
    }
    if (kind === "tool_call") {
      eventData.toolCallId = update.toolCallId || update.tool_call_id || "";
      eventData.title = update.title || "";
      eventData.status = update.status || "";
      pushEvent(entry, "tool/start", eventData);
      return;
    }
    if (kind === "tool_call_update") {
      eventData.toolCallId = update.toolCallId || update.tool_call_id || "";
      eventData.title = update.title || "";
      eventData.status = update.status || "";
      pushEvent(entry, "tool/update", eventData);
      return;
    }
    if (kind === "usage_update") {
      pushEvent(entry, "usage/update", eventData);
      return;
    }
    if (kind === "plan") {
      pushEvent(entry, "plan/update", eventData);
      return;
    }
    if (kind === "available_commands_update") {
      pushEvent(entry, "commands/update", eventData);
      return;
    }
    if (kind === "session_info_update") {
      pushEvent(entry, "session/update", eventData);
      return;
    }

    pushEvent(entry, "acp/session_update", eventData);
  }

  function handleAcpLine(entry, line, streamName) {
    var text = trim(line);
    if (!text.length) {
      return;
    }
    if (streamName !== "stdout" && streamName !== "codex-session") {
      pushEvent(entry, streamName, { line: text });
      return;
    }
    var message;
    try {
      message = JSON.parse(text);
    } catch (parseError) {
      pushEvent(entry, "stdout", { line: text });
      return;
    }

    if (typeof message.id !== "undefined" && (typeof message.result !== "undefined" || typeof message.error !== "undefined")) {
      var key = String(message.id);
      var pending = entry.pending.get(key);
      if (pending !== null && typeof pending !== "undefined") {
        pending.response = message;
        pending.done = true;
        pending.completedAt = now();
        if (pending.method === "session/prompt") {
          if (message.error) {
            pushEvent(entry, "turn/error", {
              requestId: message.id,
              method: pending.method,
              error: message.error
            });
          } else {
            pushEvent(entry, "turn/end", {
              requestId: message.id,
              method: pending.method,
              result: message.result || {}
            });
          }
        }
      }
      pushEvent(entry, message.error ? "acp/response_error" : "acp/response", {
        id: message.id,
        method: pending ? pending.method : "",
        response: message
      });
      return;
    }

    if (message.method) {
      if (String(message.method) === "session/update") {
        normalizeSessionUpdate(entry, message.params || {});
        return;
      }
      handleAgentRequest(entry, message);
      return;
    }

    pushEvent(entry, "acp/message", { message: message });
  }

  function handleProcessLine(entry, line, streamName) {
    if (entry.protocol === "codex-app-server") {
      handleCodexAppServerLine(entry, line, streamName);
      return;
    }
    if (entry.protocol === "codex-jsonl") {
      handleCodexLine(entry, line, streamName);
      return;
    }
    handleAcpLine(entry, line, streamName);
  }

  function startReaderThread(entry, stream, streamName) {
    var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
    var thread = new Thread(new Runnable({
      run: function () {
        try {
          var line;
          while ((line = reader.readLine()) !== null) {
            handleProcessLine(entry, String(line), streamName);
          }
        } catch (e) {
          if (entry.status !== "closed") {
            entry.lastError = String(e);
            pushEvent(entry, "error", { message: String(e), phase: streamName + "_reader" });
          }
        } finally {
          if (streamName === "stdout" && entry.status !== "closed" && entry.status !== "completed" && !processAlive(entry.process)) {
            entry.status = entry.status === "error" ? "error" : "exited";
            entry.closedAt = now();
            pushEvent(entry, "system/exit", {
              exitCode: getExitCode(entry.process)
            });
          }
        }
      }
    }), "ConvertigoAgentBridge-" + streamName + "-" + entry.handle);
    thread.setDaemon(true);
    thread.start();
    return thread;
  }

  function getExitCode(process) {
    try {
      return process.exitValue();
    } catch (_ignoreExit) {
      return null;
    }
  }

  function sendAcpRequest(entry, method, params) {
    var id = entry.nextRequestId++;
    var pending = {
      id: id,
      method: method,
      startedAt: now(),
      done: false,
      response: null,
      completedAt: 0
    };
    entry.pending.put(String(id), pending);
    writeJson(entry, {
      jsonrpc: "2.0",
      id: id,
      method: method,
      params: params || {}
    });
    pushEvent(entry, "acp/request", { id: id, method: method });
    return pending;
  }

  function waitForPending(entry, pending, timeoutMs, removeWhenDone) {
    var deadline = now() + timeoutMs;
    while (now() < deadline) {
      if (pending.done === true) {
        if (removeWhenDone) {
          entry.pending.remove(String(pending.id));
        }
        if (pending.response && pending.response.error) {
          var message = pending.response.error.message || JSON.stringify(pending.response.error);
          var error = new Error(String(message));
          error.acpError = pending.response.error;
          error.method = pending.method;
          throw error;
        }
        return pending.response ? pending.response.result || {} : {};
      }
      if (!processAlive(entry.process)) {
        throw new Error(entry.provider + " process exited while waiting for " + pending.method);
      }
      Thread.sleep(50);
    }
    throw new Error("Timeout while waiting for ACP response: " + pending.method);
  }

  function acpRequest(entry, method, params, timeoutMs) {
    var pending = sendAcpRequest(entry, method, params);
    return waitForPending(entry, pending, timeoutMs, true);
  }

  function buildMcpServers(mcpEndpoint) {
    return [{
      type: "http",
      name: "Convertigo",
      url: mcpEndpoint,
      headers: []
    }];
  }

  function statusOf(entry) {
    if (entry.process !== null && entry.status !== "closed" && entry.status !== "completed" && entry.status !== "error" && entry.status !== "exited" && !processAlive(entry.process)) {
      entry.status = "exited";
      entry.closedAt = entry.closedAt || now();
    }
    return {
      handle: entry.handle,
      provider: entry.provider,
      model: entry.model || "",
      reasoningEffort: entry.reasoningEffort || "",
      serviceTier: entry.serviceTier || "",
      protocol: entry.protocol,
      codexRuntimeMode: entry.codexRuntimeMode || "",
      status: entry.status,
      phase: entry.phase,
      alive: processAlive(entry.process),
      pid: Number(entry.pid || processPid(entry.process) || 0),
      cwd: entry.cwd,
      command: entry.command,
      envKeys: entry.envKeys,
      convertigoRevealMode: entry.convertigoRevealMode === true,
      browserDebugUrl: entry.browserDebugUrl || "",
      viewerDebugPort: Number(entry.viewerDebugPort || 0),
      playwrightCdpEndpoint: entry.playwrightCdpEndpoint || entry.viewerCdpEndpoint || "",
      home: entry.home,
      credentials: {
        policy: entry.credentials.policy,
        sources: entry.credentials.sources,
        injectedKeys: entry.credentials.injectedKeys
      },
      sessionId: entry.sessionId,
      codexThreadId: entry.codexThreadId || "",
      activeTurnId: entry.activeTurnId || "",
      codexSessionFile: entry.codexSessionFile || "",
      createdAt: entry.createdAt,
      lastAccess: entry.lastAccess,
      idleMs: now() - entry.lastAccess,
      ttlMs: entry.ttlMillis,
      firstCursor: entry.firstIndex,
      nextCursor: entry.nextIndex,
      pendingCount: entry.pending.size(),
      lastError: entry.lastError,
      closedAt: entry.closedAt
    };
  }

  function startProcess(entry, env) {
    var pb = new ProcessBuilder(toJavaList(entry.command));
    pb.directory(new File(entry.cwd));
    envObjectToMap(pb.environment(), env);
    entry.process = pb.start();
    entry.writer = new BufferedWriter(new OutputStreamWriter(entry.process.getOutputStream(), StandardCharsets.UTF_8));
    writeEntryPidFile(entry);
    entry.stdoutThread = startReaderThread(entry, entry.process.getInputStream(), "stdout");
    entry.stderrThread = startReaderThread(entry, entry.process.getErrorStream(), "stderr");
    startCodexSessionWatcher(entry);
  }

  C8O.agentBridge.events = function (options) {
    options = options || {};
    var handle = resolveHandle(options.handle);
    if (!handle.length) {
      return { ok: false, status: "error", error: "handle is required", timestamp: now() };
    }
    var entry = getRegistry().get(handle);
    if (entry === null || typeof entry === "undefined") {
      return { ok: false, status: "not_found", handle: handle, events: [], timestamp: now() };
    }

    var cursor = intValue(options.cursor, 0, 0, 2147483647);
    var limit = intValue(options.limit, DEFAULT_EVENT_LIMIT, 1, MAX_EVENT_LIMIT);
    var waitMs = intValue(options.waitMs, 25000, 0, 30000);
    var deadline = now() + waitMs;
    while (entry.nextIndex <= cursor && processAlive(entry.process) && now() < deadline) {
      Thread.sleep(100);
    }
    entry.lastAccess = now();

    var startCursor = cursor;
    var truncated = false;
    if (startCursor < entry.firstIndex) {
      startCursor = entry.firstIndex;
      truncated = true;
    }
    var offset = startCursor - entry.firstIndex;
    if (offset < 0) {
      offset = 0;
    }
    var events = [];
    var available = entry.events.size();
    for (var i = offset; i < available && events.length < limit; i++) {
      events.push(entry.events.get(i));
    }
    var nextCursor = events.length ? events[events.length - 1].index + 1 : startCursor;
    return {
      ok: true,
      status: "ok",
      handle: handle,
      cursor: cursor,
      nextCursor: nextCursor,
      firstCursor: entry.firstIndex,
      truncated: truncated,
      events: events,
      state: statusOf(entry),
      timestamp: now()
    };
  };

  C8O.agentBridge.status = function (options) {
    options = options || {};
    var handle = resolveHandle(options.handle);
    var registry = getRegistry();
    if (handle.length) {
      var entry = registry.get(handle);
      if (entry === null || typeof entry === "undefined") {
        return { ok: false, status: "not_found", handle: handle, timestamp: now() };
      }
      return { ok: true, status: "ok", handle: handle, state: statusOf(entry), timestamp: now() };
    }
    var handles = [];
    var iterator = registry.keySet().iterator();
    while (iterator.hasNext()) {
      var key = String(iterator.next());
      var item = registry.get(key);
      handles.push(statusOf(item));
    }
    return { ok: true, status: "ok", handles: handles, timestamp: now() };
  };

  function stopEntry(entry, removeFromRegistry) {
    try {
      if (entry.writer !== null) {
        entry.writer.close();
      }
    } catch (_ignoreWriterClose) {}
    try {
      if (entry.process !== null && processAlive(entry.process)) {
        entry.process.destroy();
        if (!entry.process.waitFor(2000, TimeUnit.MILLISECONDS)) {
          entry.process.destroyForcibly();
        }
      }
    } catch (_ignoreDestroy) {}
    deleteEntryPidFile(entry);
    entry.status = entry.status === "error" ? "error" : "closed";
    entry.closedAt = entry.closedAt || now();
    pushEvent(entry, "system/closed", {
      handle: entry.handle,
      exitCode: getExitCode(entry.process)
    });
    if (removeFromRegistry) {
      getRegistry().remove(entry.handle);
      forgetSessionHandle(entry.handle);
    }
  }

  C8O.agentBridge.sweepExpired = function (options) {
    options = options || {};
    var hardIdle = intValue(options.maxIdleSeconds, 0, 0, 86400) * 1000;
    var registry = getRegistry();
    var stopped = [];
    var kept = [];
    var iterator = registry.keySet().iterator();
    var current = now();
    while (iterator.hasNext()) {
      var handle = String(iterator.next());
      var entry = registry.get(handle);
      if (entry === null || typeof entry === "undefined") {
        continue;
      }
      var idle = current - entry.lastAccess;
      var expiredByTtl = entry.ttlMillis > 0 && idle > entry.ttlMillis;
      var expiredByHardIdle = hardIdle > 0 && idle > hardIdle;
      var dead = !processAlive(entry.process);
      if (expiredByTtl || expiredByHardIdle || dead) {
        var state = statusOf(entry);
        stopEntry(entry, true);
        stopped.push({
          handle: handle,
          reason: dead ? "dead" : "idle",
          idleMs: idle,
          state: state
        });
      } else {
        kept.push(statusOf(entry));
      }
    }
    return {
      ok: true,
      status: "ok",
      stopped: stopped,
      kept: kept,
      timestamp: current
    };
  };
