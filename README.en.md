# DeepSeek site chat sync

Imports chat.deepseek.com conversations as DSH Sessions. **Version 1.6.0 covers the whole pipeline**: list, select, read, map, package, and hand to the built-in importer.

## Installation

This is a local DSH plugin bundle (its `package.json` declares `dsh.bundle.patch`), installed as a **directory**, not through npm.

1. Clone it anywhere on the machine:

   ```bash
   git clone https://github.com/Kongbaige010/dsh-ds-chat-sync.git
   ```

2. In DSH, open **Plugins** → **Add plugin** and pick the cloned **repository root** — the folder that holds `package.json`, not a subfolder.

3. Confirm a row named **DeepSeek site sync** appears and is enabled.

4. Right Sidebar → `+` → choose **DeepSeek site sync**.

### Requirements

| Requirement | Why |
| --- | --- |
| DSH Desktop | The web build cannot create a managed browser view; the panel says so |
| Built-in importer enabled | **DeepSeek chat import** must be on, because it performs the import |
| A first sign-in | Sign in to chat.deepseek.com inside the panel; the token is kept |

### Uninstall

Disable the row in Plugins. Imported Sessions are unaffected. To drop the site login as well, remove the corresponding browser partition data in DSH.

## How it works

It reads the two endpoints the site itself uses:

| Purpose | Endpoint |
| --- | --- |
| Conversation list (paged) | `GET /api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=<sec>` |
| One conversation | `GET /api/v0/chat/history_messages?chat_session_id=<id>` |

The result is compressed with `CompressionStream('deflate-raw')` into an `export_format_version: 3` archive and posted to DSH's own import route:

```
POST /api/deepseek-chat-import/archive?workspaceId=<workspace id>
```

**The official plugin still performs the import.** This bundle only reads, converts and packages. Nothing touches disk and nothing leaves the machine.

## Usage

1. Right Sidebar → `+` → **DeepSeek site sync**.
2. Sign in to the site in the page area (once; the token is kept for later visits).
3. Press **Sync conversations**.
4. Tick the conversations, choose a target workspace.
5. Press **Import selected**.

## Design choices

- **Only the selected conversations are read**, one request each, so the site's rate limits are not provoked by a bulk prefetch.
- **The sign-in token is captured from the page's own requests** and persisted in the site's localStorage. When the site answers `INVALID_TOKEN`, the tab reloads once to let the site renew it, then retries. If that fails, open any conversation on the page to renew it.
- **Deduplication by id** in browser localStorage; already-imported conversations are greyed out.
- **Images are carried.** The file host grants no CORS headers, so the page cannot read them; the Host half downloads them in Node and returns the bytes. Each entry is named `chat_sessions/{session}_files/{file}_{name}.{ext}`, and the extension follows the actual bytes — the site serves WebP behind a `.png` display name, and the importer derives the media type from the extension.
- **Only four fragment types are written**: `REQUEST`, `RESPONSE`, `THINK`, `FILE`. Search and open-web cards have field shapes that do not fully match the importer's validation, so they are dropped rather than risk rejecting a whole conversation.
- **Collapse hides the list completely.** The collapse arrow lives inside the list panel; when the panel is closed it is gone, and a text button in the toolbar brings it back.

## Known limitations

- **Desktop only.** The web build cannot create a managed browser view.
- Depends on the Desktop-internal `dshDesktop.browser` bridge (`protocolVersion: 1`), which is not a public API and may change.
- The site's endpoints are not public; a field rename requires updating the mapping layer.
- Large imports may hit the site's rate limits.
- The token is tied to your account session; this plugin reads your own data and sends nothing outward.

## Verification

- 36 offline logic checks: CRC-32, timestamp conversion, fragment and session mapping, ZIP structure read back by a standard decompressor, attachment naming and format detection.
- 8 component render checks that execute the real component body with stub hooks, so a runtime error surfaces before delivery.
- Live end-to-end verified on 2026-11-14: sign in → sync list → select → import → Sessions appear with images.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `INVALID_TOKEN` | No token captured. Open any conversation on the page, then sync again. |
| Marked imported but no new Session | The ledger recorded a write that did not happen; press **Reset ledger** and import again. |
| `workspace-not-found` | The workspace id went stale; pick the workspace again. |
| No list at all | Sign in on the page first, then press **Sync conversations**. |

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
