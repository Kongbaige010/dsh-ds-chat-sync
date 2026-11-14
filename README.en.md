# DeepSeek site chat sync

Syncs chat history from chat.deepseek.com into DSH sessions. **Version 0.1.1 is a read-only observation stage**: it opens the site inside DSH and records the requests the site makes when it exports conversations. It writes no sessions and uploads nothing.

## Why observe first

DSH's built-in "DeepSeek chat import" only accepts archives exported by the site (`deepseek_data-*.zip`, `export_format_version: 3`). Reusing the site's own export requires knowing which endpoint it calls and what it returns, which can only be observed, not inferred.

## Usage

1. Press **DeepSeek site sync** in the dock under the composer.
2. The panel expands inline in the dock and shows chat.deepseek.com.
3. Sign in once. The state lives in a dedicated partition and survives DSH restarts.
4. Press **Start capture**.
5. Press the site's own export button.
6. Press **Show capture** and share the JSON output.

## Known limitations

- **Desktop only.** The web build reports that it is unsupported.
- Depends on the Desktop-internal `dshDesktop.browser` bridge (`protocolVersion: 1`), which is not a public API.
- The hook is lost after a page navigation and must be re-armed.
- This stage imports nothing; importing needs the official "DeepSeek chat import" plugin enabled.

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 0.1 | Site sign-in + export request observation | current |
| 0.2 | Conversation list with checkboxes + target workspace | pending |
| 0.3 | Direct submit to the official import route + dedup | pending |
