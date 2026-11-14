# DeepSeek site chat sync

Imports chat.deepseek.com conversations as DSH sessions. **Version 0.3.0 carries the full pipeline**: list, select, read, map, package, hand to the built-in importer.

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

**The official plugin still performs the import**; this bundle only reads and converts. Nothing touches disk and nothing leaves the machine.

## Usage

1. Right Sidebar → `+` → **DeepSeek site sync**.
2. Sign in to the site in the page area (once; the session persists in a dedicated partition).
3. Press **Sync conversations** (the page area collapses).
4. Tick the conversations and choose a target workspace.
5. Press **Import selected**.

## Design choices

- **Only selected conversations are read**, one request each, so the site's rate limits are not provoked by a bulk prefetch.
- **Deduplication by id** in browser localStorage; already-imported conversations are greyed out.
- **Images inside `FILE` fragments are carried**: when `signed_path` exists the bytes are fetched and written as `chat_sessions/{session}_files/{file}_{name}`, and the fragment's `export_path` points at that entry. Limits are 4 MB per image and 40 images per conversation; anything larger or unreachable degrades to a file card. Non-image files are not carried.
- **Only four fragment types are written**: `REQUEST`, `RESPONSE`, `THINK`, `FILE`. Search and open-web cards have field shapes that do not fully match the importer's validation, so they are dropped rather than risk rejecting a whole conversation.

## Limitations

- Desktop only; the web build cannot create a managed browser view.
- Depends on the Desktop-internal `dshDesktop.browser` bridge (`protocolVersion: 1`).
- Site field changes require updating the mapping layer.
- Large imports may hit the site's rate limits.

## Verification

- 26 offline unit checks pass: CRC-32, timestamp conversion, fragment and session mapping, and ZIP structure read back by a standard decompressor.
- The live end-to-end path is not yet verified.
