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
    const frame = event.currentTarget.closest<HTMLElement>(".markdown-image-frame");
    if (!frame) return;
    const parentWidth = frame.parentElement?.clientWidth ?? frame.clientWidth ?? 1;
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

  const caption = alt.trim();
  const frameClassName = `markdown-image-frame${editable ? " is-editable" : ""}${presentation.hasCustomWidth ? " has-custom-width" : ""}`;
  const frameStyle = editable || presentation.hasCustomWidth ? { width: `${presentation.width}%` } : undefined;

  return <span className={frameClassName} style={frameStyle}>
    <span className="markdown-image-visual">
      <img loading="lazy" src={presentation.cleanSrc} alt={alt} style={style} {...props} />
      {editable && <>
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
      </>}
    </span>
    {caption && <span className="markdown-image-caption">{caption}</span>}
  </span>;
}
