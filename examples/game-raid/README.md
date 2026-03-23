# Game Raid Examples

Use these files when you want Mercenary to turn one GB Studio task into:

- a gameplay patch
- a pixel-art pack
- a teaser and launch copy

## Files

- [native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/native-raid.json): direct `POST /v1/raid` payload
- [delegate-input.json](/Users/area/Desktop/boss-raid/examples/game-raid/delegate-input.json): `bossraid_delegate` input for Claude Code or Codex
- [providers.http.json](/Users/area/Desktop/boss-raid/examples/game-raid/providers.http.json): provider registrations for `Gamma`, `Dottie`, and `Riko`
- [provider-submissions.json](/Users/area/Desktop/boss-raid/examples/game-raid/provider-submissions.json): example provider callback bodies showing the correct gameplay, image, bundle, and video return shapes

If you want repo-specific versions of those payloads, run:

```bash
pnpm game-raid:build-payload -- --repo /path/to/game --file project.gbsproj --file scripts/game.ts --title "Boss Raid: Slime Panic"
```

That writes:

- `temp/game-raid-payload/native-raid.json`
- `temp/game-raid-payload/delegate-input.json`
- `temp/game-raid-payload/provider-submission-templates.json`

## Why The Parent Payload Uses `primaryType: "patch"`

Keep the parent raid output as `patch`.

That gives the user one canonical gameplay diff in `synthesizedOutput.patchUnifiedDiff`, while the pixel artist and video marketer still roll their outputs into:

- `synthesizedOutput.artifacts`
- `synthesizedOutput.workstreams[*].artifacts`

This is the cleanest fit for developer workflows because the host still gets one patch-first answer, but the receipt and ops surfaces also show the art pack and teaser.

## One Important Routing Rule

Do not set the root request to `requiredCapabilities: ["gb-studio", "pixel-art", "remotion"]`.

Root discovery requires every listed capability on every eligible provider. The game planner now adds those scoped tags on the child workstreams automatically:

- `Gameplay` -> `gb-studio`
- `Pixel Art` -> `pixel-art`
- `Video Marketing` -> `remotion`

Keep the root request broad and let Mercenary scope the branches.

## Provider Registration Contract

For the game demo, keep these exact provider ids and registration signals:

- `gamma` / `Gamma`: `supportedFrameworks: ["gb-studio"]`, `supportedLanguages: ["typescript"]`, `outputTypes: ["patch", "text", "bundle"]`, specializations including `game-development`, `gameplay`, and `gb-studio`
- `dottie` / `Dottie`: `outputTypes: ["image", "text", "bundle"]`, specialization `pixel-art`
- `riko` / `Riko`: `outputTypes: ["video", "text", "bundle"]`, specializations including `game-marketing` and `remotion`

Those are the load-bearing fields for correct routing.

## Host Workflow

Inside Claude Code or Codex, prefer `bossraid_delegate` with [delegate-input.json](/Users/area/Desktop/boss-raid/examples/game-raid/delegate-input.json).

`bossraid_delegate` waits for the result by default, so the host gets the full receipt-style object instead of just a spawn handle. For this game flow, the important fields are:

- `synthesizedOutput.patchUnifiedDiff`
- `synthesizedOutput.artifacts`
- `synthesizedOutput.workstreams`
- `raidAccessToken`
- `receiptPath`

If the host wants to reopen the result later, call `bossraid_receipt` with the returned `raidId` and `raidAccessToken`.
