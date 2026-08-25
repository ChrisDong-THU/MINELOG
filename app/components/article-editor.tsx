"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { articleAuthor } from "../../shared/article-metadata";
import type { Section } from "../content-types";
import { MINECRAFT_UI_ICONS } from "../minecraft-icons";
import { saveLocalArticleImage } from "../local-article-assets";
import { GameModal } from "./game-modal";
import { GameSelect } from "./game-select";
import { MarkdownEditorToolbar, type MarkdownEditorCommand, type MarkdownInsertKind } from "./markdown-editor-toolbar";
import { MarkdownRenderer, type MarkdownSourceRange } from "./markdown-renderer";

export type ArticleEditorValue = {
  id: string;
  sectionId: string;
  title: string;
  author: string;
  summary: string;
  tags: string[];
  markdown: string;
  uploadedAssetUrls?: string[];
};

type EditorSection = Pick<Section, "id" | "label" | "icon">;
type EditorSelection = { start: number; end: number };
type HistorySnapshot = EditorSelection & { value: string };
type InsertDialog = MarkdownInsertKind | null;

const STARTER_MARKDOWN = `## 从这里开始\n\n写下文章正文。编辑内容会在右侧实时渲染。\n\n> 可以使用标题、引用、列表、表格、代码块与 LaTeX 公式。\n`;

function selectionCenterScrollTop(input: HTMLTextAreaElement, source: string, selection: EditorSelection) {
  const style = getComputedStyle(input);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.75 || 22;
  const endOffset = Math.max(selection.start, selection.end - 1);
  const mirror = document.createElement("div");
  const startMarker = document.createElement("span");
  const endMarker = document.createElement("span");

  Object.assign(mirror.style, {
    position: "fixed",
    inset: "0 auto auto -100000px",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    width: `${input.clientWidth}px`,
    padding: style.padding,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing,
    textIndent: style.textIndent,
    textTransform: style.textTransform,
    tabSize: style.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: style.wordBreak,
  });
  for (const marker of [startMarker, endMarker]) {
    marker.style.display = "inline-block";
    marker.style.width = "0";
    marker.style.height = `${lineHeight}px`;
    marker.style.verticalAlign = "top";
  }

  mirror.append(
    document.createTextNode(source.slice(0, selection.start)),
    startMarker,
    document.createTextNode(source.slice(selection.start, endOffset)),
    endMarker,
  );
  document.body.append(mirror);
  const selectionCenter = (startMarker.offsetTop + endMarker.offsetTop + lineHeight) / 2;
  mirror.remove();

  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, selectionCenter - input.clientHeight / 2));
}

