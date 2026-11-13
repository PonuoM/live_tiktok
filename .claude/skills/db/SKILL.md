---
name: db
description: Run SQL queries, migrations, schema inspection, or remote bootstrap migrations against any MySQL database. Default = local AppServ MySQL (root/12345678), but auto-detects credentials from project context (secrets.php, .env, secrets.production.php). Supports both local mysql.exe execution and production HTTP-bootstrap workflow. Triggers — user types "/db", says "รัน migration", "ดู schema", "query DB", "ลอง SQL นี้", "เช็คตาราง", "deploy migration บน host", "run migration on production".
---

# /db — MySQL ผู้ช่วยรอบด้าน

Skill สำหรับรัน SQL กับ MySQL database — ทั้ง **local** (mysql.exe ตรง) และ **production** (ผ่าน HTTP bootstrap helper)

## 🎯 สั่งงานยังไง

ใช้รูปแบบ free-form ก็ได้ หรือ flag-based ก็ได้ — เลือกตามถนัด:

| ตัวอย่างประโยค | Action |
|---|---|
| `/db ดู tables ใน primawell` | `inspect` mode |
| `/db รัน migration distribution/migrate_phase22_app_settings.sql` | `migrate` mode (local) |
| `/db เช็คว่ามี app_settings ไหม` | `query` mode |
| `/db deploy migration นี้ขึ้น host` | `migrate --target=prod` |
| `/db dump customers_cache` | `dump` mode |

## 🔌 Connection — Default vs Override

### Local default (ใช้ตอนไม่ระบุอะไร)
```
mysql.exe: C:\AppServ\MySQL\bin\mysql.exe
host:      localhost
user:      root
pass:      12345678
db:        (ต้องระบุ หรือ auto-detect)
```

### Auto-detect จาก project context
ก่อนใช้ default ให้เช็ค cwd:

1. **PHP project (secrets.php pattern)** — มี `<cwd>/distribution/secrets.php` หรือ `<cwd>/config/secrets.php`:
   ```php
   return [
     'db_host' => 'localhost',
     'db_user' => 'root',
     'db_pass' => '12345678',
     'db_name' => 'primawell',
   ];
   ```
   → อ่านด้วย `php -r "print_r(require '...');"` แล้วใช้ค่าจริง

2. **.env file** (Laravel/Node/Generic) — มี `<cwd>/.env`:
   ```
   DB_HOST=localhost
   DB_DATABASE=mydb
   DB_USERNAME=root
   DB_PASSWORD=secret
   ```
   → grep `DB_DATABASE|DB_USERNAME|DB_PASSWORD` ออกมา

3. **Explicit args** จาก user message override ทุกอย่าง:
   ```
   /db query "..." --db=other_db --user=admin --pass=xxx
   ```

### Production (HTTP bootstrap mode)
ห้ามใช้ mysql.exe เชื่อม production โดยตรง (shared hosting blocks external 3306)
ใช้ **HTTP bootstrap helper** แทน — สร้าง PHP script + เปิด URL

## 🛠️ 4 Commands หลัก

### 1. `query` — รัน SQL inline

```bash
"C:/AppServ/MySQL/bin/mysql.exe" -u <user> -p<pass> <db> -e "SQL_HERE" 2>&1
```

ตัวอย่าง:
```bash
"C:/AppServ/MySQL/bin/mysql.exe" -u root -p12345678 primawell -e "SELECT COUNT(*) FROM customers_cache"
```

**Format output**: ถ้า rows < 20 → แสดงครบ; เกิน 20 → preview 10 บรรทัดแรก + บอก "ทั้งหมด X rows"

### 2. `migrate` — รัน .sql file

```bash
"C:/AppServ/MySQL/bin/mysql.exe" -u <user> -p<pass> <db> < <path-to-sql>
```

ลำดับงาน:
1. Read SQL file → preview 20 บรรทัดให้ user เห็นว่าจะรันอะไร
2. ตรวจ destructive: `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, `DELETE FROM ... WHERE 1` → **ต้องถาม confirm** ก่อนรัน
3. รัน
4. Verify — query ที่เกี่ยวข้อง (เช่น `SELECT * FROM <table>` ถ้าสร้างตาราง)
5. รายงานผล

### 3. `inspect` — แสดง schema + row counts

```bash
"C:/AppServ/MySQL/bin/mysql.exe" -u <user> -p<pass> <db> -e "
  SELECT TABLE_NAME, TABLE_ROWS, ENGINE, TABLE_COLLATION
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = '<db>'
  ORDER BY TABLE_ROWS DESC;
