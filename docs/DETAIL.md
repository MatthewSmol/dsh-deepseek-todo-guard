# TODO watcher — design and limitations

**English** · [Русский](DETAIL.ru.md)

## Why the plugin draws nothing itself

The «Tasks» plaque is stock DSH UI (`@deepseek-ai/dsh-client-ui-conversation`,
slot `conversation.input.dock`, id `todo`). It sits above the composer, starts
collapsed, shows the tasks of the current round and reads the `todos` projection.
The projection is filled by the `todo/write` session event, normally written by
the agent's `todo_write` tool. The panel disappears while the list is empty and is
reset on `turn/start`, so between turns there is nothing to show until the list is
written again.

The plugin therefore renders no panel of its own: it makes sure `todo/write`
appears in time. A second panel would only duplicate the stock one.

## The 30 second check

One timer walks the live agents (`ctx.agents` is an `AgentRegistry` with
`list()`; it is not iterable) and reads each session log: turn number, whether
`todo/write` happened in this turn, when it happened, human and assistant texts,
tool names, whether the turn is still open.

| Situation | Action | Reason in the journal |
|---|---|---|
| no `todo/write` in this turn, no list | create | `в этом ходе списка нет` |
| no `todo/write` in this turn, list from a previous turn | refresh | `список относится к прошлому ходу` |
| turn closed, unfinished items remain | promote to `completed` | `ход завершён, есть незавершённые` |
| the turn is open and the list is older than `refreshSeconds` | refresh | `список обновляется по ходу работы` |
| the agent is idle and the list is older than `staleAfterMinutes` | refresh | `список давно не обновлялся` |
| list is fresh | do nothing | `список актуален` |

`turn/end` is handled immediately, without waiting for the tick, so checkmarks
appear without a 30 second delay.

## Nudging the agent

A plaque the watcher maintains behind the agent's back is not enough: the agent
should keep the list current itself. After a `create` or `refresh` write the
watcher sends one short context message into the agent's next step with
`agent.inject`:

- it never wakes an idle driver and never starts a turn;
- it carries the current list, per-status counts and the reason for the reminder;
- it asks the agent to call `todo_write` with the complete list when the plan
  changes;
- it is rate-limited by `nudgeAfterSeconds` (180 s by default) and can be turned
  off with `nudgeAgents: false`;
- each reminder is a separate `nudge` entry in the journal, so the sidebar shows
  exactly when and whom the watcher poked.

## Journal in the sidebar

Every nudge is recorded: time, session id and its title (from `session/title`),
action (`create`/`refresh`/`promote`), wording source (`model`/`heuristic`/`none`)
and item count. The last 50 entries live in memory and in `.nudges.json` next to
the package, so the history survives a restart.

The panel is the plugin's client half:

- sidebar entry `sidebar.panellist` with id `todo-watch-log`, order 45, a
  checklist-with-clock icon;
- panel `main` under the same key: title, the line “latest N · updated …”, and one
  card per entry (time, session, action, source, item count, reason);
- the panel polls `GET /todo-watch/nudges` every 5 seconds.

The route is registered on the host `webServer` service and protected by a
per-process one-off token: the host injects the global
`__TODO_WATCH__ = { endpoint, token, historySize }` into the page HTML through
`webserver/index-inject`, and the panel sends the token in the
`x-todo-watch-token` header. Responses carry `cache-control: no-store`; POST
returns 405. After a `dsh web` restart the token changes, so an old tab shows “No
connection to the watcher” until it is reloaded.

## Where the wording comes from

### Session model (default)

A one-off `ctx.llm` call on the same route as the session's main request
(`session.requestHeader().config`), with limits:

- at most one call per session (`llmMinIntervalSeconds`, 60 s by default);
- one call in flight per session; the call is aborted when the agent is disposed;
- timeout (`llmTimeoutMs`, 20 s) and token cap (`llmMaxOutputTokens`, 400);
- input is compact JSON: the human request, the latest assistant texts, tool names
  and the current list (bounded to a few KB).

The model must answer strict
`{"todos":[{"content":"…","status":"pending|in_progress|completed"}]}`. The answer
is normalized: lines trimmed to 120 characters, at most `maxItems`, no duplicates,
valid statuses, at most one `in_progress` when parallelism is off. Garbage and
timeouts are discarded — keeping the previous list beats inventing a new one.

### Heuristic fallback

If the model is unavailable, not configured (`curator: heuristic`), timed out or
answered garbage:

- an existing list keeps its wording and only moves statuses: a closed turn makes
  everything `completed`, an open one makes the first unfinished item
  `in_progress`;
- with no list, items come from the human request (numbered or bulleted lines,
  otherwise the whole line) and the first is marked in progress;
- an empty request yields one generic item so the plaque is never empty.

## Log writes

`session.append('todo/write', { todos })`, only when the list actually changed.
Append failures are logged and not retried on the next tick. The event is log-only
UI state: it does not wake the agent and does not enter the model context.

## Settings

```yaml
- id: todo-watch
  config:
    checkIntervalSeconds: 30
    refreshSeconds: 60
    nudgeAgents: true
    nudgeAfterSeconds: 180
    staleAfterMinutes: 10
    curator: llm
    llmProvider: ''            # defaults to the session route
    llmModel: ''
    llmMinIntervalSeconds: 60
    llmTimeoutMs: 20000
    llmMaxOutputTokens: 400
    maxItems: 7
    allowParallelInProgress: true
    promoteCompletedOnTurnEnd: true
    includeSubagents: false
    historySize: 5
```

## One state per process

The journal, the page token and the route flag live in the module, not inside
`apply`. Cordis can reload a plugin row without restarting the server, and a new
`apply` would otherwise create a second, empty journal behind the same route: the
panel would show 0 entries while the watcher keeps writing files. State is shared
by every activation, the route is registered once, and the last written signature
per session suppresses duplicate `todo/write` events from two timers.

## Verifying that the new version is loaded

On every tick the watcher writes `.watch-alive.json` next to the package:

```json
{ "at": "2026-11-24T05:23:40.689Z", "version": 2, "note": "тик",
  "intervalMs": 30000, "curator": "llm", "agents": 4, "nudges": 3, "projection": "ok" }
```

If the file is missing or stale, the previous module is still running: Node caches
ESM, so a code change needs a `dsh web` restart. `agents` is how many live agents
the last tick walked; `nudges` is the journal size; `projection` is the result of
the last write check — `ok` means the stock plaque's `todos` projection carries the
list we just wrote, `missing` means it did not see it, `pending` means nothing has
been written yet.

## Limitations

- The plaque exists only for presets that declare the `todos` projection
  (`standard`, `ptc`, `cordis`). With `minimal` the plugin stays silent.
- The plugin works with live sessions; a closed session is served once it is
  opened again.
- Model calls cost tokens; `llmMinIntervalSeconds` limits the rate and
  `curator: heuristic` disables them completely.
- A bundle patch change is applied after a `dsh web` restart.
