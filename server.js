// เกมร้านผีกะศุกร์13 สำหรับ TikTok LIVE
//   node server.js <ชื่อบัญชี TikTok ที่กำลังไลฟ์>   ต่อไลฟ์จริง
//   node server.js --demo                            ไม่ต่อไลฟ์ ใช้คนดูจำลองในหน้าเกม
// แล้วเปิด http://127.0.0.1:4192/ (ใส่ลิงก์นี้ในแหล่ง Link ของ TikTok LIVE Studio)
// ตัวเชื่อมอ่านไลฟ์แบบสาธารณะจากชื่อบัญชี ไม่ใช้รหัสผ่านหรือคุกกี้ของใคร
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { GIFT_DIR, rememberGift, giftImageUrl } from './gift-cache.js';
import { handleSound } from './sound-server.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const USER = (args.find(a => !a.startsWith('--')) || '').replace(/^@/, '');
const PORT = +(args.find(a => a.startsWith('--port='))?.slice(7)) || 4192;
if (!USER && !DEMO) { console.log('ใช้: node server.js <ชื่อบัญชี TikTok>  หรือ  node server.js --demo'); process.exit(1); }

// ---------- หน้าเกม + WebSocket ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try { if (await handleSound(req, res, url)) return; } catch (e) { console.log('sound:', String(e.message || e).slice(0, 120)); if (!res.headersSent) { res.writeHead(500); return res.end(); } }
  // หน้าแรก = ป้อมสุดท้าย (ทาวเวอร์ดีเฟนซ์)  /ghost = ร้านผีกะศุกร์13 เวอร์ชันแรก
  const page = { '/': 'defense.html', '/index.html': 'defense.html', '/ghost': 'game.html', '/dig': 'dig.html' }[url.pathname];
  // สถิติความลึกของเกมขุดสมบัติ เก็บข้ามไลฟ์ (รับแค่ตัวเลขที่มากขึ้น)
  if (url.pathname === '/dig-record') {
    const f = path.join(DIR, 'dig-record.json');
    let rec = { best: 0 }; try { rec = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    if (req.method === 'POST') {
      let body = ''; for await (const ch of req) { body += ch; if (body.length > 200) break; }
      const best = Math.floor(+(JSON.parse(body || '{}').best) || 0);
      if (best > (rec.best || 0) && best < 100000) { rec = { best, date: new Date().toISOString() }; fs.writeFileSync(f, JSON.stringify(rec)); }
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(rec));
  }
  if (page) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return fs.createReadStream(path.join(DIR, page)).pipe(res);
  }
  // ไอคอนของขวัญที่เก็บไว้ (เฉพาะชื่อไฟล์ในโฟลเดอร์ gifts กันอ่านไฟล์อื่น)
  const m = url.pathname.match(/^\/gifts\/([\w-]+\.(png|json))$/);
  if (m && fs.existsSync(path.join(GIFT_DIR, m[1]))) {
    res.writeHead(200, { 'content-type': m[2] === 'png' ? 'image/png' : 'application/json', 'cache-control': 'no-store' });
    return fs.createReadStream(path.join(GIFT_DIR, m[1])).pipe(res);
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, path: '/ws' });
let status = { type: 'status', state: DEMO ? 'demo' : 'connecting', user: USER, viewers: 0 };
const send = ev => { const s = JSON.stringify(ev); wss.clients.forEach(c => c.readyState === 1 && c.send(s)); };
wss.on('connection', ws => ws.send(JSON.stringify(status)));
const setStatus = patch => { status = { ...status, ...patch }; send(status); };
server.listen(PORT, '127.0.0.1', () => console.log(`หน้าเกม: http://127.0.0.1:${PORT}/${DEMO ? '?demo=1' : ''}`));

if (DEMO) { console.log('โหมดจำลอง ไม่ต่อไลฟ์'); }
else startLive();

// ---------- ตัวเชื่อม TikTok ----------
function who(u) {
  const id = String(u?.displayId || u?.uniqueId || u?.id || u?.userId || '?');
  // ชื่อเล่นมักมีอีโมจิและตัวอักษรแต่ง: แปลงตัวเอียงตัวหนาเป็นตัวปกติ เก็บแค่ตัวอักษร ตัวเลข และสระวรรณยุกต์ไทย
  let name = String(u?.nickname || '').normalize('NFKC').replace(/[^\p{L}\p{N}฀-๿ ._-]/gu, '').replace(/\s+/g, ' ').trim();
  if (name.replace(/[\s._-]/g, '').length < 2) name = id;
  const pic = u?.avatarThumb?.urlList?.[0] || u?.profilePicture?.urlList?.[0] || '';
  return { id, name: name.slice(0, 14), pic };
}
// กดติดตามได้โบนัสครั้งเดียวต่อคนต่อวัน กันกดติดตาม เลิกติดตาม แล้วติดตามใหม่เพื่อเอาระเบิด
const FOLLOW_FILE = path.join(DIR, 'followed.json');
let followed = { day: '', ids: [] };
try { followed = JSON.parse(fs.readFileSync(FOLLOW_FILE, 'utf8')); } catch {}
function firstFollowToday(id) {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  if (followed.day !== day) followed = { day, ids: [] };
  if (followed.ids.includes(id)) return false;
  followed.ids.push(id);
  try { fs.writeFileSync(FOLLOW_FILE, JSON.stringify(followed)); } catch {}
  return true;
}
// สถิติไว้ดูความเร็วตอนทดสอบ
const stat = { chat: 0, like: 0, gift: 0, member: 0, follow: 0, lag: [] };
function lagOf(d) {
  const t = +(d?.common?.createTime || d?.common?.clientSendTime || 0);
  if (!t) return;
  const ms = Date.now() - (t > 1e12 ? t : t * 1000);
  if (ms > -5000 && ms < 120000) stat.lag.push(ms);
}
setInterval(() => {
  if (DEMO || status.state !== 'live') return;
  const l = stat.lag.sort((a, b) => a - b), med = l.length ? l[l.length >> 1] : null;
  console.log(`[10 วิ] คอมเมนต์ ${stat.chat} ไลค์ ${stat.like} ของขวัญ ${stat.gift} เข้าห้อง ${stat.member} ติดตาม ${stat.follow} คนดู ${status.viewers}` +
    (med != null ? ` ดีเลย์กลาง ${(med / 1000).toFixed(1)} วิ` : ''));
  Object.assign(stat, { chat: 0, like: 0, gift: 0, member: 0, follow: 0, lag: [] });
}, 10000);

