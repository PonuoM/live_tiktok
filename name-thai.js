// แปลงชื่อ TikTok ที่เขียนเป็นอักษรอังกฤษแบบไทยให้อ่านเป็นไทย เช่น nongbeem -> น้องบีม
// เสียงไทยของ Edge อ่านอักษรอังกฤษตามสำเนียงอังกฤษจนผิด (nong -> น่อง) จึงแทนคำที่รู้จักด้วยอักษรไทยก่อนส่งไปอ่าน
// คำที่ยังอ่านผิด เพิ่มเองได้ใน name-fix.json รูปแบบ { "อักษรอังกฤษ": "คำไทย" }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'name-fix.json');
const BASE = {
  // คำนำหน้า คำลงท้าย
  nong: 'น้อง', nongz: 'น้อง', pee: 'พี่', phi: 'พี่', krub: 'ครับ', khrub: 'ครับ', kub: 'ครับ', kha: 'ค่ะ', naja: 'นะจ๊ะ', na: 'นะ',
  jaa: 'จ้า', ja: 'จ้า', za: 'ซ่า', zaa: 'ซ่า', lnwza: 'เทพซ่า', lnw: 'เทพ', khun: 'คุณ', little: 'ลิตเติ้ล', baby: 'เบบี้', boy: 'บอย', girl: 'เกิร์ล',
  // ชื่อเล่นที่พบบ่อย
  beam: 'บีม', beem: 'บีม', bim: 'บิม', ploy: 'พลอย', mint: 'มิ้นท์', minnie: 'มินนี่', fah: 'ฟ้า', fa: 'ฟ้า', nam: 'น้ำ', naam: 'น้ำ', namwan: 'น้ำหวาน',
  ice: 'ไอซ์', bank: 'แบงค์', boss: 'บอส', mild: 'มายด์', pond: 'ปอนด์', kao: 'ข้าว', khao: 'ข้าว', kaohom: 'ข้าวหอม', ton: 'ต้น', tonkla: 'ต้นกล้า',
  fern: 'เฟิร์น', oat: 'โอ๊ต', aom: 'ออม', aim: 'เอม', earth: 'เอิร์ธ', bow: 'โบว์', gift: 'กิ๊ฟ', golf: 'กอล์ฟ', kwan: 'ขวัญ', may: 'เมย์', mook: 'มุก',
  nan: 'แนน', nut: 'นัท', pat: 'แพท', pim: 'พิม', pang: 'แป้ง', toey: 'เตย', bua: 'บัว', film: 'ฟิล์ม', fluke: 'ฟลุ๊ค', jay: 'เจ', jane: 'เจน',
  arm: 'อาร์ม', got: 'ก๊อต', mek: 'เมฆ', jom: 'จอม', tum: 'ตั้ม', toon: 'ตูน', tong: 'ต้อง', top: 'ท็อป', tar: 'ต้า', ta: 'ต้า', tee: 'ตี๋',
  eye: 'อาย', am: 'แอม', ann: 'แอน', aon: 'อ้อน', bee: 'บี', ben: 'เบน', big: 'บิ๊ก', bom: 'บอม', bonus: 'โบนัส', bright: 'ไบรท์',
  cake: 'เค้ก', cartoon: 'การ์ตูน', champ: 'แชมป์', cherry: 'เชอร์รี่', chompoo: 'ชมพู่', dao: 'ดาว', deer: 'เดียร์', dew: 'ดิว', donut: 'โดนัท',
  em: 'เอ็ม', eve: 'อีฟ', fai: 'ฝ้าย', fai: 'ฝ้าย', fang: 'แฟง', fon: 'ฝน', gam: 'แก้ม', game: 'เกม', gun: 'กัน', guy: 'กาย', ham: 'แฮม',
  jam: 'แจม', jan: 'จันทร์', jeab: 'เจี๊ยบ', jib: 'จิ๊บ', joy: 'จอย', jub: 'จุ๊บ', kai: 'ไข่', kaew: 'แก้ว', kate: 'เคท', kim: 'คิม', king: 'คิง',
  kitty: 'คิตตี้', kong: 'ก้อง', ko: 'โก้', kung: 'กุ้ง', lek: 'เล็ก', lin: 'หลิน', ling: 'ลิง', lookpla: 'ลูกปลา', luk: 'ลูก', mai: 'ใหม่',
  man: 'แมน', maprang: 'มะปราง', max: 'แม็กซ์', meen: 'มีน', mew: 'มิว', milk: 'มิลค์', mon: 'มน', moo: 'หมู', mod: 'มด', nat: 'แนท',
  new: 'นิว', nick: 'นิก', nine: 'ไนน์', noon: 'นุ่น', nook: 'นุ๊ก', nui: 'นุ้ย', oil: 'ออย', om: 'โอม', ong: 'อ้อง', palm: 'ปาล์ม',
  pan: 'แพน', pang: 'แป้ง', pear: 'แพร', pete: 'พีท', ping: 'ปิง', pla: 'ปลา', plai: 'ปลาย', poo: 'ปู', pop: 'ป๊อป', porsche: 'ปอร์เช่',
  pupe: 'ปุ๊ปิ๊', pui: 'ปุ้ย', sai: 'ทราย', sam: 'แซม', som: 'ส้ม', sun: 'ซัน', tam: 'แตม', tan: 'แทน', tangmo: 'แตงโม', tao: 'เต่า',
  tik: 'ติ๊ก', tle: 'เติ้ล', tom: 'ทอม', tong: 'ต้อง', tukta: 'ตุ๊กตา', tum: 'ตั้ม', view: 'วิว', wan: 'หวาน', win: 'วิน', yam: 'แยม',
  yui: 'ยุ้ย', zen: 'เซน', zoom: 'ซูม', nueng: 'หนึ่ง', neung: 'หนึ่ง', song: 'สอง', sam: 'แซม', sorn: 'ซอร์น', rak: 'รัก', suay: 'สวย',
  sweet: 'สวีท', cute: 'คิวท์', love: 'เลิฟ', lucky: 'ลัคกี้', happy: 'แฮปปี้', smile: 'สไมล์', star: 'สตาร์', moon: 'มูน', sky: 'สกาย',
  tiktok: 'ติ๊กต็อก', thailand: 'ไทยแลนด์', th: '', official: '', ok: 'โอเค', gamer: 'เกมเมอร์', live: 'ไลฟ์', shop: 'ช็อป',
};
function dict() { let extra = {}; try { extra = JSON.parse(fs.readFileSync(FIX, 'utf8')); } catch {} return { ...BASE, ...extra }; }

