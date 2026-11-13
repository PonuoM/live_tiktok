---
name: codex-delegate
description: Hands well-specified coding work (new tools in tools/, engine features, multi-file edits) to Codex through the codex MCP using GPT-6.1 Sol medium, then verifies the result and reports token cost. Use when a coding task is self-contained and can be specced in one prompt, when Claude's own usage is high, or when the user asks to let Codex do it or asks how many tokens Codex used.
---

# ส่งงานโค้ดให้ Codex

## แบ่งงาน
- **Codex:** เขียนเครื่องมือใหม่ ฟีเจอร์เอนจินที่สเปกชัด แก้หลายไฟล์ งานซ้ำๆ
- **Claude ทำเอง:** ตัดสินคุณภาพภาพ บท และฮุค ประสานงานกับ session อื่น แก้ CLAUDE.md และ memory และงานแก้ไม่กี่บรรทัด ซึ่งลงมือเองเร็วกว่าเขียนคำสั่ง
- ทุกงานที่ Codex ส่งกลับมา Claude ต้องตรวจเองก่อนใช้

## สั่งงาน
- ใช้ `mcp__codex__codex` แบบรอผล ไม่ใช้ codex-start กับการเช็คสถานะซ้ำ เพราะการเช็คแต่ละครั้งกิน token ฝั่ง Claude
- **ไม่ต้องใส่ `model`** ระบบใช้ `gpt-6.1-sol` ระดับ medium ตามที่ตั้งไว้ใน `.mcp.json` ห้ามใช้ `gpt-5.6-terra` (ผู้ใช้สั่ง)
- `cwd` = รากโปรเจกต์ `sandbox` = `workspace-write`
- งานต่อเนื่องใช้ `mcp__codex__codex-reply` กับ threadId เดิม

คำสั่งที่ดีต้องมีครบ:
1. ไฟล์ที่แก้ได้ (เช่น "Edit only tools/x.js") และสิ่งที่ห้ามทำ: ห้ามเรนเดอร์ ห้ามเรียก API เสียเงิน ห้ามลบไฟล์
2. ให้อ่าน CLAUDE.md และใช้พาธจาก `engine/paths.js`
3. ไฟล์ทดสอบที่ยาวพอ เช่น ตอนเต็ม `series/เดินฐานกลางคืน/output/db01.mp4` ไม่ใช่คลิป 6 วินาที terra เคยพลาดเพราะทดสอบแค่คลิปสั้น
4. ผลที่ต้องการ และให้ตอบสั้นๆ: ไฟล์ที่แก้ คำสั่งที่ทดสอบ ผลที่ได้ ข้อจำกัด
5. บอกว่า "keep steps few" เพราะยอด token โตตามจำนวนขั้นที่ Codex เดิน (ราว 55-60k ต่อขั้น ส่วนใหญ่อ่านจากแคช)

## ตรวจงาน
- [ ] รันเครื่องมือเองกับไฟล์จริงหนึ่งไฟล์
- [ ] เทียบผลกับก่อนแก้ ตัวเลขที่หายหรือเป็น 0 คือสัญญาณบั๊ก (Sol เคยทำยอดภาพเป็น 0)
- [ ] ถ้ามีภาพผลลัพธ์ เปิดดูด้วย Read
- [ ] ผิดตรงไหน ส่ง codex-reply บอกบั๊กพร้อมตัวเลขที่ควรได้

## วัด token และโควตา
```
node tools/codex-quota.js
```
บอกแพ็ก เปอร์เซ็นต์ที่ใช้ของรอบสัปดาห์ เวลารีเซ็ต จำนวนภาพ และ token ของงาน mcp-agents ทุกงานวันนี้ แยกตามรุ่นโมเดล
- ไฟล์ดิบอยู่ที่ `~/.local/state/mcp-agents/codex/projects/*/v1/sessions/` ไม่ใช่ `~/.codex/sessions`
- รายงานผู้ใช้ทุกครั้ง: token รวม ส่วนที่อ่านจากแคช และเปอร์เซ็นต์โควตาก่อนกับหลังงาน
- ตัวเลขอ้างอิงจากวันที่ 5 พ.ย. 2026: เครื่องมือใหม่หนึ่งตัวใช้ราว 1M token หรือราว 1% ของรอบสัปดาห์ งานแก้เล็กกับ Sol ใช้ราว 185-366k

## ถ้ามีปัญหา
- UAC ขึ้นทุกครั้งที่เรียก: ดูว่า `mcp-agents/server.js` ยังตั้ง `sandbox = "unelevated"` อยู่ไหม (แก้ไว้ 5 พ.ย. 2026 ไฟล์สำรองคือ `server.js.bak-elevated`) ถ้าอัปเดตแพ็กเกจ ค่านี้จะกลับเป็นแบบเดิม
- รุ่นโมเดลไม่ใช่ Sol: ดู `--model` ใน `.mcp.json` แล้ว reconnect `/mcp`
