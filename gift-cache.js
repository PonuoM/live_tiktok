// เก็บไอคอนของขวัญที่เจอในไลฟ์ไว้ในเครื่อง: gifts/catalog.json + gifts/<id>.png
// หน้าเกมใช้เลือกไอคอนตัวอย่างของแต่ละช่วงราคาในป้ายวิธีเล่น
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GIFT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gifts');
const CAT = path.join(GIFT_DIR, 'catalog.json');
fs.mkdirSync(GIFT_DIR, { recursive: true });
let catalog = {};
try { catalog = JSON.parse(fs.readFileSync(CAT, 'utf8')); } catch {}
const busy = new Map();   // id -> งานดาวน์โหลดที่กำลังทำ (ส่งเหตุการณ์ซ้ำระหว่างโหลด รองานเดียวกัน)

export function giftImageUrl(gi) {
  return gi?.image?.urlList?.[0] || gi?.icon?.urlList?.[0] || '';
}

export function rememberGift(id, gi) {
  id = String(id || gi?.id || '');
  const url = giftImageUrl(gi);
  if (!id || !url || catalog[id]) return Promise.resolve(catalog[id]);
  if (busy.has(id)) return busy.get(id);
  const job = (async () => { try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(path.join(GIFT_DIR, `${id}.png`), Buffer.from(await res.arrayBuffer()));
    catalog[id] = { id, name: gi.name || '', coins: +gi.diamondCount || 0, file: `${id}.png` };
    fs.writeFileSync(CAT, JSON.stringify(catalog, null, 1));
    console.log(`เก็บไอคอนของขวัญ ${gi.name} (${gi.diamondCount} เหรียญ)`);
  } catch (e) { console.log('โหลดไอคอนไม่ได้:', gi?.name, String(e.message || e).slice(0, 80)); }
  finally { busy.delete(id); }
  return catalog[id]; })();
  busy.set(id, job);
  return job;
}

export function hasGift(id) { return !!catalog[String(id)]; }