export function nameToThai(name) {
  const D = dict(), keys = Object.keys(D).sort((a, b) => b.length - a.length);
  // แยกคำตามช่องว่าง ขีดล่าง จุด และตัวเลข แล้วค่อยหาคำที่รู้จักในแต่ละก้อนแบบเอาคำยาวที่สุดก่อน
  const parts = String(name || '').replace(/[0-9]+/g, ' ').split(/[\s_.\-]+/).filter(Boolean);
  const out = [];
  for (const raw of parts) {
    if (/[฀-๿]/.test(raw)) { out.push(raw); continue; }
    let w = raw.toLowerCase(), buf = '', res = [];
    // จับคำที่รู้จักเฉพาะต้นคำ หรือต่อจากคำที่รู้จักแล้ว (กัน hom -> h+โอม)
    while (w.length) {
      const k = !buf && keys.find(k => k && w.startsWith(k) && (w.length === k.length || k.length >= 3 || /^[^aeiou]/.test(w.slice(k.length))));
      if (k) { if (D[k]) res.push(D[k]); w = w.slice(k.length); }
      else { buf += w; w = ''; }
    }
    // ตัวอักษรที่เหลือ 1-2 ตัว (ตัวย่อ เช่น k, bk) ไม่ต้องอ่าน
    if (buf && buf.length > 2) res.push(buf);
    out.push(res.join(''));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