"
```

ถ้า user ระบุตารางเฉพาะ → `DESCRIBE <table>` + `SELECT COUNT(*) FROM <table>` + `SHOW CREATE TABLE <table> \G`

### 4. `dump` — export ตารางเป็น CSV / SQL

```bash
"C:/AppServ/MySQL/bin/mysqldump.exe" -u <user> -p<pass> <db> <table> > <path-to-output>
```

CSV variant:
```bash
"C:/AppServ/MySQL/bin/mysql.exe" -u <user> -p<pass> <db> -e "SELECT ..." --batch --raw > out.tsv
```

## 🌐 Production Mode — HTTP Bootstrap workflow

เมื่อ user สั่ง deploy migration ขึ้น production (`--target=prod` หรือ "บน host"):

### Workflow

1. **สร้าง bootstrap_phaseXX.php** ใน project root โดยใช้ template:

```php
<?php
/**
 * bootstrap_phaseXX.php — One-shot migration runner
 * Trigger: https://your-host/bootstrap_phaseXX.php?key=<TOKEN>
 * **ลบไฟล์ทิ้งหลังเสร็จ** (security)
 */
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');

$expectedKey = '<RANDOM_TOKEN_PER_MIGRATION>';
if (($_GET['key'] ?? '') !== $expectedKey) {
    http_response_code(403); echo "Forbidden\n"; exit;
}

require_once __DIR__ . '/<project_config_path>';  // load secrets

echo "=== Migration: <PHASE_NAME> ===\n";
echo "Time: " . date('Y-m-d H:i:s') . "\nDB: " . DB_NAME . "\n\n";

try {
    $db = db();
    // === SQL statements here ===
    $db->exec("CREATE TABLE IF NOT EXISTS ...");
    $db->exec("INSERT INTO ... ON DUPLICATE KEY UPDATE ...");

    // === Verify ===
    $rows = $db->query("SELECT ...")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) print_r($r);

    echo "\n✅ Done. Delete bootstrap_phaseXX.php now.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "❌ " . $e->getMessage() . "\n";
}
```

2. **Build & remind user upload** (เฉพาะ project ที่มี `host:build` script):
```bash
cd <project>/frontend && npm run host:build
```
แล้วบอก user upload `host/bootstrap_phaseXX.php` ขึ้น host

3. **Trigger via curl/WebFetch** หลัง user confirm ว่า upload เสร็จ:
```bash
curl -s "https://<host>/bootstrap_phaseXX.php?key=<TOKEN>"
```

4. **Verify output** — เช็คว่ามี "✅ Done"

5. **Remind user** ลบ bootstrap_phaseXX.php ออกจาก host (security)

## 🛡️ Safety Rules

### ห้ามทำ
- ❌ ใช้ mysql.exe เชื่อม production DB ตรง (shared hosting blocks external 3306)
- ❌ รัน DROP / TRUNCATE / DELETE WHERE 1 โดยไม่ confirm
- ❌ Commit secrets.php หรือ creds ใน git
- ❌ Trigger bootstrap URL โดยไม่ confirm กับ user ว่า upload เสร็จ

### ก่อนรัน destructive — ต้อง confirm
```
⚠ จะรัน: DROP TABLE customers_cache
ตรวจสอบให้แน่ใจอีกครั้ง พิมพ์ "yes drop" เพื่อยืนยัน
```

### Backup ก่อน migration ใหญ่
แนะนำ user รัน mysqldump backup ก่อน:
```bash
"C:/AppServ/MySQL/bin/mysqldump.exe" -u root -p12345678 <db> > backup_<date>.sql
```

## 📂 Project-Specific Cheat Sheet

### Primawell (`C:\AppServ\www\primawell`)
- Local DB: `primawell` / root / 12345678
- Production DB: `primacom_primawell` / primacom_bloguser / pJnL53Wkhju2LaGPytw8 (access ผ่าน HTTP bootstrap เท่านั้น)
- Config: `distribution/secrets.php` (local), `distribution/secrets.production.php` (host)
- Helper PHP: `require __DIR__ . '/distribution/config.php'; $db = db();`
- Host: `https://primawell.prima49.com`
- Build script: `frontend/scripts/host-build.mjs` (มี `EXTRA_ROOT_FILES` list — เพิ่มชื่อ bootstrap script ลงไป)

