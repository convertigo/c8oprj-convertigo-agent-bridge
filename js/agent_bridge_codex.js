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
      phase: "final_answer",
      source: source || "codex",
      provider: "codex"
    });
  }

  function pushCodexRawChunk(entry, text, phase, source) {
    text = String(text || "");
    if (!trim(text).length) {
      return;
    }
    pushEvent(entry, "answer/chunk", {
      text: text,
      phase: phase || "final_answer",
      source: source || "codex",
      provider: "codex"
    });
  }

  function pushCodexProgressChunk(entry, text, phase, source) {
    text = String(text || "");
    if (!trim(text).length) {
      return;
    }
    pushEvent(entry, "answer/chunk", {
      text: text,
      phase: "commentary",
      progressPhase: phase || "commentary",
      source: source || "codex",
      provider: "codex"
    });
  }

  function codexAgentMessageLooksFinal(text, phase) {
    var p = String(phase || "").toLowerCase();
    if (p === "final_answer") {
      return true;
    }
    if (p === "commentary") {
      return false;
    }
    var raw = String(text || "");
    var compact = trim(raw.replace(/\s+/g, " "));
    if (!compact.length) {
      return false;
    }
    var lower = compact.toLowerCase();
    if (lower.indexOf("projets ouverts") === 0 || lower.indexOf("open projects") === 0) {
      return true;
    }
    if (lower.indexOf("aucune modification effectu") !== -1 || lower.indexOf("no change") !== -1) {
      return true;
    }
    if (lower.indexOf("validation faite") !== -1 || lower.indexOf("validated") !== -1) {
      return true;
    }
    var bulletCount = (raw.match(/\n\s*[-*]\s+/g) || []).length;
    if (bulletCount >= 3) {
      return true;
    }
    return compact.length >= 220 && (compact.indexOf(" - ") !== -1 || compact.indexOf(";") !== -1);
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

  function codexToolPreview(value) {
    if (value === null || typeof value === "undefined") {
      return "";
    }
    var text = "";
    if (typeof value === "string") {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch (_ignoreStringify) {
        text = String(value);
      }
    }
    text = trim(String(text).replace(/\s+/g, " "));
    if (!text.length || text === "{}" || text === "[]") {
      return "";
    }
    if (text.length > 1800) {
      text = text.substring(0, 1797) + "...";
    }
    return text;
  }

  function isCodexManagedSkillRead(value) {
    var text = trim(String(value || "")).replace(/\s+/g, " ");
    if (!text.length) {
      return false;
    }
    var lower = text.toLowerCase();
    var readsManagedSkill = lower.indexOf("skills/convertigo-generalist/skill.md") !== -1 ||
      lower.indexOf("skills/convertigo-nocode/skill.md") !== -1;
    return readsManagedSkill &&
      (lower.indexOf("sed -n") !== -1 ||
        lower.indexOf("cat ") !== -1 ||
        lower.indexOf("/bin/zsh -lc") !== -1 ||
        lower.indexOf("/bin/bash -lc") !== -1 ||
        lower.indexOf("zsh -lc") !== -1 ||
        lower.indexOf("bash -lc") !== -1);
  }

  function isCodexManagedSkillReadItem(item) {
    if (!item) {
      return false;
    }
    var parts = [
      codexItemTitle(item),
      codexItemText(item),
      codexToolPreview(item.command),
      codexToolPreview(item.arguments),
      codexToolPreview(item.content),
      codexToolPreview(item.output),
      codexToolPreview(item.result)
    ];
    for (var i = 0; i < parts.length; i++) {
      if (isCodexManagedSkillRead(parts[i])) {
        return true;
      }
    }
    return false;
  }

  function codexToolNameFromPayload(payload) {
    payload = payload || {};
    return trim(payload.tool || payload.name || (payload.invocation && (payload.invocation.tool || payload.invocation.name)) || "");
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
      if (codexAgentMessageLooksFinal(text, phase)) {
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
        toolName: codexToolNameFromPayload(payload),
        server: payload.invocation && payload.invocation.server ? payload.invocation.server : "",
        status: status,
        callId: payload.call_id || "",
        invocation: payload.invocation || {},
        result: payload.result || {},
        detail: codexToolPreview(payload.result),
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
        toolName: codexToolNameFromPayload(payload),
        status: "running",
        callId: payload.call_id || "",
        arguments: payload.arguments || "",
        detail: codexToolPreview(payload.arguments),
        provider: "codex"
      });
      return true;
    }
    if (payloadType === "function_call_output" || payloadType === "tool_search_output") {
      pushEvent(entry, "tool/update", {
        title: payload.name || "",
        toolName: codexToolNameFromPayload(payload),
        status: "completed",
        callId: payload.call_id || "",
        output: payload.output || "",
        detail: codexToolPreview(payload.output),
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

  function rememberCodexSession(entry, rawId, source) {
    var id = trim(rawId);
    if (!entry || !id.length) {
      return false;
    }
    var currentSessionId = trim(entry.sessionId);
    var currentThreadId = trim(entry.codexThreadId);
    if (!currentSessionId.length || currentSessionId === id) {
      entry.sessionId = id;
      currentSessionId = id;
    }
    if (!currentThreadId.length || currentThreadId === id) {
      entry.codexThreadId = id;
      currentThreadId = id;
    }
    if (!currentSessionId.length && currentThreadId.length) {
      entry.sessionId = currentThreadId;
      currentSessionId = currentThreadId;
    }
    if (!currentThreadId.length && currentSessionId.length) {
      entry.codexThreadId = currentSessionId;
      currentThreadId = currentSessionId;
    }
    pushEvent(entry, "session/update", {
      sessionId: currentSessionId,
      threadId: currentThreadId,
      reportedSessionId: id,
      provider: "codex",
      source: source || ""
    });
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
      if (streamName === "stderr") {
        entry.lastError = text;
      }
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
    if (type === "session_meta") {
      var metaPayload = message.payload || {};
      rememberCodexSession(entry, metaPayload.id || metaPayload.session_id || metaPayload.sessionId || metaPayload.thread_id || metaPayload.threadId || message.id, "session_meta");
      return;
    }
    if (type === "event_msg" && handleCodexEventMessage(entry, message)) {
      return;
    }
    if (type === "response_item" && handleCodexResponseItem(entry, message)) {
      return;
    }
    if (type === "thread.started") {
      rememberCodexSession(entry, message.thread_id || message.threadId, "thread.started");
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
          var itemPhase = String(item.phase || (item.metadata && item.metadata.phase) || "");
          if (codexAgentMessageLooksFinal(itemText, itemPhase)) {
            pushCodexAnswer(entry, itemText, "item");
          } else {
            pushCodexProgress(entry, itemText, itemPhase || "commentary", "item");
          }
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
        if (isCodexManagedSkillReadItem(item)) {
          return;
        }
        pushEvent(entry, type === "item.started" ? "tool/start" : "tool/update", {
          title: codexItemTitle(item),
          toolName: codexToolNameFromPayload(item),
          status: type === "item.completed" ? "completed" : "running",
          callId: item.call_id || item.callId || item.id || "",
          item: item,
          detail: codexToolPreview(item.output || item.result || item.content || item.arguments),
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

  function codexRuntimeMode(options) {
    var mode = trim(options.codexRuntimeMode || options.codexProtocol || options.runtimeMode || options.protocol).toLowerCase();
    if (!mode.length || mode === "server" || mode === "stdio" || mode === "stdio://" || mode === "appserver" || mode === "app-server") {
      return "app-server";
    }
    if (mode === "exec" || mode === "jsonl" || mode === "codex-jsonl") {
      return "exec";
    }
    return mode;
  }

  function codexAppServerCommand(baseCommand, options) {
    var command = parseCommand(options.appServerCommand || options.codexAppServerCommand, [baseCommand || "codex"]);
    if (command.length === 1) {
      command.push("app-server");
      command.push("--listen");
      command.push("stdio://");
    }
    return command;
  }

  function codexApprovalPolicy(options) {
    var explicit = trim(options.approvalPolicy || options.askForApproval);
    if (explicit.length) {
      return explicit;
    }
    return boolValue(options.bypassApprovalsAndSandbox, true) ? "never" : "on-request";
  }

  function codexSandboxMode(options) {
    var sandbox = trim(options.sandbox || options.sandboxMode);
    if (sandbox.length) {
      return sandbox;
    }
    return boolValue(options.bypassApprovalsAndSandbox, true) ? "danger-full-access" : "workspace-write";
  }

  function codexThreadParams(entry, options) {
    var params = {
      cwd: entry.cwd,
      approvalPolicy: codexApprovalPolicy(options),
      approvalsReviewer: "user",
      sandbox: codexSandboxMode(options),
      threadSource: "user"
    };
    if (trim(entry.model || options.model || options.agentModel).length) {
      params.model = trim(entry.model || options.model || options.agentModel);
    }
    if (trim(entry.serviceTier || options.serviceTier || options.speedTier).length) {
      params.serviceTier = trim(entry.serviceTier || options.serviceTier || options.speedTier);
    }
    return params;
  }

  function codexTurnParams(entry, options, promptText, requestId) {
    var params = {
      threadId: entry.codexThreadId || entry.sessionId,
      clientUserMessageId: trim(options.messageId) || ("bridge-" + requestId),
      input: [{
        type: "text",
        text: promptText,
        text_elements: []
      }],
      cwd: entry.cwd,
      approvalPolicy: codexApprovalPolicy(options)
    };
    if (trim(entry.model || options.model || options.agentModel).length) {
      params.model = trim(entry.model || options.model || options.agentModel);
    }
    if (trim(entry.serviceTier || options.serviceTier || options.speedTier).length) {
      params.serviceTier = trim(entry.serviceTier || options.serviceTier || options.speedTier);
    }
    if (trim(entry.reasoningEffort || options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort).length) {
      params.effort = normalizeCodexReasoningEffort(entry.reasoningEffort || options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort);
    }
    return params;
  }

  function sendCodexAppServerRequest(entry, method, params) {
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
      id: id,
      method: method,
      params: params || {}
    });
    pushEvent(entry, "codex/request", {
      id: id,
      method: method,
      provider: "codex"
    });
    return pending;
  }

  function codexAppServerRequest(entry, method, params, timeoutMs) {
    var pending = sendCodexAppServerRequest(entry, method, params);
    return waitForPending(entry, pending, timeoutMs || 60000, true);
  }

  function codexAppServerThreadFromResponse(response) {
    response = response || {};
    return response.thread || (response.result && response.result.thread) || {};
  }

  function startCodexAppServer(entry, env, options, setup) {
    var timeoutMs = intValue(options.requestTimeoutMs || options.appServerTimeoutMs, 60000, 1000, 180000);
    entry.command = codexAppServerCommand(entry.codexPath || "codex", options);
    entry.envKeys = envKeys(env);
    startProcess(entry, env);
    pushEvent(entry, "system/start", {
      handle: entry.handle,
      provider: "codex",
      protocol: "codex-app-server",
      command: entry.command,
      cwd: entry.cwd,
      codexHome: setup.setup.codexHome,
      home: publicHomeInfo(setup.setup.home),
      resumedThreadId: entry.codexThreadId,
      mcp: setup.setup.mcp,
      reasoningEffort: entry.reasoningEffort,
      serviceTier: entry.serviceTier
    });

    entry.phase = "initialize";
    entry.init = codexAppServerRequest(entry, "initialize", {
      clientInfo: {
        name: "ConvertigoAgentBridge",
        version: "0.1.0"
      },
      capabilities: null
    }, timeoutMs);
    writeJson(entry, { method: "initialized" });

    var threadResponse;
    if (entry.sessionId.length || entry.codexThreadId.length) {
      entry.phase = "thread/resume";
      var resumeParams = codexThreadParams(entry, options);
      resumeParams.threadId = entry.sessionId || entry.codexThreadId;
      threadResponse = codexAppServerRequest(entry, "thread/resume", resumeParams, timeoutMs);
    } else {
      entry.phase = "thread/start";
      threadResponse = codexAppServerRequest(entry, "thread/start", codexThreadParams(entry, options), timeoutMs);
    }

    var thread = codexAppServerThreadFromResponse(threadResponse);
    rememberCodexSession(entry, thread.id || thread.threadId || entry.sessionId || entry.codexThreadId, "app-server");
    entry.phase = "ready";
    entry.status = "running";
    entry.session = threadResponse;
    rememberSessionHandle(entry.handle);
  }

  function codexAppServerItemTitle(item) {
    item = item || {};
    if (item.type === "commandExecution") {
      return item.command || "command";
    }
    if (item.type === "mcpToolCall") {
      return trim(item.server).length || trim(item.tool).length ? trim(item.server) + "." + trim(item.tool) : "mcp tool";
    }
    if (item.type === "dynamicToolCall") {
      return trim(item.namespace).length ? trim(item.namespace) + "." + trim(item.tool) : trim(item.tool) || "tool";
    }
    if (item.type === "fileChange") {
      return "file change";
    }
    if (item.type === "webSearch") {
      return "web search";
    }
    return item.type || "item";
  }

  function codexAppServerToolStatus(item, completed) {
    if (completed) {
      return "completed";
    }
    var status = trim(item && item.status);
    return status.length ? status : "running";
  }

  function codexAppServerToolDetail(item) {
    item = item || {};
    return codexToolPreview(item.aggregatedOutput || item.result || item.error || item.arguments || item.changes || item.query || "");
  }

  function codexAppServerDeltaPhase(entry, itemId) {
    var item = entry && entry.codexAppServerItems ? entry.codexAppServerItems[itemId] : null;
    return String((item && item.phase) || "").toLowerCase();
  }

  function codexAppServerShouldFlushText(text) {
    var value = String(text || "");
    if (!trim(value).length) {
      return false;
    }
    if (/[\r\n]/.test(value)) {
      return true;
    }
    if (/[.!?;:]\s*$/.test(value) && trim(value).length >= 24) {
      return true;
    }
    return value.length >= 140 && /\s$/.test(value);
  }

  function codexAppServerAppendStoredDelta(entry, itemId, delta) {
    itemId = String(itemId || "");
    delta = String(delta || "");
    if (!delta.length) {
      return;
    }
    if (!entry.codexAppServerDeltaText) {
      entry.codexAppServerDeltaText = {};
    }
    entry.codexAppServerDeltaText[itemId] = String(entry.codexAppServerDeltaText[itemId] || "") + delta;
  }

  function codexAppServerAppendDelta(entry, itemId, delta) {
    itemId = String(itemId || "");
    delta = String(delta || "");
    if (!delta.length) {
      return;
    }
    codexAppServerAppendStoredDelta(entry, itemId, delta);
    if (!entry.codexAppServerDeltaPending) {
      entry.codexAppServerDeltaPending = {};
    }
    entry.codexAppServerDeltaPending[itemId] = String(entry.codexAppServerDeltaPending[itemId] || "") + delta;
  }

  function codexAppServerAppendReasoningSummary(entry, itemId, delta) {
    itemId = String(itemId || "");
    delta = String(delta || "");
    if (!delta.length) {
      return;
    }
    codexAppServerAppendStoredDelta(entry, itemId, delta);
    if (!entry.codexAppServerReasoningSummaryPending) {
      entry.codexAppServerReasoningSummaryPending = {};
    }
    entry.codexAppServerReasoningSummaryPending[itemId] = String(entry.codexAppServerReasoningSummaryPending[itemId] || "") + delta;
  }

  function codexAppServerFlushPendingAgentMessage(entry, itemId, phase, force) {
    itemId = String(itemId || "");
    if (!entry.codexAppServerDeltaPending) {
      return false;
    }
    var pending = String(entry.codexAppServerDeltaPending[itemId] || "");
    if (!trim(pending).length) {
      return false;
    }
    if (force !== true && !codexAppServerShouldFlushText(pending)) {
      return false;
    }
    entry.codexAppServerDeltaPending[itemId] = "";
    if (!entry.codexAppServerStreamedItems) {
      entry.codexAppServerStreamedItems = {};
    }
    entry.codexAppServerStreamedItems[itemId] = true;
    if (String(phase || "").toLowerCase() === "final_answer") {
      pushCodexRawChunk(entry, pending, "final_answer", "app-server-delta");
      pushCodexProgress(entry, pending, "final_answer", "app-server-delta");
    } else {
      pushCodexProgressChunk(entry, pending, phase || "commentary", "app-server-delta");
    }
    return true;
  }

  function codexAppServerFlushReasoningSummary(entry, itemId, force) {
    itemId = String(itemId || "");
    if (!entry.codexAppServerReasoningSummaryPending) {
      return false;
    }
    var pending = String(entry.codexAppServerReasoningSummaryPending[itemId] || "");
    if (!trim(pending).length) {
      return false;
    }
    if (force !== true && !codexAppServerShouldFlushText(pending)) {
      return false;
    }
    entry.codexAppServerReasoningSummaryPending[itemId] = "";
    pushCodexProgressChunk(entry, pending, "reasoning_summary", "app-server-delta");
    return true;
  }

  function codexAppServerHandleItem(entry, item, completed) {
    item = item || {};
    var type = String(item.type || "");
    if (!entry.codexAppServerItems) {
      entry.codexAppServerItems = {};
    }
    if (!entry.codexAppServerCompletedItems) {
      entry.codexAppServerCompletedItems = {};
    }
    if (item.id) {
      entry.codexAppServerItems[item.id] = item;
      if (completed && entry.codexAppServerCompletedItems[item.id] === true) {
        return true;
      }
    }
    if (type === "agentMessage") {
      if (!completed && item.id) {
        var runningPhase = String(item.phase || "").toLowerCase();
        if (runningPhase === "final_answer") {
          codexAppServerFlushPendingAgentMessage(entry, item.id, "final_answer", true);
        } else if (runningPhase === "commentary") {
          codexAppServerFlushPendingAgentMessage(entry, item.id, "commentary", false);
        }
        return true;
      }
      if (completed && item.id && entry.codexAppServerStreamedItems && entry.codexAppServerStreamedItems[item.id] === true) {
        codexAppServerFlushPendingAgentMessage(entry, item.id, item.phase, true);
        entry.codexAppServerCompletedItems[item.id] = true;
        return true;
      }
      var messageText = item.text || "";
      if (!trim(messageText).length && item.id && entry.codexAppServerDeltaText) {
        messageText = entry.codexAppServerDeltaText[item.id] || "";
      }
      if (completed && trim(messageText).length) {
        if (String(item.phase || "") === "commentary") {
          pushCodexProgress(entry, messageText, item.phase, "app-server-item");
        } else {
          pushCodexAnswer(entry, messageText, "app-server-item");
        }
      }
      if (completed && item.id) {
        entry.codexAppServerCompletedItems[item.id] = true;
      }
      return true;
    }
    if (type === "plan") {
      var planText = item.text || "";
      if (!trim(planText).length && item.id && entry.codexAppServerDeltaText) {
        planText = entry.codexAppServerDeltaText[item.id] || "";
      }
      if (trim(planText).length) {
        pushEvent(entry, "plan/update", {
          text: planText,
          item: item,
          provider: "codex"
        });
      }
      if (completed && item.id) {
        entry.codexAppServerCompletedItems[item.id] = true;
      }
      return true;
    }
    if (type === "reasoning") {
      if (completed && item.id) {
        codexAppServerFlushReasoningSummary(entry, item.id, true);
      }
      var text = "";
      if (item.summary && item.summary.length) {
        text = item.summary.join("\n");
      } else if (item.content && item.content.length) {
        text = item.content.join("\n");
      } else if (item.id && entry.codexAppServerDeltaText) {
        text = entry.codexAppServerDeltaText[item.id] || "";
      }
      if (trim(text).length) {
        pushEvent(entry, "reasoning/chunk", {
          text: text,
          item: item,
          provider: "codex"
        });
      }
      if (completed && item.id) {
        entry.codexAppServerCompletedItems[item.id] = true;
      }
      return true;
    }
    if (type === "commandExecution" || type === "mcpToolCall" || type === "dynamicToolCall" || type === "fileChange" || type === "webSearch") {
      pushEvent(entry, completed ? "tool/update" : "tool/start", {
        title: codexAppServerItemTitle(item),
        toolName: item.tool || item.command || type,
        status: codexAppServerToolStatus(item, completed),
        callId: item.id || "",
        item: item,
        detail: codexAppServerToolDetail(item),
        provider: "codex"
      });
      if (completed && item.id) {
        entry.codexAppServerCompletedItems[item.id] = true;
      }
      return true;
    }
    return false;
  }

  function handleCodexAppServerRequest(entry, message) {
    var method = String(message.method || "");
    var params = message.params || {};
    pushEvent(entry, "codex/request_from_server", {
      id: message.id || null,
      method: method,
      params: params,
      provider: "codex"
    });
    if (method === "item/commandExecution/requestApproval") {
      sendJsonResponse(entry, message.id, { decision: "accept" });
      return true;
    }
    if (method === "item/fileChange/requestApproval") {
      sendJsonResponse(entry, message.id, { decision: "accept" });
      return true;
    }
    if (method === "item/permissions/requestApproval") {
      sendJsonResponse(entry, message.id, {
        permissions: params.permissions || {},
        scope: "session"
      });
      return true;
    }
    sendJsonError(entry, message.id, -32601, "Unsupported Codex app-server request: " + method);
    return true;
  }

  function handleCodexAppServerLine(entry, line, streamName) {
    var text = trim(line);
    if (!text.length) {
      return;
    }
    if (streamName !== "stdout") {
      if (streamName === "stderr") {
        entry.lastError = text;
      }
      pushEvent(entry, streamName, { line: text, provider: "codex" });
      return;
    }

    var message;
    try {
      message = JSON.parse(text);
    } catch (_ignoreCodexAppServerJson) {
      pushEvent(entry, "diagnostic", { line: text, provider: "codex" });
      return;
    }

    if (typeof message.id !== "undefined" && (typeof message.result !== "undefined" || typeof message.error !== "undefined")) {
      var pending = entry.pending.get(String(message.id));
      if (pending !== null && typeof pending !== "undefined") {
        pending.response = message;
        pending.done = true;
        pending.completedAt = now();
        if (message.error) {
          entry.lastError = JSON.stringify(message.error);
          pushEvent(entry, "turn/error", {
            requestId: message.id,
            method: pending.method,
            error: message.error,
            provider: "codex"
          });
        } else if (pending.method === "turn/start") {
          var turn = (message.result && message.result.turn) || {};
          entry.activeTurnId = turn.id || entry.activeTurnId || "";
        }
      }
      pushEvent(entry, message.error ? "codex/response_error" : "codex/response", {
        id: message.id,
        method: pending ? pending.method : "",
        response: message,
        provider: "codex"
      });
      return;
    }

    var method = String(message.method || "");
    var params = message.params || {};
    if (!method.length) {
      pushEvent(entry, "codex/event", { event: message, provider: "codex" });
      return;
    }
    if (typeof message.id !== "undefined") {
      handleCodexAppServerRequest(entry, message);
      return;
    }
    if (method === "thread/started") {
      var thread = params.thread || {};
      rememberCodexSession(entry, params.threadId || thread.id || thread.threadId, "thread/started");
      return;
    }
    if (method === "thread/status/changed") {
      pushEvent(entry, "codex/thread_status", {
        threadId: params.threadId || entry.codexThreadId,
        status: params.status || {},
        provider: "codex"
      });
      return;
    }
    if (method === "thread/closed") {
      pushEvent(entry, "codex/thread_closed", {
        threadId: params.threadId || entry.codexThreadId,
        provider: "codex"
      });
      return;
    }
    if (method === "turn/started") {
      var startedTurn = params.turn || {};
      entry.activeTurnId = startedTurn.id || entry.activeTurnId || "";
      entry.status = "running";
      entry.phase = "turn";
      pushEvent(entry, "turn/start", {
        provider: "codex",
        threadId: params.threadId || entry.codexThreadId,
        turnId: entry.activeTurnId,
        turn: startedTurn
      });
      return;
    }
    if (method === "turn/completed") {
      var completedTurn = params.turn || {};
      entry.activeTurnId = completedTurn.id || entry.activeTurnId || "";
      if (completedTurn.items && completedTurn.items.length) {
        for (var i = 0; i < completedTurn.items.length; i++) {
          codexAppServerHandleItem(entry, completedTurn.items[i], true);
        }
      }
      pushCodexTurnEnd(entry, {
        result: params,
        provider: "codex",
        threadId: params.threadId || entry.codexThreadId,
        turnId: entry.activeTurnId
      });
      return;
    }
    if (method === "item/agentMessage/delta") {
      if (!entry.codexAppServerItemDeltas) {
        entry.codexAppServerItemDeltas = {};
      }
      entry.codexAppServerItemDeltas[params.itemId || ""] = true;
      var deltaItemId = params.itemId || "";
      var deltaPhase = codexAppServerDeltaPhase(entry, deltaItemId);
      codexAppServerAppendDelta(entry, deltaItemId, params.delta || "");
      if (deltaPhase === "final_answer") {
        codexAppServerFlushPendingAgentMessage(entry, deltaItemId, "final_answer", false);
      } else if (deltaPhase === "commentary") {
        codexAppServerFlushPendingAgentMessage(entry, deltaItemId, "commentary", false);
      }
      return;
    }
    if (method === "item/plan/delta") {
      codexAppServerAppendDelta(entry, params.itemId || "", params.delta || "");
      return;
    }
    if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryTextDelta") {
      var reasoningItemId = params.itemId || "";
      if (method === "item/reasoning/textDelta") {
        codexAppServerAppendStoredDelta(entry, reasoningItemId, params.delta || "");
      } else {
        codexAppServerAppendReasoningSummary(entry, reasoningItemId, params.delta || "");
      }
      if (method === "item/reasoning/summaryTextDelta") {
        codexAppServerFlushReasoningSummary(entry, reasoningItemId, false);
      }
      return;
    }
    if (method === "item/started" || method === "item/completed") {
      if (!codexAppServerHandleItem(entry, params.item || {}, method === "item/completed")) {
        pushEvent(entry, "codex/item", {
          method: method,
          params: params,
          provider: "codex"
        });
      }
      return;
    }
    if (method === "error") {
      entry.status = "error";
      entry.phase = "error";
      entry.lastError = JSON.stringify(params);
      pushEvent(entry, "turn/error", {
        error: params,
        provider: "codex"
      });
      return;
    }
    pushEvent(entry, "codex/event", {
      method: method,
      params: params,
      provider: "codex"
    });
  }

  C8O.agentBridge.codexSetup = function (options) {
    options = optionsWithRequestFallbacks(options || {});
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
    var bootstrap = {
      attempted: false,
      ok: true,
      home: "",
      copied: [],
      reused: [],
      generated: [],
      message: "",
      error: ""
    };
    if (setup.home.error) {
      messages.push(setup.home.error);
    }
    if (setup.home.path.length && !setup.home.error.length) {
      bootstrap = bootstrapCodexHome(options, setup.home.path, setup.mcpEndpoint);
      if (bootstrap.message) {
        messages.push(bootstrap.message);
      }
      if (bootstrap.error) {
        messages.push(bootstrap.error);
      }
      setup = detectCodexRuntime(options);
    }
    var skills = installAgentSkills(options, "codex", setup.codexHome || setup.home.path);
    if (skills.message) {
      messages.push(skills.message);
    }
    if (skills.error) {
      messages.push(skills.error);
    }
    if (skills.ok === true) {
      setup = detectCodexRuntime(options);
    }
    if (setup.codex.found && !setup.mcp.hasConvertigo) {
      messages.push("Codex does not list the Convertigo MCP server after setup.");
    }
    var managedCodex = setup.codex.found && commandPathStartsWith(setup.codex, setup.installDir);
    var playwrightRequired = managedCodex && !boolValue(options.skipCodexPlaywrightInstall || options.skipPlaywrightInstall, false);
    if (playwrightRequired && (!setup.playwright || setup.playwright.found !== true)) {
      messages.push("Playwright MCP is not available in the managed Codex runtime.");
    }
    var ready = setup.codex.found && !setup.home.error.length && skills.ok === true && setup.mcp.hasConvertigo === true && (!playwrightRequired || setup.playwright.found === true);
    return {
      ok: ready,
      status: ready ? "ready" : "missing",
      setup: setup,
      installation: installation,
      bootstrap: bootstrap,
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

  function copyEnvObject(env) {
    var out = {};
    env = env || {};
    for (var key in env) {
      if (Object.prototype.hasOwnProperty.call(env, key)) {
        out[key] = env[key];
      }
    }
    return out;
  }

  function mergeEnvObject(target, source) {
    source = source || {};
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && typeof source[key] !== "undefined") {
        target[key] = source[key];
      }
    }
    return target;
  }

  function codexCommand(baseCommand, entry, options, promptText) {
    var command = parseCommand(options.command, [baseCommand || "codex"]);
    var model = trim(options.model);
    var reasoningEffort = normalizeCodexReasoningEffort(options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort || entry.reasoningEffort);
    var serviceTier = trim(options.serviceTier || options.speedTier || entry.serviceTier);
    var bypass = boolValue(options.bypassApprovalsAndSandbox, true);
    var sandbox = trim(options.sandbox);
    if (entry.sessionId.length) {
      command.push("exec");
      command.push("resume");
      command.push("--json");
      if (reasoningEffort.length) {
        command.push("-c");
        command.push('model_reasoning_effort="' + tomlString(reasoningEffort) + '"');
      }
      if (serviceTier.length) {
        command.push("-c");
        command.push('service_tier="' + tomlString(serviceTier) + '"');
      }
      if (bypass) {
        command.push("--dangerously-bypass-approvals-and-sandbox");
      }
      if (model.length) {
        command.push("-m");
        command.push(model);
      }
      command.push("--skip-git-repo-check");
      command.push(entry.sessionId);
      command.push("-");
      return command;
    }

    command.push("exec");
    command.push("--json");
    if (reasoningEffort.length) {
      command.push("-c");
      command.push('model_reasoning_effort="' + tomlString(reasoningEffort) + '"');
    }
    if (serviceTier.length) {
      command.push("-c");
      command.push('service_tier="' + tomlString(serviceTier) + '"');
    }
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
    command.push("-");
    return command;
  }

  C8O.agentBridge.codexStart = function (options) {
    options = optionsWithRequestFallbacks(options || {});
    var handle = trim(options.handle) || makeHandle("codex");
    var registry = getRegistry();
    var existing = registry.get(handle);
    if (existing !== null && typeof existing !== "undefined" && processAlive(existing.process)) {
      writeEntryPidFile(existing);
      rememberSessionHandle(handle);
      return {
        ok: true,
        status: "already_running",
        handle: handle,
        state: statusOf(existing),
        timestamp: now()
      };
    }

    var setup = C8O.agentBridge.codexSetup({
      workspaceRoot: options.workspaceRoot,
      installDir: options.installDir,
      codexHome: options.codexHome || options.agentHome,
      codexHomeScope: options.codexHomeScope || options.homeScope || options.scope,
      userId: options.userId,
      conversationId: options.conversationId,
      projectId: options.projectId,
      agentProfile: options.agentProfile,
      skillProfile: options.skillProfile,
      assistantContext: options.assistantContext,
      assistantSurface: options.assistantSurface,
      mcpEndpoint: options.mcpEndpoint,
      codexPath: options.codexPath || options.commandPath,
      install: options.install || options.installCodex,
      nodeVersion: options.nodeVersion,
      nodeDir: options.nodeDir || options.nodeInstallDir,
      npmPath: options.npmPath,
      allowNodeDownload: options.allowNodeDownload,
      codexPackage: options.codexPackage || options.packageName,
      codexVersion: options.codexVersion || options.packageVersion,
      codexPlaywrightMcpPackage: options.codexPlaywrightMcpPackage || options.playwrightMcpPackage,
      codexPlaywrightMcpVersion: options.codexPlaywrightMcpVersion || options.playwrightMcpVersion,
      codexPlaywrightPackage: options.codexPlaywrightPackage || options.playwrightPackage,
      codexPlaywrightVersion: options.codexPlaywrightVersion || options.playwrightVersion,
      codexInstallMethod: options.codexInstallMethod || options.installMethod,
      codexInstallTimeoutMs: options.codexInstallTimeoutMs,
      forceCodexInstall: options.forceCodexInstall || options.forceInstall,
      forceCodexPlaywrightInstall: options.forceCodexPlaywrightInstall || options.forcePlaywrightInstall,
      skipCodexPlaywrightInstall: options.skipCodexPlaywrightInstall || options.skipPlaywrightInstall,
      browserDebugUrl: options.browserDebugUrl,
      browserDevToolsJsonUrl: options.browserDevToolsJsonUrl,
      browserDevToolsWebSocketUrl: options.browserDevToolsWebSocketUrl,
      playwrightCdpEndpoint: options.playwrightCdpEndpoint || options.viewerCdpEndpoint,
      playwrightMcpEndpoint: options.playwrightMcpEndpoint,
      agentRevealMode: firstDefinedOption(options, ["agentRevealMode", "convertigoRevealMode", "uiRevealMode", "revealMode", "reveal"]),
      mcpSkillsSourceDir: options.mcpSkillsSourceDir || options.skillsSourceDir || options.convertigoMcpDir,
      skipSkillsInstall: options.skipSkillsInstall || options.skipSkillSync,
      nocodeMcpTokenHandle: options.nocodeMcpTokenHandle || options.noCodeMcpTokenHandle || options.mcpBearerTokenHandle,
      noCodeMcpTokenHandle: options.noCodeMcpTokenHandle,
      mcpBearerTokenHandle: options.mcpBearerTokenHandle
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

    var env = parseObject(options.env, {});
    if (setup.setup.codexHome.length) {
      env.CODEX_HOME = setup.setup.codexHome;
    }
    var noCodeToken = noCodeMcpBearerToken(options);
    if (noCodeToken.length) {
      env[NOCODE_MCP_TOKEN_ENV] = noCodeToken;
    }
    var nodePath = nodeRuntimeSearchPath(options);
    if (nodePath.length) {
      env.PATH = nodePath + String(File.pathSeparator) + (env.PATH || String(System.getenv("PATH") || ""));
    }
    env.TERM = env.TERM || "xterm-256color";
    var cwd = normalizeDirectory(options.cwd, setup.setup.workspaceRoot, setup.setup.workspaceRoot);
    var ttlMillis = intValue(options.ttlSeconds, DEFAULT_TTL_SECONDS, 30, 86400) * 1000;
    var orphanSweep = sweepCodexAppServerPidFiles(setup.setup.workspaceRoot, ttlMillis);
    var credentials = codexCredentials(options, setup.setup.home);
    var runtimeMode = codexRuntimeMode(options);
    if (runtimeMode !== "app-server" && runtimeMode !== "exec") {
      return {
        ok: false,
        status: "error",
        phase: "codex_start",
        error: "Unsupported Codex runtime mode: " + runtimeMode,
        setup: setup,
        timestamp: now()
      };
    }
    var protocol = runtimeMode === "exec" ? "codex-jsonl" : "codex-app-server";
    var entry = createEntry(handle, "codex", protocol, [], cwd, env, ttlMillis, setup.setup.home, credentials, options.model || options.agentModel);
    entry.workspaceRoot = setup.setup.workspaceRoot;
    var pidFile = protocol === "codex-app-server" ? codexPidFile(setup.setup.workspaceRoot, handle) : null;
    entry.pidFile = pidFile === null ? "" : filePath(pidFile);
    entry.agentProfile = trim(options.agentProfile || options.skillProfile || options.assistantContext || options.assistantSurface || options.profile);
    entry.skillProfile = normalizeSkillProfile(options);
    entry.assistantContext = trim(options.assistantContext);
    entry.assistantSurface = trim(options.assistantSurface);
    entry.userId = trim(options.userId);
    entry.nocodeMcpTokenHandle = trim(options.nocodeMcpTokenHandle || options.noCodeMcpTokenHandle || options.mcpBearerTokenHandle);
    entry.noCodeMcpTokenHandle = trim(options.noCodeMcpTokenHandle);
    entry.mcpBearerTokenHandle = trim(options.mcpBearerTokenHandle);
    entry.mcpEndpoint = resolveMcpEndpoint(options);
    entry.browserDebugUrl = trim(options.browserDebugUrl);
    entry.browserDevToolsJsonUrl = trim(options.browserDevToolsJsonUrl);
    entry.browserDevToolsWebSocketUrl = trim(options.browserDevToolsWebSocketUrl);
    entry.playwrightCdpEndpoint = resolvePlaywrightMcpCdpEndpoint(options);
    entry.viewerCdpEndpoint = trim(options.viewerCdpEndpoint || entry.playwrightCdpEndpoint);
    entry.playwrightMcpEndpoint = trim(options.playwrightMcpEndpoint);
    entry.convertigoRevealMode = revealModeEnabled(options, null);
    entry.reasoningEffort = normalizeCodexReasoningEffort(options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort);
    entry.serviceTier = trim(options.serviceTier || options.speedTier);
    entry.baseEnv = copyEnvObject(env);
    entry.codexRuntimeMode = runtimeMode;
    entry.status = "ready";
    entry.phase = "ready";
    entry.sessionId = trim(options.codexThreadId || options.sessionId || options.externalSessionId);
    entry.codexThreadId = entry.sessionId;
    entry.codexPath = setup.setup.codex.path || "codex";
    registry.put(handle, entry);
    if (runtimeMode !== "exec") {
      try {
        startCodexAppServer(entry, env, options, setup);
      } catch (appServerError) {
        entry.status = "error";
        entry.phase = "error";
        entry.lastError = String(appServerError);
        pushEvent(entry, "error", {
          message: String(appServerError),
          phase: "codex_app_server_start",
          provider: "codex"
        });
        stopEntry(entry, false);
        return {
          ok: false,
          status: "error",
          phase: "codex_app_server_start",
          error: String(appServerError),
          handle: handle,
          state: statusOf(entry),
          setup: setup,
          timestamp: now()
        };
      }
    } else {
      rememberSessionHandle(handle);
      pushEvent(entry, "system/start", {
        handle: handle,
        provider: "codex",
        protocol: "codex-jsonl",
        cwd: cwd,
        codexHome: setup.setup.codexHome,
        home: publicHomeInfo(setup.setup.home),
        resumedThreadId: entry.codexThreadId,
        mcp: setup.setup.mcp,
        reasoningEffort: entry.reasoningEffort,
        serviceTier: entry.serviceTier
      });
    }
    if (orphanSweep.stopped.length) {
      pushEvent(entry, "system/sweep", {
        provider: "codex",
        stopped: orphanSweep.stopped
      });
    }

    return {
      ok: true,
      status: "started",
      handle: handle,
      sessionId: entry.sessionId,
      codexThreadId: entry.codexThreadId,
      codexRuntimeMode: entry.codexRuntimeMode,
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
    if (entry.protocol === "codex-app-server") {
      if (!processAlive(entry.process)) {
        return { ok: false, status: "not_running", handle: handle, state: statusOf(entry), timestamp: now() };
      }
    } else if (processAlive(entry.process)) {
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
    if (trim(options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort).length) {
      entry.reasoningEffort = normalizeCodexReasoningEffort(options.reasoningEffort || options.reasoningLevel || options.modelReasoningEffort);
    }
    if (trim(options.serviceTier || options.speedTier).length) {
      entry.serviceTier = trim(options.serviceTier || options.speedTier);
    }
    if (resolvePlaywrightMcpCdpEndpoint(options).length) {
      entry.browserDebugUrl = trim(options.browserDebugUrl || entry.browserDebugUrl);
      entry.browserDevToolsJsonUrl = trim(options.browserDevToolsJsonUrl || entry.browserDevToolsJsonUrl);
      entry.browserDevToolsWebSocketUrl = trim(options.browserDevToolsWebSocketUrl || entry.browserDevToolsWebSocketUrl);
      entry.playwrightCdpEndpoint = resolvePlaywrightMcpCdpEndpoint(options);
      entry.viewerCdpEndpoint = trim(options.viewerCdpEndpoint || entry.playwrightCdpEndpoint || entry.viewerCdpEndpoint);
      entry.playwrightMcpEndpoint = trim(options.playwrightMcpEndpoint || entry.playwrightMcpEndpoint);
    }
    entry.convertigoRevealMode = revealModeEnabled(options, entry);
    var runtimeOptions = {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        runtimeOptions[key] = options[key];
      }
    }
    runtimeOptions.agentProfile = trim(runtimeOptions.agentProfile || entry.agentProfile || entry.skillProfile);
    runtimeOptions.skillProfile = trim(runtimeOptions.skillProfile || entry.skillProfile || entry.agentProfile);
    runtimeOptions.assistantContext = trim(runtimeOptions.assistantContext || entry.assistantContext);
    runtimeOptions.assistantSurface = trim(runtimeOptions.assistantSurface || entry.assistantSurface);
    runtimeOptions.userId = trim(runtimeOptions.userId || entry.userId);
    runtimeOptions.nocodeMcpTokenHandle = trim(runtimeOptions.nocodeMcpTokenHandle || entry.nocodeMcpTokenHandle || entry.noCodeMcpTokenHandle || entry.mcpBearerTokenHandle);
    runtimeOptions.noCodeMcpTokenHandle = trim(runtimeOptions.noCodeMcpTokenHandle || entry.noCodeMcpTokenHandle);
    runtimeOptions.mcpBearerTokenHandle = trim(runtimeOptions.mcpBearerTokenHandle || entry.mcpBearerTokenHandle);
    runtimeOptions.mcpEndpoint = trim(runtimeOptions.mcpEndpoint || entry.mcpEndpoint);
    runtimeOptions.browserDebugUrl = trim(runtimeOptions.browserDebugUrl || entry.browserDebugUrl);
    runtimeOptions.browserDevToolsJsonUrl = trim(runtimeOptions.browserDevToolsJsonUrl || entry.browserDevToolsJsonUrl);
    runtimeOptions.browserDevToolsWebSocketUrl = trim(runtimeOptions.browserDevToolsWebSocketUrl || entry.browserDevToolsWebSocketUrl);
    runtimeOptions.playwrightCdpEndpoint = trim(runtimeOptions.playwrightCdpEndpoint || entry.playwrightCdpEndpoint || entry.viewerCdpEndpoint);
    runtimeOptions.viewerCdpEndpoint = trim(runtimeOptions.viewerCdpEndpoint || entry.viewerCdpEndpoint || runtimeOptions.playwrightCdpEndpoint);
    runtimeOptions.playwrightMcpEndpoint = trim(runtimeOptions.playwrightMcpEndpoint || entry.playwrightMcpEndpoint);
    runtimeOptions.agentRevealMode = entry.convertigoRevealMode === true ? "true" : "false";
    try {
      if (entry.home && trim(entry.home.path).length) {
        var bootstrap = bootstrapCodexHome(runtimeOptions, entry.home.path, resolveMcpEndpoint(runtimeOptions));
        if (bootstrap && bootstrap.ok === false) {
          pushEvent(entry, "warning", {
            message: bootstrap.error || bootstrap.message || "Unable to refresh Codex home",
            provider: "codex"
          });
        }
      }
    } catch (refreshError) {
      pushEvent(entry, "warning", {
        message: String(refreshError),
        provider: "codex"
      });
    }
    if (entry.protocol === "codex-app-server") {
      var appServerRequestId = entry.nextRequestId;
      var appServerCursor = entry.nextIndex;
      entry.status = "running";
      entry.phase = "turn";
      entry.lastCodexProgressMessage = "";
      entry.lastCodexAnswerChunk = "";
      entry.codexTurnEnded = false;
      entry.codexAppServerItems = {};
      entry.codexAppServerCompletedItems = {};
      entry.codexAppServerDeltaText = {};
      entry.codexAppServerDeltaPending = {};
      entry.codexAppServerReasoningSummaryPending = {};
      entry.codexAppServerStreamedItems = {};
      entry.codexAppServerItemDeltas = {};
      promptText = withRevealModePrompt(promptText, entry.convertigoRevealMode === true);
      if (!trim(entry.codexThreadId || entry.sessionId).length) {
        return { ok: false, status: "error", handle: handle, error: "Codex app-server thread id is missing", state: statusOf(entry), timestamp: now() };
      }
      try {
        var turnPending = sendCodexAppServerRequest(entry, "turn/start", codexTurnParams(entry, options, promptText, appServerRequestId));
        pushEvent(entry, "turn/start", {
          requestId: turnPending.id,
          provider: "codex",
          textLength: promptText.length,
          threadId: entry.codexThreadId,
          reasoningEffort: entry.reasoningEffort,
          serviceTier: entry.serviceTier
        });
        return {
          ok: true,
          status: "submitted",
          handle: handle,
          requestId: turnPending.id,
          cursor: appServerCursor,
          state: statusOf(entry),
          timestamp: now()
        };
      } catch (appServerPromptError) {
        entry.status = "error";
        entry.phase = "error";
        entry.lastError = String(appServerPromptError);
        pushEvent(entry, "turn/error", {
          message: String(appServerPromptError),
          provider: "codex"
        });
        return {
          ok: false,
          status: "error",
          handle: handle,
          error: String(appServerPromptError),
          state: statusOf(entry),
          timestamp: now()
        };
      }
    }
    var env = mergeEnvObject(copyEnvObject(entry.baseEnv), codexRuntimeEnv(runtimeOptions, entry.home && entry.home.path ? entry.home.path : ""));
    env = mergeEnvObject(env, parseObject(options.env, {}));
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
    promptText = withRevealModePrompt(promptText, entry.convertigoRevealMode === true);
    entry.command = codexCommand(entry.codexPath || "codex", entry, options, promptText);
    entry.envKeys = envKeys(env);
    pushEvent(entry, "turn/start", {
      requestId: requestId,
      provider: "codex",
      textLength: promptText.length,
      resumedThreadId: entry.codexThreadId,
      reasoningEffort: entry.reasoningEffort,
      serviceTier: entry.serviceTier
    });

    try {
      prepareCodexSessionWatcherForPrompt(entry);
      startProcess(entry, env);
      try {
        if (entry.writer !== null) {
          entry.writer.write(promptText);
          entry.writer.newLine();
          entry.writer.flush();
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
