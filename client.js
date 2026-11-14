/**
 * Client half of the DeepSeek chat sync bundle — a Right-Sidebar tab.
 *
 * Reads the site's own conversation API from inside a Desktop-managed webview
 * guest, maps each conversation to the archive shape the built-in
 * "DeepSeek chat import" plugin accepts, and posts that archive to the import
 * route. Nothing is written to disk and no site feature is bypassed: the same
 * endpoints the site uses itself are read, and the same importer that handles a
 * manual export handles the result.
 *
 * @module @local/dsh-ds-chat-sync
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-ds-chat-sync',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Implementation identity; the key its body and title register under. */
    const ID = '@local/dsh-ds-chat-sync';
    /** Tab kind. */
    const KIND = 'ds-chat-sync';
    /** Locale namespace. */
    const NS = 'dsChatSync';
    /** Site the guest shows. */
    const HOME_URL = 'https://chat.deepseek.com';
    /** Storage account for the managed guest; fixed so the login persists. */
    const PARTITION_KEY = 'dsh-ds-chat-sync';
    /** Browser storage key recording which conversations were already imported. */
    const LEDGER_KEY = 'dsh-ds-chat-sync/imported';
    /** Chrome-shaped user agent, so the guest is not treated as a bot client. */
    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    /** Fragment types carried over; the importer validates these strictly. */
    const KEPT_FRAGMENTS = new Set(['REQUEST', 'RESPONSE', 'THINK', 'FILE']);
    /** Largest single attachment kept, in bytes. */
    const MAX_IMAGE_BYTES = 4194304;
    /** Most attachments fetched for one conversation per import. */
    const MAX_IMAGES_PER_SESSION = 40;

    // ---------------------------------------------------------------- copy
    const zh = {
      'type.label': 'DeepSeek 官网同步',
      'type.description': '把官网会话导入为 DSH 会话',
      'status.booting': '正在申请浏览器视图…',
      'status.navigating': '正在加载 chat.deepseek.com…',
      'status.ready': '网页已就绪',
      'status.needLogin': '尚未登录，请先在网页区登录',
      'status.desktopOnly': '仅桌面应用可用：网页版无创建浏览器视图的权限。',
      'status.bridgeMissing': '未找到桌面浏览器桥接。',
      'action.sync': '同步会话',
      'action.import': '导入所选',
      'action.reload': '重新加载',
      'action.auth': '查看令牌',
      'auth.none': '还没捕获到任何令牌头。请在网页区点开一个会话，再点一次「查看令牌」。',
      'auth.found': '已捕获到这些请求头，同步时会自动带上：',
      'action.web': '显示网页',
      'action.hide': '隐藏网页',
      'hint.idle': '先在网页里登录官网，然后点「同步会话」拉取会话清单。',
      'hint.loading': '正在拉取会话清单…',
      'hint.empty': '没有拉到会话。如果网页里还没登录，请先登录再同步。',
      'hint.selected': '已选 {n} 个会话',
      'hint.importing': '正在读取 {done}/{total}…',
      'hint.images': '（图片 {n} 张）',
      'list.search': '搜索标题',
      'list.imported': '已导入',
      'list.heading': '会话',
      'panel.show': '显示列表',
      'panel.hide': '隐藏列表',
      'list.all': '全选',
      'list.none': '取消全选',
      'entry.label': 'DeepSeek 网页',
      'entry.open': '在右侧边栏打开 chat.deepseek.com',
      'entry.close': '关闭右侧边栏的 DeepSeek 网页',
      'list.refresh': '刷新',
      'label.workspace': '目标工作区',
      'import.done': '完成：已导入 {n} 个会话',
      'import.target': '位置：{path}',
      'import.skipped': '，跳过 {n} 个',
      'import.omitted': '，{n} 个超出上限未处理',
      'import.images': '图片：{ok}/{total} 张已取回并写入归档',
      'import.imageErrors': '取图失败原因：',
      'import.empty': '请先勾选要导入的会话',
      'import.noworkspace': '还没有可用工作区',
      'action.reset': '重置记账',
      'action.probe': '图片诊断',
      'probe.title': '图片地址探测结果：',
      'probe.noimage': '这个会话里没有可探测的图片',
      'reset.done': '已清空导入记录，可以重新勾选',
      'error.prefix': '失败：',
      'error.notjson': '接口返回的不是 JSON',
      'error.nooutcome': '导入路由没有返回结果行',
      'error.notoken': '还没有捕获到登录令牌。请在网页区点开任意一个会话，等它加载完，再点「同步会话」。',
      'error.tokenexpired': '登录令牌已过期，自动刷新后仍未恢复。请在网页区点开任意一个会话，等它加载完，再重试。',
    };
    const en = {
      'type.label': 'DeepSeek site sync',
      'type.description': 'Import site conversations as DSH sessions',
      'status.booting': 'Requesting a browser view…',
      'status.navigating': 'Loading chat.deepseek.com…',
      'status.ready': 'Page ready',
      'status.needLogin': 'Not signed in — sign in on the page first',
      'status.desktopOnly': 'Desktop only: the web build cannot create a browser view.',
      'status.bridgeMissing': 'Desktop browser bridge was not found.',
      'action.sync': 'Sync conversations',
      'action.import': 'Import selected',
      'action.reload': 'Reload',
      'action.auth': 'Show token',
      'auth.none': 'No token header captured yet. Open one conversation on the page, then press "Show token" again.',
      'auth.found': 'These request headers were captured and are replayed on sync:',
      'action.web': 'Show page',
      'action.hide': 'Hide page',
      'hint.idle': 'Sign in to the site, then press "Sync conversations".',
      'hint.loading': 'Loading the conversation list…',
      'hint.empty': 'No conversations found. Sign in on the page first.',
      'hint.selected': '{n} selected',
      'hint.importing': 'Reading {done}/{total}…',
      'hint.images': ' ({n} images)',
      'list.search': 'Filter titles',
      'list.imported': 'imported',
      'list.heading': 'Conversations',
      'panel.show': 'Show list',
      'panel.hide': 'Hide list',
      'list.all': 'Select all',
      'list.none': 'Clear',
      'entry.label': 'DeepSeek web',
      'entry.open': 'Open chat.deepseek.com in the Right Sidebar',
      'entry.close': 'Close the DeepSeek page tab',
      'list.refresh': 'Refresh',
      'label.workspace': 'Target workspace',
      'import.done': 'Done: {n} conversations imported',
      'import.target': 'Location: {path}',
      'import.skipped': ', {n} skipped',
      'import.omitted': ', {n} over the limit',
      'import.images': 'Images: {ok}/{total} fetched into the archive',
      'import.imageErrors': 'Image failures:',
      'import.empty': 'Select at least one conversation',
      'import.noworkspace': 'No workspace available',
      'action.reset': 'Reset ledger',
      'action.probe': 'Image probe',
      'probe.title': 'Image URL probe:',
      'probe.noimage': 'This conversation has no image to probe',
      'reset.done': 'Import ledger cleared; conversations are selectable again',
      'error.prefix': 'Failed: ',
      'error.notjson': 'the endpoint did not answer with JSON',
      'error.nooutcome': 'the import route returned no outcome line',
      'error.notoken': 'No sign-in token captured yet. Open any conversation on the page, let it load, then press "Sync conversations".',
      'error.tokenexpired': 'The sign-in token expired and auto-refresh did not recover it. Open any conversation on the page, let it load, then try again.',
    };

    /**
     * Stable fallback translator.
     * @param {string} key - copy key.
     * @returns {string} localized text or the key.
     */
    function fallbackT(key) {
      return zh[key] !== undefined ? zh[key] : key;
    }

    /**
     * Short date for a conversation's last update: month-day within this year,
     * otherwise the full date.
     * @param {unknown} unix - site timestamp in seconds.
     * @returns {string} display text, or '' when unusable.
     */
    function formatWhen(unix) {
      const seconds = typeof unix === 'number' ? unix : Number(unix);
      if (Number.isFinite(seconds) === false || seconds <= 0) return '';
      const date = new Date(seconds * 1000);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      if (date.getFullYear() !== new Date().getFullYear()) return date.getFullYear() + '-' + month + '-' + day;
      return month + '-' + day;
    }

    /**
     * Replaces `{name}` placeholders.
     * @param {string} template - text with placeholders.
     * @param {object} values - replacement values.
     * @returns {string} filled text.
     */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, name) => (
        values[name] === undefined ? whole : String(values[name])
      ));
    }

    // -------------------------------------------------- page-context sources
    /**
     * Records the authentication headers the site attaches to its own API
     * calls. Cookies alone answer `INVALID_TOKEN`, so the caller has to replay
     * whatever header carries the token.
     * @returns {string} idempotent expression.
     */
    const AUTH_HOOK_SOURCE = `(() => {
      const STORE_KEY = 'dsh-ds-chat-sync/auth';
      if (window.__DSCS_AUTH__ !== undefined) return 'already';
      const state = { headers: {} };
      // Hydrate from the last visit: the site caches its list, so a fresh page
      // often makes no API call at all and would otherwise leave us tokenless.
      try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (parsed !== null && typeof parsed === 'object') state.headers = parsed;
        }
      } catch (error) { /* start empty */ }
      window.__DSCS_AUTH__ = state;
      const persist = () => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state.headers)); } catch (error) { /* ignore */ }
      };
      const note = (name, value) => {
        const key = String(name).toLowerCase();
        if (key === 'authorization' || key.startsWith('x-') || key === 'cookie') {
          state.headers[key] = String(value);
          persist();
        }
      };
      const origFetch = window.fetch;
      window.fetch = function (input, init) {
        try {
          const headers = init && init.headers;
          if (headers !== undefined && headers !== null) {
            if (typeof headers.forEach === 'function') headers.forEach((value, key) => note(key, value));
            else if (Array.isArray(headers)) headers.forEach((pair) => note(pair[0], pair[1]));
            else Object.keys(headers).forEach(key => note(key, headers[key]));
          }
        } catch (error) { /* observation only */ }
        return origFetch.apply(this, arguments);
      };
      const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        try { note(name, value); } catch (error) { /* observation only */ }
        return origSetHeader.apply(this, arguments);
      };
      return 'hooked';
    })()`;

    /**
     * Reads the captured authentication headers, skipping per-request proof
     * tokens whose reuse would be rejected.
     * @returns {string} expression returning a JSON object of headers.
     */
    const AUTH_READ_SOURCE = `(() => {
      const state = window.__DSCS_AUTH__;
      if (state === undefined) return '{}';
      const out = {};
      for (const key of Object.keys(state.headers)) {
        if (/pow|challenge|signature|nonce|timestamp/i.test(key)) continue;
        out[key] = state.headers[key];
      }
      return JSON.stringify(out);
    })()`;

    /**
     * Inline header replay shared by the two data readers.
     * @returns {string} statement text.
     */
    function authReplaySnippet() {
      return `const replay = (() => {
        const state = window.__DSCS_AUTH__;
        if (state === undefined) return {};
        const out = {};
        for (const key of Object.keys(state.headers)) {
          if (/pow|challenge|signature|nonce|timestamp/i.test(key)) continue;
          out[key] = state.headers[key];
        }
        return out;
      })();`;
    }

    /**
     * Walks the site's conversation list pages until the cursor runs dry.
     * Runs in the guest, where the site's session cookie is present.
     * @returns {string} expression resolving to a JSON string.
     */
    const LIST_SOURCE = `(async () => {
      ${authReplaySnippet()}
      if (replay.authorization === undefined) return JSON.stringify({ error: 'no-token', tried: [] });
      const readPage = async (query) => {
        let response;
        try {
          response = await fetch('/api/v0/chat_session/fetch_page' + query, {
            credentials: 'include',
            headers: replay,
          });
        } catch (error) {
          return { status: 0, list: null, head: 'network: ' + String(error) };
        }
        let text = '';
        try { text = await response.text(); } catch (error) { text = ''; }
        let body = null;
        try { body = JSON.parse(text); } catch (error) { body = null; }
        if (body !== null && body !== undefined && body.code === 40003) {
          return { status: response.status, list: null, head: 'INVALID_TOKEN', expired: true };
        }
        const biz = body && body.data && body.data.biz_data;
        const list = biz && biz.chat_sessions;
        return { status: response.status, list: Array.isArray(list) ? list : null, head: text.slice(0, 220) };
      };

      const now = Math.floor(Date.now() / 1000);
      const variants = [
        '',
        '?lte_cursor.pinned=true',
        '?lte_cursor.pinned=false&lte_cursor.updated_at=' + now,
      ];
      const tried = [];
      let firstQuery = null;
      for (const query of variants) {
        const result = await readPage(query);
        if (result.expired === true) return JSON.stringify({ error: 'token-invalid', tried });
        tried.push({
          query: query === '' ? '(none)' : query,
          status: result.status,
          count: result.list === null ? -1 : result.list.length,
          head: result.head,
        });
        if (result.list !== null && result.list.length > 0) {
          firstQuery = query;
          break;
        }
      }
      if (firstQuery === null) return JSON.stringify({ error: 'no variant returned sessions', tried });

      const collected = [];
      const seen = new Set();
      const absorb = (list) => {
        let added = 0;
        for (const item of list) {
          if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
          seen.add(item.id);
          collected.push({ id: item.id, title: item.title, pinned: item.pinned === true, updatedAt: item.updated_at });
          added += 1;
        }
        return added;
      };

      let cursor = '';
      let query = firstQuery;
      for (let page = 0; page < 80; page += 1) {
        const result = page === 0 ? await readPage(query) : await readPage(query);
        if (result.list === null || result.list.length === 0) break;
        absorb(result.list);
        const last = result.list[result.list.length - 1];
        if (!last || typeof last.updated_at !== 'number') break;
        const next = String(last.updated_at);
        if (next === cursor) break;
        cursor = next;
        query = '?lte_cursor.pinned=false&lte_cursor.updated_at=' + cursor;
      }
      if (collected.length === 0) {
        return JSON.stringify({ error: 'sessions found but none usable', tried });
      }
      return JSON.stringify({ sessions: collected, tried });
    })()`;

    /**
     * Builds the reader for one conversation.
     * @param {string} sessionId - site conversation id.
     * @returns {string} expression resolving to the raw response text.
     */
    function historySource(sessionId) {
      return `(async () => {
        ${authReplaySnippet()}
        let response;
        try {
          response = await fetch('/api/v0/chat/history_messages?chat_session_id='
            + encodeURIComponent(${JSON.stringify(sessionId)}), { credentials: 'include', headers: replay });
        } catch (error) {
          return JSON.stringify({ error: 'network: ' + String(error) });
        }
        if (!response.ok) return JSON.stringify({ error: 'HTTP ' + response.status });
        return await response.text();
      })()`;
    }

    // ------------------------------------------------------------- mapping
    /**
     * Converts a site unix timestamp (seconds, fractional) to the export format.
     * @param {unknown} value - site value.
     * @returns {string} RFC 3339 string, or the epoch when unusable.
     */
    function isoFromUnix(value) {
      const seconds = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) return '1970-01-01T00:00:00.000Z';
      return new Date(seconds * 1000).toISOString();
    }

    /**
     * Keeps only the fields the import format validates.
     * @param {object} fragment - site fragment.
     * @returns {object|null} archive fragment, or null when the type is dropped.
     */
    function mapFragment(fragment) {
      if (fragment === null || typeof fragment !== 'object') return null;
      const type = fragment.type;
      if (typeof type !== 'string' || KEPT_FRAGMENTS.has(type) === false) return null;
      if (type === 'FILE') {
        const files = Array.isArray(fragment.files) ? fragment.files : [];
        return {
          type,
          files: files.map(file => ({
            id: String(file.id),
            file_name: String(file.file_name || 'file'),
            file_size: Number.isFinite(file.file_size) ? file.file_size : 0,
            is_image: file.is_image === true,
            // No attachment bytes are carried, so the importer renders a card.
            export_path: null,
          })),
        };
      }
      return { type, content: typeof fragment.content === 'string' ? fragment.content : '' };
    }

    /**
     * Maps one site conversation payload to the archive session shape.
     * @param {object} payload - parsed `history_messages` body.
     * @returns {object|null} archive session, or null when unreadable.
     */
    function mapSession(payload) {
      const biz = payload && payload.data && payload.data.biz_data;
      const session = biz && biz.chat_session;
      const messages = biz && biz.chat_messages;
      if (!session || typeof session.id !== 'string' || Array.isArray(messages) === false) return null;
      const mapped = [];
      for (const message of messages) {
        if (message === null || typeof message !== 'object') continue;
        if (typeof message.message_id !== 'number') continue;
        const fragments = [];
        for (const fragment of (Array.isArray(message.fragments) ? message.fragments : [])) {
          const kept = mapFragment(fragment);
          if (kept !== null) fragments.push(kept);
        }
        mapped.push({
          id: message.message_id,
          parent_id: typeof message.parent_id === 'number' ? message.parent_id : null,
          role: message.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER',
          status: typeof message.status === 'string' ? message.status : 'FINISHED',
          inserted_at: isoFromUnix(message.inserted_at),
          fragments,
        });
      }
      if (mapped.length === 0) return null;
      mapped.sort((left, right) => left.id - right.id);
      const current = typeof session.current_message_id === 'number'
        ? session.current_message_id
        : mapped[mapped.length - 1].id;
      return {
        id: session.id,
        title: typeof session.title === 'string' && session.title.trim() !== '' ? session.title : null,
        current_message_id: current,
        inserted_at: isoFromUnix(session.inserted_at),
        messages: mapped,
      };
    }

    // ----------------------------------------------------------------- zip
    let crcTable;

    /**
     * CRC-32 of one byte array, as the ZIP format requires.
     * @param {Uint8Array} bytes - payload.
     * @returns {number} unsigned CRC.
     */
    function crc32(bytes) {
      if (crcTable === undefined) {
        crcTable = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
          let value = index;
          for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
          }
          crcTable[index] = value >>> 0;
        }
      }
      let crc = 0xFFFFFFFF;
      for (let index = 0; index < bytes.length; index += 1) {
        crc = crcTable[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * Raw-deflates one payload when the browser exposes the stream.
     * @param {Uint8Array} bytes - payload.
     * @returns {Promise<Uint8Array|null>} compressed bytes, or null when unavailable.
     */
    async function deflateRaw(bytes) {
      if (typeof CompressionStream !== 'function') return null;
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (error) {
        return null;
      }
    }

    /**
     * Builds a ZIP archive; entries are deflated when that helps.
     * @param {Array<{name: string, bytes: Uint8Array}>} entries - archive members.
     * @returns {Promise<Uint8Array>} the archive bytes.
     */
    async function buildZip(entries) {
      const encoder = new TextEncoder();
      const now = new Date();
      const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
      const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
      const body = [];
      const central = [];
      let offset = 0;
      for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const crc = crc32(entry.bytes);
        const compressed = await deflateRaw(entry.bytes);
        const useDeflate = compressed !== null && compressed.length < entry.bytes.length;
        const payload = useDeflate ? compressed : entry.bytes;
        const method = useDeflate ? 8 : 0;

        const local = new Uint8Array(30 + name.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, method, true);
        localView.setUint16(10, dosTime, true);
        localView.setUint16(12, dosDate, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, payload.length, true);
        localView.setUint32(22, entry.bytes.length, true);
        localView.setUint16(26, name.length, true);
        localView.setUint16(28, 0, true);
        local.set(name, 30);
        body.push(local, payload);

        const record = new Uint8Array(46 + name.length);
        const recordView = new DataView(record.buffer);
        recordView.setUint32(0, 0x02014b50, true);
        recordView.setUint16(4, 20, true);
        recordView.setUint16(6, 20, true);
        recordView.setUint16(8, 0, true);
        recordView.setUint16(10, method, true);
        recordView.setUint16(12, dosTime, true);
        recordView.setUint16(14, dosDate, true);
        recordView.setUint32(16, crc, true);
        recordView.setUint32(20, payload.length, true);
        recordView.setUint32(24, entry.bytes.length, true);
        recordView.setUint16(28, name.length, true);
        recordView.setUint32(42, offset, true);
        record.set(name, 46);
        central.push(record);

        offset += local.length + payload.length;
      }
      let centralSize = 0;
      for (const record of central) centralSize += record.length;
      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      endView.setUint32(0, 0x06054b50, true);
      endView.setUint16(8, entries.length, true);
      endView.setUint16(10, entries.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, offset, true);

      const chunks = body.concat(central, [end]);
      let total = 0;
      for (const chunk of chunks) total += chunk.length;
      const archive = new Uint8Array(total);
      let position = 0;
      for (const chunk of chunks) {
        archive.set(chunk, position);
        position += chunk.length;
      }
      return archive;
    }

    /**
     * Assembles the archive the import route expects.
     * @param {object[]} sessions - mapped conversations.
     * @param {Array<{name: string, bytes: Uint8Array}>} [attachments] - attachment entries.
     * @returns {Promise<Uint8Array>} archive bytes.
     */
    async function buildArchive(sessions, attachments) {
      const encoder = new TextEncoder();
      const index = sessions.map(session => ({
        id: session.id,
        title: session.title,
        message_count: session.messages.length,
        inserted_at: session.inserted_at,
        updated_at: session.updated_at,
      }));
      const entries = [
        { name: 'manifest.json', bytes: encoder.encode(JSON.stringify({ export_format_version: 3 })) },
        { name: 'chat_session_index.json', bytes: encoder.encode(JSON.stringify(index)) },
      ];
      for (const session of sessions) {
        entries.push({
          name: 'chat_sessions/' + session.id + '.json',
          bytes: encoder.encode(JSON.stringify({
            id: session.id,
            title: session.title,
            current_message_id: session.current_message_id,
            inserted_at: session.inserted_at,
            messages: session.messages,
          })),
        });
      }
      for (const attachment of (Array.isArray(attachments) ? attachments : [])) {
        entries.push(attachment);
      }
      return buildZip(entries);
    }

    /**
     * Reads the import route's NDJSON answer: progress lines, then exactly one
     * outcome line. HTTP 200 alone does not mean the import worked, so the
     * outcome is the only trustworthy signal.
     * @param {Response} response - import route answer.
     * @returns {Promise<{outcome: object|null, raw: string}>} decoded outcome and a short raw excerpt.
     */
    async function readImportOutcome(response) {
      let text = '';
      try {
        text = await response.text();
      } catch (error) {
        return { outcome: null, raw: 'unreadable body: ' + String(error) };
      }
      let outcome = null;
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          continue;
        }
        if (parsed !== null && typeof parsed === 'object') {
          if (parsed.type === 'outcome') outcome = parsed.outcome;
          else if (parsed.ok !== undefined) outcome = parsed;
        }
      }
      return { outcome, raw: text.slice(0, 600) };
    }

    /**
     * Probes one attachment URL several ways so the note can name the variant
     * that actually returns image bytes. A signed path is designed for an
     * `<img src>`, and a plain fetch can land on the SPA shell instead.
     * @param {{path: string}} ref - attachment reference.
     * @returns {string} expression resolving to a JSON string.
     */
    function imageProbeSource(ref) {
      return `(async () => {
        ${authReplaySnippet()}
        const target = ${JSON.stringify(ref.path)};
        const lines = [];
        const describe = async (label, init, origin) => {
          try {
            const url = origin === undefined ? target : origin + target;
            const response = await fetch(url, init);
            let magic = '';
            let size = 0;
            try {
              const buffer = await response.arrayBuffer();
              size = buffer.byteLength;
              const bytes = new Uint8Array(buffer).subarray(0, 4);
              for (const byte of bytes) magic += (byte < 16 ? '0' : '') + byte.toString(16);
            } catch (error) { magic = 'unreadable'; }
            const location = response.headers.get('location') || '';
            lines.push(label + ': ' + response.status
              + ' ' + (response.headers.get('content-type') || '-')
              + ' size=' + size + ' magic=' + magic
              + (location === '' ? '' : ' loc=' + location));
          } catch (error) {
            lines.push(label + ': ' + String(error));
          }
        };
        await describe('plain', { credentials: 'include', headers: replay });
        await describe('accept', { credentials: 'include', headers: Object.assign({ accept: 'image/*' }, replay) });
        await describe('no-auth', { credentials: 'include' });
        await describe('manual', { credentials: 'include', headers: replay, redirect: 'manual' });
        await describe('files-host', { credentials: 'omit' }, 'https://files.deepseeksvc.com/api');

        // The site's own image URLs: what the page actually loads.
        try {
          const seen = new Set();
          const fromPerformance = performance.getEntriesByType('resource')
            .filter(entry => entry.initiatorType === 'img' || /\\.(png|jpe?g|webp|gif)(\\?|$)/i.test(entry.name))
            .map(entry => entry.name);
          const fromDom = Array.from(document.images).map(image => image.currentSrc || image.src || '');
          for (const url of fromPerformance.concat(fromDom)) {
            if (url === '' || seen.has(url)) continue;
            seen.add(url);
            if (seen.size > 6) break;
            lines.push('img: ' + url.slice(0, 150));
          }
          if (seen.size === 0) lines.push('img: 页面上没有已加载的图片');
        } catch (error) {
          lines.push('img: ' + String(error));
        }
        return lines.join('\\n');
      })()`;
    }

    /**
     * Asks the Host to read one attachment. The file host grants no CORS
     * headers, so a page `fetch` cannot read it; the Host reads it in Node and
     * answers same-origin.
     * @param {string} path - signed path from the conversation payload.
     * @returns {Promise<{bytes?: Uint8Array, type?: string, error?: string}>} bytes or a reason.
     */
    async function fetchAttachment(path) {
      const url = path.startsWith('http') ? path : 'https://files.deepseeksvc.com/api' + path;
      let response;
      try {
        response = await fetch('/api/ds-chat-sync/proxy-image', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        });
      } catch (error) {
        return { error: 'proxy unreachable: ' + String(error) };
      }
      if (response.ok !== true) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 120); } catch (error) { detail = ''; }
        return { error: 'proxy HTTP ' + response.status + (detail === '' ? '' : ' · ' + detail) };
      }
      const buffer = await response.arrayBuffer();
      return { bytes: new Uint8Array(buffer), type: response.headers.get('content-type') || '' };
    }

    /**
     * Lists the image attachments of one conversation that carry a fetchable
     * path. Only images are collected; other files stay as synthetic cards.
     * @param {object} payload - parsed `history_messages` body.
     * @returns {Array<{id: string, path: string, name: string}>} attachment refs.
     */
    function extractImageRefs(payload) {
      const biz = payload && payload.data && payload.data.biz_data;
      const messages = biz && biz.chat_messages;
      if (Array.isArray(messages) === false) return [];
      const refs = [];
      const seen = new Set();
      for (const message of messages) {
        if (message === null || typeof message !== 'object') continue;
        const fragments = Array.isArray(message.fragments) ? message.fragments : [];
        for (const fragment of fragments) {
          if (fragment === null || fragment.type !== 'FILE' || Array.isArray(fragment.files) === false) continue;
          for (const file of fragment.files) {
            if (file === null || typeof file !== 'object') continue;
            if (typeof file.id !== 'string' || seen.has(file.id)) continue;
            if (file.is_image !== true) continue;
            if (typeof file.signed_path !== 'string' || file.signed_path === '') continue;
            seen.add(file.id);
            refs.push({ id: file.id, path: file.signed_path, name: String(file.file_name || 'image.png') });
          }
        }
      }
      return refs;
    }

    /**
     * Points one archived attachment at its fragment, so the importer resolves
     * the bytes instead of rendering a card with no content.
     * @param {object} session - mapped conversation.
     * @param {string} fileId - attachment id.
     * @param {string} path - archive entry name.
     * @returns {void}
     */
    function markImagePath(session, fileId, path) {
      for (const message of session.messages) {
        for (const fragment of message.fragments) {
          if (fragment.type !== 'FILE' || Array.isArray(fragment.files) === false) continue;
          for (const file of fragment.files) {
            if (file.id === fileId) file.export_path = path;
          }
        }
      }
    }

    /** Archive extension for each media type the importer accepts. */
    const EXTENSION_OF = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };

    /**
     * Builds the archive entry name for one attachment, matching the export
     * layout the importer resolves `export_path` against.
     *
     * Two details matter and both are conventions of the real export: the
     * site's file ids carry a `file-` prefix that the export strips, and the
     * extension must describe the bytes actually stored. The file host serves
     * WebP behind a `.png` display name, and the importer derives the media
     * type from the extension, so a name that disagrees with its bytes is
     * rejected during storage.
     * @param {string} sessionId - conversation id.
     * @param {{id: string, name: string}} ref - attachment.
     * @param {string} mediaType - detected media type of the bytes.
     * @returns {string} relative archive path.
     */
    function attachmentEntryName(sessionId, ref, mediaType) {
      const bare = String(ref.id).replace(/^file-/, '');
      const stem = String(ref.name).replace(/\.[^.]*$/, '');
      const safe = stem.replace(/[\\/:*?"<>|]/g, '_');
      const extension = EXTENSION_OF[mediaType] || 'bin';
      return 'chat_sessions/' + sessionId + '_files/' + bare + '_' + safe + '.' + extension;
    }

    /**
     * Recognizes the image containers the export format supports.
     * @param {Uint8Array} bytes - payload.
     * @returns {string|null} media type, or null when the bytes are not a known image.
     */
    function imageKindOf(bytes) {
      if (bytes.length < 12) return null;
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
      return null;
    }

    /**
     * Decodes base64 into bytes.
     * @param {string} text - base64 payload.
     * @returns {Uint8Array} decoded bytes.
     */
    function base64ToBytes(text) {
      const binary = atob(text);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    // -------------------------------------------------------------- ledger
    /**
     * Reads the imported-conversation ledger.
     * @returns {object} map of conversation id to its site update time.
     */
    function readLedger() {
      try {
        const raw = window.localStorage.getItem(LEDGER_KEY);
        const parsed = raw === null ? {} : JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    /**
     * Records conversations as imported.
     * @param {object[]} sessions - imported conversations.
     * @returns {void}
     */
    function writeLedger(sessions) {
      try {
        const ledger = readLedger();
        for (const session of sessions) ledger[session.id] = session.updatedAt;
        window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      } catch (error) { /* a full or blocked storage must not fail the import */ }
    }

    // --------------------------------------------------------------- styles
    /**
     * Styles for this tab. Every color, border and radius comes from the host
     * theme, so light and dark follow the application without a second
     * definition; the literal values are only fallbacks for a renamed token.
     */
    const CSS = ".ds-cs-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);}\n.ds-cs-bar{display:flex;flex:0 0 auto;align-items:center;gap:6px;box-sizing:border-box;height:44px;padding:0 12px;border-bottom:.5px solid var(--dsw-alias-border-l3);}\n.ds-cs-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-btn{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;height:28px;padding:0 12px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease;}\n@media (hover:hover){.ds-cs-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-btn:disabled{color:var(--dsw-alias-label-quaternary);background:transparent;border-color:transparent;cursor:default;}\n.ds-cs-stage{position:relative;flex:1 1 auto;min-height:220px;}\n.ds-cs-stage[data-hidden=\"true\"]{display:none;}\n.ds-cs-host{position:absolute;inset:0;}\n.ds-cs-panel{display:flex;flex:0 0 auto;flex-direction:column;gap:12px;min-height:0;max-height:62%;padding:12px 12px 10px;border-top:.5px solid var(--dsw-alias-border-l3);}\n.ds-cs-search{position:relative;display:flex;align-items:center;width:100%;}\n.ds-cs-search input{width:100%;height:34px;box-sizing:border-box;padding:0 12px 0 32px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);transition:border-color .12s ease;}\n.ds-cs-search input::placeholder{color:var(--dsw-alias-label-tertiary);}\n.ds-cs-search input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);}\n.ds-cs-glass{position:absolute;left:11px;display:flex;pointer-events:none;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-head{display:flex;align-items:center;gap:8px;min-width:0;padding:0 2px;margin-bottom:-4px;}\n.ds-cs-head-title{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);}\n.ds-cs-grow{flex:1 1 auto;min-width:0;}\n.ds-cs-count{flex:0 0 auto;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-group{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);}\n.ds-cs-list{display:flex;flex:1 1 auto;flex-direction:column;gap:2px;min-height:0;margin:0;padding:0;overflow:auto;list-style:none;}\n.ds-cs-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--dsw-radius-sm);cursor:pointer;transition:background .12s ease;}\n@media (hover:hover){.ds-cs-item:hover{background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-item[data-on=\"true\"]{background:var(--dsw-alias-interactive-bg-active);}\n.ds-cs-item[data-done=\"true\"]{cursor:default;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-item[data-done=\"true\"]:hover{background:transparent;}\n.ds-cs-text{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;gap:1px;}\n.ds-cs-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:1.5;color:inherit;}\n.ds-cs-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-note{margin:0;padding:10px 12px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-tertiary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);max-height:300px;overflow:auto;}\n.ds-cs-note[data-mono=\"true\"]{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;}\n.ds-cs-tools{display:flex;flex:0 0 auto;flex-wrap:wrap;gap:16px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l3);}\n.ds-cs-link{font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);background:none;border:0;padding:0;cursor:pointer;transition:color .12s ease;}\n@media (hover:hover){.ds-cs-link:hover:not(:disabled){color:var(--dsw-alias-label-primary);}}\n.ds-cs-link:disabled{opacity:.5;cursor:default;}\n.ds-cs-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6;}\n.ds-cs-entry{display:inline-flex;align-items:center;height:26px;padding:0 8px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:var(--dsw-radius-md);cursor:pointer;transition:background .12s ease,color .12s ease;}\n@media (hover:hover){.ds-cs-entry:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-field{display:flex;flex-direction:column;gap:6px;}\n.ds-cs-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);}\n.ds-cs-picker{position:relative;}\n.ds-cs-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;box-sizing:border-box;padding:0 10px 0 12px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);cursor:pointer;text-align:left;transition:background .12s ease,border-color .12s ease;}\n@media (hover:hover){.ds-cs-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-trigger:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary);}\n.ds-cs-trigger-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.ds-cs-caret{flex:0 0 auto;display:flex;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-menu{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;padding:4px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);box-shadow:0 10px 28px var(--dsw-alias-bg-mask-2,rgba(0,0,0,.14));}\n.ds-cs-option{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:none;border:0;border-radius:var(--dsw-radius-sm);cursor:pointer;text-align:left;}\n@media (hover:hover){.ds-cs-option:hover{background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-option[data-current=\"true\"]{background:var(--dsw-alias-interactive-bg-active);}\n.ds-cs-option-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.ds-cs-tick{flex:0 0 auto;display:flex;color:var(--dsw-alias-label-tertiary);}\n.ds-cs-caret-btn{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:22px;height:22px;padding:0;color:var(--dsw-alias-label-tertiary);background:none;border:0;border-radius:var(--dsw-radius-sm);cursor:pointer;transition:background .12s ease,color .12s ease;}\n@media (hover:hover){.ds-cs-caret-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-field-head{display:flex;align-items:center;gap:8px;min-height:22px;}\n.ds-cs-caret-row{display:flex;align-items:center;justify-content:center;width:100%;height:18px;margin:-6px 0 -4px;padding:0;color:var(--dsw-alias-label-tertiary);background:none;border:0;border-radius:var(--dsw-radius-sm);cursor:pointer;transition:background .12s ease,color .12s ease;}\n@media (hover:hover){.ds-cs-caret-row:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}}\n.ds-cs-btn-icon{width:28px;padding:0;}";

    /** Injects this tab's styles; unmounting removes them with the element. */
    function ShellStyles() {
      return h('style', { 'data-ds-chat-sync': '' }, CSS);
    }

    // ------------------------------------------------------------ component
    /**
     * Workspace menu drawn in the host's own style. A native `<select>` opens the
     * platform list, which ignores the theme; this one keeps the theme and shows
     * the current choice with a tick.
     * @param {object} props - items, current value, and change handler.
     * @returns {object} React tree.
     */
    function WorkspacePicker(props) {
      const items = Array.isArray(props.items) ? props.items : [];
      const [open, setOpen] = React.useState(false);
      const boxRef = React.useRef(null);

      React.useEffect(() => {
        if (open === false) return undefined;
        const onPointerDown = (event) => {
          const box = boxRef.current;
          if (box !== null && box.contains(event.target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('mousedown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      const current = items.find(item => item.workspaceId === props.value);
      const label = current === undefined ? '' : (current.title || current.path);

      return h('div', { className: 'ds-cs-picker', ref: boxRef },
        h('button', {
          type: 'button',
          className: 'ds-cs-trigger',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          onClick: () => { setOpen(value => !value); },
        },
          h('span', { className: 'ds-cs-trigger-text' }, label),
          h('span', { className: 'ds-cs-caret', 'aria-hidden': true },
            h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none' },
              h('path', { d: 'M4 6.5L8 10.5L12 6.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        ),
        open === false ? null : h('div', { className: 'ds-cs-menu', role: 'listbox' },
          items.map(item => h('button', {
            key: item.workspaceId,
            type: 'button',
            className: 'ds-cs-option',
            role: 'option',
            'aria-selected': item.workspaceId === props.value ? 'true' : 'false',
            'data-current': item.workspaceId === props.value ? 'true' : 'false',
            onClick: () => {
              props.onChange(item.workspaceId);
              setOpen(false);
            },
          },
            h('span', { className: 'ds-cs-option-text' }, item.title || item.path),
            item.workspaceId === props.value
              ? h('span', { className: 'ds-cs-tick', 'aria-hidden': true },
                h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none' },
                  h('path', { d: 'M3.5 8.5L6.5 11.5L12.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })))
              : null,
          )),
        ),
      );
    }

    /**
     * Sidebar tab body: owns the guest, the conversation list, and the import.
     * @param {object} props - slot props plus the plugin environment.
     * @returns {object} React tree.
     */
    function SyncBody(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const env = props.env;
      const hostRef = React.useRef(null);
      const viewRef = React.useRef(null);
      const leaseRef = React.useRef(undefined);
      const [status, setStatus] = React.useState('booting');
      const [showWeb, setShowWeb] = React.useState(true);
      const [sessions, setSessions] = React.useState(null);
      const [selected, setSelected] = React.useState(() => new Set());
      const [filter, setFilter] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState(null);
      const [ledger, setLedger] = React.useState(() => readLedger());
      const [workspaceId, setWorkspaceId] = React.useState('');
      const [collapsed, setCollapsed] = React.useState(false);

      const workspaces = env.ctx.workspaces.list;
      const subscribeWorkspaces = React.useCallback(
        listener => workspaces.subscribe(listener),
        [workspaces],
      );
      const readWorkspaces = React.useCallback(() => workspaces.getSnapshot(), [workspaces]);
      const workspaceSnapshot = React.useSyncExternalStore(subscribeWorkspaces, readWorkspaces);
      const workspaceItems = workspaceSnapshot.phase === 'ready' ? workspaceSnapshot.items : [];

      const useTabInfo = props.useTabInfo;
      const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
      const tabNavigation = tabInfo === undefined ? undefined : tabInfo.tab.navigation;
      const tabSessionId = tabNavigation === undefined || tabNavigation.params === undefined
        ? undefined
        : tabNavigation.params.sessionId;

      React.useEffect(() => {
        if (workspaceId !== '' || workspaceItems.length === 0) return;
        const host = workspaceItems.find(item => (
          tabSessionId !== undefined && item.sessionIds.includes(tabSessionId)
        ));
        setWorkspaceId((host === undefined ? workspaceItems[0] : host).workspaceId);
      }, [workspaceId, workspaceItems, tabSessionId]);

      React.useEffect(() => {
        let disposed = false;
        const carrier = globalThis.dshDesktop;
        const bridge = carrier !== undefined && carrier.protocolVersion === 1 ? carrier.browser : undefined;
        if (bridge === undefined) {
          setStatus('desktopOnly');
          return undefined;
        }
        const host = hostRef.current;
        if (host === null) {
          setStatus('bridgeMissing');
          return undefined;
        }

        void (async () => {
          try {
            const reservation = await bridge.acquire(PARTITION_KEY);
            if (disposed) {
              void bridge.release(reservation.lease).catch(() => {});
              return;
            }
            leaseRef.current = reservation.lease;
            const view = document.createElement('webview');
            view.setAttribute('name', reservation.lease);
            view.setAttribute('partition', reservation.partition);
            view.setAttribute('allowpopups', '');
            view.setAttribute('src', 'about:blank#' + reservation.lease);
            view.style.width = '100%';
            view.style.height = '100%';
            view.style.border = '0';
            // `dom-ready` fires on every navigation, so the initial load is latched.
            let started = false;
            view.addEventListener('dom-ready', () => {
              if (disposed) return;
              // Idempotent, and installed on every document so the site's own
              // first API call already reveals the token header we must replay.
              try {
                void Promise.resolve(view.executeJavaScript(AUTH_HOOK_SOURCE, true)).catch(() => {});
              } catch (error) { /* the sync button still reports the failure */ }
              if (started) return;
              started = true;
              setStatus('navigating');
              try {
                if (typeof view.setUserAgent === 'function') view.setUserAgent(CHROME_UA);
              } catch (error) { /* the default agent still works */ }
              try {
                void view.loadURL(HOME_URL).catch(() => {});
              } catch (error) { /* reported by did-fail-load */ }
            });
            view.addEventListener('did-stop-loading', () => {
              if (disposed) return;
              setStatus(current => (current === 'ready' || current === 'needLogin' ? current : 'ready'));
              // Report the real sign-in state instead of assuming one: the site
              // shows a sign-in form until the account session exists.
              void view.executeJavaScript(`JSON.stringify({
                path: location.pathname || '',
                form: document.querySelector('input[type="password"]') !== null
                  || document.querySelector('input[placeholder*="手机号"]') !== null
                  || document.querySelector('input[placeholder*="验证码"]') !== null
              })`, true).then((text) => {
                if (disposed || typeof text !== 'string') return;
                let state;
                try { state = JSON.parse(text); } catch (error) { return; }
                const signedOut = String(state.path).includes('sign_in') || state.form === true;
                setStatus(signedOut ? 'needLogin' : 'ready');
              }).catch(() => {});
            });
            view.addEventListener('did-fail-load', (event) => {
              if (disposed || event.isMainFrame !== true || event.errorCode === -3) return;
              setNote(t('error.prefix') + (event.errorDescription || String(event.errorCode)));
            });
            host.append(view);
            viewRef.current = view;
          } catch (error) {
            if (!disposed) {
              setStatus('bridgeMissing');
              setNote(t('error.prefix') + String(error && error.message ? error.message : error));
            }
          }
        })();

        return () => {
          disposed = true;
          const view = viewRef.current;
          if (view !== null && view.parentNode !== null) view.parentNode.removeChild(view);
          viewRef.current = null;
          const lease = leaseRef.current;
          leaseRef.current = undefined;
          if (lease !== undefined) void bridge.release(lease).catch(() => {});
        };
      }, [t]);

      /**
       * Runs an expression in the guest.
       * @param {string} source - expression.
       * @returns {Promise<unknown>} its resolved value.
       */
      const runInPage = React.useCallback(async (source) => {
        const view = viewRef.current;
        if (view === null) throw new Error('网页尚未就绪');
        return view.executeJavaScript(source, true);
      }, []);

      /**
       * Resolves once the guest finishes its next load, or after a deadline.
       * @returns {Promise<boolean>} whether a load completed.
       */
      const waitForLoad = React.useCallback(() => new Promise((resolve) => {
        const view = viewRef.current;
        if (view === null) {
          resolve(false);
          return;
        }
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          try { view.removeEventListener('did-stop-loading', finish); } catch (error) { /* gone */ }
          resolve(true);
        };
        view.addEventListener('did-stop-loading', finish);
        setTimeout(finish, 15000);
      }), []);

      /**
       * Reloads the site so it re-issues its authenticated calls; the hook
       * reinstalls on `dom-ready` and captures the fresh token.
       * @returns {Promise<boolean>} whether the page came back.
       */
      const refreshSession = React.useCallback(async () => {
        const view = viewRef.current;
        if (view === null) return false;
        const loaded = waitForLoad();
        try {
          view.reload();
        } catch (error) {
          return false;
        }
        const ok = await loaded;
        if (ok !== true) return false;
        // Give the page a moment to make its first authenticated request.
        await new Promise(resolve => setTimeout(resolve, 1200));
        return true;
      }, [waitForLoad]);

      /**
       * Reads the conversation list, retrying once after a token refresh.
       * @returns {Promise<object>} the parsed answer.
       */
      const readList = React.useCallback(async () => {
        const first = await runInPage(LIST_SOURCE);
        let parsed = typeof first === 'string' ? JSON.parse(first) : first;
        if (parsed.error !== 'token-invalid') return parsed;
        const refreshed = await refreshSession();
        if (refreshed !== true) return parsed;
        const second = await runInPage(LIST_SOURCE);
        parsed = typeof second === 'string' ? JSON.parse(second) : second;
        return parsed;
      }, [runInPage, refreshSession]);

      const onSync = React.useCallback(async () => {
        setBusy(true);
        setNote(t('hint.loading'));
        try {
          const parsed = await readList();
          const diagnostic = Array.isArray(parsed.tried)
            ? '\n\n' + parsed.tried.map(row => (
              row.query + ' → HTTP ' + row.status + ' · '
              + (row.count < 0 ? '不是预期的 JSON' : row.count + ' 条') + '\n' + row.head
            )).join('\n---\n')
            : '';
          if (parsed.error !== undefined) {
            setNote(t('error.prefix')
              + (parsed.error === 'no-token' ? t('error.notoken')
                : parsed.error === 'token-invalid' ? t('error.tokenexpired')
                  : String(parsed.error))
              + diagnostic);
            return;
          }
          const list = Array.isArray(parsed.sessions) ? parsed.sessions : [];
          setSessions(list);
          setSelected(new Set());
          setNote(list.length === 0 ? t('hint.empty') + diagnostic : null);
        } catch (error) {
          setNote(t('error.prefix') + String(error && error.message ? error.message : error));
        } finally {
          setBusy(false);
        }
      }, [runInPage, t]);

      const onImport = React.useCallback(async () => {
        if (sessions === null) return;
        if (selected.size === 0) {
          setNote(t('import.empty'));
          return;
        }
        if (workspaceId === '') {
          setNote(t('import.noworkspace'));
          return;
        }
        setBusy(true);
        const targets = sessions.filter(session => selected.has(session.id));
        const mapped = [];
        const attachments = [];
        const imageErrors = [];
        const fetchErrors = [];
        let imageCount = 0;
        let imagePlanned = 0;
        let probeReport = null;
        try {
          for (let index = 0; index < targets.length; index += 1) {
            const entry = targets[index];
            setNote(fill(t('hint.importing'), { done: index + 1, total: targets.length })
              + (imageCount === 0 ? '' : fill(t('hint.images'), { n: imageCount })));
            let text = await runInPage(historySource(entry.id));
            // A token that expired between listing and reading is refreshed once.
            if (typeof text === 'string' && text.includes('40003')) {
              const refreshed = await refreshSession();
              if (refreshed === true) text = await runInPage(historySource(entry.id));
            }
            if (typeof text !== 'string') {
              if (fetchErrors.length < 3) fetchErrors.push((entry.title || entry.id) + ': 返回的不是文本');
              continue;
            }
            let payload;
            try {
              payload = JSON.parse(text);
            } catch (error) {
              if (fetchErrors.length < 3) fetchErrors.push((entry.title || entry.id) + ': 不是 JSON — ' + text.slice(0, 120));
              continue;
            }
            if (payload.error !== undefined) {
              if (fetchErrors.length < 3) fetchErrors.push((entry.title || entry.id) + ': ' + String(payload.error));
              continue;
            }
            const session = mapSession(payload);
            if (session === null) {
              if (fetchErrors.length < 3) fetchErrors.push((entry.title || entry.id) + ': 结构无法识别');
              continue;
            }
            session.updatedAt = entry.updatedAt;
            session.updated_at = isoFromUnix(entry.updatedAt);

            const refs = extractImageRefs(payload).slice(0, MAX_IMAGES_PER_SESSION);
            if (refs.length > 0) {
              imagePlanned += refs.length;
              for (const ref of refs) {
                let got;
                try {
                  got = await fetchAttachment(ref.path);
                } catch (error) {
                  got = { error: String(error) };
                }
                if (got.bytes === undefined) {
                  if (imageErrors.length < 3) imageErrors.push(ref.name + ': ' + String(got.error || 'no bytes'));
                  continue;
                }
                const kind = imageKindOf(got.bytes);
                if (kind === null) {
                  let magic = '';
                  for (const byte of got.bytes.subarray(0, 4)) magic += (byte < 16 ? '0' : '') + byte.toString(16);
                  if (imageErrors.length < 3) {
                    imageErrors.push(ref.name + ': 不是图片 (type=' + String(got.type || '?')
                      + ' magic=' + magic + ' size=' + got.bytes.length + ')');
                  }
                  continue;
                }
                const name = attachmentEntryName(session.id, ref, kind);
                attachments.push({ name, bytes: got.bytes });
                markImagePath(session, ref.id, name);
                imageCount += 1;
              }
            }
            mapped.push(session);
          }
          if (mapped.length === 0) {
            setNote(t('error.prefix') + t('error.notjson'));
            return;
          }
          setNote(fill(t('hint.importing'), { done: targets.length, total: targets.length }));
          const archive = await buildArchive(mapped, attachments);
          // Keep a copy so a failed import can be compared offline against an
          // archive the site itself produced. Local only; failure is ignored.
          try {
            await fetch('/api/ds-chat-sync/dump-archive', {
              method: 'POST',
              headers: { 'content-type': 'application/octet-stream' },
              body: archive.slice(),
            });
          } catch (error) { /* the import below is what matters */ }
          const response = await fetch(
            '/api/deepseek-chat-import/archive?workspaceId=' + encodeURIComponent(workspaceId),
            {
              method: 'POST',
              headers: { 'content-type': 'application/octet-stream' },
              body: archive,
            },
          );
          if (response.ok === false) {
            setNote(t('error.prefix') + 'HTTP ' + response.status);
            return;
          }
          const { outcome, raw } = await readImportOutcome(response);
          if (outcome === null) {
            setNote(t('error.prefix') + t('error.nooutcome') + '\n' + raw);
            return;
          }
          if (outcome.ok !== true) {
            const error = outcome.error || {};
            setNote(t('error.prefix') + String(error.reason || 'unknown')
              + (error.message === undefined ? '' : ' · ' + String(error.message))
              + '\nHTTP ' + response.status + '\n' + raw);
            return;
          }
          const value = outcome.value || {};
          const created = Array.isArray(value.sessionIds) ? value.sessionIds : [];
          const skipped = Array.isArray(value.skipped) ? value.skipped : [];
          // Only conversations the importer reports as written enter the ledger.
          writeLedger(mapped.filter((session) => created.includes(session.id)));
          setLedger(readLedger());
          setSelected(new Set());
          setNote(fill(t('import.done'), { n: created.length })
            + (value.workspacePath === undefined ? '' : '\n' + fill(t('import.target'), { path: String(value.workspacePath) }))
            + (skipped.length === 0 ? '' : fill(t('import.skipped'), { n: skipped.length }))
            + (value.omittedByLimit === undefined || value.omittedByLimit === 0
              ? ''
              : fill(t('import.omitted'), { n: value.omittedByLimit }))
            + (imagePlanned === 0 ? '' : '\n' + fill(t('import.images'), { ok: imageCount, total: imagePlanned }))
            + (imageErrors.length === 0 ? '' : '\n' + t('import.imageErrors') + '\n' + imageErrors.join('\n'))
            + (probeReport === null ? '' : '\n' + t('probe.title') + '\n' + String(probeReport)));
          // The Host wrote the Sessions; the client list is stale until asked.
          const sessionsService = env.ctx.sessions;
          if (sessionsService !== undefined && typeof sessionsService.refresh === 'function') {
            try {
              await sessionsService.refresh();
            } catch (error) { /* the note already reports the import */ }
          }
        } catch (error) {
          setNote(t('error.prefix') + String(error && error.message ? error.message : error));
        } finally {
          setBusy(false);
        }
      }, [sessions, selected, workspaceId, runInPage, t]);

      const onAuth = React.useCallback(async () => {
        setBusy(true);
        try {
          const raw = await runInPage(AUTH_READ_SOURCE);
          let headers = {};
          try { headers = JSON.parse(typeof raw === 'string' ? raw : '{}'); } catch (error) { headers = {}; }
          const keys = Object.keys(headers);
          if (keys.length === 0) {
            setNote(t('auth.none'));
            return;
          }
          setNote(t('auth.found') + '\n' + keys.map((key) => {
            const value = String(headers[key]);
            const shown = value.length <= 10 ? value : value.slice(0, 6) + '…';
            return key + ': ' + shown + '  (长度 ' + value.length + ')';
          }).join('\n'));
        } catch (error) {
          setNote(t('error.prefix') + String(error && error.message ? error.message : error));
        } finally {
          setBusy(false);
        }
      }, [runInPage, t]);

      const onProbeImages = React.useCallback(async () => {
        if (sessions === null || selected.size === 0) {
          setNote(t('import.empty'));
          return;
        }
        setBusy(true);
        setNote(t('hint.loading'));
        try {
          const target = sessions.find(item => selected.has(item.id));
          const text = await runInPage(historySource(target.id));
          const payload = JSON.parse(typeof text === 'string' ? text : '{}');
          if (payload.error !== undefined) {
            setNote(t('error.prefix') + String(payload.error));
            return;
          }
          const refs = extractImageRefs(payload);
          if (refs.length === 0) {
            setNote(t('probe.noimage'));
            return;
          }
          const report = await runInPage(imageProbeSource(refs[0]));
          setNote(t('probe.title') + '\n' + String(report));
        } catch (error) {
          setNote(t('error.prefix') + String(error && error.message ? error.message : error));
        } finally {
          setBusy(false);
        }
      }, [sessions, selected, runInPage, t]);

      const onReset = React.useCallback(() => {
        try {
          window.localStorage.removeItem(LEDGER_KEY);
        } catch (error) { /* ignore */ }
        setLedger({});
        setNote(t('reset.done'));
      }, [t]);

      const onReload = React.useCallback(() => {
        const view = viewRef.current;
        if (view === null) return;
        try {
          view.reload();
        } catch (error) { /* ignore */ }
      }, []);

      const toggle = React.useCallback((id) => {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const lowered = filter.trim().toLowerCase();
      const visible = sessions === null
        ? []
        : sessions.filter(session => (
          lowered === '' || String(session.title || '').toLowerCase().includes(lowered)
        )).slice(0, 400);
      // Declared after `visible`: both read it, and a hook dependency array is
      // evaluated during render, where an earlier reference would be in its
      // temporal dead zone and throw.
      const pickable = visible.filter(session => ledger[session.id] === undefined);
      const allSelected = pickable.length > 0
        && pickable.every(session => selected.has(session.id));
      const toggleAll = React.useCallback(() => {
        setSelected((current) => {
          const next = new Set(current);
          const everyOn = pickable.length > 0 && pickable.every(session => next.has(session.id));
          for (const session of pickable) {
            if (everyOn) next.delete(session.id);
            else next.add(session.id);
          }
          return next;
        });
      }, [pickable]);

      return h('div', { className: 'ds-cs-root' },
        h(ShellStyles, null),
        h('div', { className: 'ds-cs-bar' },
          h('span', { className: 'ds-cs-status' }, t('status.' + status)),
          h('button', {
            type: 'button', className: 'ds-cs-btn',
            disabled: busy, onClick: onSync,
          }, t('action.sync')),
          collapsed === true && sessions !== null ? h('button', {
            type: 'button', className: 'ds-cs-btn',
            onClick: () => { setCollapsed(false); },
          }, t('panel.show')) : null,
          h('button', {
            type: 'button', className: 'ds-cs-btn',
            onClick: () => { setShowWeb(value => !value); },
          }, t(showWeb ? 'action.hide' : 'action.web')),
        ),
        // The stage stays mounted and is hidden with CSS: unmounting it would
        // take the imperatively appended guest with it and destroy the login.
        h('div', { className: 'ds-cs-stage', 'data-hidden': showWeb === true ? 'false' : 'true' },
          h('div', { ref: hostRef, className: 'ds-cs-host' }),
        ),
        collapsed === true || (sessions === null && note === null) ? null : h('div', { className: 'ds-cs-panel' },
          h('button', {
            type: 'button',
            className: 'ds-cs-caret-row',
            title: t(collapsed ? 'panel.show' : 'panel.hide'),
            'aria-label': t(collapsed ? 'panel.show' : 'panel.hide'),
            'aria-expanded': collapsed ? 'false' : 'true',
            onClick: () => { setCollapsed(value => !value); },
          }, h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
            h('path', {
              d: collapsed ? 'M4 10L8 6L12 10' : 'M4 6L8 10L12 6',
              stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
            }))),
          sessions === null
            ? h('div', { className: 'ds-cs-empty' }, h('span', null, note))
            : h(React.Fragment, null,
                h('div', { className: 'ds-cs-field' },
                  h('div', { className: 'ds-cs-field-head' },
                    h('span', { className: 'ds-cs-label' }, t('label.workspace')),
                    h('span', { className: 'ds-cs-grow' }),
                    h('button', {
                      type: 'button', className: 'ds-cs-btn',
                      disabled: sessions === null, onClick: toggleAll,
                    }, t(allSelected === true ? 'list.none' : 'list.all')),
                    h('button', {
                      type: 'button', className: 'ds-cs-btn',
                      disabled: busy || sessions === null, onClick: onImport,
                    }, t('action.import')),
                  ),
                  h(WorkspacePicker, {
                    items: workspaceItems,
                    value: workspaceId,
                    onChange: setWorkspaceId,
                  }),
                ),
                h('span', { className: 'ds-cs-search' },
                  h('svg', { className: 'ds-cs-glass', width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }, h('circle', { cx: 7, cy: 7, r: 4.6, stroke: 'currentColor', strokeWidth: 1.4 }), h('path', { d: 'M10.6 10.6L14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })),
                  h('input', {
                    type: 'search', placeholder: t('list.search'),
                    value: filter, onChange: event => { setFilter(event.target.value); },
                  }),
                ),
                h('div', { className: 'ds-cs-head' },
                  h('span', { className: 'ds-cs-head-title' }, t('list.heading')),
                  h('span', { className: 'ds-cs-grow' }),
                  h('span', { className: 'ds-cs-count' }, fill(t('hint.selected'), { n: selected.size })),
                ),
                h('div', { className: 'ds-cs-group' },
                  h('ul', { className: 'ds-cs-list' }, visible.map(session => {
                    const done = ledger[session.id] !== undefined;
                    const on = selected.has(session.id);
                    const when = formatWhen(session.updatedAt);
                    const sub = [when, done === true ? t('list.imported') : null]
                      .filter(part => part !== null && part !== '').join(' · ');
                    return h('li', {
                      key: session.id,
                      className: 'ds-cs-item',
                      role: 'checkbox',
                      'aria-checked': on || done ? 'true' : 'false',
                      'aria-disabled': done ? 'true' : 'false',
                      'data-done': done ? 'true' : 'false',
                      'data-on': on ? 'true' : 'false',
                      title: session.title || session.id,
                      onClick: () => { if (done === false) toggle(session.id); },
                    },
                      h('span', { className: 'ds-cs-text' },
                        h('span', { className: 'ds-cs-title' }, session.title || session.id),
                        sub === '' ? null : h('span', { className: 'ds-cs-sub' }, sub),
                      ),
                    );
                  })),
                ),
                note === null ? null : h('div', { className: 'ds-cs-note', 'data-mono': 'true' }, note),
                h('div', { className: 'ds-cs-tools' },
                  h('button', { type: 'button', className: 'ds-cs-link', onClick: onReload }, t('action.reload')),
                  h('button', { type: 'button', className: 'ds-cs-link', disabled: busy, onClick: onAuth }, t('action.auth')),
                  h('button', { type: 'button', className: 'ds-cs-link', onClick: onReset }, t('action.reset')),
                  h('button', { type: 'button', className: 'ds-cs-link', disabled: busy, onClick: onProbeImages }, t('action.probe')),
                ),
              ),
        ),
      );
    }

    /**
     * Composer tool-row entry: toggles this tab, which hosts the site itself.
     * The same control closes it, so the row needs no second affordance.
     * @param {object} props - slot props plus the plugin environment.
     * @returns {object} React tree.
     */
    function WebEntry(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const env = props.env;
      const sidebar = env.ctx.sidebarRight;
      const source = sidebar.openTabs;
      const subscribe = React.useCallback(listener => source.subscribe(listener), [source]);
      const read = React.useCallback(() => source.getSnapshot(), [source]);
      const tabs = React.useSyncExternalStore(subscribe, read);
      const opened = Array.isArray(tabs) ? tabs.find(tab => tab.kind === KIND) : undefined;
      const active = opened !== undefined;
      const onToggle = React.useCallback(() => {
        try {
          if (opened !== undefined) sidebar.close(opened.tabId);
          else sidebar.openTab(KIND);
        } catch (error) { /* the registry reports its own refusals */ }
      }, [opened, sidebar]);
      return h(React.Fragment, null,
        h(ShellStyles, null),
        h('button', {
          type: 'button',
          className: 'ds-cs-entry',
          title: t(active ? 'entry.close' : 'entry.open'),
          'aria-pressed': active ? 'true' : 'false',
          onClick: onToggle,
        },
          t('entry.label'),
        ),
      );
    }

    /**
     * Tab chip title.
     * @returns {object} React tree.
     */
    function SyncTitle(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      return h('span', { style: { fontSize: '12px', fontWeight: 600 } }, t('type.label'));
    }

    // Test seam: a Node harness sets this flag to exercise the pure helpers
    // without a browser. Production never defines it.
    if (globalThis.__DSCS_TEST__ === true) {
      return {
        buildZip, buildArchive, mapSession, mapFragment, crc32, deflateRaw, isoFromUnix,
        extractImageRefs, attachmentEntryName, base64ToBytes, markImagePath, SyncBody, WebEntry, WorkspacePicker, formatWhen,
      };
    }

    /** Registration entry point. */
    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'workspaces', 'sessions'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        const env = { ctx };
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ds-chat-sync: locale');
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          multiple: false,
          keepMounted: true,
          title: () => t('type.label'),
          description: () => t('type.description'),
          guide: [{
            id: 'open',
            order: 40,
            title: () => t('type.label'),
            description: () => t('type.description'),
          }],
        }), 'ds-chat-sync: tab type');
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          locale: NS,
        }, props => h(SyncBody, Object.assign({ env }, props)))), 'ds-chat-sync: tab body');
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: ID,
          locale: NS,
        }, SyncTitle)), 'ds-chat-sync: tab title');
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: ID + '/entry',
          order: 5,
          locale: NS,
        }, childProps => h(WebEntry, Object.assign({ env }, childProps)))), 'ds-chat-sync: composer entry');
      },
    };
  },
});
