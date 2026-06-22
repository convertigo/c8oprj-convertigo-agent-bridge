// Common runtime, process registry, event buffer and shared helpers.
// Loaded by vibe_agent_bridge.js inside one Rhino scope.
  var REGISTRY_KEY = "ConvertigoAgentBridge.agentProcessRegistry.v1";
  var SESSION_HANDLE_ATTR = "ConvertigoAgentBridge.currentHandle";
  var SESSION_CONVERSATION_ATTR = "ConvertigoAgentBridge.currentConversationId";
  var FALLBACK_MCP_PATH = "/api/mcp";
  var DEFAULT_TTL_SECONDS = 3600;
  var DEFAULT_EVENT_LIMIT = 100;
  var MAX_EVENT_LIMIT = 500;
  var MAX_EVENT_BUFFER = 5000;

  var File = Packages.java.io.File;
  var FileOutputStream = Packages.java.io.FileOutputStream;
  var RandomAccessFile = Packages.java.io.RandomAccessFile;
  var BufferedReader = Packages.java.io.BufferedReader;
  var InputStreamReader = Packages.java.io.InputStreamReader;
  var OutputStreamWriter = Packages.java.io.OutputStreamWriter;
  var BufferedWriter = Packages.java.io.BufferedWriter;
  var ProcessBuilder = Packages.java.lang.ProcessBuilder;
  var Runnable = Packages.java.lang.Runnable;
  var Thread = Packages.java.lang.Thread;
  var System = Packages.java.lang.System;
  var UUID = Packages.java.util.UUID;
  var ArrayList = Packages.java.util.ArrayList;
  var ConcurrentHashMap = Packages.java.util.concurrent.ConcurrentHashMap;
  var LinkedHashMap = Packages.java.util.LinkedHashMap;
  var Collections = Packages.java.util.Collections;
  var TimeUnit = Packages.java.util.concurrent.TimeUnit;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var StandardCopyOption = Packages.java.nio.file.StandardCopyOption;
  var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
  var MessageDigest = Packages.java.security.MessageDigest;
  var ProcessUtils = Packages.com.twinsoft.convertigo.engine.util.ProcessUtils;

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

  function agentSkillInstructions(provider) {
    return [
      "# Convertigo Agent Instructions",
      "",
      "You are running inside a Convertigo-integrated local agent session.",
      "",
      "- Automatically follow the Convertigo Generalist workflow for Convertigo project work.",
      "- Use the Convertigo MCP/tools whenever you need to inspect, modify, save, reload, or validate Convertigo projects.",
      "- Work on the selected project unless the user explicitly asks for another project.",
      "- Prefer Convertigo objects and MCP operations. Do not edit generated folders such as `_private/ionic`, `DisplayObjects`, `dist`, or build outputs.",
      "- Reply to the user in their language. Keep progress updates short and factual, and never expose hidden reasoning.",
      "- When you change a project, validate the result with the available Convertigo tools before claiming completion.",
      "",
      "The synchronized Convertigo MCP knowledge pack is available in `skills/convertigo-mcp/`.",
      "Start with `skills/convertigo-mcp/AGENT.md` and `skills/convertigo-mcp/TOOLS.md`, then read only the prompt or resource files relevant to the task.",
      "",
      "Provider: " + providerLabel(provider)
    ].join("\n");
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

  function patchCodexMcpConfigText(existingText, mcpEndpoint) {
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = splitTextLines(text);
    var range = findTomlSectionRange(lines, "mcp_servers.convertigo");
    var urlLine = 'url = "' + tomlEscape(mcpEndpoint) + '"';
    var timeoutLine = "startup_timeout_sec = 60";
    var status = "unchanged";

    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[mcp_servers.convertigo]");
      lines.push(urlLine);
      lines.push(timeoutLine);
      status = text.length ? "updated" : "created";
      return {
        status: status,
        text: lines.join("\n").replace(/\n+$/, "\n")
      };
    }

    var sectionLines = lines.slice(range.start, range.end);
    var replacedUrl = false;
    var replacedTimeout = false;
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
    var nextText = lines.slice(0, range.start).concat(sectionLines).concat(lines.slice(range.end)).join("\n").replace(/\n+$/, "\n");
    if (nextText === text.replace(/\n+$/, "\n")) {
      status = "unchanged";
    }
    return {
      status: status,
      text: nextText
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
      "## Mandatory bootstrap",
      "",
      "1. Call `resources/list`.",
      "2. If the caller surface exposes it, call `prompts/list`.",
      "3. Read `convertigo://capabilities`.",
      "4. Read `convertigo://recipes/quickstart`.",
      "5. Read `convertigo://resources/convertigo-start`.",
      "6. Only then decide the route:",
      "   - Standard SQL CRUD + starter NGX UI: read `convertigo://resources/convertigo-crud-fastpath` and use `convertigo-crud-fastpath`.",
      "   - Existing deterministic CRUD project edits: also read `convertigo://resources/convertigo-crud-edit-fastpath`, then stay on the CRUD rail without replaying the new-project bootstrap.",
      "   - Non-CRUD work or tasks outside the deterministic rail: stay exploratory and follow `convertigo-quickstart`.",
      "7. Do not call `rag-query` before the start guide and the chosen recipe were read.",
      "8. If the user explicitly wants MCP-only work or the starting workspace is empty/non-relevant, do not inspect the local shell workspace before the MCP route decision is made.",
      "",
      "## CRUD routing",
      "",
      "- Do not ask the user to choose `upsert-crud`.",
      "- Decide it yourself: use the CRUD rail only when the task is a standard SQL CRUD + starter NGX UI fit.",
      "- Generic CRUD UI default: `ui.variant=entity-pages`.",
      "- CRM-specific UI default: `ui.variant=master-detail`.",
      "- For a new UI project, validate the name, run `marketplace-import` with that exact name, open the viewer immediately with `mobile-builder-open`, then continue with `upsert-crud` and the staged UI kit.",
      "- For an existing deterministic CRUD project that is already green, use the edit rail: `crud-status` -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open` -> final `crud-proof(viewerUrl)` -> optional `project-save`.",
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
      "- Do not invent prefixes, suffixes, or dates.",
      "- If the requested name collides with an existing project, surface the collision explicitly instead of renaming it.",
      "",
      "## Viewer rule",
      "",
      "- In dev, `mobile-builder-open` serves the live app from the viewer root. Prefer `viewerHomeUrl`, or fall back to `viewerBaseUrl`.",
      "- Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
      "- In prod, the application URL is `.../DisplayObjects/mobile/home`.",
      "- If `mobile-builder-open` reports `compile_error`, treat that as a generator or source-object issue. Do not patch generated runtime sources.",
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

  function setupCodexGeneralist(options, homePath, mcpEndpoint) {
    var report = {
      attempted: false,
      ok: true,
      provider: "codex",
      source: "ConvertigoMCP._setupCodex-compatible",
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
        "Use the generated convertigo-generalist skill for general Convertigo work."
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
      report.message = "Convertigo Generalist setup disabled by request";
      return report;
    }
    report.attempted = true;
    try {
      var codexHome = new File(effectiveCodexHomePath(homePath));
      var skillFile = new File(new File(new File(codexHome, "skills"), "convertigo-generalist"), "SKILL.md");
      var configFile = new File(codexHome, "config.toml");
      var skillWrite = writeManagedTextFile(skillFile, buildConvertigoGeneralistSkill(report.resolvedMcpUrl), report.dryRun);
      var existingConfig = readTextFile(configFile);
      var patchedConfig = patchCodexMcpConfigText(existingConfig, report.resolvedMcpUrl);
      if (patchedConfig.status !== "unchanged" && report.dryRun !== true) {
        writeTextFile(configFile, patchedConfig.text);
      }
      report.skillStatus = skillWrite.status;
      report.configStatus = patchedConfig.status;
      report.resolvedCodexHome = filePath(codexHome);
      report.target = report.resolvedCodexHome;
      report.skillPath = filePath(skillFile);
      if (skillWrite.status === "unchanged") {
        report.reused.push("skills/convertigo-generalist/SKILL.md");
      } else {
        report.generated.push("skills/convertigo-generalist/SKILL.md");
      }
      if (patchedConfig.status === "unchanged") {
        report.reused.push("config.toml");
      } else {
        report.generated.push("config.toml");
      }
      report.message = "Convertigo Generalist skill configured";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to configure Convertigo Generalist skill";
    }
    return report;
  }

  function installAgentSkills(options, provider, homePath) {
    if (normalizeProvider(provider) === "codex") {
      return setupCodexGeneralist(options || {}, homePath, resolveMcpEndpoint(options || {}));
    }
    var report = {
      attempted: false,
      ok: true,
      provider: normalizeProvider(provider),
      source: "",
      target: "",
      copied: [],
      generated: [],
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
      writeTextFile(new File(homeDir, "AGENTS.md"), agentSkillInstructions(provider));
      report.generated.push("AGENTS.md");
      report.message = "Convertigo MCP skills synchronized";
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      report.message = "Unable to synchronize Convertigo MCP skills";
    }
    return report;
  }

  function appendCodexConvertigoMcpConfig(configFile, mcpEndpoint) {
    var endpoint = trim(mcpEndpoint) || resolveMcpEndpoint({});
    var marker = "[mcp_servers.convertigo]";
    var text = configFile.exists() ? readTextFile(configFile) : "";
    if (!text.length) {
      text = [
        "# Generated by ConvertigoAgentBridge.",
        'preferred_auth_method = "chat"',
        "",
        marker,
        'url = "' + endpoint.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
        "startup_timeout_sec = 60",
        "enabled = true",
        ""
      ].join("\n");
      writeTextFile(configFile, text);
      return true;
    }
    if (text.indexOf(marker) >= 0) {
      return false;
    }
    text += (text.lastIndexOf("\n") === text.length - 1 ? "" : "\n") + [
      "",
      "# Added by ConvertigoAgentBridge.",
      marker,
      'url = "' + endpoint.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
      "startup_timeout_sec = 60",
      "enabled = true",
      ""
    ].join("\n");
    writeTextFile(configFile, text);
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

  function bootstrapCodexHome(options, homePath, mcpEndpoint) {
    var report = {
      attempted: false,
      ok: true,
      home: trim(homePath),
      copied: [],
      reused: [],
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
      copyCodexUserFileIfMissing(userCodex, homeDir, "auth.json", report);
      copyCodexUserFileIfMissing(userCodex, homeDir, "auth.json.api", report);
      copyCodexUserFileIfMissing(userCodex, homeDir, "installation_id", report);
      var configFile = new File(homeDir, "config.toml");
      if (appendCodexConvertigoMcpConfig(configFile, mcpEndpoint)) {
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
    var id = trim(options.projectId);
    if (id.length) {
      return id;
    }
    try {
      if (context && context.project && context.project.getName) {
        return String(context.project.getName());
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
      var userBase = childPath(childPath(root, "users"), stableId("user", user));
      userBase = appendProjectPath(userBase, project);
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
      convBase = childPath(childPath(root, "users"), stableId("user", user));
      convBase = appendProjectPath(convBase, project);
      convBase = childPath(childPath(convBase, "conversations"), stableId("conversation", conv));
    } else {
      convBase = childPath(childPath(root, "conversations"), stableId("conversation", conv));
      convBase = appendProjectPath(convBase, project);
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

    var scope = normalizeCodexHomeScope(options.codexHomeScope || options.homeScope || options.scope);
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
      var userBase = childPath(childPath(root, "users"), stableId("user", user));
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
      convBase = childPath(childPath(root, "users"), stableId("user", user));
      convBase = appendProjectPath(convBase, project);
      convBase = childPath(childPath(convBase, "conversations"), stableId("conversation", conv));
    } else {
      convBase = childPath(childPath(root, "conversations"), stableId("conversation", conv));
      convBase = appendProjectPath(convBase, project);
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

  function codexPackageSpec(options) {
    var name = trim(options.codexPackage || options.packageName) || "@openai/codex";
    var version = trim(options.codexVersion || options.packageVersion || options.version) || "latest";
    if (!version.length) {
      return name;
    }
    return name + "@" + version;
  }

  function runNpmInstall(npm, packageSpec, prefixDir, options) {
    var npmDir = parentPath(npm.path);
    var paths = npmDir.length ? npmDir : "";
    var normalizedNpmDir = npmDir.replace(/\\/g, "/");
    var npmMarker = "/lib/node_modules/npm/bin";
    var markerIndex = normalizedNpmDir.indexOf(npmMarker);
    if (markerIndex > 0) {
      var nodeBinDir = normalizedNpmDir.substring(0, markerIndex) + "/bin";
      paths = nodeBinDir + (paths.length ? String(File.pathSeparator) + paths : "");
    }
    var command = toJavaList(["npm", "install", "--prefix", prefixDir, packageSpec]);
    var pb = ProcessUtils.getNpmProcessBuilder(paths, command);
    return runProcessBuilder(pb, {
      cwd: prefixDir,
      timeoutMs: intValue(options.codexInstallTimeoutMs || options.npmInstallTimeoutMs, 600000, 30000, 1800000)
    });
  }

  function ensureCodexRuntime(options) {
    options = options || {};
    var before = detectCodexRuntime(options);
    var force = boolValue(options.forceCodexInstall || options.forceInstall || options.force, false);
    var workspaceFirstOption = typeof options.workspaceInstallFirst !== "undefined" ? options.workspaceInstallFirst : options.preferWorkspaceInstall;
    var workspaceFirst = boolValue(typeof workspaceFirstOption === "undefined" ? true : workspaceFirstOption, true);
    if (before.codex.found && !force && (!workspaceFirst || commandPathStartsWith(before.codex, before.installDir))) {
      return {
        attempted: false,
        installed: false,
        reused: true,
        method: "existing",
        package: "",
        npm: null,
        before: before.codex,
        codex: before.codex,
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
        return {
          attempted: true,
          installed: false,
          reused: true,
          method: "existing",
          package: "",
          npm: null,
          before: before.codex,
          codex: before.codex,
          steps: steps,
          timestamp: now()
        };
      }
      var fallbackCodex = before.codex.found && !commandPathStartsWith(before.codex, before.installDir) ? before.codex : null;
      try {
        ensureDirectory(new File(before.installDir));
        var npmPrefix = childPath(before.installDir, "npm");
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
      stdout: "",
      stderr: "",
      error: ""
    };
    if (command.found) {
      var env = {};
      var path = nodeRuntimeSearchPath(options);
      if (path.length) {
        env.PATH = path + String(File.pathSeparator) + String(System.getenv("PATH") || "");
      }
      if (codexHome.path.length) {
        env.CODEX_HOME = codexHome.path;
      }
      var mcpProbe = runCommand([command.path, "mcp", "list"], { timeoutMs: 15000, env: env });
      mcp.checked = true;
      mcp.ok = mcpProbe.ok;
      mcp.stdout = mcpProbe.stdout;
      mcp.stderr = mcpProbe.stderr;
      mcp.error = mcpProbe.error;
      var mcpText = String((mcpProbe.stdout || "") + "\n" + (mcpProbe.stderr || "")).toLowerCase();
      mcp.hasConvertigo = mcpText.indexOf("convertigo") >= 0;
    }
    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      codexHome: codexHome.path,
      home: publicHomeInfo(codexHome),
      mcpEndpoint: resolveMcpEndpoint(options),
      codex: command,
      mcp: mcp
    };
  }

  function codexRuntimeEnv(options, codexHomePath) {
    var env = {};
    var path = nodeRuntimeSearchPath(options || {});
    if (path.length) {
      env.PATH = path + String(File.pathSeparator) + String(System.getenv("PATH") || "");
    }
    if (trim(codexHomePath).length) {
      env.CODEX_HOME = trim(codexHomePath);
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

  function codexSettings(options) {
    options = options || {};
    var setup = detectCodexRuntime(options);
    var source = {
      type: "cli",
      command: setup.codex.found ? setup.codex.path + " debug models" : "codex debug models",
      ok: false,
      exitCode: -1,
      error: "",
      stderr: ""
    };
    var models = [];
    if (setup.codex.found) {
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
    } else {
      source.error = "Codex CLI not found";
    }
    var defaultModel = models.length ? models[0].id : "";
    return {
      id: "codex",
      label: "Codex",
      status: setup.codex.found ? "ready" : "missing",
      ready: setup.codex.found === true,
      setup: compactCodexSetup(setup),
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
    options = options || {};
    var setup = detectRuntime(options);
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

  C8O.agentBridge.settings = function (options) {
    options = options || {};
    var rawProvider = trim(options.provider || options.agent || "").toLowerCase();
    var provider = (!rawProvider.length || rawProvider === "all" || rawProvider === "*" || rawProvider === "any") ? "" : normalizeProvider(rawProvider);
    var providers = [];
    if (!provider.length || provider === "codex") {
      providers.push(codexSettings(options));
    }
    if (!provider.length || provider === "vibe") {
      providers.push(vibeSettings(options));
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
    if (defaultProvider !== null && defaultProvider.models.length) {
      defaults.reasoning = defaultProvider.models[0].defaultReasoning || "";
    }
    return {
      ok: providers.length > 0,
      status: providers.length ? "ready" : "empty",
      defaults: defaults,
      providers: providers,
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

  function writeJson(entry, message) {
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
        throw new Error("vibe-acp process exited while waiting for " + pending.method);
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
      status: entry.status,
      phase: entry.phase,
      alive: processAlive(entry.process),
      cwd: entry.cwd,
      command: entry.command,
      envKeys: entry.envKeys,
      home: entry.home,
      credentials: {
        policy: entry.credentials.policy,
        sources: entry.credentials.sources,
        injectedKeys: entry.credentials.injectedKeys
      },
      sessionId: entry.sessionId,
      codexThreadId: entry.codexThreadId || "",
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
