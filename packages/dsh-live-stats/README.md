# @linxin666/dsh-live-stats

English | [中文](README.zh.md)

Live input/output token estimates, rolling one-second generation peak, and session cost display for DSH Web. It feeds the built-in session status row: input and output token totals update while a response streams, the estimated API cost is shown as a compact `≈¥` amount, and the generation throughput group (`TPS 31.4 tok/s`) renders right after the step counts:

```text
1 turns · 3 steps API ↑7.9K ↓12 · ≈¥0.05 TPS 31.4 tok/s
```

`~` marks a heuristic token estimate and `≈` marks the calculated API cost. Provider usage replaces the token estimate when it arrives; exact cache accounting continues to come from DSH's durable token-usage projection. A retry replaces the prior estimate for that step, and an aborted turn removes its unsettled estimate.

## What it does

- **Host half**: registers the replayable `liveTokenUsage` session projection (`ctx.sessionProjections`). The fold estimates input tokens from the surface log plus header/tool framing and turns streamed output increments into timestamped samples. Each sample computes the output-token total in `[t-1000ms, t]`; same-millisecond batches are coalesced, and each step records its latest rolling rate and maximum rolling peak. Usage summaries and final messages correct billing buckets only and never create instantaneous samples. The latest rate remains resident when no new sample arrives; no TPS is shown when a step has no valid streamed sample.
- **Client half**: mounts the cost/TPS row in the conversation composer dock. It reads the host's `liveTokenUsage` projection directly and renders compact input/output token totals plus the current-session estimated cost.

## Installation

Install the family aggregate package `@linxin666/dsh-web-ui-all` (all plugins and skins in one) or this plugin alone:

```sh
# Recommended: install directly from npm
dsh plugin --profile web add @linxin666/dsh-live-stats

# Or from the repository (development loop)
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-live-stats

```

Restart `dsh web`, and the cost/TPS row appears in the session status line.

Alternatively, as a plain overlay row in the personal DSH overlay (`~/.dsh/config.yaml`), hot-reloaded on save:

```yaml
- insert:
    - id: live-stats
      name: '@linxin666/dsh-live-stats'
      config:
        charsPerToken: 4
        blockOverhead: 4
        roleOverhead: 4
```

All three estimator values are optional (defaults shown).

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `charsPerToken` | `number` | `4` | Approximate text characters represented by one token |
| `blockOverhead` | `number` | `4` | Fixed framing tokens assigned to each content block |
| `roleOverhead` | `number` | `4` | Fixed framing tokens assigned to each message or assistant response |
| `showCost` | `boolean` | `true` | Show the current-session estimated API cost in the composer row |
| `priceMode` | `string` | `auto` | Use automatic Beijing-time peak/off-peak pricing, or force `peak` / `offpeak` |

## Export shape

A function/namespace plugin: `inject` / `Config` / `apply`, no default export. The estimator (`./estimator`) and the projection fold (`./projection`) are pure and unit-tested; the client `TpsLine` renders through the runtime's projection hook. The invariant companion registers under `./invariant`.

## Model Experience

### Prompt and tool surface

#### What the model sees

Nothing. The plugin injects no prompt sections, registers no tools, and emits no `session` events of its own — it only consumes the durable stream and the projection carrier's wire path.

#### Token effect

Zero per request.

#### KV Cache effect

No system-prompt contribution, so no cache-stability effect.

## Known Limitations and Deferred Work

- **Heuristic estimates**: input/output totals are character-count heuristics (`~`) until provider usage arrives; exact cache accounting always comes from DSH's durable token-usage projection. Rolling peaks accept only positive streamed increments with non-decreasing timestamps.
- **Web only**: the TPS row renders in DSH Web's composer dock; there is no TUI equivalent yet.
- **Single active step**: the projection tracks one active step per session and the dock row shows that session's view; concurrent sessions each get their own projection.
- **Density assumption**: `charsPerToken` defaults to 4 characters, which undercounts CJK text and overcounts pure ASCII; tune it per deployment if estimates drift.
- **Cost estimate**: the displayed `≈` amount uses the built-in DeepSeek peak/off-peak rates for the current session and is not a provider invoice; model-specific pricing tables are deferred.
