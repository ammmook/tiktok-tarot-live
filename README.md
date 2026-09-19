# Tarot LIVE Queue

Frontend mockup สำหรับจัดคิวดูดวงระหว่าง TikTok LIVE ใช้ Next.js 16, App Router, TypeScript และ Tailwind CSS 4

## Run

```sh
npm install
npm run dev
```

เปิด http://localhost:3000/live (หน้าแรกจะ redirect มาที่นี่)

```sh
npm run lint
npm run build
```

## ทดลอง workflow

- เริ่มจาก Mint กำลังตอบ พร้อม 7 คิวรอ, 2 รายการรอคำถาม และ 1 รายการตอบแล้ว
- เพิ่ม/แก้ไขของขวัญเป็น Love Glasses เพื่อทดสอบคิวลัด โดยไม่แทรกคนกำลังตอบ
- เลือกเริ่มตอบคนอื่น จะพักคนเดิมไว้ในตัวกรองพักไว้
- ตอบแล้วแสดง UNDO 9 วินาที; ถ้ามีคนใหม่กำลังตอบ UNDO จะคืนคนเดิมเข้าคิวรอ
- รายการตอบแล้วสามารถคืนเข้าคิวได้เสมอ
- ค้นหาชื่อ, TikTok username หรือคำถาม และใช้ตัวกรองคิวปกติ/ลัดคิว/พักไว้
- Simulate Gift เพิ่มรายการรอคำถาม; Simulate Comment จับคู่ผู้ส่งจำลองคนล่าสุดที่ยังรอคำถาม หรือผู้รอคำถามคนแรก
- ของขวัญจำลองสลับ Donut และ Love Glasses เพื่อทดสอบทั้งสองเส้นทาง
- Start Mock Live เปิดสถานะและเวลาเซสชันจำลอง; ปุ่ม demo ใช้ได้โดยไม่ต้องเริ่ม LIVE
- ลบคิวต้องยืนยัน และเปลี่ยนสถานะเป็น cancelled โดยไม่ลบ object

ข้อมูลอยู่ใน React local state รีเฟรชหน้าเพื่อเริ่มข้อมูลจำลองใหม่ ไม่มีการบันทึกถาวรหรือเชื่อมต่อ API, Google Sheets, TikTok, database, authentication หรือ backend

## โครงสร้าง

- app/live: route แดชบอร์ด
- components/live: แดชบอร์ด, รายการคิว และ dialog เพิ่ม/แก้ไข/ลบ
- components/ui: SVG icons
- types/queue.ts: QueueEntry, GiftRule และสถานะ
- data/mockQueue.ts: ข้อมูลจำลองเริ่มต้น
- utils/queuePriority.ts: กฎของขวัญและการจัดลำดับ
- services/queueService.ts: interface และ mock operations แยกจาก UI
- tokens.css: สีและ font tokens

การต่อ API ในอนาคต: เพิ่ม adapter และ asynchronous state controller รอบ QueueService โดย reuse types, priority rules และ presentation components

## Validation

ผ่าน lint และ production build รวมถึงทดสอบใน browser: เพิ่มคิวลัด, ค้นหา, เริ่มตอบ, ตอบแล้ว/Undo, แก้ไข, ยืนยันลบ, คืนคิวพัก/คิวตอบแล้ว และ Gift/Comment pairing ตรวจ responsive ที่ 320, 375, 414, 768 และ 1440 px
