# Tarot LIVE Queue

ระบบจัดคิวดูดวงระหว่าง TikTok LIVE แบบ monorepo โดยใช้ pnpm workspace และ Turborepo

## เริ่มต้นใช้งาน

```sh
pnpm install
pnpm dev
```

เว็บจะเปิดที่ http://localhost:3000/live และ API health check อยู่ที่ http://localhost:4000/health

คำสั่งหลัก:

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## โครงสร้าง

- `apps/web`: Next.js App Router dashboard และหน้า settings
- `apps/api`: HTTP API และจุดต่อยอด routes, services, socket, queue และ auth
- `apps/listener`: service สำหรับรับ event จาก TikTok LIVE และส่งต่อเข้า API
- `packages/shared`: types, schemas และ constants ที่ใช้ร่วมกัน
- `packages/db`: database entrypoint, schema และ migrations

ข้อมูลหน้าเว็บปัจจุบันยังเป็น mock data ใน local state เพื่อให้ทดสอบ workflow การจัดคิวได้ก่อนเชื่อม API จริง
