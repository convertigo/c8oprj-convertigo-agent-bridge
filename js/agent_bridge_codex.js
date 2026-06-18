// Codex CLI provider implementation.
// Loaded by vibe_agent_bridge.js after agent_bridge_common.js.

  function codexItemText(item) {
    if (!item) {
      return "";
    }
    if (item.text !== null && typeof item.text !== "undefined") {
      return String(item.text);
    }
    if (item.content !== null && typeof item.content !== "undefined") {
      return extractContentText(item.content);
    }
    if (item.message !== null && typeof item.message !== "undefined") {
      return extractContentText(item.message);
    }
    if (item.delta !== null && typeof item.delta !== "undefined") {
      return extractContentText(item.delta);
    }
    return "";
  }

  function codexItemTitle(item) {
    if (!item) {
      return "";
    }
    return String(item.title || item.name || item.command || item.type || "");
  }

  function isCodexToolItem(itemType) {
    return itemType.indexOf("tool") >= 0 ||
      itemType.indexOf("command") >= 0 ||
      itemType.indexOf("exec") >= 0 ||
      itemType.indexOf("function") >= 0 ||
      itemType.indexOf("mcp") >= 0;
  }

  function isCodexReasoningItem(itemType) {
    return itemType.indexOf("reason") >= 0 ||
      itemType.indexOf("thought") >= 0 ||
      itemType.indexOf("plan") >= 0;
  }

  function codexContentText(content) {
    if (content === null || typeof content === "undefined") {
      return "";
    }
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray && Array.isArray(content)) {
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        var part = codexContentText(content[i]);
        if (part.length) {
          parts.push(part);
        }
      }
      return parts.join("\n");
    }
    if (content.text !== null && typeof content.text !== "undefined") {
      return String(content.text);
    }
    if (content.output_text !== null && typeof content.output_text !== "undefined") {
      return String(content.output_text);
    }
    if (content.input_text !== null && typeof content.input_text !== "undefined") {
      return String(content.input_text);
    }
    if (content.message !== null && typeof content.message !== "undefined") {
      return codexContentText(content.message);
    }
    if (content.content !== null && typeof content.content !== "undefined") {
      return codexContentText(content.content);
    }
    return "";
  }

  function pushCodexProgress(entry, text, phase, source) {
    text = trim(text);
    if (!text.length || entry.lastCodexProgressMessage === text) {
      return;
    }
    entry.lastCodexProgressMessage = text;
    pushEvent(entry, "progress/message", {
      text: text,
      phase: phase || "commentary",
      source: source || "codex",
      provider: "codex"
    });
  }

  function pushCodexAnswer(entry, text, source) {
    text = trim(text);
    if (!text.length || entry.lastCodexAnswerChunk === text) {
      return;
    }
    entry.lastCodexAnswerChunk = text;
    pushEvent(entry, "answer/chunk", {
      text: text,
      source: source || "codex",
      provider: "codex"
    });
  }

  function pushCodexTurnEnd(entry, data) {
    if (entry.codexTurnEnded) {
      return;
    }
    entry.codexTurnEnded = true;
    entry.status = "completed";
    entry.phase = "completed";
    pushEvent(entry, "turn/end", data || {
      provider: "codex",
      threadId: entry.codexThreadId
    });
  }

  function codexToolTitleFromInvocation(invocation) {
    invocation = invocation || {};
    var tool = trim(invocation.tool || invocation.name);
    var server = trim(invocation.server);
    if (server.length && tool.length) {
      return server + "." + tool;
    }
    return tool.length ? tool : server;
  }

  function handleCodexEventMessage(entry, message) {
    var payload = message.payload || {};
    var payloadType = String(payload.type || "");
    if (payloadType === "task_started") {
      entry.status = "running";
      entry.phase = "turn";
      pushEvent(entry, "turn/start", { provider: "codex", threadId: entry.codexThreadId });
      return true;
    }
    if (payloadType === "agent_message") {
      var text = trim(payload.message || payload.text || codexContentText(payload.content));
      var phase = String(payload.phase || "");
      if (phase === "final_answer") {
        pushCodexAnswer(entry, text, "event_msg");
      } else {
        pushCodexProgress(entry, text, phase, "event_msg");
      }
      return true;
    }
    if (payloadType === "mcp_tool_call_end") {
      var status = payload.result && payload.result.Err ? "failed" : "completed";
      pushEvent(entry, "tool/update", {
        title: codexToolTitleFromInvocation(payload.invocation) || payload.call_id || "tool",
        status: status,
        callId: payload.call_id || "",
        provider: "codex"
      });
      return true;
    }
    if (payloadType === "task_complete") {
      pushCodexTurnEnd(entry, {
        result: payload,
        provider: "codex",
        threadId: entry.codexThreadId
      });
      return true;
    }
    return false;
  }

  function handleCodexResponseItem(entry, message) {
    var payload = message.payload || {};
    var payloadType = String(payload.type || "");
    if (payloadType === "function_call" || payloadType === "tool_search_call") {
      pushEvent(entry, "tool/start", {
        title: codexToolTitleFromInvocation(payload) || payload.name || payloadType,
        status: "running",
        callId: payload.call_id || "",
        provider: "codex"
      });
      return true;
    }
    if (payloadType === "function_call_output" || payloadType === "tool_search_output") {
      pushEvent(entry, "tool/update", {
        title: payload.name || payload.call_id || payloadType,
        status: "completed",
        callId: payload.call_id || "",
        provider: "codex"
      });
      return true;
    }
    if (payloadType === "message" && String(payload.role || "") === "assistant") {
      var text = codexContentText(payload.content);
      var phase = String(payload.phase || "");
      if (phase === "final_answer") {
        pushCodexAnswer(entry, text, "response_item");
      } else if (phase === "commentary") {
        pushCodexProgress(entry, text, phase, "response_item");
      }
      return true;
    }
    return false;
  }

  function codexLineKey(text) {
    try {
      return String(new java.lang.String(String(text)).hashCode()) + ":" + String(text.length);
    } catch (_ignoreHash) {
      return String(text.length) + ":" + String(text).substring(0, 80);
    }
  }

  function markCodexLine(entry, text) {
    if (!entry || !text.length) {
      return false;
    }
    if (!entry.codexSeenLineKeys) {
      entry.codexSeenLineKeys = {};
      entry.codexSeenLineOrder = [];
    }
    var key = codexLineKey(text);
    if (entry.codexSeenLineKeys[key] === true) {
      return false;
    }
    entry.codexSeenLineKeys[key] = true;
    entry.codexSeenLineOrder.push(key);
    while (entry.codexSeenLineOrder.length > 12000) {
      var oldKey = entry.codexSeenLineOrder.shift();
      delete entry.codexSeenLineKeys[oldKey];
    }
    return true;
  }

  function handleCodexLine(entry, line, streamName) {
    var text = trim(line);
    if (!text.length) {
      return;
    }
    if (!markCodexLine(entry, text)) {
      return;
    }
    if (streamName !== "stdout" && streamName !== "codex-session") {
      pushEvent(entry, streamName, { line: text });
      return;
    }

    var message;
    try {
      message = JSON.parse(text);
    } catch (_ignoreCodexJson) {
      pushEvent(entry, "diagnostic", { line: text });
      return;
    }

    var type = String(message.type || "");
    if (type === "event_msg" && handleCodexEventMessage(entry, message)) {
      return;
    }
    if (type === "response_item" && handleCodexResponseItem(entry, message)) {
      return;
    }
    if (type === "thread.started") {
      entry.codexThreadId = String(message.thread_id || message.threadId || "");
      entry.sessionId = entry.codexThreadId;
      pushEvent(entry, "session/update", {
        sessionId: entry.sessionId,
        threadId: entry.codexThreadId,
        provider: "codex"
      });
      return;
    }
    if (type === "turn.started") {
      entry.status = "running";
      entry.phase = "turn";
      pushEvent(entry, "turn/start", { provider: "codex", threadId: entry.codexThreadId });
      return;
    }
    if (type === "item.started" || type === "item.updated" || type === "item.completed") {
      var item = message.item || {};
      var itemType = String(item.type || "").toLowerCase();
      var itemText = codexItemText(item);
      if (itemType === "agent_message") {
        if (itemText.length) {
          pushCodexProgress(entry, itemText, "commentary", "item");
        }
        return;
      }
      if (isCodexReasoningItem(itemType)) {
        if (itemText.length) {
          pushEvent(entry, "reasoning/chunk", {
            text: itemText,
            item: item,
            provider: "codex"
          });
        } else {
          pushEvent(entry, "codex/item", { eventType: type, item: item });
        }
        return;
      }
      if (isCodexToolItem(itemType)) {
        pushEvent(entry, type === "item.started" ? "tool/start" : "tool/update", {
          title: codexItemTitle(item),
          status: type === "item.completed" ? "completed" : "running",
          item: item,
          provider: "codex"
        });
        return;
      }
      pushEvent(entry, "codex/item", { eventType: type, item: item });
      return;
    }
    if (type === "turn.completed") {
      if (message.usage) {
        pushEvent(entry, "usage/update", {
          usage: message.usage,
          provider: "codex"
        });
      }
      pushCodexTurnEnd(entry, {
        result: message,
        provider: "codex",
        threadId: entry.codexThreadId
      });
      return;
    }
    if (type === "turn.failed" || type === "error") {
      entry.status = "error";
      entry.phase = "error";
      entry.lastError = JSON.stringify(message);
      pushEvent(entry, "turn/error", {
        error: message,
        provider: "codex"
      });
      return;
    }

    pushEvent(entry, "codex/event", { event: message });
  }

  function codexSessionDatePath(timeMillis) {
    try {
      return String(new java.text.SimpleDateFormat("yyyy/MM/dd").format(new java.util.Date(timeMillis || now())));
    } catch (_ignoreDateFormat) {
      return "";
    }
  }

  function codexSessionRoots(entry) {
    var roots = [];
    var addRoot = function (path) {
      path = trim(path);
      if (!path.length) {
        return;
      }
      for (var i = 0; i < roots.length; i++) {
        if (roots[i] === path) {
          return;
        }
      }
      roots.push(path);
    };
    if (entry && entry.home && entry.home.path) {
      addRoot(entry.home.path);
    }
    addRoot(childPath(String(System.getProperty("user.home")), ".codex"));
    return roots;
  }

  function sessionFileLooksLikeEntry(file, entry) {
    try {
      var text = readTextFile(file);
      if (entry && trim(entry.sessionId || entry.codexThreadId).length && text.indexOf(trim(entry.sessionId || entry.codexThreadId)) !== -1) {
        return true;
      }
      if (entry.handle && text.indexOf(entry.handle) !== -1) {
        return true;
      }
      if (entry.cwd && text.indexOf("\"cwd\":\"" + String(entry.cwd).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") !== -1) {
        return true;
      }
    } catch (_ignoreSessionProbe) {}
    return false;
  }

  function completeLineCount(file) {
    var text = readTextFile(file);
    if (!text.length) {
      return 0;
    }
    var lines = text.split(/\r?\n/);
    var completeLines = lines.length;
    if (text.charAt(text.length - 1) !== "\n") {
      completeLines--;
    }
    return completeLines < 0 ? 0 : completeLines;
  }

  function findCodexSessionFileById(entry) {
    var sessionId = trim(entry && (entry.sessionId || entry.codexThreadId));
    if (!sessionId.length) {
      return null;
    }
    var best = null;
    var bestModified = 0;
    var roots = codexSessionRoots(entry);
    for (var r = 0; r < roots.length; r++) {
      var sessions = new File(roots[r], "sessions");
      var stack = sessions.exists() ? [sessions] : [];
      while (stack.length) {
        var dir = stack.pop();
        var files = dir.listFiles();
        if (files === null) {
          continue;
        }
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          if (file.isDirectory()) {
            stack.push(file);
            continue;
          }
          if (!file.isFile() || String(file.getName()).indexOf(".jsonl") === -1) {
            continue;
          }
          if (String(file.getName()).indexOf(sessionId) === -1) {
            continue;
          }
          var modified = Number(file.lastModified() || 0);
          if (modified >= bestModified) {
            best = file;
            bestModified = modified;
          }
        }
      }
    }
    return best;
  }

  function findCodexSessionFile(entry) {
    var best = null;
    var bestModified = 0;
    var datePath = codexSessionDatePath(entry.codexSessionWatchStartedAt || entry.createdAt || now());
    var roots = codexSessionRoots(entry);
    var minModified = Number(entry.codexSessionWatchStartedAt || entry.createdAt || now()) - 60000;
    for (var r = 0; r < roots.length; r++) {
      var dir = new File(new File(roots[r], "sessions"), datePath);
      var files = dir.exists() ? dir.listFiles() : null;
      if (files === null) {
        continue;
      }
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!file.isFile() || String(file.getName()).indexOf(".jsonl") === -1) {
          continue;
        }
        var modified = Number(file.lastModified() || 0);
        if (modified < minModified || modified < bestModified) {
          continue;
        }
        if (sessionFileLooksLikeEntry(file, entry)) {
          best = file;
          bestModified = modified;
        }
      }
    }
    return best;
  }

  function pollCodexSessionFile(entry) {
    if (!entry || entry.protocol !== "codex-jsonl") {
      return;
    }
    var file = trim(entry.codexSessionFile).length ? new File(entry.codexSessionFile) : null;
    if (file === null || !file.exists()) {
      file = findCodexSessionFile(entry);
      if (file === null) {
        return;
      }
      entry.codexSessionFile = filePath(file);
      entry.codexSessionFileLineCount = 0;
      pushEvent(entry, "session/update", {
        sessionFile: entry.codexSessionFile,
        provider: "codex"
      });
    }
    var text = readTextFile(file);
    if (!text.length) {
      return;
    }
    var lines = text.split(/\r?\n/);
    var completeLines = lines.length;
    if (text.charAt(text.length - 1) !== "\n") {
      completeLines--;
    }
    if (entry.codexSessionFileLineCount > completeLines) {
      entry.codexSessionFileLineCount = 0;
    }
    for (var i = entry.codexSessionFileLineCount; i < completeLines; i++) {
      handleCodexLine(entry, lines[i], "codex-session");
    }
    entry.codexSessionFileLineCount = completeLines;
  }

  function startCodexSessionWatcher(entry) {
    if (!entry || entry.protocol !== "codex-jsonl") {
      return;
    }
    if (entry.codexSessionWatcherThread !== null) {
      try {
        if (entry.codexSessionWatcherThread.isAlive()) {
          return;
        }
      } catch (_ignoreWatcherAlive) {}
      entry.codexSessionWatcherThread = null;
    }
    entry.codexSessionWatchStartedAt = now();
    var thread = new Thread(new Runnable({
      run: function () {
        var pollsAfterExit = 0;
        while (entry.status !== "closed") {
          try {
            pollCodexSessionFile(entry);
          } catch (e) {
            entry.lastError = String(e);
            pushEvent(entry, "error", { message: String(e), phase: "codex_session_watcher" });
          }
          if (!processAlive(entry.process)) {
            pollsAfterExit++;
            if (pollsAfterExit > 6) {
              break;
            }
          }
          try {
            Thread.sleep(500);
          } catch (_ignoreWatcherSleep) {
            break;
          }
        }
      }
    }), "ConvertigoAgentBridge-codex-session-" + entry.handle);
    thread.setDaemon(true);
    thread.start();
    entry.codexSessionWatcherThread = thread;
  }

  function prepareCodexSessionWatcherForPrompt(entry) {
    if (!entry || entry.protocol !== "codex-jsonl") {
      return;
    }
    entry.codexSeenLineKeys = {};
    entry.codexSeenLineOrder = [];
    entry.codexSessionWatchStartedAt = now();
    entry.codexSessionFile = "";
    entry.codexSessionFileLineCount = 0;
    var file = findCodexSessionFileById(entry);
    if (file !== null) {
      entry.codexSessionFile = filePath(file);
      entry.codexSessionFileLineCount = completeLineCount(file);
      pushEvent(entry, "session/update", {
        sessionFile: entry.codexSessionFile,
        baselineLineCount: entry.codexSessionFileLineCount,
        provider: "codex"
      });
    }
  }
  C8O.agentBridge.codexSetup = function (options) {
    options = options || {};
    var install = boolValue(options.install || options.installCodex, false);
    var installation = {
      attempted: false,
      installed: false,
      reused: false,
      method: "",
      package: "",
      steps: []
    };
    var messages = [];
    if (install) {
      try {
        installation = ensureCodexRuntime(options);
      } catch (e) {
        var failedSetup = detectCodexRuntime(options);
        messages.push(String(e));
        return {
          ok: false,
          status: "error",
          phase: "codex_setup",
          error: String(e),
          setup: failedSetup,
          installation: installation,
          messages: messages,
          timestamp: now()
        };
      }
    }
    var setup = detectCodexRuntime(options);
    if (setup.home.error) {
      messages.push(setup.home.error);
    }
    if (setup.home.path.length && !new File(setup.home.path).exists()) {
      try {
        ensureDirectory(new File(setup.home.path));
        messages.push("CODEX_HOME directory created: " + setup.home.path);
      } catch (e) {
        messages.push(String(e));
      }
      setup = detectCodexRuntime(options);
    }
    if (setup.codex.found && setup.home.path.length && !setup.mcp.hasConvertigo) {
      messages.push("Scoped CODEX_HOME does not currently list the Convertigo MCP server; default CODEX_HOME usually keeps the user's configured Codex auth and MCP servers.");
    }
    var skills = installAgentSkills(options, "codex", setup.codexHome || setup.home.path);
    if (skills.message) {
      messages.push(skills.message);
    }
    if (skills.error) {
      messages.push(skills.error);
    }
    return {
      ok: setup.codex.found && !setup.home.error.length,
      status: setup.codex.found ? "ready" : "missing",
      setup: setup,
      installation: installation,
      skills: skills,
      messages: messages,
      timestamp: now()
    };
  };

  function codexCredentials(options, home) {
    var scope = home && home.path ? "scoped-home" : "default-home";
    return {
      policy: scope,
      sources: [{
        source: scope,
        path: home && home.path ? home.path : childPath(String(System.getProperty("user.home")), ".codex"),
        exists: home && home.path ? new File(home.path).exists() : new File(childPath(String(System.getProperty("user.home")), ".codex")).exists(),
        keys: [],
        injectedKeys: []
      }],
      injectedKeys: []
    };
  }

  function codexCommand(baseCommand, entry, options, promptText) {
    var command = parseCommand(options.command, [baseCommand || "codex"]);
    var model = trim(options.model);
    var bypass = boolValue(options.bypassApprovalsAndSandbox, true);
    var sandbox = trim(options.sandbox);
    if (entry.sessionId.length) {
      command.push("exec");
      command.push("resume");
      command.push("--json");
      if (bypass) {
        command.push("--dangerously-bypass-approvals-and-sandbox");
      }
      if (model.length) {
        command.push("-m");
        command.push(model);
      }
      command.push("--skip-git-repo-check");
      command.push(entry.sessionId);
      command.push(promptText);
      return command;
    }

    command.push("exec");
    command.push("--json");
    if (bypass) {
      command.push("--dangerously-bypass-approvals-and-sandbox");
    } else if (sandbox.length) {
      command.push("-s");
      command.push(sandbox);
    }
    if (model.length) {
      command.push("-m");
      command.push(model);
    }
    command.push("--skip-git-repo-check");
    command.push("-C");
    command.push(entry.cwd);
    command.push(promptText);
    return command;
  }

  C8O.agentBridge.codexStart = function (options) {
    options = options || {};
    var setup = C8O.agentBridge.codexSetup({
      workspaceRoot: options.workspaceRoot,
      installDir: options.installDir,
      codexHome: options.codexHome || options.agentHome,
      codexHomeScope: options.codexHomeScope || options.homeScope || options.scope,
      userId: options.userId,
      conversationId: options.conversationId,
      projectId: options.projectId,
      mcpEndpoint: options.mcpEndpoint,
      codexPath: options.codexPath || options.commandPath,
      install: options.install || options.installCodex,
      nodeVersion: options.nodeVersion,
      nodeDir: options.nodeDir || options.nodeInstallDir,
      npmPath: options.npmPath,
      allowNodeDownload: options.allowNodeDownload,
      codexPackage: options.codexPackage || options.packageName,
      codexVersion: options.codexVersion || options.packageVersion,
      codexInstallMethod: options.codexInstallMethod || options.installMethod,
      codexInstallTimeoutMs: options.codexInstallTimeoutMs,
      forceCodexInstall: options.forceCodexInstall || options.forceInstall
    });
    if (!setup.ok) {
      return {
        ok: false,
        status: "error",
        phase: "setup",
        error: "codex CLI is required before start",
        setup: setup,
        timestamp: now()
      };
    }

    var handle = trim(options.handle) || makeHandle("codex");
    var registry = getRegistry();
    var existing = registry.get(handle);
    if (existing !== null && typeof existing !== "undefined" && processAlive(existing.process)) {
      rememberSessionHandle(handle);
      return {
        ok: true,
        status: "already_running",
        handle: handle,
        state: statusOf(existing),
        timestamp: now()
      };
    }

    var env = parseObject(options.env, {});
    if (setup.setup.codexHome.length) {
      env.CODEX_HOME = setup.setup.codexHome;
    }
    var nodePath = nodeRuntimeSearchPath(options);
    if (nodePath.length) {
      env.PATH = nodePath + String(File.pathSeparator) + (env.PATH || String(System.getenv("PATH") || ""));
    }
    env.TERM = env.TERM || "xterm-256color";
    var cwd = normalizeDirectory(options.cwd, setup.setup.workspaceRoot, setup.setup.workspaceRoot);
    var ttlMillis = intValue(options.ttlSeconds, DEFAULT_TTL_SECONDS, 30, 86400) * 1000;
    var credentials = codexCredentials(options, setup.setup.home);
    var entry = createEntry(handle, "codex", "codex-jsonl", [], cwd, env, ttlMillis, setup.setup.home, credentials, options.model || options.agentModel);
    entry.status = "ready";
    entry.phase = "ready";
    entry.sessionId = trim(options.codexThreadId || options.sessionId || options.externalSessionId);
    entry.codexThreadId = entry.sessionId;
    entry.codexPath = setup.setup.codex.path || "codex";
    registry.put(handle, entry);
    rememberSessionHandle(handle);
    pushEvent(entry, "system/start", {
      handle: handle,
      provider: "codex",
      protocol: "codex-jsonl",
      cwd: cwd,
      codexHome: setup.setup.codexHome,
      home: publicHomeInfo(setup.setup.home),
      resumedThreadId: entry.codexThreadId,
      mcp: setup.setup.mcp
    });

    return {
      ok: true,
      status: "started",
      handle: handle,
      sessionId: entry.sessionId,
      codexThreadId: entry.codexThreadId,
      cursor: entry.nextIndex,
      state: statusOf(entry),
      setup: setup,
      timestamp: now()
    };
  };

  C8O.agentBridge.codexPrompt = function (options) {
    options = options || {};
    var handle = resolveHandle(options.handle);
    if (!handle.length) {
      return { ok: false, status: "error", error: "handle is required", timestamp: now() };
    }
    var entry = getRegistry().get(handle);
    if (entry === null || typeof entry === "undefined") {
      return { ok: false, status: "not_found", handle: handle, error: "Unknown handle", timestamp: now() };
    }
    if (processAlive(entry.process)) {
      return { ok: false, status: "busy", handle: handle, state: statusOf(entry), timestamp: now() };
    }

    var promptText = String(options.prompt || "");
    if (!trim(promptText).length) {
      return { ok: false, status: "error", handle: handle, error: "prompt is required", timestamp: now() };
    }
    if (trim(options.codexThreadId || options.sessionId || options.externalSessionId).length) {
      entry.sessionId = trim(options.codexThreadId || options.sessionId || options.externalSessionId);
      entry.codexThreadId = entry.sessionId;
    }
    if (trim(options.model || options.agentModel).length) {
      entry.model = trim(options.model || options.agentModel);
    }
    var env = parseObject(options.env, {});
    if (entry.home && entry.home.path) {
      env.CODEX_HOME = entry.home.path;
    }
    env.TERM = env.TERM || "xterm-256color";
    var requestId = entry.nextRequestId++;
    var cursor = entry.nextIndex;
    entry.status = "starting";
    entry.phase = entry.sessionId.length ? "codex/resume" : "codex/exec";
    entry.lastCodexProgressMessage = "";
    entry.lastCodexAnswerChunk = "";
    entry.codexTurnEnded = false;
    entry.command = codexCommand(entry.codexPath || "codex", entry, options, promptText);
    entry.envKeys = envKeys(env);
    pushEvent(entry, "turn/start", {
      requestId: requestId,
      provider: "codex",
      textLength: promptText.length,
      resumedThreadId: entry.codexThreadId
    });

    try {
      prepareCodexSessionWatcherForPrompt(entry);
      startProcess(entry, env);
      try {
        if (entry.writer !== null) {
          entry.writer.close();
          entry.writer = null;
        }
      } catch (_ignoreCloseCodexStdin) {}
      return {
        ok: true,
        status: "submitted",
        handle: handle,
        requestId: requestId,
        cursor: cursor,
        state: statusOf(entry),
        timestamp: now()
      };
    } catch (e) {
      entry.status = "error";
      entry.phase = "error";
      entry.lastError = String(e);
      pushEvent(entry, "turn/error", {
        message: String(e),
        provider: "codex"
      });
      return {
        ok: false,
        status: "error",
        handle: handle,
        error: String(e),
        state: statusOf(entry),
        timestamp: now()
      };
    }
  };

  C8O.agentBridge.codexClose = function (options) {
    options = options || {};
    var handle = resolveHandle(options.handle);
    if (!handle.length) {
      return { ok: false, status: "error", error: "handle is required", timestamp: now() };
    }
    var registry = getRegistry();
    var entry = registry.get(handle);
    if (entry === null || typeof entry === "undefined") {
      forgetSessionHandle(handle);
      return { ok: true, status: "not_found", handle: handle, timestamp: now() };
    }
    var stateBeforeRemove = statusOf(entry);
    stopEntry(entry, true);
    return {
      ok: true,
      status: "closed",
      handle: handle,
      state: stateBeforeRemove,
      timestamp: now()
    };
  };
