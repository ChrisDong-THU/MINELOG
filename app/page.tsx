"use client";

import { useEffect, useMemo, useState } from "react";

type Section = { id: string; label: string; icon: string; enabled: boolean; description: string };
const KEY = "minelog-toolbar-v1";
const DEFAULTS: Section[] = [
  { id: "ai", label: "AI 工程", icon: "/minecraft/items/redstone.png", enabled: true, description: "模型、智能体、RAG 与推理系统" },
  { id: "web", label: "Web 开发", icon: "/minecraft/items/spyglass.png", enabled: true, description: "前端、服务端与体验工程" },
  { id: "data", label: "数据笔记", icon: "/minecraft/items/writable_book.png", enabled: true, description: "数据库、分析与数据管道" },
  { id: "systems", label: "系统设计", icon: "/minecraft/items/ender_eye.png", enabled: true, description: "架构、分布式系统与可靠性" },
  { id: "toolbox", label: "工具箱", icon: "/minecraft/items/chest_minecart.png", enabled: true, description: "工作流、脚本与效率工具" },
  { id: "reading", label: "阅读札记", icon: "/minecraft/items/nether_star.png", enabled: true, description: "书籍、论文与长期阅读" },
  { id: "devops", label: "DevOps", icon: "/minecraft/items/redstone.png", enabled: false, description: "交付、观测与基础设施" },
  { id: "life", label: "生活实验", icon: "/minecraft/items/bundle.png", enabled: false, description: "习惯、旅行与日常发现" },
];
const posts = [
  ["AI 工程", "把 RAG 延迟压到 180ms：一次检索链路重构", "08.02", "12 MIN"],
  ["Web 开发", "流式界面中的状态边界与错误恢复", "07.29", "8 MIN"],
  ["数据笔记", "PostgreSQL JSONB 索引的真实成本", "07.24", "10 MIN"],
];
const papers = [
  ["P-042", "Agentic Memory", "待接入订阅源 · 7 PAPERS"],
  ["P-041", "Efficient Inference", "待接入订阅源 · 12 PAPERS"],
  ["P-040", "Multimodal RAG", "待接入订阅源 · 5 PAPERS"],
];

