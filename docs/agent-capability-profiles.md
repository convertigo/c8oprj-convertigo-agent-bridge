# Agent capability profiles

This document defines the private integration contract used while Flow support
is developed outside the public 8.4.4 branches.

## Boundary

The integration has four independent dimensions:

- `surface`: Eclipse Studio, Web Studio, or NoCode Studio.
- `authoringPolicy`: `legacy-only`, `flow-only`, or `nocode`.
- `capabilities`: the MCP servers, skills, and viewer control actually installed
  in the selected agent home.
- `projectContext`: selected projects and the current viewer/debug endpoint.

Do not derive the authoring policy from the UI surface. Eclipse and Web Studio
must eventually be able to host either legacy or Flow authoring. A conversation
pins its policy so a Flow benchmark cannot silently use legacy MCP operations.

## Ownership

`ConvertigoAgentBridge` owns provider lifecycle, isolated homes, sessions,
cancellation, event transport, secrets, Playwright/CDP wiring, and capability
profile resolution. It must not know individual Flow MCP tool names.

`ConvertigoAssistant` owns the user conversation and surface context. Before the
first bridge response it uses a small compatibility map to select an endpoint.
After `agent_settings`, the bridge profile is authoritative. Assistant prompts
refer to capability operations such as viewer preparation and readiness, not to
concrete Flow tool names.

Capability projects own their knowledge and installation:

- `ConvertigoMCP._setupCodex` installs legacy and NoCode packs.
- `lib_flow_mcp._setupCodex` installs the Flow MCP configuration, orchestrator,
  backend specialist, and Svelte specialist.

The Flow setup project is required for the `flow-only` policy. Missing setup is
a configuration error. AgentBridge must not generate a substitute Flow skill,
fall back to legacy MCP, call MCP through `curl`, or edit project files directly.

## Current profiles

| Profile | Policy | MCP server | Setup owner | Provider |
| --- | --- | --- | --- | --- |
| `generalist` | `legacy-only` | `convertigo` | `ConvertigoMCP` | Codex, Vibe |
| `nocode` | `nocode` | `convertigo` | `ConvertigoMCP` | Codex, Vibe |
| `flow` | `flow-only` | `convertigo-flow` | `lib_flow_mcp` | Codex |

Aliases remain accepted for compatibility, but persisted conversations use the
canonical profile id.

## Settings contract

`agent_settings` returns:

- `agentProfile`: the active public descriptor.
- `agentProfiles`: supported descriptors.
- `providers[].agentProfile`: the descriptor evaluated for that provider.

The public descriptor includes the policy, capability ids, MCP server/path,
setup owner, managed skill, specialist skills, and supported providers. It does
not expose credentials or internal agent-home paths.

## Branch and rebase policy

Flow integration stays on dedicated local branches until it is ready to be made
public. Rebase these branches regularly on their 8.4.4 parent branches. Resolve
conflicts by preserving the generic bridge contracts first; keep Flow-specific
knowledge in `lib_flow_mcp` rather than copying it into release code.

Validation before rebasing or merging:

1. Legacy profile still installs `convertigo-generalist` and `/api/mcp`.
2. NoCode profile still preserves bearer-token handling and `/api/mcp`.
3. Flow profile installs only `convertigo-flow` through `lib_flow_mcp` and fails
   clearly if that project or its skills are unavailable.
4. The Studio viewer keeps using the managed Playwright/CDP endpoint.
5. Resume, cancellation, progress events, and conversation storage remain
   profile-independent.