export function ArticleEditor({
  mode,
  sections,
  initialValue,
  onCancel,
  onSave,
  onDelete,
  onDirtyChange,
}: {
  mode: "new" | "edit";
  sections: EditorSection[];
  initialValue: ArticleEditorValue;
  onCancel: () => void;
  onSave: (value: ArticleEditorValue) => void | Promise<void>;
  onDelete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [sectionId, setSectionId] = useState(initialValue.sectionId);
  const [title, setTitle] = useState(initialValue.title);
  const [author, setAuthor] = useState(initialValue.author);
  const [summary, setSummary] = useState(initialValue.summary);
  const [tags, setTags] = useState(initialValue.tags.join("，"));
  const [markdown, setMarkdown] = useState(initialValue.markdown || STARTER_MARKDOWN);
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [insertDialog, setInsertDialog] = useState<InsertDialog>(null);
  const [insertUrl, setInsertUrl] = useState("");
  const [insertLabel, setInsertLabel] = useState("");
  const [tableDialog, setTableDialog] = useState(false);
  const [tableRows, setTableRows] = useState(2);
  const [tableColumns, setTableColumns] = useState(3);
  const [pasteError, setPasteError] = useState("");
  const [savingArticle, setSavingArticle] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insertUrlRef = useRef<HTMLInputElement>(null);
  const markdownRef = useRef(markdown);
  const uploadedAssetUrls = useRef(new Set<string>());
  const selectionRef = useRef<EditorSelection>({ start: 0, end: 0 });
  const dialogSelectionRef = useRef<EditorSelection>({ start: 0, end: 0 });
  const historyRef = useRef<{
    undo: HistorySnapshot[];
    redo: HistorySnapshot[];
    lastKind: "typing" | "command" | null;
    lastInputAt: number;
  }>({ undo: [], redo: [], lastKind: null, lastInputAt: 0 });
  const selectedSection = sections.find((section) => section.id === sectionId) ?? sections[0];
  const originalSection = sections.find((section) => section.id === initialValue.sectionId);
  const stats = useMemo(() => {
    const characters = markdown.replace(/\s/g, "").length;
    return { characters, minutes: Math.max(1, Math.ceil(characters / 500)) };
  }, [markdown]);
  const isDirty = sectionId !== initialValue.sectionId
    || title !== initialValue.title
    || author !== initialValue.author
    || summary !== initialValue.summary
    || tags !== initialValue.tags.join("，")
    || markdown !== (initialValue.markdown || STARTER_MARKDOWN);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!insertDialog) return;
    const frame = requestAnimationFrame(() => insertUrlRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [insertDialog]);

  const focusSelection = ({ start, end }: EditorSelection) => {
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(start, end);
    });
  };

  const focusMarkdownSource = ({ start, end }: MarkdownSourceRange) => {
    const source = markdownRef.current;
    const selectionStart = Math.min(Math.max(0, start), source.length);
    const selection = {
      start: selectionStart,
      end: Math.min(Math.max(selectionStart, end), source.length),
    };
    selectionRef.current = selection;
    setMobilePane("edit");

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(selection.start, selection.end);

      const top = selectionCenterScrollTop(input, source, selection);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      input.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });

      const bounds = input.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        input.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      }
    }));
  };

  const updateMarkdown = (
    next: string,
    selection: EditorSelection,
    kind: "typing" | "command" = "command",
  ) => {
    const current = markdownRef.current;
    if (next === current) {
      selectionRef.current = selection;
      focusSelection(selection);
      return;
    }

    const history = historyRef.current;
    const now = Date.now();
    const continuesTyping = kind === "typing" && history.lastKind === "typing" && now - history.lastInputAt < 750;
    if (!continuesTyping) {
      history.undo.push({ value: current, ...selectionRef.current });
      if (history.undo.length > 120) history.undo.shift();
    }
    history.redo = [];
    history.lastKind = kind;
    history.lastInputAt = kind === "typing" ? now : 0;
    setHistoryStatus({ canUndo: history.undo.length > 0, canRedo: false });
    selectionRef.current = selection;
    markdownRef.current = next;
    setMarkdown(next);
    if (kind === "command") focusSelection(selection);
  };

  const replaceRange = (
    range: EditorSelection,
    replacement: string,
    selectedRange: EditorSelection = { start: range.start, end: range.start + replacement.length },
  ) => {
    const value = markdownRef.current;
    updateMarkdown(value.slice(0, range.start) + replacement + value.slice(range.end), selectedRange);
  };

  const currentSelection = (): EditorSelection => {
    const input = textareaRef.current;
    return input ? { start: input.selectionStart, end: input.selectionEnd } : selectionRef.current;
  };

  const wrapSelection = (before: string, after = before, fallback = "文本") => {
    const range = currentSelection();
    const value = markdownRef.current;
    const selected = value.slice(range.start, range.end) || fallback;
    replaceRange(range, `${before}${selected}${after}`, {
      start: range.start + before.length,
      end: range.start + before.length + selected.length,
    });
  };

  const transformSelectedLines = (kind: "unordered-list" | "ordered-list" | "task-list" | "quote") => {
    const value = markdownRef.current;
    const range = currentSelection();
    const lineStart = value.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
    const nextBreak = value.indexOf("\n", range.end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const patterns = {
      "unordered-list": /^(\s*)[-*+]\s+/,
      "ordered-list": /^(\s*)\d+[.)]\s+/,
      "task-list": /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
      quote: /^(\s*)>\s?/,
    };
    const pattern = patterns[kind];
    const contentLines = lines.filter((line) => line.trim());
    const shouldRemove = contentLines.length > 0 && contentLines.every((line) => pattern.test(line));
    let ordinal = 0;
    const replacement = lines.map((line) => {
      if (!line.trim()) return line;
      if (shouldRemove) return line.replace(pattern, "$1");
      const indentation = line.match(/^\s*/)?.[0] ?? "";
      const content = line.slice(indentation.length);
      ordinal += 1;
      const prefix = kind === "unordered-list" ? "- "
          : kind === "ordered-list" ? `${ordinal}. `
            : kind === "task-list" ? "- [ ] "
              : "> ";
      return `${indentation}${prefix}${content}`;
    }).join("\n");
    replaceRange({ start: lineStart, end: lineEnd }, replacement, { start: lineStart, end: lineStart + replacement.length });
  };

  const setHeadingLevel = (level: number) => {
    const value = markdownRef.current;
    const range = currentSelection();
    const lineStart = value.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
    const nextBreak = value.indexOf("\n", range.end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const replacement = value.slice(lineStart, lineEnd).split("\n").map((line) => {
      if (!line.trim()) return line;
      const indentation = line.match(/^\s*/)?.[0] ?? "";
      const content = line.slice(indentation.length).replace(/^#{1,6}\s+/, "");
      return level === 0 ? `${indentation}${content}` : `${indentation}${"#".repeat(level)} ${content}`;
    }).join("\n");
    replaceRange({ start: lineStart, end: lineEnd }, replacement, { start: lineStart, end: lineStart + replacement.length });
  };

  const insertBlock = (marker: "```" | "$$", fallback: string) => {
    const range = currentSelection();
    const value = markdownRef.current;
    const selected = value.slice(range.start, range.end) || fallback;
    const leading = range.start > 0 && value[range.start - 1] !== "\n" ? "\n\n" : "";
    const trailing = range.end < value.length && value[range.end] !== "\n" ? "\n\n" : "";
    const replacement = `${leading}${marker}\n${selected}\n${marker}${trailing}`;
    const contentStart = range.start + leading.length + marker.length + 1;
    replaceRange(range, replacement, { start: contentStart, end: contentStart + selected.length });
  };

  const insertTable = () => {
    const range = dialogSelectionRef.current;
    const columns = Math.max(1, Math.min(10, Math.round(tableColumns)));
    const rows = Math.max(1, Math.min(30, Math.round(tableRows)));
    const header = `| ${Array.from({ length: columns }, (_, index) => `列 ${index + 1}`).join(" | ")} |`;
    const divider = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
    const body = Array.from({ length: rows }, () => `| ${Array.from({ length: columns }, () => "内容").join(" | ")} |`);
    const table = [header, divider, ...body].join("\n");
    const value = markdownRef.current;
    const leading = range.start > 0 && value[range.start - 1] !== "\n" ? "\n\n" : "";
    const trailing = range.end < value.length && value[range.end] !== "\n" ? "\n\n" : "";
    setTableDialog(false);
    replaceRange(range, `${leading}${table}${trailing}`, {
      start: range.start + leading.length + 2,
      end: range.start + leading.length + 5,
    });
  };

  const undo = () => {
    const history = historyRef.current;
    const snapshot = history.undo.pop();
    if (!snapshot) return;
    history.redo.push({ value: markdownRef.current, ...currentSelection() });
    history.lastKind = null;
    markdownRef.current = snapshot.value;
    selectionRef.current = { start: snapshot.start, end: snapshot.end };
    setMarkdown(snapshot.value);
    setHistoryStatus({ canUndo: history.undo.length > 0, canRedo: true });
    focusSelection(snapshot);
  };

  const redo = () => {
    const history = historyRef.current;
    const snapshot = history.redo.pop();
    if (!snapshot) return;
    history.undo.push({ value: markdownRef.current, ...currentSelection() });
    history.lastKind = null;
    markdownRef.current = snapshot.value;
    selectionRef.current = { start: snapshot.start, end: snapshot.end };
    setMarkdown(snapshot.value);
    setHistoryStatus({ canUndo: true, canRedo: history.redo.length > 0 });
    focusSelection(snapshot);
  };

  const runCommand = (command: MarkdownEditorCommand) => {
    if (command === "undo") return undo();
    if (command === "redo") return redo();
    if (command === "bold") return wrapSelection("**", "**", "加粗文本");
    if (command === "italic") return wrapSelection("_", "_", "斜体文本");
    if (command === "strike") return wrapSelection("~~", "~~", "删除线文本");
    if (command === "code-block") return insertBlock("```", "代码");
    if (command === "math-block") return insertBlock("$$", "E = mc^2");
    if (command === "table") {
      dialogSelectionRef.current = currentSelection();
      setTableDialog(true);
      return;
    }
    transformSelectedLines(command);
  };

  const openInsertDialog = (kind: MarkdownInsertKind) => {
    const range = currentSelection();
    const selected = markdownRef.current.slice(range.start, range.end).trim();
    dialogSelectionRef.current = range;
    setInsertUrl("");
    setInsertLabel(selected || "链接文字");
    setInsertDialog(kind);
  };

  const confirmInsert = () => {
    if (!insertDialog || !insertUrl.trim()) return;
    const label = insertLabel.trim() || "链接";
    const url = insertUrl.trim().replace(/\s/g, "%20");
    const replacement = `[${label}](${url})`;
    const range = dialogSelectionRef.current;
    setInsertDialog(null);
    replaceRange(range, replacement, { start: range.start, end: range.start + replacement.length });
  };

  const handleEditorPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    const html = event.clipboardData.getData("text/html");
    const htmlImage = html
      ? new DOMParser().parseFromString(html, "text/html").querySelector<HTMLImageElement>("img")?.src
      : undefined;
    const plainText = event.clipboardData.getData("text/plain").trim();
    const externalImage = /^(https?:\/\/\S+|data:image\/[^;,]+;base64,\S+)$/i.test(plainText) ? plainText : undefined;
    const sources: Array<File | string> = imageFiles.length ? imageFiles : htmlImage ? [htmlImage] : externalImage ? [externalImage] : [];
    if (!sources.length) return;

    event.preventDefault();
    const range = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    setPasteError("");
    try {
      const markdownImages: string[] = [];
      for (const [index, source] of sources.entries()) {
        const url = await saveLocalArticleImage(source);
        uploadedAssetUrls.current.add(url);
        const rawLabel = source instanceof File ? source.name.replace(/\.[^.]+$/, "") : `图片 ${index + 1}`;
        const label = (rawLabel || "图片").replace(/\]/g, "\\]");
        markdownImages.push(`![${label}](${url})`);
      }
      const value = markdownRef.current;
      const leading = range.start > 0 && value[range.start - 1] !== "\n" ? "\n\n" : "";
      const trailing = range.end < value.length && value[range.end] !== "\n" ? "\n\n" : "";
      const replacement = `${leading}${markdownImages.join("\n\n")}${trailing}`;
      const caret = range.start + replacement.length;
      replaceRange(range, replacement, { start: caret, end: caret });
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "图片保存失败");
      if (!imageFiles.length && !htmlImage && externalImage) {
        replaceRange(range, plainText, { start: range.start + plainText.length, end: range.start + plainText.length });
      }
    }
  };

  const updateImageWidth = (src: string, width: number) => {
    const normalizedWidth = Math.max(10, Math.min(100, Math.round(width)));
    const cleanSource = src.replace(/#width=\d{1,3}$/, "");
    const nextSource = `${cleanSource}#width=${normalizedWidth}`;
    const escapedSource = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imagePattern = new RegExp(`(!\\[[^\\]]*\\]\\()${escapedSource}(\\))`, "g");
    const current = markdownRef.current;
    const next = current.replace(imagePattern, (_match, opening: string, closing: string) => `${opening}${nextSource}${closing}`);
    if (next === current) return;
    updateMarkdown(next, currentSelection());
  };

  const submit = async () => {
    if (!title.trim()) {
      setDetailsOpen(true);
      return;
    }
    setSavingArticle(true);
    try {
      await onSave({
        id: initialValue.id,
        sectionId,
        title: title.trim(),
        author: articleAuthor(author),
        summary: summary.trim(),
        tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
        markdown: markdownRef.current,
        uploadedAssetUrls: [...uploadedAssetUrls.current],
      });
    } finally {
      setSavingArticle(false);
    }
  };

  useEffect(() => {
    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey)
        && !event.shiftKey
        && !event.altKey
        && event.key.toLowerCase() === "s";
      if (!isSaveShortcut) return;
      event.preventDefault();
      if (event.repeat || savingArticle || deleteConfirm || insertDialog || tableDialog) return;
      void submit();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  });

  const indentSelection = (outdent: boolean) => {
    const value = markdownRef.current;
    const range = currentSelection();
    if (range.start === range.end && !outdent) {
      replaceRange(range, "  ", { start: range.start + 2, end: range.start + 2 });
      return;
    }
    const lineStart = value.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
    const nextBreak = value.indexOf("\n", range.end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const replacement = value.slice(lineStart, lineEnd).split("\n").map((line) => outdent ? line.replace(/^( {1,2}|\t)/, "") : `  ${line}`).join("\n");
    replaceRange({ start: lineStart, end: lineEnd }, replacement, { start: lineStart, end: lineStart + replacement.length });
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      indentSelection(event.shiftKey);
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    if (modifier && !event.shiftKey && !event.altKey && /^[0-6]$/.test(key)) {
      event.preventDefault();
      setHeadingLevel(Number(key));
      return;
    }
    if (!modifier && !(event.altKey && event.shiftKey && event.code === "Digit5")) return;

    if (key === "z" && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if (key === "y" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      redo();
    } else if (key === "b" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      runCommand("bold");
    } else if (key === "i" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      runCommand("italic");
    } else if (key === "k" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openInsertDialog("link");
    } else if ((!isMac && event.altKey && event.shiftKey && event.code === "Digit5") || (isMac && event.ctrlKey && event.shiftKey && key === "`")) {
      event.preventDefault();
      runCommand("strike");
    } else if ((!isMac && event.ctrlKey && event.shiftKey && key === "`") || (isMac && event.metaKey && event.shiftKey && key === "`")) {
      event.preventDefault();
      wrapSelection("`", "`", "行内代码");
    } else if ((event.ctrlKey && event.shiftKey && event.key === "[") || (event.metaKey && event.altKey && key === "o")) {
      event.preventDefault();
      runCommand("ordered-list");
    } else if ((event.ctrlKey && event.shiftKey && event.key === "]") || (event.metaKey && event.altKey && key === "u")) {
      event.preventDefault();
      runCommand("unordered-list");
    } else if ((event.ctrlKey && event.shiftKey && key === "q") || (event.metaKey && event.altKey && key === "q")) {
      event.preventDefault();
      runCommand("quote");
    } else if ((event.ctrlKey && event.shiftKey && key === "k") || (event.metaKey && event.altKey && key === "c")) {
      event.preventDefault();
      runCommand("code-block");
    } else if ((event.ctrlKey && event.shiftKey && key === "m") || (event.metaKey && event.altKey && key === "b")) {
      event.preventDefault();
      runCommand("math-block");
    } else if ((event.ctrlKey && !event.shiftKey && !event.altKey && key === "t") || (event.metaKey && event.altKey && !event.shiftKey && key === "t")) {
      event.preventDefault();
      dialogSelectionRef.current = currentSelection();
      setTableDialog(true);
    } else if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === "[") {
      event.preventDefault();
      indentSelection(true);
    } else if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === "]") {
      event.preventDefault();
      indentSelection(false);
    }
  };

  if (savingArticle) return <div className="content-loading-state" role="status">{"\u6B63\u5728\u4FDD\u5B58\u6587\u7AE0\u6B63\u6587\u2026"}</div>;

  return <div className="editor-page">
    <header className="editor-header">
      <div>
        <span>{mode === "edit" ? "EDIT ARTICLE" : "NEW ARTICLE"}</span>
        <h1>{mode === "edit" ? "编辑文章" : "新建文章"}</h1>
        <p>Markdown 内容将在右侧实时呈现，保存后直接进入文章阅读页。</p>
      </div>
      <div className="editor-actions">
        {mode === "edit" && onDelete && <button type="button" className="editor-delete-button" onClick={() => setDeleteConfirm(true)}>删除文章</button>}
        <button type="button" className="editor-quiet-button" onClick={onCancel}>取消</button>
        <button type="button" className="editor-save-button" onClick={submit} disabled={!title.trim()}>保存文章</button>
      </div>
    </header>

    <div className="editor-mobile-tabs" role="tablist" aria-label="编辑器视图">
      <button type="button" role="tab" aria-selected={mobilePane === "edit"} onClick={() => setMobilePane("edit")}>编辑</button>
      <button type="button" role="tab" aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>预览</button>
    </div>

    <div className={`editor-workspace pane-${mobilePane}`}>
      <div className={`editor-form-column${detailsOpen ? " is-meta-open" : " is-meta-collapsed"}`}>
      <section className={`editor-meta-panel${detailsOpen ? " is-open" : ""}`} aria-label="文章基本信息">
        <button
          type="button"
          className="editor-meta-toggle"
          aria-expanded={detailsOpen}
          aria-controls="article-editor-details"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <img src={selectedSection?.icon} alt="" />
          <span className="editor-meta-button-copy">
            <small>ARTICLE DETAILS</small>
            <strong>文章基本信息</strong>
          </span>
          <span className="editor-meta-button-summary">{title.trim() || "设置板块、作者与文章信息"}</span>
          <i className="editor-meta-chevron" aria-hidden="true" />
        </button>
        <div id="article-editor-details" className="editor-meta-body" aria-hidden={!detailsOpen} inert={!detailsOpen}>
          <div className="editor-meta-body-inner">
            <div className="editor-meta-fields">
              <label className="editor-field editor-title-field">
                <span>文章大标题</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入文章标题" />
              </label>
              <div className="editor-field-grid editor-summary-grid">
                <label className="editor-field">
                  <span>文章副标题</span>
                  <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="用一句话说明这篇文章" />
                </label>
                <label className="editor-field">
                  <span>文章标签</span>
                  <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：RAG，性能" />
                </label>
              </div>
              <div className="editor-field-grid">
                <div className="editor-field">
                  <span>归属板块</span>
                  <GameSelect
                    value={sectionId}
                    options={sections.map((section) => ({ value: section.id, label: section.label, icon: section.icon }))}
                    ariaLabel="归属板块"
                    size="compact"
                    onChange={setSectionId}
                  />
                </div>
                <label className="editor-field">
                  <span>作者</span>
                  <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={80} placeholder="输入作者或署名" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

        <section className="editor-markdown-panel" aria-label="Markdown editor">
          <div className="editor-markdown-field">
          <div className="editor-markdown-heading">
            <span>正文 · MARKDOWN</span>
            <small className={pasteError ? "is-error" : undefined}>{pasteError || `${stats.characters} 字符 · 约 ${stats.minutes} 分钟`}</small>
          </div>
          <MarkdownEditorToolbar
            canUndo={historyStatus.canUndo}
            canRedo={historyStatus.canRedo}
            onCommand={runCommand}
            onInsert={openInsertDialog}
          />
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(event) => updateMarkdown(event.currentTarget.value, { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }, "typing")}
            onKeyDown={handleEditorKeyDown}
            onPaste={handleEditorPaste}
            onSelect={(event) => { selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
            spellCheck={false}
            aria-label="Markdown 正文"
          />
        </div>
      </section>
      </div>

      <section className="editor-preview" aria-label="文章实时预览">
        <header className="editor-preview-header">
          <h2>{title || "未命名文章"}</h2>
          <p>{summary || "文章副标题会显示在这里。"}</p>
        </header>
        <MarkdownRenderer
          markdown={markdown}
          editableImages
          onImageWidthChange={updateImageWidth}
          onSourceActivate={focusMarkdownSource}
        />
      </section>
    </div>

    {deleteConfirm && onDelete && <GameModal
      eyebrow="DELETE ARTICLE"
      title="确认删除这篇文章？"
      description="删除后文章正文和本地修改记录将一并移除，此操作无法撤销。"
      icon={MINECRAFT_UI_ICONS.delete}
      onClose={() => setDeleteConfirm(false)}
      footer={<><button type="button" className="pixel-button" onClick={() => setDeleteConfirm(false)}>保留文章</button><button type="button" className="pixel-button editor-delete-confirm" onClick={onDelete}>确认删除</button></>}
    >
      <div className="editor-delete-summary"><span>即将删除</span><strong>{initialValue.title}</strong><small>{originalSection?.label}</small></div>
    </GameModal>}

    {tableDialog && <GameModal
      eyebrow="INSERT TABLE"
      title="设置表格尺寸"
      description="确定列数与数据行数，编辑器会自动生成表头和分隔行。"
      icon={MINECRAFT_UI_ICONS.table}
      onClose={() => setTableDialog(false)}
      className="editor-table-modal"
      footer={<><span className="editor-insert-hint">1–10 列 · 1–30 行</span><span className="editor-insert-actions"><button type="button" className="pixel-button" onClick={() => setTableDialog(false)}>取消</button><button type="button" className="pixel-button modal-done" onClick={insertTable}>插入表格</button></span></>}
    >
      <div className="editor-table-size">
        <label>
          <span>列数</span>
          <input type="number" min="1" max="10" value={tableColumns} onChange={(event) => setTableColumns(Number(event.target.value))} />
        </label>
        <label>
          <span>数据行数</span>
          <input type="number" min="1" max="30" value={tableRows} onChange={(event) => setTableRows(Number(event.target.value))} />
        </label>
      </div>
      <div className="editor-table-preview" aria-hidden="true">
        {Array.from({ length: Math.min(4, Math.max(1, tableRows + 1)) }, (_, row) => (
          <span key={row} className={row === 0 ? "is-header" : undefined}>
            {Array.from({ length: Math.min(6, Math.max(1, tableColumns)) }, (_, column) => <i key={column} />)}
          </span>
        ))}
      </div>
    </GameModal>}

    {insertDialog && <GameModal
      eyebrow="INSERT LINK"
      title="插入链接"
      description="粘贴目标 URL，并补充一段便于识别的链接文字。"
      icon={MINECRAFT_UI_ICONS.link}
      onClose={() => setInsertDialog(null)}
      className="editor-insert-modal"
      footer={<><span className="editor-insert-hint">HTTP · HTTPS</span><span className="editor-insert-actions"><button type="button" className="pixel-button" onClick={() => setInsertDialog(null)}>取消</button><button type="button" className="pixel-button modal-done" disabled={!insertUrl.trim()} onClick={confirmInsert}>插入正文</button></span></>}
    >
      <form className="editor-insert-form" onSubmit={(event) => { event.preventDefault(); confirmInsert(); }}>
        <label>
          <span>目标 URL</span>
          <input ref={insertUrlRef} type="url" inputMode="url" value={insertUrl} onChange={(event) => setInsertUrl(event.target.value)} placeholder="https://example.com/resource" />
        </label>
        <label>
          <span>链接文字</span>
          <input value={insertLabel} onChange={(event) => setInsertLabel(event.target.value)} placeholder="用于正文展示和无障碍阅读" />
        </label>
      </form>
    </GameModal>}
  </div>;
}
