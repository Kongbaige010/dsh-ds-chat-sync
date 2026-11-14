/**
 * Host half of the DeepSeek chat sync bundle.
 *
 * Registers one narrow route that fetches a signed attachment from the site's
 * file host. The browser cannot read those bytes itself: the file host answers
 * `chat.deepseek.com` without CORS headers, so a page `fetch` fails with
 * "Failed to fetch" even though an `<img>` loads it fine. Node has no such
 * restriction, so the read happens here and the bytes travel back same-origin.
 *
 * The route is deliberately not an open proxy: it accepts only the exact file
 * host and only URLs carrying a `state` signature.
 *
 * @module @local/dsh-ds-chat-sync
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only origin this proxy will read from. */
const ALLOWED_PREFIX = 'https://files.deepseeksvc.com/';
/** Largest attachment this proxy returns, in bytes. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Route the Client half posts to. */
const ROUTE = '/api/ds-chat-sync/proxy-image';
/** Route that keeps the last built archive for offline comparison. */
const DUMP_ROUTE = '/api/ds-chat-sync/dump-archive';

/** Where the last archive is kept, relative to this package. */
const DUMP_DIR = new URL('./.debug/', import.meta.url);
/** Largest archive kept for inspection, in bytes. */
const MAX_DUMP_BYTES = 64 * 1024 * 1024;

/**
 * Request profiles tried in order. The file host sits behind a WAF that may
 * answer a bare Node request with 400, so the proxy presents itself the way the
 * page would before giving up.
 */
const PROFILES = [
  {
    label: 'browser',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: 'https://chat.deepseek.com/',
      origin: 'https://chat.deepseek.com',
    },
  },
  {
    label: 'plain',
    headers: {},
  },
];

/**
 * The file route requires a `ty` discriminator that the conversation payload
 * omits, so every accepted value is tried in turn.
 */
const TYPE_VARIANTS = ['p', 't', 'r'];

/**
 * Adds the missing `ty` discriminator when the signed path lacks one.
 * @param {string} url - signed file URL.
 * @param {string} variant - one of {@link TYPE_VARIANTS}.
 * @returns {string} candidate URL.
 */
function withType(url, variant) {
  return /[?&]ty=/.test(url) ? url : url + '&ty=' + variant;
}

/**
 * Keep the archive the Client just built, so a failure can be compared offline
 * against an archive the site itself produced. Development aid: it writes only
 * inside this package and only when the Client sends one.
 * @param {Request} request - body: raw ZIP bytes.
 * @returns {Promise<Response>} where it landed, or why not.
 */
async function dumpArchive(request) {
  let bytes;
  try {
    bytes = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    return new Response('unreadable body', { status: 400 });
  }
  if (bytes.length === 0) return new Response('empty body', { status: 400 });
  if (bytes.length > MAX_DUMP_BYTES) return new Response('too large', { status: 413 });
  try {
    const dir = fileURLToPath(DUMP_DIR);
    await mkdir(dir, { recursive: true });
    const target = join(dir, 'last-archive.zip');
    await writeFile(target, bytes);
    return new Response('written ' + bytes.length + ' bytes to ' + target, { status: 200 });
  } catch (error) {
    return new Response('write failed: ' + String(error), { status: 500 });
  }
}

/**
 * Read one attachment on the page's behalf.
 * @param {Request} request - body `{ url }` naming a signed file URL.
 * @returns {Promise<Response>} the bytes, or a short reason naming each attempt.
 */
async function proxyImage(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return new Response('body must be JSON', { status: 400 });
  }
  const url = payload !== null && typeof payload === 'object' && typeof payload.url === 'string'
    ? payload.url
    : '';
  if (url.startsWith(ALLOWED_PREFIX) === false) {
    return new Response('unsupported origin', { status: 400 });
  }
  if (url.includes('state=') === false) {
    return new Response('a signed url is required', { status: 400 });
  }

  const tried = [];
  for (const variant of TYPE_VARIANTS) {
    const candidate = withType(url, variant);
    for (const profile of PROFILES) {
      let upstream;
      try {
        upstream = await fetch(candidate, { redirect: 'follow', headers: profile.headers });
      } catch (error) {
        tried.push(variant + '/' + profile.label + ': ' + String(error).slice(0, 60));
        continue;
      }
      if (upstream.ok === false) {
        let detail = '';
        try {
          detail = (await upstream.text()).slice(0, 60);
        } catch (error) {
          detail = '';
        }
        tried.push(variant + '/' + profile.label + ': ' + upstream.status + (detail === '' ? '' : ' ' + detail));
        continue;
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length === 0) {
        tried.push(variant + '/' + profile.label + ': empty body');
        continue;
      }
      if (bytes.length > MAX_BYTES) {
        return new Response('attachment too large', { status: 413 });
      }
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-ds-attachment-profile': variant + '/' + profile.label,
        },
      });
    }
  }
  return new Response('every attempt failed → ' + tried.join(' | '), { status: 502 });
}

/** Services the route needs. */
export const inject = ['connection'];

/**
 * Register the attachment proxy.
 * @param {object} ctx - plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: proxyImage,
    }),
    'ds-chat-sync: attachment proxy',
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: DUMP_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: dumpArchive,
    }),
    'ds-chat-sync: archive dump',
  );
}