function startLive() {
  let conn = null, retry = null;
  const connect = async () => {
    clearTimeout(retry);
    setStatus({ state: 'connecting' });
    conn = new TikTokLiveConnection(USER, { enableExtendedGiftInfo: false, processInitialData: false } /* รายชื่อของขวัญทั้งห้องต้องใช้แพ็กเกจเสียเงินของ Euler ราคามากับของขวัญแต่ละชิ้นอยู่แล้ว */);
    wire(conn);
    try {
      const st = await conn.connect();
      console.log(`ต่อไลฟ์ @${USER} แล้ว (room ${st.roomId})`);
      setStatus({ state: 'live' });
    } catch (e) {
      const msg = String(e?.message || e);
      const offline = /offline|isn't online|not.*live/i.test(msg + ' ' + e?.name);
      console.log(offline ? `@${USER} ยังไม่ได้ไลฟ์ ลองใหม่ใน 30 วิ` : `ต่อไม่ได้: ${msg.slice(0, 200)} ลองใหม่ใน 15 วิ`);
      setStatus({ state: offline ? 'offline' : 'error' });
      retry = setTimeout(connect, offline ? 30000 : 15000);
    }
  };
  function wire(c) {
    c.on(WebcastEvent.CHAT, d => { stat.chat++; lagOf(d); const u = who(d.user); const text = String(d.content ?? d.comment ?? '').trim().slice(0, 60); if (text) send({ type: 'chat', ...u, text }); });
    c.on(WebcastEvent.LIKE, d => { const n = +(d.count ?? d.likeCount) || 1; stat.like += n; lagOf(d); send({ type: 'like', ...who(d.user), count: n }); });
    c.on(WebcastEvent.MEMBER, d => { stat.member++; send({ type: 'join', ...who(d.user) }); });
    c.on(WebcastEvent.FOLLOW, d => { stat.follow++; const u = who(d.user); send({ type: 'follow', ...u, repeat: !firstFollowToday(u.id) }); });
    c.on(WebcastEvent.SHARE, d => send({ type: 'share', ...who(d.user) }));
    c.on(WebcastEvent.ROOM_USER, d => { const v = d.total ?? d.viewerCount; if (v != null) setStatus({ viewers: +v }); });
    // ของขวัญแบบส่งรัว (combo) ส่งยอดสะสม repeatCount มาเรื่อยๆ นับเฉพาะส่วนที่เพิ่มจากครั้งก่อนของชุดเดียวกัน
    const combo = new Map();
    c.on(WebcastEvent.GIFT, d => {
      const gi = d.gift || d.giftDetails || {};
      const u = who(d.user), key = `${u.id}:${d.giftId}:${d.groupId || ''}`;
      const total = +d.repeatCount || 1, prev = combo.get(key) || 0, add = total - prev;
      if (d.repeatEnd) combo.delete(key); else combo.set(key, Math.max(prev, total));
      if (combo.size > 500) combo.clear();
      if (add <= 0) return;
      const each = +(gi.diamondCount ?? gi.diamond_count) || 1;
      stat.gift++; lagOf(d);
      rememberGift(d.giftId, gi);
      send({ type: 'gift', ...u, gift: gi.name || gi.giftName || `gift${d.giftId}`, giftId: String(d.giftId || ''), img: giftImageUrl(gi), coins: each * add, count: add });
    });
    c.on(WebcastEvent.STREAM_END, () => { console.log('ไลฟ์จบแล้ว'); setStatus({ state: 'offline' }); retry = setTimeout(connect, 30000); });
    c.on(ControlEvent.DISCONNECTED, () => {
      if (status.state === 'live') { console.log('หลุดการเชื่อมต่อ ต่อใหม่ใน 5 วิ'); setStatus({ state: 'connecting' }); retry = setTimeout(connect, 5000); }
    });
    c.on(ControlEvent.ERROR, e => console.log('error:', String(e?.info || e?.message || e).slice(0, 200)));
  }
  connect();
  process.on('SIGINT', async () => { try { await conn?.disconnect(); } catch {} process.exit(0); });
}
