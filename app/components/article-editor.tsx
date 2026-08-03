"use client";

import { useMemo, useRef, useState } from "react";
import type { Section } from "../content-types";
import { GameModal } from "./game-modal";
import { MarkdownRenderer } from "./markdown-renderer";

export type ArticleEditorValue = {
  sectionId: string;
  title: string;
  summary: string;
  tags: string[];
  markdown: string;
};

type EditorSection = Pick<Section, "id" | "label" | "icon">;

const STARTER_MARKDOWN = `## 从这里开始\n\n写下文章正文。编辑内容会在右侧实时渲染。\n\n> 可以使用标题、引用、列表、表格、代码块与 LaTeX 公式。\n`;

export function ArticleEditor({
  mode,
  sections,
  initialValue,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: "new" | "edit";
  sections: EditorSection[];
  initialValue: ArticleEditorValue;
  onCancel: () => void;
  onSave: (value: ArticleEditorValue) => void;
  onDelete?: () => void;
}) {
  const [sectionId, setSectionId] = useState(initialValue.sectionId);
  const [title, setTitle] = useState(initialValue.title);
  const [summary, setSummary] = useState(initialValue.summary);
  const [tags, setTags] = useState(initialValue.tags.join("，"));
  const [markdown, setMarkdown] = useState(initialValue.markdown || STARTER_MARKDOWN);
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedSection = sections.find((section) => section.id === sectionId) ?? sections[0];
  const originalSection = sections.find((section) => section.id === initialValue.sectionId);
  const stats = useMemo(() => {
    const characters = markdown.replace(/\s/g, "").length;
    return { characters, minutes: Math.max(1, Math.ceil(characters / 500)) };
  }, [markdown]);

  const insert = (before: string, after = "", fallback = "文本") => {
    const input = textareaRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = markdown.slice(start, end) || fallback;
    const next = markdown.slice(0, start) + before + selected + after + markdown.slice(end);
    setMarkdown(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const submit = () => {
    if (!title.trim() || !summary.trim()) return;
    onSave({
      sectionId,
      title: title.trim(),
      summary: summary.trim(),
      tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      markdown,
    });
  };

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
        <button type="button" className="editor-save-button" onClick={submit} disabled={!title.trim() || !summary.trim()}>保存文章</button>
      </div>
    </header>

    <div className="editor-mobile-tabs" role="tablist" aria-label="编辑器视图">
      <button type="button" role="tab" aria-selected={mobilePane === "edit"} onClick={() => setMobilePane("edit")}>编辑</button>
      <button type="button" role="tab" aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>预览</button>
    </div>

    <div className={`editor-workspace pane-${mobilePane}`}>
      <section className="editor-form" aria-label="文章内容编辑">
        <div className="editor-field-grid">
          <label className="editor-field">
            <span>归属板块</span>
            <span className="editor-select-wrap">
              <img src={selectedSection?.icon} alt="" />
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
              </select>
            </span>
          </label>
          <label className="editor-field">
            <span>文章标签</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：RAG，性能" />
          </label>
        </div>
        <label className="editor-field">
          <span>文章大标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入文章标题" />
        </label>
        <label className="editor-field">
          <span>文章副标题</span>
          <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="用一句话说明这篇文章" />
        </label>

        <div className="editor-markdown-field">
          <div className="editor-markdown-heading">
            <span>正文 · MARKDOWN</span>
            <small>{stats.characters} 字符 · 约 {stats.minutes} 分钟</small>
          </div>
          <div className="editor-format-bar" role="toolbar" aria-label="Markdown 格式工具">
            <button type="button" onClick={() => insert("## ", "", "小节标题")}>H2</button>
            <button type="button" onClick={() => insert("**", "**", "加粗文本")}><strong>B</strong></button>
            <button type="button" onClick={() => insert("[", "](https://)", "链接文本")}>链接</button>
            <button type="button" onClick={() => insert("`", "`", "代码")}>代码</button>
            <button type="button" onClick={() => insert("> ", "", "引用内容")}>引用</button>
          </div>
          <textarea ref={textareaRef} value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} aria-label="Markdown 正文" />
        </div>
      </section>

      <section className="editor-preview" aria-label="文章实时预览">
        <header className="editor-preview-header">
          <h2>{title || "未命名文章"}</h2>
          <p>{summary || "文章副标题会显示在这里。"}</p>
        </header>
        <MarkdownRenderer markdown={markdown} />
      </section>
    </div>
    {deleteConfirm && onDelete && <GameModal
      eyebrow="DELETE ARTICLE"
title="确认删除这篇文章？"
      description="删除后文章正文和本地修改记录将一并移除，此操作无法撤销。"
      icon="/minecraft/items/redstone.png"
      onClose={() => setDeleteConfirm(false)}
      footer={<><button type="button" className="pixel-button" onClick={() => setDeleteConfirm(false)}>保留文章</button><button type="button" className="pixel-button editor-delete-confirm" onClick={onDelete}>确认删除</button></>}
    >
      <div className="editor-delete-summary"><span>即将删除</span><strong>{initialValue.title}</strong><small>{originalSection?.label}</small></div>
    </GameModal>}
  </div>;
}
