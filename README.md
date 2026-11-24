# TODO watcher

**English** · [Русский](README.ru.md)

A DeepSeek Harness plugin that keeps the TODO plaque above the composer current.
That plaque is **stock DSH UI** (`@deepseek-ai/dsh-client-ui-conversation`,
`conversation.input.dock`, id `todo`): it shows the tasks of the current round
and reads the `todos` projection, which the `todo/write` session event fills.
Agents routinely forget to create or refresh that list, so the plugin does it
itself.

## What it does

Every 30 seconds (configurable) the watcher walks the live sessions and:

| Situation | Action |
|---|---|
| no list in the current turn | creates one from the human request |
| the list is left over from a previous turn | replaces it with a current one |
| the turn ended and items are unfinished | marks the finished ones completed |
| the list exists in this turn and is fresh | leaves it alone |

Every nudge goes to a journal: time, session (title or short id), action, source
of the wording, and item count. The «TODO watcher» panel in the left sidebar
shows the latest 5 entries and refreshes every 5 seconds. The journal lives in
memory and in `.nudges.json`, so it survives a restart.

The plugin renders no panel of its own over the composer: it only writes
`todo/write` in the same shape as the agent's `todo_write` tool. It adds no
session event types and never wakes an agent.

## Where the wording comes from

- **The session model** (default): a one-off `ctx.llm` call on the same route as
  the session's main request (`session.requestHeader().config`), at most once per
  60 seconds per session, with a 20 second timeout and a 400 token cap. The answer
  must be strict JSON and is normalized (≤7 items, ≤120 characters each, no
  duplicates, at most one `in_progress` when parallelism is off).
- **Heuristic fallback**: if the model is unavailable, not configured, timed out,
  or answered garbage. Existing wording is kept and statuses follow progress; with
  no list at all, items come from the request lines.

Writes happen only when the list actually changes.

## Install

```bash
npm install && npm run build
```

Then **Plugins → Add plugin** (or `install_bundle` for the `/home/main/PluginTODO`
directory) and **restart `dsh web`**: the bundle patch and the client half are
applied at server start only.

## Configure

```yaml
- id: todo-watch
  config:
    checkIntervalSeconds: 30    # 5–600
    refreshSeconds: 60          # refresh a running turn this often (15–600)
    staleAfterMinutes: 10       # 0 — never treat an idle list as stale
    curator: llm                # llm | heuristic
    llmProvider: ''             # defaults to the session route
    llmModel: ''
    llmMinIntervalSeconds: 60
    llmTimeoutMs: 20000
    llmMaxOutputTokens: 400
    maxItems: 7
    allowParallelInProgress: true
    promoteCompletedOnTurnEnd: true
    includeSubagents: false
    historySize: 5              # entries in the sidebar panel (1–50)
```

Set `curator: heuristic` to run without model calls. See
[docs/DETAIL.md](docs/DETAIL.md) (Russian: [docs/DETAIL.ru.md](docs/DETAIL.ru.md))
for the full design, the HTTP endpoint, and limitations.

## Build and test

```bash
npm run typecheck
npm run build      # host: tsc → terser; client: tsc → loader wrapper → terser
npm test           # typecheck + 67 tests
```

Sizes after minification: host ≈ 14.6 KB, client ≈ 6.3 KB.

## Interface languages

The panel, the sidebar entry and the plugin page metadata ship in **Russian**,
**English** and **Chinese**. The active language follows the GUI locale, so the
sidebar label and all panel strings switch without a reload.

## Donations

The plugin is free and stays free. If it saves you time and you want to say
thanks, any of these addresses works — pick the network in the comment.

```text
BTC   bc1qmvw20wke93dtnf0hzzuqlg0fxkgxfxsnsz9xe7
ETH   0x6888d4d2Bbc1776432AA32e02f50DdBeFDeE31Af
SOL   AXAMj68npvibHCg1hNqX7b51iGTeQqKuMeaQY6asmoXL
GRAM  UQAH2_xVEAa2AkTfvZ5f5c_kLwJ7JflcEMgcKb4rWucC41q5
ADA   addr1q9lclrf04dvdfnv9n2u0nxf3ps4lwsuc0ptmuha4nk5cnxq0w5zns4f6a2qjrdnaklkgxdgmhy7tqeg99ut4enzkx84s08dqty
TRX   TCrfaBYqi4ar7n2FwrtvxT2exvbbYcToNq
```

Networks: BTC — Bitcoin; ETH — Ethereum (ERC-20); SOL — Solana; GRAM — TON;
ADA — Cardano; TRX — Tron (TRC-20). Double-check the address against the coin
before sending: transfers on a wrong network cannot be recovered.
