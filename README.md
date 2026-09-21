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
