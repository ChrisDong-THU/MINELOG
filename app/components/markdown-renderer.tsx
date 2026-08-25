"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { rehypeKatexSizingCompat } from "../katex-compat";
import { markdownCodeLineRange, type MarkdownSourceRange } from "../markdown-source-range";
import { remarkTyporaMath } from "../remark-typora-math";
import { ResizableMarkdownImage } from "./resizable-markdown-image";

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];
export type { MarkdownSourceRange } from "../markdown-source-range";
type PositionedHastNode = {
  type?: string;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  properties?: Record<string, unknown>;
  children?: PositionedHastNode[];
};

function rehypeSourcePositions() {
  return (tree: PositionedHastNode) => {
    const visit = (node: PositionedHastNode) => {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (node.type === "element" && typeof start === "number" && typeof end === "number") {
        node.properties ??= {};
        node.properties["data-source-start"] = start;
        node.properties["data-source-end"] = end;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const REMARK_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]> = [remarkGfm, remarkMath, remarkTyporaMath];
const BASE_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [
  [rehypeHighlight, {
    aliases: {
      bash: ["sh", "shell", "zsh"],
      javascript: ["js", "jsx"],
      markdown: ["md"],
      plaintext: ["text", "txt"],
      typescript: ["ts", "tsx"],
    },
    detect: true,
    plainText: ["text", "txt", "plaintext"],
    subset: ["bash", "c", "cpp", "csharp", "css", "go", "java", "javascript", "json", "markdown", "python", "rust", "sql", "typescript", "xml", "yaml"],
  }],
  rehypeKatex,
  rehypeKatexSizingCompat,
];

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  python: "Python",
  py: "Python",
  rust: "Rust",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

function codeBlockLanguage(children: ReactNode) {
  const code = Children.toArray(children).find((child) => isValidElement<{ className?: string }>(child));
  const className = isValidElement<{ className?: string }>(code) ? code.props.className : undefined;
  const language = className?.match(/(?:^|\s)language-([\w-]+)/)?.[1]?.toLowerCase() ?? "text";
  return { language, label: CODE_LANGUAGE_LABELS[language] ?? language.toUpperCase() };
}
async function writeCodeToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Clipboard request timed out")), 700);
        navigator.clipboard.writeText(text).then(
          () => {
            clearTimeout(timeout);
            resolve();
          },
          (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      });
      return;
    } catch {
      // Fall through to the selection-based copy path for restricted browsers.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;inset:0 auto auto -9999px;opacity:0";
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("Unable to copy code");
}
function MarkdownCodeBlock({
  children,
  language,
  label,
  ...props
}: ComponentProps<"pre"> & { language: string; label: string }) {
  const preRef = useRef<HTMLPreElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copyCode = async () => {
    const code = preRef.current?.textContent;
    if (code === undefined) return;

    setCopyState("copying");
    try {
      await writeCodeToClipboard(code.replace(/\r?\n$/, ""));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  };

  const copyLabel = copyState === "copied" ? "\u4ee3\u7801\u5df2\u590d\u5236" : copyState === "error" ? "\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5" : copyState === "copying" ? "\u6b63\u5728\u590d\u5236" : "\u590d\u5236\u4ee3\u7801";
  return <div className="markdown-code-block" data-language={language}>
    <div className="markdown-code-header">
      <span className="markdown-code-language">{label}</span>
      <button className="markdown-code-copy" type="button" aria-label={copyLabel} title={copyLabel} data-copy-state={copyState} onClick={copyCode}>
        <span aria-hidden="true" />
      </button>
    </div>
    <pre ref={preRef} {...props}>{children}</pre>
    <span className="markdown-code-copy-feedback" aria-live="polite">{copyState === "copied" ? "\u4ee3\u7801\u5df2\u590d\u5236" : copyState === "error" ? "\u590d\u5236\u5931\u8d25" : copyState === "copying" ? "\u6b63\u5728\u590d\u5236" : ""}</span>
  </div>;
}

export function MarkdownRenderer({
  markdown,
  components,
  className = "",
  editableImages = false,
  onImageWidthChange,
  onSourceActivate,
}: {
  markdown: string;
  components?: MarkdownComponents;
  className?: string;
  editableImages?: boolean;
  onImageWidthChange?: (src: string, width: number) => void;
  onSourceActivate?: (range: MarkdownSourceRange) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const rehypePlugins = useMemo<NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>>(
    () => onSourceActivate ? [rehypeSourcePositions, ...BASE_REHYPE_PLUGINS] : BASE_REHYPE_PLUGINS,
    [onSourceActivate],
  );
  const markdownComponents = useMemo<MarkdownComponents>(() => ({
    a: ({ href, children, ...props }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined} {...props}>{children}</a>,
    img: ({ alt, src, ...props }) => {
      const imageSource = typeof src === "string" ? src : undefined;
      const video = alt?.match(/^video(?::\s*(.*))?$/i);
      if (video) {
        const label = video[1]?.trim() || "正文视频";
        return <figure className="markdown-video">
          <video controls preload="metadata" src={imageSource} aria-label={label}>当前浏览器无法播放此视频。</video>
          {video[1] && <figcaption>{label}</figcaption>}
        </figure>;
      }
      if (!imageSource) return null;
      return <ResizableMarkdownImage
        src={imageSource}
        alt={alt ?? ""}
        editable={editableImages}
        onWidthChange={onImageWidthChange}
        {...props}
      />;
    },
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
    pre: ({ children, node, ...props }) => {
      void node;
      const { language, label } = codeBlockLanguage(children);
      return <MarkdownCodeBlock language={language} label={label} {...props}>{children}</MarkdownCodeBlock>;
    },
    ...components,
  }), [components, editableImages, onImageWidthChange]);

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!onSourceActivate || !(event.target instanceof Element)) return;
    if (event.target.closest("a, button, input, textarea, select")) return;
    const codeBlock = event.target.closest<HTMLElement>(".markdown-code-block pre");
    const code = codeBlock?.querySelector<HTMLElement>("code");
    if (codeBlock && code && rootRef.current?.contains(codeBlock)) {
      const start = Number(codeBlock.dataset.sourceStart);
      const end = Number(codeBlock.dataset.sourceEnd);
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start) {
        const lineHeight = Number.parseFloat(getComputedStyle(code).lineHeight);
        const codeTop = code.getBoundingClientRect().top;
        const renderedLineIndex = Number.isFinite(lineHeight) && lineHeight > 0
          ? Math.floor(Math.max(0, event.clientY - codeTop) / lineHeight)
          : 0;
        const lineRange = markdownCodeLineRange(markdown, { start, end }, renderedLineIndex);
        if (lineRange) {
          event.preventDefault();
          onSourceActivate(lineRange);
          return;
        }
      }
    }
    const source = event.target.closest<HTMLElement>("[data-source-start][data-source-end]");
    if (!source || !rootRef.current?.contains(source)) return;
    const start = Number(source.dataset.sourceStart);
    const end = Number(source.dataset.sourceEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return;
    event.preventDefault();
    onSourceActivate({ start, end });
  };

  const sourceClassName = onSourceActivate ? " is-source-navigable" : "";
  return <article
    ref={rootRef}
    className={`reader-paper markdown-body science-article ${className}${sourceClassName}`.trim()}
    onDoubleClick={handleDoubleClick}
  >
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >{markdown}</ReactMarkdown>
  </article>;
}
