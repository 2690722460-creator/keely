import { createCmsHandler, loadCmsConfig } from './cms.mjs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BODY_LIMIT = 16 * 1024;
const DEFAULT_TO = '2690722460@qq.com';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.pdf': 'application/pdf'
};

function isEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n\0]/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) ||
      parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false;
  const labels = parts[1].split('.');
  return labels.length > 1 && labels.every(label =>
    label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

function exactOrigin(value) {
  if (typeof value !== 'string' || !value || value === 'null' || value.includes('*')) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value &&
      !parsed.username && !parsed.password ? parsed.origin : null;
  } catch { return null; }
}

/** Parse trusted server environment only. Missing SMTP never prevents static hosting. */
export function loadConfig(env = process.env) {
  const errors = [];
  const rawPort = env.PORT || '4180';
  const port = /^\d+$/.test(String(rawPort)) && Number(rawPort) > 0 && Number(rawPort) <= 65535 ? Number(rawPort) : 4180;
  if (String(port) !== String(rawPort)) errors.push('PORT');
  const smtpPort = Number(env.SMTP_PORT || 465);
  if (![465, 587].includes(smtpPort)) errors.push('SMTP_PORT');
  const secure = smtpPort === 465;
  if (env.SMTP_SECURE !== undefined && env.SMTP_SECURE !== '' &&
      String(env.SMTP_SECURE).toLowerCase() !== String(secure)) errors.push('SMTP_SECURE');
  const smtpHost = String(env.SMTP_HOST || 'smtp.qq.com').trim();
  if (!/^[A-Za-z0-9.-]+$/.test(smtpHost) || smtpHost.length > 253) errors.push('SMTP_HOST');
  const user = typeof env.SMTP_USER === 'string' ? env.SMTP_USER.trim() : '';
  const pass = typeof env.SMTP_PASS === 'string' ? env.SMTP_PASS.trim() : '';
  if (!isEmail(user)) errors.push('SMTP_USER');
  if (!pass || pass.length > 2048 || /[\r\n\0]/.test(pass)) errors.push('SMTP_PASS');
  const contactTo = typeof env.CONTACT_TO === 'string' && env.CONTACT_TO.trim() ? env.CONTACT_TO.trim() : DEFAULT_TO;
  if (!isEmail(contactTo)) errors.push('CONTACT_TO');
  const origins = new Set();
  const rawOrigins = env.APP_ORIGIN === undefined || env.APP_ORIGIN === ''
    ? `http://localhost:${port},http://127.0.0.1:${port}` : String(env.APP_ORIGIN);
  for (const entry of rawOrigins.split(',')) {
    const origin = exactOrigin(entry.trim());
    if (origin) origins.add(origin); else errors.push('APP_ORIGIN');
  }
  // These values are supplied by the deployment platform, never derived from Host.
  for (const key of ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL']) {
    const domain = typeof env[key] === 'string' ? env[key].trim() : '';
    if (!domain) continue;
    const origin = exactOrigin(`https://${domain}`);
    if (origin) origins.add(origin); else errors.push(key);
  }
  const configErrors = [...new Set(errors)];
  return {
    host: String(env.HOST || '127.0.0.1'), port,
    smtp: { host: smtpHost, port: smtpPort, secure, requireTLS: smtpPort === 587, user, pass },
    contactTo, allowedOrigins: [...origins],
    trustProxy: String(env.TRUST_PROXY || '').toLowerCase() === 'true',
    verifyOnStart: String(env.SMTP_VERIFY_ON_START || '').toLowerCase() === 'true',
    mailReady: configErrors.length === 0, configErrors
  };
}

/** The dependency is lazy so tests inject sendMail without SMTP or network access. */
export async function createMailer(config) {
  if (!config?.mailReady) throw new Error('SMTP configuration incomplete.');
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    requireTLS: config.smtp.requireTLS, ignoreTLS: false,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true
  });
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function decodeBody(raw) {
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'INVALID_JSON', '请提交有效的 JSON 留言。'); }
}

