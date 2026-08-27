# Agent Run Optimization TODO

This checklist tracks the generic latency, reliability, and observability work
identified while testing end-to-end Agent runs. It must not be optimized for a
single prompt or demo application.

## Reference Baseline

Reference run: fresh NGX application creation on Windows with GPT-5.6 Terra at
medium reasoning.

- Total duration: 6 min 39 s.
- 41 MCP calls and 39 model cycles.
- MCP time: 203.5 s, including 186.6 s in mobile builder calls.
- Two `mobile-builder-open` calls consumed their full 90 s timeout although the
  viewer URL and browser control were already available.
- Raw nested tool output was about 242 kB; tree reads and palette descriptions
  were the main contributors.
- The asynchronous viewer launch, project adoption, JxBrowser Playwright
  control, compile-error correction, and final runtime proof all worked.

Keep this baseline only as a comparison point. Validate improvements on cold
setup, warm continuation, backend-only, frontend-edit, and new-project flows.

## P0 - Remove Deterministic Waits

### Builder readiness semantics

- [x] **Owner: Convertigo MCP.** Separate `viewerReady`,
  `browserControlReady`, `buildObserved`, and `compileState` instead of deriving
  one ambiguous `building` status.
- [x] Return promptly when JxBrowser has a non-blank application URL and CDP is
  ready, even if no terminal build event was observed.
- [x] Keep compile state `unknown` when there is no build evidence; do not report
  a successful compilation only because the viewer is reachable.
- [x] Never report that the browser URL is missing when `viewerHomeUrl` or a CDP
  URL is present.
- [x] Preserve `wait=true` for callers that explicitly need terminal build
  evidence, but distinguish browser readiness from compilation completion.
- [x] Reject the transient Studio `Convertigo FlashUpdate` shell as viewer and
  browser-control readiness, and select the NGX application's actual root page
  before exposing the JxBrowser target.

Acceptance: a ready viewer no longer consumes the default 90 s timeout, and the
response describes browser and compile readiness independently.

Validation (2026-08-27, Studio/JxBrowser on port 18082): asynchronous launch
returned in 0.34 s, the initial compile and viewer wait returned in 5.16 s, and
a warm browser-ready probe returned in 1.88 s with
`readyReason=browser_control_ready` and `compileState=unknown`. The historical
false 90 s timeout did not recur.

Validation (2026-08-27, fresh Windows project): a state-only probe correctly
reported `browserControlReady=false` while JxBrowser was still on
`/index.html` with title `Convertigo FlashUpdate`. A normal non-restarting open
then reused the live builder, selected the root `home` page, and returned
`browserControlReady=true` on `/home` with the application title.

### Compile diagnostics in Studio and server mode

- [x] **Owner: Convertigo MCP / engine integration.** Expose build errors and
  terminal state from the available builder signals.
- [x] Use Eclipse job information only as an optional Studio signal. The MCP
  must remain functional on a Convertigo server without Eclipse.
- [x] Capture Angular compiler errors early enough for the agent to correct them
  before visual validation when the builder exposes them.
- [x] Keep Playwright as runtime acceptance proof, not as the only way to
  discover a compiler overlay.

Acceptance: an intentional Angular compile error is returned promptly in Studio,
while the same API remains valid and non-blocking in headless server mode.

Validation (2026-08-27): the integration probe returned `compile_error` with
four structured Angular diagnostics in 1.75 s, returned `ready` after repair,
then classified an unchanged generation as `not_required` in 1.89 s. The
temporary probe project was removed after the test.

## P0 - Avoid Redundant Bootstrap Work

### Current guidance must supersede historical warnings

- [x] **Owner: Agent Bridge.** Include the current guidance compatibility result
  as structured preflight state for every submitted turn.
- [x] After a scoped setup refresh, explicitly tell the active agent process that
  configuration is current and that setup must not be repeated.
- [x] Ignore a guidance mismatch from earlier conversation history once the
  current managed home uses the expected version.
- [ ] Prevent managed conversations from invoking a no-scope setup that updates
  the user's global Codex home.
- [x] **Owner: managed skills.** Do not reread capabilities and the Start guide
  during a warm continuation unless the current preflight reports a mismatch or
  the requested capability has not been loaded.

Acceptance: a warm follow-up with current configuration performs no setup call
and no repeated general guide discovery.

