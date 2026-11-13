// เสียงของเกม: ไฟล์เสียงประกอบจาก sfx/live/, เสียงอ่านชื่อฟรีจาก Edge, และค่าที่เลือกในหน้าฟังเสียง
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { nameToThai } from './name-thai.js';
import { execFile } from 'node:child_process';
// ปรับความดังเสียงชื่อให้อยู่ที่ -20 LUFS เท่ากับเพลงและเสียงประกาศ (วัดก่อนแล้วค่อยปรับ เร็วกว่า loudnorm สองรอบ)
const ff = args => new Promise(res => execFile('ffmpeg', args, { windowsHide: true }, (e, so, se) => res(String(se || ''))));
async function normalize(file) {
  const out = await ff(['-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-']);
  const I = parseFloat((out.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0]);
  if (!Number.isFinite(I)) return;
  const tmp = file + '.tmp.mp3';
  await ff(['-v', 'error', '-y', '-i', file, '-af', `volume=${(-20 - I).toFixed(2)}dB,alimiter=limit=0.89:level=false`, '-b:a', '96k', tmp]);
  if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) fs.renameSync(tmp, file);
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
// เสียงอยู่ในโฟลเดอร์ sfx ของเกมเอง (ย้ายไปเครื่องอื่นได้ทั้งโฟลเดอร์) ถ้าไม่มีค่อยใช้ sfx/live ของโปรเจกต์หลัก
export const SFX_DIR = fs.existsSync(path.join(DIR, 'sfx')) ? path.join(DIR, 'sfx') : path.join(DIR, '..', '..', 'sfx', 'live');
const TTS_DIR = path.join(DIR, 'tts-cache');
const CHOICE = path.join(DIR, 'sounds.json');
fs.mkdirSync(TTS_DIR, { recursive: true });

// บริการของ Edge ตัดการเชื่อมต่อกลางทางบ่อย จึงลองซ้ำได้ 3 ครั้ง ถ้ายังไม่ได้ก็ข้ามไป (เกมเล่นแค่ประโยคต้อนรับ)
async function edgeOnce(text) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata('th-TH-NiwatNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const parts = []; let ok = false;
  await new Promise(res => {
    audioStream.on('data', c => parts.push(c));
    audioStream.on('end', () => { ok = true; res(); });
    audioStream.on('error', res);
    setTimeout(res, 10000);
  });
  try { tts.close(); } catch {}
  return ok && parts.length ? Buffer.concat(parts) : null;
}
const busy = new Map();
export async function sayName(text) {
  text = nameToThai(text).slice(0, 30);
  if (!text) return null;
  const file = path.join(TTS_DIR, crypto.createHash('md5').update(text).digest('hex') + '.mp3');
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  if (busy.has(file)) return busy.get(file);
  const job = (async () => {
    for (let i = 0; i < 3; i++) {
      const b = await edgeOnce(text).catch(() => null);
      if (b) { fs.writeFileSync(file, b); await normalize(file).catch(() => {}); return file; }
      await new Promise(r => setTimeout(r, 600));
    }
    return null;
  })().finally(() => busy.delete(file));
  busy.set(file, job);
  return job;
}

export function readChoice() { try { return JSON.parse(fs.readFileSync(CHOICE, 'utf8')); } catch { return {}; } }
export function saveChoice(obj) {
  const clean = {};
  for (const [k, v] of Object.entries(obj || {})) if (/^[a-z0-9_]+$/.test(k) && /^[a-z]$/.test(v)) clean[k] = v;
  fs.writeFileSync(CHOICE, JSON.stringify(clean, null, 1));
  return clean;
}
// รายชื่อเสียงที่มี: { gun: ['a','b'], ... }
export function listSfx() {
  const out = {};
  for (const f of fs.readdirSync(SFX_DIR)) { const m = f.match(/^([a-z0-9_]+)_([a-z])\.mp3$/); if (m) (out[m[1]] ||= []).push(m[2]); }
  return out;
}

// ตัวจัดการ URL ที่เกี่ยวกับเสียง คืน true ถ้าตอบไปแล้ว
export async function handleSound(req, res, url) {
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  let m = url.pathname.match(/^\/sfx\/([a-z0-9_]+_[a-z])\.mp3$/);
  if (m) {
    const f = path.join(SFX_DIR, m[1] + '.mp3');
    if (!fs.existsSync(f)) { send(404, 'text/plain', ''); return true; }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'max-age=3600' });
    fs.createReadStream(f).pipe(res); return true;
  }
  if (url.pathname === '/say') {
    const f = await sayName(url.searchParams.get('t'));
    if (!f) { send(404, 'text/plain', ''); return true; }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res); return true;
  }
  if (url.pathname === '/say-text') { send(200, 'text/plain; charset=utf-8', nameToThai(url.searchParams.get('t'))); return true; }
  if (url.pathname === '/sounds' && req.method === 'GET') { send(200, 'application/json', JSON.stringify({ choice: readChoice(), list: listSfx() })); return true; }
  if (url.pathname === '/sounds' && req.method === 'POST') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 5000) req.destroy(); });
    req.on('end', () => { try { send(200, 'application/json', JSON.stringify(saveChoice(JSON.parse(body)))); } catch { send(400, 'text/plain', 'bad json'); } });
    return true;
  }
  if (url.pathname === '/sound-pick') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    fs.createReadStream(path.join(DIR, 'sound-pick.html')).pipe(res); return true;
  }
  return false;
}
