"use client";

export type MarkdownEditorCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "strike"
  | "unordered-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "code-block"
  | "math-block"
  | "table";

export type MarkdownInsertKind = "link";

type IconName = MarkdownEditorCommand | MarkdownInsertKind;
type ToolbarItem = {
  command?: MarkdownEditorCommand;
  insert?: MarkdownInsertKind;
  icon: IconName;
  label: string;
  shortcut?: string;
};

const TOOL_GROUPS: ToolbarItem[][] = [
  [
    { command: "undo", icon: "undo", label: "撤销", shortcut: "Ctrl/Cmd + Z" },
    { command: "redo", icon: "redo", label: "重做", shortcut: "Ctrl/Cmd + Shift + Z" },
  ],
  [
    { command: "bold", icon: "bold", label: "加粗", shortcut: "Ctrl/Cmd + B" },
    { command: "italic", icon: "italic", label: "斜体", shortcut: "Ctrl/Cmd + I" },
    { command: "strike", icon: "strike", label: "删除线", shortcut: "Alt + Shift + 5" },
  ],
  [
    { command: "unordered-list", icon: "unordered-list", label: "无序列表", shortcut: "Ctrl + Shift + ] / Cmd + Option + U" },
    { command: "ordered-list", icon: "ordered-list", label: "有序列表", shortcut: "Ctrl + Shift + [ / Cmd + Option + O" },
    { command: "task-list", icon: "task-list", label: "任务列表" },
    { command: "quote", icon: "quote", label: "引用", shortcut: "Ctrl + Shift + Q / Cmd + Option + Q" },
    { command: "code-block", icon: "code-block", label: "插入代码区块", shortcut: "Ctrl + Shift + K / Cmd + Option + C" },
    { command: "math-block", icon: "math-block", label: "插入公式区块", shortcut: "Ctrl + Shift + M / Cmd + Option + B" },
    { command: "table", icon: "table", label: "插入表格", shortcut: "Ctrl + T / Cmd + Option + T" },
  ],
  [
    { insert: "link", icon: "link", label: "插入链接", shortcut: "Ctrl/Cmd + K" },
  ],
];

function ToolbarIcon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
    strokeWidth: 1.8,
  };

  switch (name) {
    case "undo":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M8 7H3v-5M3.7 6.3A9 9 0 1 1 5.5 17" /></svg>;
    case "redo":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M16 7h5v-5m-.7 4.3A9 9 0 1 0 18.5 17" /></svg>;
    case "bold":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M7 4h6.2a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z" /></svg>;
    case "italic":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M10 4h8M6 20h8M14 4 10 20" /></svg>;
    case "strike":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5 8c0-2.2 2.1-4 6-4 3 0 5 1 6 2.5M4 12h16M8 16c.8 2.5 3.2 4 6 4 3.1 0 5-1.6 5-4" /></svg>;
    case "unordered-list":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M9 6h12M9 12h12M9 18h12" /><path fill="currentColor" d="M3 4.5h3v3H3zm0 6h3v3H3zm0 6h3v3H3z" /></svg>;
    case "ordered-list":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M10 6h11M10 12h11M10 18h11M3 5h2v3M3 12h2l-2 3h2M3 17h2l-2 3h2" /></svg>;
    case "task-list":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M10 6h11M10 12h11M10 18h11M3 4h4v4H3zm0 6h4v4H3zm0 6h4v4H3zM3.8 12l1.2 1.2L7.4 10" /></svg>;
    case "quote":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h7v8H7.5c0 2.3-1.1 4.2-3.5 5.8V16c1.1-.9 1.6-1.9 1.6-3H4zm11 0h7v8h-3.5c0 2.3-1.1 4.2-3.5 5.8V16c1.1-.9 1.6-1.9 1.6-3H15z" /></svg>;
    case "code-block":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m8 5-7 7 7 7M16 5l7 7-7 7M14 3l-4 18" /></svg>;
    case "math-block":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M19 5H7l6 7-6 7h12M3 5v14" /></svg>;
    case "table":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M3 4h18v16H3zM3 9h18M9 4v16M15 4v16" /></svg>;
    case "link":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m9.5 14.5 5-5M7.2 17.8l-1.4 1.4a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0M16.8 6.2l1.4-1.4a4.2 4.2 0 0 1 6 6l-4 4a4.2 4.2 0 0 1-6 0" /></svg>;
  }
}

export function MarkdownEditorToolbar({
  canUndo,
  canRedo,
  onCommand,
  onInsert,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onCommand: (command: MarkdownEditorCommand) => void;
  onInsert: (kind: MarkdownInsertKind) => void;
}) {
  return <div className="editor-format-bar" role="toolbar" aria-label="Markdown 格式工具栏">
    {TOOL_GROUPS.map((group, groupIndex) => <div className="editor-tool-group" key={groupIndex}>
      {group.map((item) => {
        const disabled = item.command === "undo" ? !canUndo : item.command === "redo" ? !canRedo : false;
        const title = item.shortcut ? `${item.label}（${item.shortcut}）` : item.label;
        return <button
          className="editor-tool-button"
          type="button"
          key={item.command ?? item.insert}
          title={title}
          aria-label={title}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => item.command ? onCommand(item.command) : item.insert && onInsert(item.insert)}
        >
          <ToolbarIcon name={item.icon} />
        </button>;
      })}
    </div>)}
  </div>;
}
