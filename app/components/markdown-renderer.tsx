"use client";

import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { rehypeKatexSizingCompat } from "../katex-compat";
import { ResizableMarkdownImage } from "./resizable-markdown-image";

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];
const REMARK_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]> = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [rehypeKatex, rehypeKatexSizingCompat];

export function MarkdownRenderer({
  markdown,
  components,
  className = "",
  editableImages = false,
  onImageWidthChange,
}: {
  markdown: string;
  components?: MarkdownComponents;
  className?: string;
  editableImages?: boolean;
  onImageWidthChange?: (src: string, width: number) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
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

  return <article ref={rootRef} className={`reader-paper markdown-body science-article ${className}`.trim()}>
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={markdownComponents}
    >{markdown}</ReactMarkdown>
  </article>;
}