async function readBody(req) {
  // Serverless platforms may have consumed the stream and attached a parsed body.
  if (req.body !== undefined) {
    let raw;
    try {
      raw = Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string'
        ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body));
    } catch { throw new HttpError(400, 'INVALID_JSON', '请提交有效的 JSON 留言。'); }
    if (raw.length > BODY_LIMIT) throw new HttpError(413, 'BODY_TOO_LARGE', '留言数据过大。');
    return decodeBody(raw);
  }
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > BODY_LIMIT)) {
    req.resume();
    throw new HttpError(413, 'BODY_TOO_LARGE', '留言数据过大。');
  }
  return new Promise((resolveBody, reject) => {
    let bytes = 0;
    const chunks = [];
    function cleanup() {
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError);
    }
    function onError() { cleanup(); reject(new HttpError(400, 'INVALID_BODY', '留言数据读取失败。')); }
    function onData(chunk) {
      bytes += chunk.length;
      if (bytes > BODY_LIMIT) {
        cleanup(); req.resume(); reject(new HttpError(413, 'BODY_TOO_LARGE', '留言数据过大。')); return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      cleanup();
      try { resolveBody(decodeBody(Buffer.concat(chunks))); } catch (error) { reject(error); }
    }
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onError);
  });
}

function validatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELDS', '请填写姓名、联系方式和留言内容。');
  }
  const limits = { name: 80, contactInfo: 200, content: 5000 };
  const payload = {};
  for (const [key, maximum] of Object.entries(limits)) {
    if (typeof value[key] !== 'string') throw new HttpError(400, 'INVALID_FIELDS', '请填写有效的留言信息。');
    const text = value[key].trim();
    if (!text || text.length > maximum || /\0/.test(text) || (key !== 'content' && /[\r\n]/.test(text))) {
      throw new HttpError(400, 'INVALID_FIELDS', '请检查留言格式和字数。');
    }
    payload[key] = key === 'content' ? text.replace(/\r\n?/g, '\n') : text;
  }
  if (value.website !== undefined && (typeof value.website !== 'string' || value.website.trim())) {
    throw new HttpError(400, 'INVALID_FIELDS', '留言校验未通过，请重新填写。');
  }
  return payload;
}

function inside(base, target) {
  const subpath = relative(base, target);
  return subpath !== '' && !subpath.startsWith(`..${sep}`) && subpath !== '..' && !isAbsolute(subpath);
}