function Item({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="pixel-item" src={src} alt={alt} draggable={false} />;
}

function Status({ kind, filled }: { kind: "heart" | "food"; filled: number }) {
  return <div className={"status-icons " + kind} aria-label={(kind === "heart" ? "生命值" : "饱食度") + " " + filled + "/10"}>
    {Array.from({ length: 10 }, (_, i) => <span className="status-icon" key={i}>
      <img src={kind === "heart" ? "/minecraft/hud/heart_container.png" : "/minecraft/hud/food_empty.png"} alt="" />
      {i < filled && <img src={kind === "heart" ? "/minecraft/hud/heart_full.png" : "/minecraft/hud/food_full.png"} alt="" />}
    </span>)}
  </div>;
}

export default function Home() {
  const [sections, setSections] = useState<Section[]>(DEFAULTS);
  const [active, setActive] = useState("home");
  const [settings, setSettings] = useState(false);
  const [credits, setCredits] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { try { const value = localStorage.getItem(KEY); if (value) setSections(JSON.parse(value)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sections)); } catch {} }, [sections]);

  const visible = useMemo(() => sections.filter((x) => x.enabled).slice(0, 7), [sections]);
  const hidden = useMemo(() => sections.filter((x) => !visible.some((y) => y.id === x.id)), [sections, visible]);
  const nav = useMemo(() => ["home", ...visible.map((x) => x.id), "more"], [visible]);
  const activeSection = sections.find((x) => x.id === active);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input,textarea,select")) return;
      if (event.key.toLowerCase() === "e") { event.preventDefault(); setSettings((x) => !x); }
      else if (event.key === "Escape") { setSettings(false); setCredits(false); }
      else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !settings && !credits) {
        const current = Math.max(0, nav.indexOf(active));
        setActive(nav[(current + (event.key === "ArrowRight" ? 1 : -1) + nav.length) % nav.length]);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, credits, nav, settings]);

  useEffect(() => {
    if (active !== "home" && active !== "more" && !visible.some((x) => x.id === active)) setActive("home");
  }, [active, visible]);

  const ping = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400); };
  const move = (index: number, step: number) => {
    const to = index + step;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[index], next[to]] = [next[to], next[index]];
    setSections(next);
  };
  const toggle = (id: string) => {
    const count = sections.filter((x) => x.enabled).length;
    setSections(sections.map((x) => {
      if (x.id !== id) return x;
      if (!x.enabled && count >= 7) { ping("工具槽最多展示 7 个动态板块"); return x; }
      return { ...x, enabled: !x.enabled };
    }));
  };

  const slots: Array<Section | "home" | "more" | null> = Array(9).fill(null);
  slots[0] = "home";
  visible.forEach((x, i) => { slots[i + 1] = x; });
  slots[8] = "more";

  return <main className="minecraft-shell">
    <div className="scene-shade" />
    <header className="topbar">
      <button className="brand-lockup" onClick={() => setActive("home")} aria-label="返回首页">
        <span className="brand-cube" /><span><strong>MINELOG</strong><small>PERSONAL KNOWLEDGE REPOSITORY</small></span>
      </button>
      <div className="top-actions">
        <button className="pixel-button source-button" onClick={() => setCredits(true)}>素材说明</button>
        <button className="pixel-button settings-button" onClick={() => setSettings(true)}><Item src="/minecraft/items/nether_star.png" /><span>设置</span><kbd>E</kbd></button>
      </div>
    </header>
    <img className="crosshair" src="/minecraft/hud/crosshair.png" alt="" />

    <section className="content-viewport" aria-live="polite">
      {active === "home" && <div className="home-content">
        <div className="hero-copy">
          <p className="eyebrow"><span /> SPAWN POINT · 知识出生点 <span /></p>
          <h1>矿脉日志 <em>MINELOG</em></h1>
          <p className="tagline">挖掘、记录、连接每一块知识</p>
          <div className="world-stats"><span>12 个矿脉</span><span>48 篇笔记</span><span>最后同步 8 MIN AGO</span></div>
        </div>
        <div className="broadcast-grid">
          <section className="broadcast-panel">
            <div className="panel-heading"><div><p className="panel-kicker">WORLD LOG / 01</p><h2>最近更新</h2></div><span className="live-chip"><i /> LIVE</span></div>
            <div className="post-list">{posts.map((post, i) =>
              <button className="post-entry" key={post[1]} onClick={() => ping("文章内容将在知识系统接入后开放")}>
                <span className="entry-index">0{i + 1}</span><span className="entry-copy"><small>{post[0]} · {post[2]}</small><strong>{post[1]}</strong></span><span className="entry-read">{post[3]} <b>→</b></span>
              </button>)}</div>
            <button className="panel-link" onClick={() => ping("完整文章索引将在板块页阶段接入")}>查看全部记录 →</button>
          </section>
          <section className="broadcast-panel paper-panel">
            <div className="panel-heading"><div><p className="panel-kicker">PAPER BEACON / 02</p><h2>论文信标</h2></div><span className="signal-bars"><i /><i /><i /><i /></span></div>
            <p className="panel-intro">订阅源连接后，这里会像信标一样持续推送值得阅读的论文。</p>
            <div className="paper-list">{papers.map((paper) =>
              <button key={paper[0]} onClick={() => ping("Paper Feed 接口将在后续阶段接入")}><span>{paper[0]}</span><strong>{paper[1]}</strong><small>{paper[2]}</small></button>)}</div>
            <div className="feed-status"><span>FEED STATUS</span><b>AWAITING CONNECTION</b></div>
          </section>
        </div>
      </div>}

      {activeSection && <div className="section-placeholder"><div className="ore-card">
        <Item src={activeSection.icon} /><p className="panel-kicker">DYNAMIC SECTOR</p><h1>{activeSection.label}</h1><p>{activeSection.description}</p>
        <div className="mining-progress"><span /></div><small>板块页将在下一阶段开采</small><button className="pixel-button" onClick={() => setActive("home")}>返回出生点</button>
      </div></div>}

      {active === "more" && <div className="more-page">
        <div className="more-heading"><p className="eyebrow"><span /> INVENTORY · 全部矿区 <span /></p><h1>更多板块</h1><p>未放入快捷工具槽的板块，都集中存放在这里。</p></div>
        <div className="more-grid">{(hidden.length ? hidden : sections).map((x) =>
          <button key={x.id} onClick={() => ping("可在设置中将「" + x.label + "」加入工具槽")}><span className="block-swatch"><Item src={x.icon} /></span><span><strong>{x.label}</strong><small>{x.description}</small></span><b>+</b></button>)}</div>
      </div>}
    </section>

    <div className="hud-floor" />
    <nav className="game-hud" aria-label="页面工具槽">
      <div className="survival-status"><Status kind="heart" filled={7} /><span className="level-number">12</span><Status kind="food" filled={8} /></div>
      <div className="xp-bar"><img src="/minecraft/hud/experience_bar_background.png" alt="" /><span><img src="/minecraft/hud/experience_bar_progress.png" alt="" /></span></div>
      <div className="hotbar-shell"><img className="hotbar-frame" src="/minecraft/hud/hotbar.png" alt="" /><div className="hotbar-slots">
        {slots.map((slot, i) => {
          if (!slot) return <span className="empty-slot" key={"empty-" + i} />;
          const id = typeof slot === "string" ? slot : slot.id;
          const label = slot === "home" ? "首页" : slot === "more" ? "更多" : slot.label;
          const icon = slot === "home" ? "/minecraft/items/book.png" : slot === "more" ? "/minecraft/items/bundle.png" : slot.icon;
          return <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)} aria-label={"前往" + label} aria-current={active === id ? "page" : undefined}><Item src={icon} /><span className="slot-tooltip">{i + 1} · {label}</span></button>;
        })}
      </div></div>
      <p className="hud-hint"><span>← →</span> 切换页面 <i /> <span>E</span> 调整工具槽</p>
    </nav>

    {notice && <div className="toast" role="status">{notice}</div>}

    {settings && <div className="modal-backdrop" onMouseDown={() => setSettings(false)}><section className="inventory-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-titlebar"><div><p className="panel-kicker">HOTBAR LOADOUT</p><h2>工具槽设置</h2></div><button onClick={() => setSettings(false)} aria-label="关闭">×</button></div>
      <p className="settings-copy">选择首页与“更多”之间要常驻的板块，并调整出现顺序。设置只保存在当前设备。</p>
      <div className="section-settings">{sections.map((x, i) => <div className={"setting-row " + (x.enabled ? "enabled" : "")} key={x.id}>
        <span className="setting-icon"><Item src={x.icon} /></span><span className="setting-name"><strong>{x.label}</strong><small>{x.description}</small></span>
        <span className="order-controls"><button onClick={() => move(i, -1)} disabled={i === 0}>↑</button><button onClick={() => move(i, 1)} disabled={i === sections.length - 1}>↓</button></span>
        <button className="toggle-button" onClick={() => toggle(x.id)} aria-pressed={x.enabled}>{x.enabled ? "ON" : "OFF"}</button>
      </div>)}</div>
      <div className="modal-footer"><span>{visible.length}/7 个动态槽位已使用</span><button className="pixel-button" onClick={() => setSettings(false)}>保存并返回</button></div>
    </section></div>}

    {credits && <div className="modal-backdrop" onMouseDown={() => setCredits(false)}><section className="inventory-modal credits-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-titlebar"><div><p className="panel-kicker">RESOURCE NOTES</p><h2>素材与许可</h2></div><button onClick={() => setCredits(false)} aria-label="关闭">×</button></div>
      <p className="legal-callout">非官方 Minecraft 产品。未经 Mojang 或 Microsoft 批准，也不与其关联。</p>
      <div className="credit-list">
        <p><strong>原版游戏贴图</strong><span>通过 PrismarineJS / minecraft-assets 索引取得，版权归 Mojang 与 Microsoft 所有。</span></p>
        <p><strong>场景截图</strong><span>“Un paysage de Minecraft”，作者 Tofli IV，CC BY-SA 4.0；网页以 cover 方式展示，未修改原文件。</span></p>
        <p><strong>中文像素字体</strong><span>Ark Pixel Font，SIL Open Font License 1.1。</span></p>
      </div>
      <div className="credit-links"><a href="https://github.com/PrismarineJS/minecraft-assets" target="_blank" rel="noreferrer">资源索引 ↗</a><a href="https://commons.wikimedia.org/wiki/File:Un_paysage_de_Minecraft.png" target="_blank" rel="noreferrer">截图授权 ↗</a><a href="https://github.com/TakWolf/ark-pixel-font" target="_blank" rel="noreferrer">字体仓库 ↗</a><a href="https://www.minecraft.net/usage-guidelines" target="_blank" rel="noreferrer">使用规范 ↗</a></div>
      <div className="modal-footer"><span>公开发布或商业化前，请重新核对最新使用规范。</span><button className="pixel-button" onClick={() => setCredits(false)}>知道了</button></div>
    </section></div>}
  </main>;
}

