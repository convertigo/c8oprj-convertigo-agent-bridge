# Convertigo Agent Bridge Notes

This project is the Convertigo-side runtime bridge for local AI agents such as
Codex and Vibe. Keep this file current when workflow decisions or runtime
contracts change, so another agent can resume the work without rediscovering the
same context.

## Convertigo Project Editing

- Do not hand-edit `_c8oProject/*.yaml` or `c8oProject.yaml`.
- Use the Convertigo MCP tools for every Convertigo object mutation, then verify
  the live tree with `databaseobject_tree_get` when needed.
- Direct edits are acceptable for plain source files such as `js/*.js`,
  `docs/*.md`, `README.md`, and this `AGENTS.md`.
- After editing JavaScript helpers, run `node --check` on the touched files.

## Runtime Scope

- Default Studio workspace root is usually
  `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudioHotfix/.metadata/.plugins/com.twinsoft.convertigo.studio`.
- Runtime agent files must live under `<workspaceRoot>/agents`, not under the
  Eclipse metadata plugin directory guessed from the repository.
- Do not commit generated runtime content from `<workspaceRoot>/agents`.

## Codex Integration

- Main files:
  - `js/agent_bridge_common.js`
  - `js/agent_bridge_codex.js`
  - `js/vibe_agent_bridge.js`
- The default Codex home scope is `user`, not the user's global home.
- The visible default Codex home path is:
  `<workspaceRoot>/agents/codex/homes/users/<stable-user-id>/codex-home`
- Avoid hidden `.codex-home` directories for the default managed home; Finder
  visibility matters for support and demos.
- The Codex CLI should be installed under `<workspaceRoot>/agents/codex/npm`
  when the managed workspace install path is used.
- Codex setup must synchronize the Convertigo Generalist skill into the managed
  `codex-home/skills/convertigo-generalist/SKILL.md` and write MCP config into
  `codex-home/config.toml`.
- The MCP endpoint should be derived from the current Convertigo endpoint when
  possible. Local hotfix Studio commonly uses
  `http://localhost:18082/convertigo/api/mcp`; standard Studio/server ports may
  differ.
- Validate Codex setup with `ConvertigoAgentBridge.agent_codex_setup` before
  debugging Assistant UI symptoms.

## Current 1.2.0 Roadmap

- Expose an agent settings/capabilities contract for the Assistant UI.
- Models and reasoning choices must be discovered from the installed CLIs when
  possible, not maintained only as Assistant-side hardcoded values.
- The contract should describe providers, available models, default model,
  reasoning levels, and support flags such as resume, stop, images, and MCP.
- Codex remains the priority provider. Vibe should return a degraded but explicit
  capability set until its CLI exposes equivalent model/settings metadata.
- Keep the Convertigo Generalist skill synchronized and forced by setup; it
  should not be a user-visible choice in Studio.

## Vibe Integration

- Main files:
  - `js/agent_bridge_common.js`
  - `js/agent_bridge_vibe.js`
  - `js/vibe_agent_bridge.js`
- Vibe conversations and homes are managed under `<workspaceRoot>/agents/vibe`.
- Python/Vibe setup is separate from Codex setup. Keep the shared helper logic in
  `agent_bridge_common.js` and provider-specific behavior in the provider files.

## Event Flow

- Assistant UI reads agent progress through `agent_events` / long polling.
- Do not depend on WebSocket for now; it is not yet supported by the server/SDK
  and is often blocked in enterprise environments.
- Avoid flooding Studio logs. Prefer long polling and meaningful progress
  events over tight polling loops.
- Stop/close behavior should be explicit and should clean up process handles kept
  in server memory.

## Build And Release

- Follow the standard Convertigo project build used by the neighboring projects;
  do not invent a custom GitHub Actions build path.
- Tags are expected to match the Convertigo project version when producing `.car`
  releases.
