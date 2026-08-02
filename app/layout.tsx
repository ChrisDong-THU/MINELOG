import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "矿脉日志 MINELOG",
  description: "一个以原版方块世界界面为灵感的个人知识仓库。",
  icons: { icon: "/minecraft/items/book.png", shortcut: "/minecraft/items/book.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

