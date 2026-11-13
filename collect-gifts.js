// เก็บไอคอนของขวัญจากไลฟ์ที่เปิดอยู่หลายห้องพร้อมกัน (อ่านอย่างเดียว ไม่ส่งอะไรเข้าไลฟ์)
//   node collect-gifts.js <นาที> <บัญชี1> <บัญชี2> ...
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { rememberGift } from './gift-cache.js';

const [min, ...users] = process.argv.slice(2);
if (!users.length) { console.log('ใช้: node collect-gifts.js <นาที> <บัญชี...>'); process.exit(1); }
for (const u of users) {
  const c = new TikTokLiveConnection(u.replace(/^@/, ''), { processInitialData: true });
  c.on(WebcastEvent.GIFT, d => rememberGift(d.giftId, d.gift || {}));
  c.connect().then(() => console.log('ต่อ', u)).catch(e => console.log('ต่อไม่ได้', u, String(e.message).slice(0, 60)));
}
setTimeout(() => process.exit(0), (+min || 3) * 60000);
