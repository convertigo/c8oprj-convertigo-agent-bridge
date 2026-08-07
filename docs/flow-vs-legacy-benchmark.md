# Flow versus legacy real-chart benchmark

This benchmark compares authoring effectiveness, not memorized implementation
details. Run each candidate in a fresh Studio conversation with the same model,
reasoning effort, engine build and network conditions.

## Fixed input

Use this real Nasdaq source in both prompts, unchanged:

```text
https://api.nasdaq.com/api/quote/TSLA/historical?assetclass=stocks&fromdate=2010-06-29&todate=2026-08-04&limit=5000
```

The endpoint returns actual TSLA history and requires no API key. The benchmark
must not replace it with fixtures, remembered prices or a different service.

## Flow prompt

```text
Utilise Convertigo Flow. Cree un nouveau projet nomme TeslaStockFlowNeo qui
affiche un graphique de l'evolution du cours de l'action Tesla depuis son
introduction en bourse, avec les donnees reelles de cette URL :
https://api.nasdaq.com/api/quote/TSLA/historical?assetclass=stocks&fromdate=2010-06-29&todate=2026-08-04&limit=5000
Ne consulte, ne copie et ne reutilise aucun projet existant. Ouvre et verifie le
resultat dans le viewer Studio.
```

## Legacy prompt

```text
Utilise Convertigo legacy. Cree un nouveau projet nomme TeslaStockLegacyNeo qui
affiche un graphique de l'evolution du cours de l'action Tesla depuis son
introduction en bourse, avec les donnees reelles de cette URL :
https://api.nasdaq.com/api/quote/TSLA/historical?assetclass=stocks&fromdate=2010-06-29&todate=2026-08-04&limit=5000
Ne consulte, ne copie et ne reutilise aucun projet existant. Ouvre et verifie le
resultat dans le viewer Studio.
```

The prompts deliberately do not mention a chart library, HTTP implementation,
data parsing strategy, build command or internal object model. Those decisions
must come from the selected skills, MCP diagnostics and available catalogs.

## Run controls

- Use one fresh conversation per candidate and reasoning effort `medium`.
- Start from no project with the target name. Do not expose neighboring project
  content to the agent.
- Keep both MCP servers installed. The router must select the requested
  authoring model from the explicit prompt.
- Do not perform a production build. A running dev viewer is the finish line.
- Do not intervene or repair the result during the timed run.
- Record setup warm-up separately when npm or a provider library is installed
  for the first time.

## Acceptance

A candidate passes only when all of the following are visible or directly
verifiable:

- the backend calls the supplied URL and returns real historical rows;
- price strings are normalized to numeric values and ordered by date;
- the frontend renders a real line chart, not a table-only substitute;
- loading, error and empty states exist;
- the project is understandable in the Studio tree and contains no mock;
- the dev viewer is opened and the browser console has no application error.

## Measurements

Capture these milestones from the conversation and MCP trace:

1. conversation start;
2. project bootstrap complete;
3. asynchronous dev setup started;
4. backend first successful real-data run;
5. frontend first useful preview;
6. final accepted viewer proof.

Report elapsed time per phase, total wall time, MCP tool-call count, repair
passes, and token usage. Compare warm and cold dependency runs separately.
