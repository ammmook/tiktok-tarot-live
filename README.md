# Tarot LIVE Queue

ระบบจัดคิวดูดวงระหว่าง TikTok LIVE แบบ monorepo โดยใช้ pnpm workspace และ Turborepo เชื่อม Neon PostgreSQL ผ่าน Fastify, Drizzle ORM และ Socket.IO

## เริ่มต้นใช้งาน

```sh
pnpm install
pnpm dev
```

เว็บจะเปิดที่ http://localhost:3000/live และ API health check อยู่ที่ http://localhost:4000/health

ตั้งค่า `apps/api/.env.local` จาก `apps/api/.env.example` และตั้งค่า `apps/web/.env.local` จาก `apps/web/.env.example` โดยเก็บ `DATABASE_URL` และ `LISTENER_API_KEY` ไว้ฝั่ง API/listener เท่านั้น จากนั้นเตรียม Neon ด้วยคำสั่ง:

```sh
pnpm --filter @tarot-live/db db:migrate
```

รันแยกแต่ละ service ได้ด้วย:

```sh
pnpm --filter @tarot-live/api dev
pnpm --filter @tarot-live/web dev
pnpm --filter @tarot-live/listener dev
```

คำสั่งหลัก:

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## โครงสร้าง

- `apps/web`: Next.js App Router dashboard และหน้า settings
- `apps/api`: Fastify API, queue transactions, validation, auth, health และ Socket.IO realtime
- `apps/listener`: service สำหรับ parse event จาก TikTok LIVE และส่งต่อเข้า authenticated ingest API
- `packages/shared`: types, schemas และ constants ที่ใช้ร่วมกัน
- `packages/db`: Neon connection pool, Drizzle schema และ migrations

ฐานข้อมูลเป็น source of truth; หน้าเว็บโหลด queue/history ผ่าน REST ครั้งแรกและรับ mutation/order ผ่าน Socket.IO หลัง transaction commit เท่านั้น

## TikTok LIVE listener

ตั้งค่า `apps/listener/.env.local` จาก `apps/listener/.env.example` แล้วรันแยกได้ด้วย:

```sh
pnpm --filter @tarot-live/listener dev
pnpm --filter @tarot-live/listener build
pnpm --filter @tarot-live/listener start
```

Listener รับเฉพาะ chat และ gift ผ่าน WebSocket, ปิดการประมวลผลข้อความย้อนหลัง (`processInitialData=false`) และส่ง event ที่ผ่านการ normalize ไปยัง `POST /internal/tiktok/events` ด้วย `Authorization: Bearer <LISTENER_SECRET>`. แบ็กเอนด์เป็นผู้สร้าง LIVE session, เก็บ event idempotency, จับคู่คำถาม/สิทธิ์ของขวัญแบบ FIFO และปล่อย `queue:created` หลัง commit เท่านั้น

การอ่าน LIVE สาธารณะใช้ anonymous mode เป็นค่าเริ่มต้น. หากจำเป็นต้องใช้ authenticated WebSocket ต้องตั้งค่า `TIKTOK_AUTHENTICATE_WS=true`, `TIKTOK_SESSION_ID`, `TIKTOK_TT_TARGET_IDC`, `TIKTOK_SIGN_API_KEY` และยืนยันผู้ให้บริการ signing ด้วย `TIKTOK_TRUST_SIGNING_SERVICE=true`; ระบบจะไม่ส่ง credential ไปยัง signing service โดยอัตโนมัติ


## เชื่อมต่อจากหน้าเว็บ

1. เปิด API, web และ listener ด้วย `pnpm dev` (สร้างแพ็กเกจร่วมให้อัตโนมัติ)
2. เริ่ม LIVE ในแอป TikTok จากนั้นเปิด `/live` กรอก `@username` ของเจ้าของไลฟ์ แล้วกด **Connect**
3. ผู้ชมคอมเมนต์ `ชื่อ/คำถาม` เช่น `มุก/งานใหม่จะดีไหม` รายการจะแสดงในแท็บ **รอจับคู่ → รอของขวัญ**
4. เมื่อบัญชีเดียวกันส่งของขวัญที่ตรงกติกา ระบบย้ายเข้าคิวพร้อมตอบ หากส่งของขวัญก่อนจะแสดง **รอคำถาม** แทน
5. กด **เริ่มตอบ** แล้ว **ตอบแล้ว** เพื่อปิดคำถามและเก็บในประวัติ ไม่สร้างคิวใหม่จากคำถามเดิม
6. กด **Disconnect** เพื่อหยุดรับ หรือกรอกบัญชีใหม่แล้วกด **Connect** เพื่อเปลี่ยนไลฟ์

ไม่ใช้ `TIKTOK_USERNAME` จาก env อีกต่อไป ชื่อบัญชีมาจากหน้าเว็บเท่านั้น การกด Connect เป็นการเชื่อมต่ออ่านไลฟ์ที่เปิดอยู่ ไม่ได้เริ่มถ่ายทอดสดแทนแอป TikTok

- `apps/api/.env.local` ต้องมี `DATABASE_URL` และ secret (`LISTENER_API_KEY`, `LISTENER_SECRET` หรือ `QUEUE_API_SECRET`)
- `apps/listener/.env.local` ต้องมี `API_BASE_URL` และ `LISTENER_SECRET` ที่ตรงกับ API; ไม่ต้องใส่ cookie สำหรับการอ่านไลฟ์สาธารณะตามค่าเริ่มต้น
- กติกาของขวัญใช้ TikTok Gift ID เป็นหลัก โดยเฉพาะเมื่อใช้โหมดฟรี เพราะระบบไม่โหลด gift gallery ที่ต้องใช้ Euler Business plan ของขวัญที่ไม่ตรงกติกา/ปิดใช้งาน/ไม่ถึงจำนวนขั้นต่ำจะไม่ให้สิทธิ์
- จับคู่ด้วยรหัสผู้ใช้ TikTok และห้องไลฟ์เดียวกัน แสดงชื่อที่กรอก ชื่อ TikTok, @บัญชี, รูปโปรไฟล์ และชนิด/รูป/จำนวนของขวัญ
- ของขวัญแบบ streak รอ `repeatEnd` และใช้ group ID ป้องกันนับซ้ำ สิทธิ์คำถามเป็นไปตามกติกาของขวัญที่ตั้งไว้
- รายการที่ยังจับคู่ไม่ได้หมดอายุหลัง `QUESTION_GIFT_MATCH_TTL_MINUTES` (ค่าเริ่มต้น 10 นาที) และเปลี่ยนเป็นรอตรวจสอบเมื่อไลฟ์จบ
- คำสั่งเชื่อมต่อใช้กับหนึ่ง API และหนึ่ง listener ต่อ workspace; รีสตาร์ต API แล้วต้องกด Connect ใหม่ ข้อมูลคิวเก็บใน PostgreSQL

## การตรวจสอบ

`pnpm test` ทดสอบ parser, controller, API และการจับคู่คิวด้วย PostgreSQL จำลองในหน่วยความจำ (PGlite) โดยไม่แตะฐานข้อมูลจริง ครอบคลุมสองลำดับการส่ง, การแยกผู้ใช้/ห้อง, event ซ้ำ, streak, หมดอายุ และตอบแล้วปิดคิว

แนวทางอ้างอิง: [TikTok Chat Reader](https://github.com/zerodytrash/TikTok-Chat-Reader) (username + Connect, Socket.IO และ reconnect) และ [TikTok Live Gift Tracker](https://github.com/chawilai/tiktok-live-gift-tracker) (ข้อมูลผู้ส่ง/ของขวัญและการนับ streak)
