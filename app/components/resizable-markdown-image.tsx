"use client";

import { useRef, type ImgHTMLAttributes, type PointerEvent as ReactPointerEvent } from "react";

const WIDTH_FRAGMENT = /#width=(\d{1,3})$/;

function imagePresentation(src: string) {
  const match = WIDTH_FRAGMENT.exec(src);
  const width = match ? Math.max(10, Math.min(100, Number(match[1]))) : 100;
  return { cleanSrc: match ? src.slice(0, match.index) : src, width, hasCustomWidth: Boolean(match) };
}

export function ResizableMarkdownImage({
  src,
  alt,
  editable,
  onWidthChange,
  style,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  editable: boolean;
  onWidthChange?: (src: string, width: number) => void;
}) {
  const presentation = imagePresentation(src);
  const drag = useRef<{ startX: number; startWidth: number; parentWidth: number; direction: -1 | 1; latest: number; frame: HTMLElement } | null>(null);

  const startResize = (direction: -1 | 1, event: ReactPointerEvent<HTMLButtonElement>) => {
    const frame = event.currentTarget.parentElement;
    if (!frame) return;
    const parentWidth = frame?.parentElement?.clientWidth ?? frame?.clientWidth ?? 1;
    drag.current = { startX: event.clientX, startWidth: presentation.width, parentWidth, direction, latest: presentation.width, frame };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = (event.clientX - state.startX) * state.direction;
    const width = Math.round(Math.max(10, Math.min(100, state.startWidth + delta / state.parentWidth * 200)));
    state.latest = width;
    state.frame.style.width = `${width}%`;
  };

  const finishResize = () => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    onWidthChange?.(src, state.latest);
  };

  if (!editable) {
    return <img
      loading="lazy"
      src={presentation.cleanSrc}
      alt={alt}
      style={presentation.hasCustomWidth ? { ...style, width: `${presentation.width}%` } : style}
      {...props}
    />;
  }

  return <span className="markdown-image-frame is-editable" style={{ width: `${presentation.width}%` }}>
    <img loading="lazy" src={presentation.cleanSrc} alt={alt} style={style} {...props} />
    <button
      type="button"
      className="markdown-image-resize-handle is-left"
      aria-label="从左侧调节图片宽度"
      onPointerDown={(event) => startResize(-1, event)}
      onPointerMove={resize}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
    />
    <button
      type="button"
      className="markdown-image-resize-handle is-right"
      aria-label="从右侧调节图片宽度"
      onPointerDown={(event) => startResize(1, event)}
      onPointerMove={resize}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
    />
  </span>;
}
