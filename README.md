# Convertigo Agent Bridge

Projet Convertigo dedie a l'integration locale des agents IA dans Convertigo
Studio.

L'objectif est d'exposer a l'assistant une interface HTTP/polling simple, sans
WebSocket, capable de piloter un agent CLI persistant comme `vibe-acp`. Le
projet `ConvertigoMCP` reste le serveur MCP appele par l'agent, mais il ne porte
pas le wrapper d'agent.

## Etat iteration 1

Le projet `ConvertigoAgentBridge` est un projet Convertigo autonome place dans :

```text
/Users/nicolas/git/c8oprj-convertigo-agent-bridge
```

Il expose les sequences publiques suivantes :

- `agent_python_setup` : verifie ou installe un runtime Python local au
  workspace Convertigo.
- `agent_vibe_setup` : verifie ou installe le runtime Vibe local.
- `agent_vibe_start` : lance `vibe-acp`, fait `initialize`, puis cree une
  session ACP.
- `agent_vibe_prompt` : envoie un prompt a la session ACP.
- `agent_events` : lit les evenements normalises par long-poll HTTP.
- `agent_status` : retourne les process vivants en memoire serveur.
- `agent_vibe_close` : ferme la session et arrete le process.
- `agent_sweep_expired` : nettoie les process abandonnes.

Les process sont gardes en memoire serveur via `context.server.set/get`. Le
handle courant est memorise dans la session HTTP pour permettre au chatbot de
continuer a appeler `agent_events` ou `agent_vibe_prompt` sans repasser le
handle a chaque requete.

## Appels HTTP

Sur le hotfix 8.4.4 beta courant, les appels HTTP directs doivent passer le
connecteur minimal `void` :

```text
http://localhost:18082/convertigo/projects/ConvertigoAgentBridge/.json?__connector=void&__sequence=agent_vibe_setup
```

Exemple de check runtime :

```bash
curl -sS 'http://localhost:18082/convertigo/projects/ConvertigoAgentBridge/.json?__connector=void&__sequence=agent_vibe_setup&install=false&configure=false'
```

Exemple d'installation Python workspace-local :

```bash
curl -sS 'http://localhost:18082/convertigo/projects/ConvertigoAgentBridge/.json?__connector=void&__sequence=agent_python_setup&install=true'
```

Exemple de demarrage ACP :

```bash
curl -sS --get \
  --data-urlencode '__connector=void' \
  --data-urlencode '__sequence=agent_vibe_start' \
  --data-urlencode 'handle=test-vibe-wrapper' \
  --data-urlencode 'cwd=/Users/nicolas/git' \
  --data-urlencode 'vibeHome=/Users/nicolas/git/agents/vibe/.vibe-home' \
  --data-urlencode 'env={"MISTRAL_API_KEY":"dummy"}' \
  'http://localhost:18082/convertigo/projects/ConvertigoAgentBridge/.json'
```

Le streaming cote UI se fait par polling :

```bash
curl -sS --get \
  --data-urlencode '__connector=void' \
  --data-urlencode '__sequence=agent_events' \
  --data-urlencode 'handle=test-vibe-wrapper' \
  --data-urlencode 'cursor=0' \
  --data-urlencode 'waitMs=1000' \
  'http://localhost:18082/convertigo/projects/ConvertigoAgentBridge/.json'
```

## Vibe ACP

La voie produit pour Vibe est ACP sur stdio, pas un wrapper batch
`vibe --continue`. ACP conserve le contexte dans le process vivant et remonte
les updates de raisonnement, reponse, outils, usage et permissions en temps
reel.

Le bootstrap Vibe fait :

1. Detection de Python, `uv`, `vibe` et `vibe-acp`, y compris les chemins
   usuels hors `PATH` du Studio (`~/.local/bin`, `/opt/homebrew/bin`,
   `/usr/local/bin`).
2. Si Python est absent et que `install=true`, installation d'un Python
   standalone dans `<workspace>/agents/runtimes/python/<runtime>`.
3. Avec `install=true`, creation de `<workspace>/agents/vibe/.venv`, puis
   installation de `mistral-vibe` via `pip`.
4. Avec `configure=true`, ecriture de
   `<workspace>/agents/vibe/.vibe-home/config.toml` avec le MCP Convertigo en
   HTTP : `http://localhost:18082/convertigo/api/mcp`.
5. Demarrage de `vibe-acp` avec ce `VIBE_HOME`, puis handshake ACP
   `initialize` + `session/new`.