function sendJSON(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function peerKey(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    if (isIP(first)) return first.replace(/^::ffff:/, '');
  }
  return String(req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

/** Return a Node HTTP request handler. All state belongs to this one instance. */
export function createApp({
  sendMail, config = loadConfig(), rootDir = PROJECT_ROOT, logger = console,
  now = Date.now, rateLimit = {}, sendTimeoutMs = 20000, cmsHandler
} = {}) {
  const max = Math.max(1, Number(rateLimit.max) || 5);
  const windowMs = Math.max(1, Number(rateLimit.windowMs) || 15 * 60 * 1000);
  const maxEntries = Math.max(1, Number(rateLimit.maxEntries) || 10000);
  const buckets = new Map();
  let lastPrune = 0;
  const root = resolve(rootDir);
  const cms = cmsHandler || createCmsHandler({ config: loadCmsConfig(process.env, { allowedOrigins: config.allowedOrigins }) });

  function rateCheck(req) {
    const timestamp = now();
    if (timestamp - lastPrune >= 60000 || buckets.size >= maxEntries) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= timestamp) buckets.delete(key);
      lastPrune = timestamp;
    }
    const key = peerKey(req, config.trustProxy);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      // Do not evict active buckets: that would let churn bypass existing limits.
      if (!bucket && buckets.size >= maxEntries) return { allowed: false, retryAfter: 60 };
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)) };
    bucket.count += 1;
    return { allowed: true };
  }

  async function contact(req, res) {
    if (!['POST', 'OPTIONS'].includes(req.method)) {
      sendJSON(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '此接口仅接受 POST 请求。' }, { Allow: 'POST, OPTIONS' }); return;
    }
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !config.allowedOrigins.includes(origin)) {
      sendJSON(res, 403, { ok: false, code: 'ORIGIN_NOT_ALLOWED', message: '留言来源未获允许。' }); return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      const requestedMethod = req.headers['access-control-request-method'];
      const requestedHeaders = String(req.headers['access-control-request-headers'] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if ((requestedMethod && requestedMethod !== 'POST') || requestedHeaders.some(h => h !== 'content-type')) {
        sendJSON(res, 403, { ok: false, code: 'PREFLIGHT_NOT_ALLOWED', message: '此请求未获允许。' }); return;
      }
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) {
      sendJSON(res, 415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: '请以 JSON 格式提交留言。' }); return;
    }
    const rate = rateCheck(req);
    if (!rate.allowed) {
      sendJSON(res, 429, { ok: false, code: 'RATE_LIMITED', message: '留言过于频繁，请稍后再试。' }, { 'Retry-After': String(rate.retryAfter) }); return;
    }
    const payload = validatePayload(await readBody(req));
    if (!config.mailReady || typeof sendMail !== 'function') {
      sendJSON(res, 503, { ok: false, code: 'MAIL_NOT_CONFIGURED', message: '留言邮件服务尚未配置，请直接使用页面上的联系方式。' }); return;
    }
    const mail = {
      from: { name: '作品集留言', address: config.smtp.user }, to: config.contactTo,
      subject: '作品集新留言',
      text: `作品集收到一条新留言。\n\n姓名：${payload.name}\n联系方式：${payload.contactInfo}\n\n留言内容：\n${payload.content}\n`
    };
    if (isEmail(payload.contactInfo)) mail.replyTo = payload.contactInfo;
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => sendMail(mail)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SMTP_TIMEOUT')), sendTimeoutMs); timer.unref?.(); })
      ]);
      const recipient = config.contactTo.toLowerCase();
      const accepted = Array.isArray(result?.accepted) && result.accepted.some(value => typeof value === 'string' && value.toLowerCase() === recipient);
      const rejected = Array.isArray(result?.rejected) && result.rejected.some(value => typeof value === 'string' && value.toLowerCase() === recipient);
      if (!accepted || rejected) throw new Error('SMTP_RECIPIENT_NOT_ACCEPTED');
      logger.info?.('contact.sent');
      sendJSON(res, 200, { ok: true, message: '留言已发送。' });
    } catch {
      logger.error?.('contact.send_failed');
      sendJSON(res, 502, { ok: false, code: 'MAIL_SEND_FAILED', message: '邮件暂时未能发送，请稍后重试或直接联系我。' });
    } finally { clearTimeout(timer); }
  }

  async function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) {
      sendJSON(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '此资源仅接受 GET 或 HEAD 请求。' }, { Allow: 'GET, HEAD' }); return;
    }
    const isIndex = pathname === '/' || pathname === '/index.html';
    const isAsset = pathname.startsWith('/assets/');
    const adminFiles = { '/admin':'index.html', '/admin/':'index.html', '/admin/index.html':'index.html', '/admin/admin.css':'admin.css', '/admin/admin.js':'admin.js' };
    const adminFile = Object.prototype.hasOwnProperty.call(adminFiles,pathname) ? adminFiles[pathname] : null;
    const segments = pathname.split('/');
    if ((!isIndex && !isAsset && !adminFile) || pathname.includes('\\') || pathname.includes('\0') ||
        segments.some(part => part === '..' || part === '.' || part.startsWith('.'))) {
      sendJSON(res, 404, { ok: false, code: 'NOT_FOUND', message: '资源不存在。' }); return;
    }
    const file = isIndex ? resolve(root, 'index.html') : adminFile ? resolve(root,'admin',adminFile) : resolve(root, `.${pathname}`);
    try {
      const realRoot = await realpath(root);
      const actual = await realpath(file);
      if (isIndex ? actual !== resolve(realRoot, 'index.html') : adminFile ? actual !== resolve(realRoot,'admin',adminFile) : !inside(resolve(realRoot, 'assets'), actual)) throw new Error('NOT_FOUND');
      const details = await stat(actual);
      if (!details.isFile()) throw new Error('NOT_FOUND');
      const headers = {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': details.size, 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': (isIndex || adminFile) ? 'no-cache' : 'public, max-age=3600',
        'Accept-Ranges': 'bytes'
      };
      if(adminFile){headers['X-Robots-Tag']='noindex, nofollow';headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: blob: data:; media-src 'self' https: blob:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";}
      const range = req.headers.range;
      let start = 0, end = details.size - 1, status = 200;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(String(range));
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { 'Content-Range': `bytes */${details.size}` }); res.end(); return;
        }
        if (!match[1]) { start = Math.max(0, details.size - Number(match[2])); }
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        if (start > end || start >= details.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
          res.writeHead(416, { 'Content-Range': `bytes */${details.size}` }); res.end(); return;
        }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${details.size}`; headers['Content-Length'] = end - start + 1;
      }
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || details.size === 0) { res.end(); return; }
      const stream = createReadStream(actual, { start, end });
      stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
      res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch {
      sendJSON(res, 404, { ok: false, code: 'NOT_FOUND', message: '资源不存在。' });
    }
  }

  return async function app(req, res) {
    try {
      const target = String(req.url || '/').split('?')[0];
      let pathname;
      try { pathname = decodeURIComponent(target); }
      catch { throw new HttpError(400, 'INVALID_PATH', '请求路径无效。'); }
      if (pathname === '/api/works' || pathname === '/api/admin') await cms(req,res);
      else if (pathname === '/api/contact') await contact(req, res);
      else await serveStatic(req, res, pathname);
    } catch (error) {
      if (res.writableEnded || res.destroyed) return;
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) logger.error?.('request.failed');
      sendJSON(res, status, { ok: false, code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR', message: error instanceof HttpError ? error.message : '服务暂时繁忙，请稍后再试。' });
    }
  };
}

async function loadLocalEnvironment(root = PROJECT_ROOT) {
  // The first file wins; pre-existing process environment always wins over files.
  for (const filename of ['.env.local', '.env']) {
    const file = resolve(root, filename);
    try { await access(file); process.loadEnvFile(file); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Local environment file could not be loaded.'); }
  }
}

async function main() {
  await loadLocalEnvironment();
  const config = loadConfig();
  const verifyOnly = process.argv.includes('--verify-smtp');
  if (verifyOnly) {
    if (!config.mailReady) { console.error('SMTP configuration incomplete.'); process.exitCode = 1; return; }
    let transport;
    try { transport = await createMailer(config); await transport.verify(); console.log('SMTP verification succeeded.'); }
    catch { console.error('SMTP verification failed.'); process.exitCode = 1; }
    finally { transport?.close(); }
    return;
  }
  let mailer;
  const app = createApp({ config, sendMail: async mail => {
    mailer ??= await createMailer(config);
    return mailer.sendMail(mail);
  } });
  const server = createServer(app);
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
  server.on('error', () => { console.error('HTTP server failed to start.'); process.exitCode = 1; });
  server.listen(config.port, config.host, () => {
    console.log(`Portfolio server listening on port ${config.port}.`);
    if (!config.mailReady) console.info('SMTP configuration incomplete; contact requests return 503.');
    else if (config.verifyOnStart) {
      createMailer(config).then(async transport => {
        try { await transport.verify(); console.info('SMTP verification succeeded.'); }
        catch { console.error('SMTP verification failed.'); }
        finally { transport.close(); }
      }).catch(() => console.error('SMTP verification failed.'));
    }
  });
  const stop = () => { server.close(() => { mailer?.close(); process.exit(0); }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch(() => { console.error('Server configuration could not be loaded.'); process.exitCode = 1; });
