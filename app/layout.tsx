import type { Metadata } from "next";
import { MINECRAFT_UI_ICONS } from "./minecraft-icons";
import "./globals.css";
import "katex/dist/katex.min.css";
import "./reader.css";
import "./editor.css";
import "./editor-dialogs.css";
import "./editor-image-resize.css";
import "./editor-table-style.css";
import "./hotbar-drag.css";
import "./home-globe.css";

export const metadata: Metadata = {
  title: "我的日志 MINELOG",
  description: "一个以原版方块世界界面为灵感的个人知识仓库。",
  icons: { icon: MINECRAFT_UI_ICONS.home, shortcut: MINECRAFT_UI_ICONS.home },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
