import type { Metadata } from "next";
import "./globals.css";
import { LiveQueueProvider } from "@/store/LiveQueueProvider";
export const metadata: Metadata = { title: "Tarot LIVE Queue", description: "พื้นที่เล็ก ๆ สำหรับทุกคำถาม · ระบบจัดคิวดูดวง TikTok LIVE" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="th"><body><LiveQueueProvider>{children}</LiveQueueProvider></body></html>; }

