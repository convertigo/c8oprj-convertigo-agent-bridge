// Common runtime, process registry, event buffer and shared helpers.
// Loaded by vibe_agent_bridge.js inside one Rhino scope.
  var REGISTRY_KEY = "ConvertigoAgentBridge.agentProcessRegistry.v1";
  var SESSION_HANDLE_ATTR = "ConvertigoAgentBridge.currentHandle";
  var SESSION_CONVERSATION_ATTR = "ConvertigoAgentBridge.currentConversationId";
  var DEFAULT_MCP_ENDPOINT = "http://localhost:18082/convertigo/api/mcp";
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
  var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
  var MessageDigest = Packages.java.security.MessageDigest;

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
      return "default";
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
    return "default";
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
        path: childPath(installDir, ".codex-home"),
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
      userBase = appendProjectPath(userBase, project);
      return {
        scope: "user",
        path: childPath(userBase, ".codex-home"),
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
      path: childPath(convBase, ".codex-home"),
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
        throw new Error("Timeout while waiting for Python install lock: " + filePath(file));
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

  function firstWorkingCommand(candidates, versionArgs) {
    var attempts = [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = trim(candidates[i]);
      if (!candidate.length) {
        continue;
      }
      var args = [candidate].concat(versionArgs || ["--version"]);
      var probe = runCommand(args, { timeoutMs: 10000 });
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
    var mcpEndpoint = trim(options.mcpEndpoint) || DEFAULT_MCP_ENDPOINT;
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
      "/Applications/Codex.app/Contents/Resources/codex",
      childPath(childPath(userHome, ".local"), "bin/codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "codex"
    ], ["--version"]);
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
      if (codexHome.path.length) {
        env.CODEX_HOME = codexHome.path;
      }
      var mcpProbe = runCommand([command.path, "mcp", "list"], { timeoutMs: 15000, env: env });
      mcp.checked = true;
      mcp.ok = mcpProbe.ok;
      mcp.stdout = mcpProbe.stdout;
      mcp.stderr = mcpProbe.stderr;
      mcp.error = mcpProbe.error;
      mcp.hasConvertigo = (mcpProbe.stdout || "").indexOf("convertigo") >= 0 || (mcpProbe.stderr || "").indexOf("convertigo") >= 0;
    }
    return {
      workspaceRoot: workspaceRoot,
      installDir: installDir,
      codexHome: codexHome.path,
      home: publicHomeInfo(codexHome),
      mcpEndpoint: trim(options.mcpEndpoint) || DEFAULT_MCP_ENDPOINT,
      codex: command,
      mcp: mcp
    };
  }

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
