// Vibe ACP provider implementation.
// Loaded by vibe_agent_bridge.js after agent_bridge_common.js.
  C8O.agentBridge.vibeSetup = function (options) {
    options = options || {};
    var install = boolValue(options.install, false);
    var configure = boolValue(options.configure, false);
    var setup = detectRuntime(options);
    var installation = {
      attempted: false,
      steps: []
    };
    var messages = [];

    try {
      if (setup.home.error) {
        throw new Error(setup.home.error);
      }
      if (configure) {
        var written = writeLocalVibeConfig(setup.vibeHome, setup.mcpEndpoint, options.model || options.agentModel);
        messages.push("Local VIBE_HOME config written: " + written.path + " (" + written.model + ")");
      }

      if (install && (!setup.vibe.found || !setup.vibeAcp.found)) {
        installation.attempted = true;
        ensureDirectory(new File(setup.installDir));
        if (!setup.python.found) {
          throw new Error("Python is required to install mistral-vibe");
        }
        if (!new File(setup.venvDir).exists()) {
          installation.steps.push(runCommand([setup.python.path, "-m", "venv", setup.venvDir], { timeoutMs: 120000 }));
        }
        installation.steps.push(runCommand([childPath(setup.venvDir, "bin/python"), "-m", "pip", "install", "--upgrade", "pip"], { timeoutMs: 180000 }));
        installation.steps.push(runCommand([childPath(setup.venvDir, "bin/python"), "-m", "pip", "install", "--upgrade", "mistral-vibe"], { timeoutMs: 600000 }));
      }
    } catch (e) {
      messages.push(String(e));
      setup = detectRuntime(options);
      return {
        ok: false,
        status: "error",
        phase: "setup",
        error: String(e),
        setup: setup,
        installation: installation,
        messages: messages,
        timestamp: now()
      };
    }

    setup = detectRuntime(options);
    var ready = setup.vibe.found && setup.vibeAcp.found;
    if (!setup.config.selected.valid) {
      messages.push("Selected VIBE_HOME has no valid Convertigo MCP HTTP server config yet");
    }
    return {
      ok: ready,
      status: ready ? "ready" : "missing",
      setup: setup,
      installation: installation,
      messages: messages,
      timestamp: now()
    };
  };

  C8O.agentBridge.vibeStart = function (options) {
    options = options || {};
    var autoConfigure = boolValue(options.autoConfigure, !trim(options.vibeHome).length);
    var setup = C8O.agentBridge.vibeSetup({
      workspaceRoot: options.workspaceRoot,
      installDir: options.installDir,
      vibeHome: options.vibeHome,
      vibeHomeScope: options.vibeHomeScope || options.homeScope || options.scope,
      userId: options.userId,
      conversationId: options.conversationId,
      projectId: options.projectId,
      mcpEndpoint: options.mcpEndpoint,
      model: options.model || options.agentModel,
      install: false,
      configure: autoConfigure
    });
    if (!setup.ok) {
      return {
        ok: false,
        status: "error",
        phase: "setup",
        error: "vibe and vibe-acp are required before start",
        setup: setup,
        timestamp: now()
      };
    }

    var handle = trim(options.handle) || makeHandle("vibe");
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
    var vibeHome = setup.setup.vibeHome;
    var credentials = applyCredentialsPolicy(env, options, vibeHome);
    if (vibeHome.length) {
      env.VIBE_HOME = vibeHome;
    }
    var cwd = normalizeDirectory(options.cwd, setup.setup.workspaceRoot);
    var mcpEndpoint = trim(options.mcpEndpoint) || setup.setup.mcpEndpoint || DEFAULT_MCP_ENDPOINT;
    var command = parseCommand(options.command, [setup.setup.vibeAcp.path || "vibe-acp"]);
    var ttlMillis = intValue(options.ttlSeconds, DEFAULT_TTL_SECONDS, 30, 86400) * 1000;
    var timeoutMs = intValue(options.requestTimeoutMs, 60000, 1000, 600000);
    var entry = createEntry(handle, "vibe", "acp", command, cwd, env, ttlMillis, setup.setup.home, credentials, setup.setup.model);
    registry.put(handle, entry);

    try {
      startProcess(entry, env);
      pushEvent(entry, "system/start", {
        handle: handle,
        command: command,
        cwd: cwd,
        envKeys: envKeys(env),
        vibeHome: vibeHome,
        model: setup.setup.model,
        home: publicHomeInfo(setup.setup.home),
        credentials: {
          policy: credentials.policy,
          injectedKeys: credentials.injectedKeys,
          sources: credentials.sources
        },
        mcpEndpoint: mcpEndpoint
      });

      entry.phase = "initialize";
      entry.init = acpRequest(entry, "initialize", {
        protocolVersion: 1,
        clientInfo: {
          name: "ConvertigoAgentBridge",
          version: "0.1.0"
        },
        clientCapabilities: {
          fs: {
            readTextFile: false,
            writeTextFile: false
          },
          terminal: false,
          auth: {
            terminal: false
          }
        }
      }, timeoutMs);

      entry.phase = "session/new";
      entry.session = acpRequest(entry, "session/new", {
        cwd: cwd,
        mcpServers: buildMcpServers(mcpEndpoint)
      }, timeoutMs);
      entry.sessionId = String(entry.session.sessionId || entry.session.session_id || "");
      entry.phase = "ready";
      entry.status = "running";
      pushEvent(entry, "acp/session", {
        sessionId: entry.sessionId,
        result: entry.session
      });
      rememberSessionHandle(handle);

      return {
        ok: true,
        status: "started",
        handle: handle,
        sessionId: entry.sessionId,
        cursor: entry.nextIndex,
        state: statusOf(entry),
        timestamp: now()
      };
    } catch (e) {
      entry.status = "error";
      entry.lastError = String(e);
      entry.closedAt = now();
      pushEvent(entry, "error", {
        message: String(e),
        phase: entry.phase,
        acpError: e.acpError || null
      });
      stopEntry(entry, false);
      return {
        ok: false,
        status: "error",
        phase: entry.phase,
        error: String(e),
        acpError: e.acpError || null,
        handle: handle,
        state: statusOf(entry),
        timestamp: now()
      };
    }
  };

  C8O.agentBridge.vibePrompt = function (options) {
    options = options || {};
    var handle = resolveHandle(options.handle);
    if (!handle.length) {
      return { ok: false, status: "error", error: "handle is required", timestamp: now() };
    }
    var entry = getRegistry().get(handle);
    if (entry === null || typeof entry === "undefined") {
      return { ok: false, status: "not_found", handle: handle, error: "Unknown handle", timestamp: now() };
    }
    if (!processAlive(entry.process) || entry.status !== "running") {
      return { ok: false, status: "not_running", handle: handle, state: statusOf(entry), timestamp: now() };
    }

    var promptText = String(options.prompt || "");
    if (!trim(promptText).length) {
      return { ok: false, status: "error", handle: handle, error: "prompt is required", timestamp: now() };
    }
    var messageId = trim(options.messageId);
    var params = {
      sessionId: entry.sessionId,
      prompt: [{
        type: "text",
        text: promptText
      }]
    };
    if (messageId.length) {
      params.messageId = messageId;
    }

    try {
      var pending = sendAcpRequest(entry, "session/prompt", params);
      pushEvent(entry, "turn/start", {
        requestId: pending.id,
        messageId: messageId,
        textLength: promptText.length
      });
      var wait = boolValue(options.waitForCompletion, false);
      if (wait) {
        var timeoutMs = intValue(options.requestTimeoutMs, 600000, 1000, 3600000);
        var response = waitForPending(entry, pending, timeoutMs, true);
        return {
          ok: true,
          status: "completed",
          handle: handle,
          requestId: pending.id,
          response: response,
          cursor: entry.nextIndex,
          state: statusOf(entry),
          timestamp: now()
        };
      }
      return {
        ok: true,
        status: "submitted",
        handle: handle,
        requestId: pending.id,
        cursor: entry.nextIndex,
        state: statusOf(entry),
        timestamp: now()
      };
    } catch (e) {
      entry.lastError = String(e);
      pushEvent(entry, "turn/error", {
        message: String(e),
        acpError: e.acpError || null
      });
      return {
        ok: false,
        status: "error",
        handle: handle,
        error: String(e),
        acpError: e.acpError || null,
        state: statusOf(entry),
        timestamp: now()
      };
    }
  };

  C8O.agentBridge.vibeClose = function (options) {
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
    try {
      if (processAlive(entry.process) && entry.sessionId) {
        acpRequest(entry, "session/close", { sessionId: entry.sessionId }, 3000);
      }
    } catch (e) {
      pushEvent(entry, "warning", { message: String(e), phase: "session/close" });
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