Vibe 2.9.6 charge aussi sa config `config.toml`; le champ ACP `mcpServers` seul
ne suffit pas. Le setup local configure donc explicitement le MCP dans le
`VIBE_HOME` utilise par le process.

## Runtime Python workspace-local

`agent_python_setup` installe Python dans le workspace Convertigo, pas dans le
projet. Par defaut :

```text
<workspace>/agents/runtimes/python/cpython-3.12.13-20260610-<platform>
```

Le setup utilise d'abord un Python deja disponible (`pythonPath`, `PYTHON`,
venv local, `~/.local/bin`, Homebrew, `python3`, `python`). Si aucun Python
n'est trouve et que `install=true`, il telecharge une archive
`python-build-standalone` via le client HTTP du moteur Convertigo, donc avec la
configuration proxy du serveur. Le telechargement peut etre remplace par :

- `pythonArchiveUrl` : URL directe de l'archive.
- `pythonAssetUrlPrefix` ou `pythonMirrorBaseUrl` : prefixe d'un miroir
  interne, avec support de `{tag}`.
- `pythonArchiveSha256` : controle optionnel de checksum.
- `allowPythonDownload=false` : mode diagnostic/offline, sans telechargement.

Les chemins optionnels (`installDir`, `pythonInstallDir`, `cwd`) peuvent etre
absolus ou relatifs. Quand ils sont relatifs, ils sont resolus depuis le
workspace Convertigo.

Cette installation est partageable par les providers. Les venvs restent separes
par agent, par exemple `<workspace>/agents/vibe/.venv`.

## Isolation VIBE_HOME

Le projet bridge est commun a plusieurs agents et plusieurs frontaux, mais
chaque process peut utiliser un `VIBE_HOME` separe. Le client choisit avec
`vibeHomeScope` :

- `shared` : home commun historique, `<workspace>/agents/vibe/.vibe-home`.
- `user` : home par utilisateur, sous `<workspace>/agents/vibe/homes/users`.
  `userId` est requis si le contexte Convertigo ne fournit pas deja un
  utilisateur authentifie.
- `conversation` : home par conversation, sous
  `<workspace>/agents/vibe/homes/conversations` ou sous le home utilisateur si
  `userId` est fourni. Si `conversationId` est vide, un id est genere et garde
  dans la session HTTP.
- `vibeHome` explicite : prioritaire sur le scope, utile pour tests ou
  integrations avancees.

`projectId` peut etre fourni pour ajouter un niveau projet dans les homes
`user` et `conversation`. Les identifiants utilisateur/projet/conversation sont
hashes dans les chemins afin de ne pas exposer directement un email ou login
dans le filesystem.

Les credentials sont separes de ce choix de home. `agent_vibe_start` accepte
`credentialsPolicy` :

- `explicit` : uniquement les variables passees dans `env`, comportement par
  defaut.
- `user-home` : injecte les variables trouvees dans `~/.vibe/.env`.
- `vibe-home` : injecte les variables trouvees dans le `.env` du `VIBE_HOME`
  choisi.
- `auto` : tente `vibe-home`, puis `user-home`.

Les valeurs des variables ne sont jamais retournees dans les evenements ou les
status, seuls les noms de variables injectees le sont.

## Validation locale

Validation faite le 2026-06-15 sur `localhost:18082` :

- `agent_vibe_setup install=false configure=false` detecte Python 3.14.5,
  `uv` 0.11.5, `vibe` 2.9.6 et `vibe-acp` 2.9.6.
- Le `VIBE_HOME` local valide est
  `/Users/nicolas/git/agents/vibe/.vibe-home`.
- Un `VIBE_HOME` explicite isole sous
  `/Users/nicolas/git/agents/vibe/homes/test-explicit/.vibe-home` est configure
  correctement et passe `initialize` + `session/new`.
- `agent_vibe_start` avec une cle factice `MISTRAL_API_KEY=dummy` passe
  `initialize` et `session/new` sans envoyer de prompt LLM.
- `agent_events` expose les evenements ACP initiaux, dont `acp/request`,
  `acp/response`, `commands/update` et `acp/session`.
- `agent_vibe_close` ferme la session et retire le process de la memoire
  serveur.

## Priorites suivantes

1. Ajouter une route/facade plus propre pour eviter de passer
   `__connector=void` dans les appels assistant.
2. Valider l'installation Python/Vibe sur un serveur sans Python preinstalle.
3. Valider un prompt Vibe ACP bout en bout avec MCP Convertigo actif et une
   vraie authentification Vibe.
4. Declencher `agent_sweep_expired` depuis un scheduler Convertigo.
5. Brancher l'UI assistant locale par polling HTTP.