Validation (2026-08-27, warm Windows continuation): the agent reused the
current contracts without `ALL_TOOLS`, palette, capabilities, or Start-guide
rediscovery. The first coherent mutation started after 16 s and the complete
turn finished in about 66 s bridge-side (about 1 min 15 s observed in the UI).

### Startup conversation discovery

- [x] **Owner: Assistant.** Stop the page-level host-context wait as soon as
  Agent settings providers are loaded or the settings refresh has completed.
- [x] Keep conversation listing responsible for its own Bridge readiness and
  retry policy instead of blocking it behind the 95 s page-event timeout.
- [x] Validate after a full Studio restart that resumable conversations appear
  on the first page load without using Refresh or Home.

Acceptance: after Studio startup and project loading, the first Assistant view
lists resumable conversations as soon as Agent settings are available.

Validation (2026-08-27, Windows): after rebuilding and restarting Studio, the
Assistant opened directly on Home with the resumable conversation available.

### Resident app-server lifecycle

- [ ] **Owner: Agent Bridge.** Measure MCP ping, scoped setup, process start or
  resume, MCP initialization, and tool discovery as separate phases.
- [ ] Reuse a healthy per-conversation Codex app-server.
- [ ] Restart only when the effective config fingerprint changes, such as MCP
  endpoint, guidance version, viewer debug port, skill profile, or credentials.
- [ ] Persist and compare the fingerprint before rewriting configuration or
  restarting the process.

Acceptance: an unchanged warm continuation reaches prompt submission in a few
seconds and records why any restart was necessary.

## P1 - Reduce Agent Discovery And Repair Loops

### Exact minimal tool recipes

- [ ] **Owner: Convertigo MCP guides / managed skills.** Document copyable,
  minimal signatures for project import, tree mutation, builder readiness, and
  JxBrowser Playwright validation.
- [ ] Document the supported JxBrowser Playwright path, including tab listing,
  snapshot or find, interaction, wait, and evaluation.
- [ ] State unsupported or misleading patterns explicitly, including arbitrary
  browser creation, unsupported `query` parameters, and guessed targets such as
  `main`.
- [ ] Require the agent to report a managed Playwright configuration problem
  instead of falling back to ad hoc Node or browser scripts.

Acceptance: a fresh agent completes the documented core path without a failed
first call or tool-signature discovery round.

Implementation note (2026-08-27): warm-turn prompts and generated generalist
skills now provide the optimized `batch-call`, builder-readiness, and
JxBrowser proof contracts directly. They also prohibit `ALL_TOOLS` metadata
lookups for those named tools and treat previously successful object/property
shapes as confirmed contracts. A fresh Windows run still queried `ALL_TOOLS`
twice and emitted about 20k tokens of tool metadata before its first useful
operation. The initial Codex prompt now supplies the exact callable routes for
the standard Convertigo and JxBrowser proof tools; another fresh run must prove
that this removes metadata discovery before checking this section complete.

### Batch coherent mutations

- [x] **Owner: managed skills and Convertigo MCP.** Build a coherent object plan
  before applying small, sequential tree patches.
- [x] Prefer one to three logical mutation rounds for a simple page and combine
  independent operations with the existing batch facilities.
- [ ] Perform one targeted readback after mutation rather than repeatedly
  rereading the whole tree.
- [ ] Keep recovery granular when a batch partially fails; do not trade latency
  for opaque failures.

Acceptance: representative simple frontend work requires at most three mutation
rounds plus one targeted verification read.

Implementation note (2026-08-27): warm continuations now explicitly require one
optimized mutation batch for independent targets. The batch defers refresh,
save, and mobile-builder notification to one finalization. The Windows
continuation run confirmed one `batch-call` containing four
`databaseobject-tree-apply` operations, followed by one builder readiness cycle
and one combined Playwright acceptance proof. Targeted readback and
partial-batch recovery remain to be validated.

Validation note (2026-08-27, `SuiviHabitudes` continuation): the turn took
about 4 min 01 s and 38 calls. It avoided skill and `ALL_TOOLS` rediscovery but
performed 19 tree reads because model-generated `depth` was silently ignored in
favor of the default `childrenDepth=1`. The MCP now accepts `depth` as a real
compatibility alias; a live `depth:3` probe returned 15 descendants over three
levels in one call. The managed prompt also documents `at:"inside"` root-node
semantics and parent-scoped NGX palette lookup, which caused four avoidable
failed calls in this run.