### Generic PHP project
- หา `secrets.php` หรือ `.env` ใน root/config/
- ตรวจว่ามี `db()` helper หรือ raw PDO connection
- ถ้าไม่มี config — ถาม user หรือใช้ default

## 🧪 Examples (Primawell)

### รัน local migration
```
User: /db migrate distribution/migrate_phase22_app_settings.sql
Skill flow:
  1. cwd = C:\AppServ\www\primawell
  2. Read distribution/secrets.php → primawell / root / 12345678
  3. Preview SQL file (20 lines)
  4. Check destructive → no (CREATE TABLE IF NOT EXISTS only)
  5. Run: mysql.exe ... < distribution/migrate_phase22_app_settings.sql
  6. Verify: SELECT * FROM app_settings
  7. ✅ Report
```

### Deploy migration to production
```
User: /db migrate distribution/migrate_phase22_app_settings.sql --target=prod
Skill flow:
  1. สร้าง bootstrap_phase22.php (one-shot, with random token)
  2. Add to EXTRA_ROOT_FILES ใน host-build script (ถ้ายังไม่มี)
  3. Run npm run host:build
  4. แสดง list ไฟล์ที่ user ต้อง upload
  5. รอ user confirm ว่า upload เสร็จ
  6. curl https://primawell.prima49.com/bootstrap_phase22.php?key=<TOKEN>
  7. Show output
  8. Remind ลบ bootstrap script ออก
```

### Inspect schema
```
User: /db ดู schema ของ app_settings
Skill flow:
  1. mysql.exe -e "DESCRIBE app_settings; SELECT COUNT(*) FROM app_settings;"
  2. Format เป็น table
```

### Switch DB on same connection
```
User: /db inspect mini_erp
Skill flow:
  1. Use default creds (root/12345678) แต่เปลี่ยน db = mini_erp
  2. List tables + counts
```

## 🔁 Output Format

ใช้ markdown table ถ้า rows ≤ 20:
```
| col_a | col_b | col_c |
|-------|-------|-------|
| ...   | ...   | ...   |
```

ถ้า rows > 20:
- แสดง 10 บรรทัดแรก + "... และอีก N rows"
- offer ถาม user ว่าจะ filter หรือ paginate ไหม

ถ้า error:
- แสดง error message เต็ม
- บอกสาเหตุที่เป็นไปได้:
  - `Access denied` → password ผิด
  - `Unknown database` → ชื่อ DB ผิด หรือยังไม่ create
  - `Table doesn't exist` → ยังไม่ migrate / ชื่อตารางผิด
  - `Illegal mix of collations` → ใช้ `CONVERT(col USING utf8mb4) COLLATE utf8mb4_unicode_ci` ใน JOIN

## 🚦 Decision Tree

```
User สั่งงานที่เกี่ยวกับ DB
  ↓
[1] Local หรือ Production?
  ↓
  Local → mysql.exe + Bash
  Production → bootstrap HTTP helper
  ↓
[2] Action ไหน? (query/migrate/inspect/dump)
  ↓
[3] Auto-detect creds (secrets.php / .env / default)
  ↓
[4] Destructive? → confirm ก่อน
  ↓
[5] Execute
  ↓
[6] Verify + format output
```

## 📝 Notes สำหรับตัวเอง (Claude)

- ไฟล์ secrets.php มัก return PHP array → ใช้ `php -r "$s = require '...'; echo json_encode($s);"` แล้ว parse JSON
- ระวัง password ที่มี special char → ใช้ single quote หรือ escape ใน Bash
- Windows path: ใช้ forward slash หรือ escape backslash ใน Bash command
- เลือก mysql.exe binary จาก context:
  - AppServ: `C:/AppServ/MySQL/bin/mysql.exe`
  - XAMPP: `C:/xampp/mysql/bin/mysql.exe`
  - WAMP: `C:/wamp64/bin/mysql/mysql<ver>/bin/mysql.exe`
  - Check ด้วย `ls` ก่อนใช้
- HTTP bootstrap token ควด random ต่อ migration (เพื่อกัน replay) — `bin2hex(random_bytes(8))` หรือ static ก็ได้ถ้า one-shot
