"use client";

import { useEffect, useMemo, useRef, type ComponentProps, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { rehypeKatexSizingCompat } from "../katex-compat";
import { ResizableMarkdownImage } from "./resizable-markdown-image";

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];
export type MarkdownSourceRange = { start: number; end: number };
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

const REMARK_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]> = [remarkGfm, remarkMath];
const BASE_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [rehypeKatex, rehypeKatexSizingCompat];

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
    ...components,
  }), [components, editableImages, onImageWidthChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let disposed = false;
    const fitDisplayMath = () => {
      root.querySelectorAll<HTMLElement>(".katex-display").forEach((display) => {
        const formula = display.querySelector<HTMLElement>(":scope > .katex");
        if (!formula) return;

        formula.style.removeProperty("font-size");
        display.classList.remove("is-scaled");

        const availableWidth = display.clientWidth;
        const naturalWidth = formula.getBoundingClientRect().width;
        if (availableWidth > 0 && naturalWidth > availableWidth) {
          const ratio = availableWidth / naturalWidth;
          formula.style.fontSize = `${1.21 * ratio}em`;
          display.classList.add("is-scaled");
        }
      });
    };

    const scheduleFit = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitDisplayMath);
    };

    scheduleFit();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
    resizeObserver?.observe(root);
    document.fonts?.ready.then(scheduleFit);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [markdown]);

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!onSourceActivate || !(event.target instanceof Element)) return;
    if (event.target.closest("a, button, input, textarea, select")) return;
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