Validation note (2026-08-27, second warm `SuiviHabitudes` continuation): the
visible filter and counter task completed in 1 min 33 s with 11 MCP calls: two
coherent mutation batches, one builder-readiness probe, and eight Playwright
calls against the Studio JxBrowser. It performed no tree, palette, skill,
capability, Start-guide, or `ALL_TOOLS` rediscovery. The first mutation started
after 44 s, while all MCP and Playwright calls together consumed about 7 s, so
the dominant remaining latency is before tool execution rather than in the
builder or MCP transport. Playwright proved all three filter states with zero
console errors and the viewer remained ready on `/habitudes`.

## P1 - Reduce Context And Payload Cost

- [x] **Owner: Convertigo MCP / Bridge wrapper.** Avoid returning the same result
  in both text and structured content for managed Codex and Vibe transports.
  Keep the default endpoint response backward compatible for older clients.
- [ ] Add or use compact result modes for tree reads, palette descriptions, and
  successful mutations.
- [ ] Request only the required tree depth, properties, and palette details.
- [ ] Reserve verbose palette descriptions for unknown components or ambiguous
  contracts.
- [ ] Measure payload size by tool and expose the largest contributors in test
  diagnostics.

Acceptance: the reference workflow reduces raw tool output by at least 50%
without removing information needed to recover from errors.

Implementation note: managed configurations now add `jsonOnly=true` to the MCP
URL while preserving existing query parameters. On a representative
`project-list` response this reduced the JSON response from 1260 to 563 bytes
(55%) without removing `structuredContent`. Full-workflow payload measurement is
still required for the acceptance criterion.

## P1 - End-To-End Timing Visibility

- [ ] **Owner: Agent Bridge and Assistant.** Persist timestamps for user submit,
  Bridge acceptance, app-server ready, task started, first model event, first MCP
  call, async builder start, viewer/CDP ready, compile terminal state,
  Playwright proof, and task completion.
- [ ] Distinguish time spent waiting on the model, Bridge bootstrap, MCP calls,
  builder readiness, compilation, and UI verification.
- [ ] Keep detailed timings in diagnostics; show only useful progress states in
  the Assistant UI.
- [ ] Include model, reasoning effort, cold/warm state, cache state, provider,
  platform, and project type in performance reports.

Acceptance: one diagnostic report reconstructs the complete phase breakdown
without manually correlating Assistant logs, Bridge logs, and JSONL events.

## P2 - Regression And Performance Coverage

### Convertigo MCP tests

- [x] Cover `about:blank` while the viewer is starting.
- [x] Cover browser ready with build state not observed.
- [x] Cover a terminal compile error and a successful terminal build.
- [x] Cover an Angular/Vite error overlay rendered inside its shadow DOM.
- [x] Cover a stopped viewer that must restart.
- [x] Cover server-mode readiness decisions with no Eclipse APIs available.

### Agent Bridge tests

- [ ] Cover a stale historical guidance warning with valid current config.
- [ ] Cover an unchanged config fingerprint with no app-server restart.
- [ ] Cover a changed debug port, guidance version, profile, or credential source
  causing exactly one restart.
- [ ] Cover conversation resume and adoption of a project created during the
  conversation.

### End-to-end tests

- [ ] Run from a clean Windows workspace through stack setup, authentication,
  first conversation, project creation, and visual proof.
- [x] Run a warm follow-up in the same conversation.
- [x] Verify that Playwright controls the visible Studio JxBrowser and never
  opens an external browser.
- [ ] Run an equivalent headless Convertigo server scenario without Studio UI
  assumptions.
- [ ] Add backend-only and non-visual prompts to ensure the viewer is not made a
  mandatory dependency for unrelated work.

## Release Gate

- [x] No false 90 s builder wait when browser control is ready.
- [x] No redundant setup or general guide reload on a warm continuation.
- [x] Compile errors are visible through structured builder diagnostics when
  available.
- [x] No external Playwright browser or ad hoc automation fallback.
- [ ] Asynchronous viewer startup still overlaps useful agent work.
- [x] New projects remain attached to the conversation that created them.
- [ ] Warm and cold timing reports are reproducible and attributable by phase.
- [ ] Server mode remains independent from Eclipse-specific services.
