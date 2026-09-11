# dsh-particle-theme

English | [中文](README.zh.md)

An independent, full-page particle theme for DeepSeek Harness Web UI. It carries the Desktop startup whale into the working interface without replacing the active skin.

## What it does

The browser client mounts one fixed, pointer-transparent canvas behind interactive surfaces and renders the built-in `whale` scene. The whale drifts, breathes, and moves its tail while sparse ambient particles preserve content contrast in light and dark modes.

The controller selects a page profile automatically:

| Page state | Behavior |
| --- | --- |
| Normal | Uses the configured density, opacity, and speed |
| Editable control focused | Reduces density, opacity, and speed |
| Dialog open | Becomes quieter than focused mode |
| Reduced motion | Uses a sparse static frame |
| Hidden page | Stops and clears rendering |

## Install

DeepSeek Harness Desktop mounts this bundle through `@linxin666/dsh-web-ui-all`. For another DSH profile, add the package as a normal bundle dependency and include its patch.

## Configuration

The `particle-theme` settings namespace is exposed under **Settings > Plugin config > Particle theme**.

| Field | Default | Valid range | Purpose |
| --- | ---: | ---: | --- |
| `enabled` | `true` | — | Mount or remove the full-page canvas |
| `theme` | `whale` | `whale` | Select the registered scene |
| `density` | `1` | `0.35`–`1.5` | Scale the particle count |
| `opacity` | `0.26` | `0.08`–`0.55` | Scale scene alpha |
| `speed` | `1` | `0.4`–`1.6` | Scale motion speed |

Changes publish through the standard settings scope and apply live. Disabling the theme removes the canvas immediately.

## Performance and accessibility

Rendering uses one animation loop, capped particle counts, a device-pixel ratio ceiling of 1.5, and sustained frame-time feedback. Slow frames gradually reduce quality; stable fast frames restore it. The loop pauses for hidden documents, uses a static low-density frame for reduced-motion users, and never intercepts pointer or accessibility input.

Desktop window dragging and resizing pause the particle loop until the gesture ends. The native composer band is excluded even when it has no attachments or focus; older attachment rails retain the same protection. The boundary follows draft resizing, scrolling and remounting, while the whale fits above that boundary instead of being drawn across the input. Reduced-motion preference changes apply live.

## Extension API

The client exports `ParticleThemeRegistry`, `ParticleThemeDefinition`, and the page-profile primitives. A future scene registers a unique ID and returns an object with `update(state)` and `dispose()` methods. The controller remains unchanged, so additional themes can share the same lifecycle, settings, accessibility, and page-awareness rules.

## Model experience

The theme is renderer-only. It adds no system prompt, conversation tokens, tools, network calls, or model latency.

## Known limitations

The packaged settings schema currently accepts only the built-in `whale` ID. New scene packages must extend the allowed theme selection as well as register their definition. Adaptive quality responds to sustained frame time rather than GPU telemetry.

## Development

```bash
pnpm --filter @linxin666/dsh-particle-theme test
pnpm --filter @linxin666/dsh-particle-theme build
```
