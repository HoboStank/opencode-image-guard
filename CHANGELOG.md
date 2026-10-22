# Changelog

## 0.1.0 - 2026-10-22

- Initial release.
- Keeps the newest `maxImages` image parts in outgoing model requests.
- Replaces older image parts with a text marker without touching persisted history.
- Guards `context`, `compaction`, and `title` requests.
- Configurable `maxImages`, `providerID`, and `debug` options.
