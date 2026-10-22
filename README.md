# OpenCode Image Guard

[![Test](https://github.com/HoboStank/opencode-image-guard/actions/workflows/test.yml/badge.svg)](https://github.com/HoboStank/opencode-image-guard/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-111827)](https://opencode.ai/v2/docs/)

A small OpenCode V2 plugin that keeps long sessions working when a provider caps the number of images per request.

If you have seen this error:

```text
Upstream request failed: [invalid_request_error]
Too many images in request: 39 > 30
```

...the limit is enforced by the provider, not by OpenCode, and there is no config field that raises it. Every request replays the conversation, so once a session accumulates too many screenshots, every new turn fails.

This plugin fixes that by keeping the newest images and omitting older ones from the outgoing request only.

## How it works

- Registers the V2 `session.hook("context")`, `"compaction"`, and `"title"` hooks.
- Walks the assembled messages from newest to oldest.
- Keeps the newest `maxImages` image parts (`media` parts with an `image/*` media type).
- Replaces older image parts with a short text marker.
- Leaves persisted session history and the images on disk untouched.
- Never blocks a request if pruning itself fails.

## Install

Clone the repository into your OpenCode plugins directory:

```bash
git clone https://github.com/HoboStank/opencode-image-guard.git \
  ~/.config/opencode/plugins/image-guard
```

PowerShell:

```powershell
git clone https://github.com/HoboStank/opencode-image-guard.git `
  "$env:USERPROFILE\.config\opencode\plugins\image-guard"
```

Add the plugin to `opencode.json` (or `opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "C:\\Users\\you\\.config\\opencode\\plugins\\image-guard",
      "options": {
        "maxImages": 24
      }
    }
  ]
}
```

Use forward slashes or escaped backslashes in JSON. Restart OpenCode after adding the plugin.

If you only want the defaults, the string form is enough:

```jsonc
{
  "plugins": ["C:\\Users\\you\\.config\\opencode\\plugins\\image-guard"]
}
```

## Options

| Option       | Default          | Description                                                                 |
| ------------ | ---------------- | --------------------------------------------------------------------------- |
| `maxImages`  | `24`             | Image parts kept per request. `0` disables the guard.                       |
| `providerID` | `"opencode-go"`  | Provider to guard. Set to `false` to apply to every provider.               |
| `debug`      | `false`          | Log pruning decisions through `console.error` (visible in OpenCode logs).   |

The provider limit observed with OpenCode Go is **30 images per request**, so `29` is the highest useful value. The default of `24` leaves headroom for provider-side counting differences.

## Behavior

- The newest images always survive. Older ones are replaced with:

  ```text
  [an older image was omitted from this request to stay within the model's image limit]
  ```

- Images are counted across all message content, including images returned by tools.
- If a single message contains more than `maxImages` images, that message's oldest images are omitted first.
- Only the outgoing request is changed. Reopening the session still shows every original image.

## Compatibility

- OpenCode **V2**, tested with **2.1.2**.
- Any provider that enforces an image-count limit. The default scope is `opencode-go`; set `providerID: false` for others.

## Troubleshooting

**The error still appears.** Confirm the plugin is enabled for the provider you are using. If you use a provider other than `opencode-go`, set `"providerID": false` or the provider's ID. Then start a new turn so a fresh request is assembled.

**The model cannot see an old screenshot.** That is the trade-off. Re-attach the screenshot, or raise `maxImages` (up to `29` for a 30-image cap).

**Nothing is logged.** Set `"debug": true` and check the OpenCode server log (`~/.local/share/opencode/log/opencode.log`).

## Development

Requires [Bun](https://bun.sh/). There is no build step; OpenCode loads the TypeScript directly.

```bash
bun test
```

The tests cover image-part detection, counting, pruning order, and no-op behavior.

## License

MIT. Not affiliated with OpenCode.
