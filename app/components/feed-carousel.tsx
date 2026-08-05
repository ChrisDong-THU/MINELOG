"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type WheelEvent } from "react";
import type { FeedEntry } from "../content-types";

const MAX_FEED_ENTRIES = 10;
const FEED_ROW_HEIGHT = 64;
const AUTO_SCROLL_DELAY = 3600;
const LOOP_RESET_DELAY = 560;

export function FeedCarousel({
  entries,
  arrow,
  onOpen,
}: {
  entries: FeedEntry[];
  arrow: string;
  onOpen: (entry: FeedEntry) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const lastWheelAtRef = useRef(0);
  const visibleEntries = entries.slice(0, MAX_FEED_ENTRIES);
  const rotating = visibleEntries.length > 3;
  const renderedEntries = rotating ? [...visibleEntries, ...visibleEntries] : visibleEntries;

  const syncPaused = () => {
    pausedRef.current = pointerInsideRef.current || focusInsideRef.current;
  };

  const clearLoopReset = useCallback(() => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  }, []);

  const scrollByRow = useCallback((direction: 1 | -1) => {
    const viewport = viewportRef.current;
    if (!viewport || !rotating) return;

    const loopHeight = visibleEntries.length * FEED_ROW_HEIGHT;
    if (direction < 0 && viewport.scrollTop <= 2) viewport.scrollTop = loopHeight;
    const target = viewport.scrollTop + direction * FEED_ROW_HEIGHT;

    clearLoopReset();
    viewport.scrollTo({ top: target, behavior: "smooth" });
    if (target >= loopHeight) {
      resetTimerRef.current = window.setTimeout(() => {
        if (viewportRef.current) viewportRef.current.scrollTop = Math.max(0, viewportRef.current.scrollTop - loopHeight);
        resetTimerRef.current = null;
      }, LOOP_RESET_DELAY);
    }
  }, [clearLoopReset, rotating, visibleEntries.length]);

  useEffect(() => {
    if (!rotating || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      if (!pausedRef.current) scrollByRow(1);
    }, AUTO_SCROLL_DELAY);
    return () => {
      window.clearInterval(timer);
      clearLoopReset();
    };
  }, [clearLoopReset, rotating, scrollByRow]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!rotating) return;
    event.preventDefault();
    const now = window.performance.now();
    if (now - lastWheelAtRef.current < 140) return;
    lastWheelAtRef.current = now;
    const delta = event.deltaY || event.deltaX;
    if (delta !== 0) scrollByRow(delta > 0 ? 1 : -1);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      focusInsideRef.current = false;
      syncPaused();
    }
  };

  return <div
    ref={viewportRef}
    className={`post-list feed-carousel ${rotating ? "is-rotating" : "is-static"}`}
    data-count={visibleEntries.length}
    tabIndex={rotating ? 0 : undefined}
    aria-label={rotating ? "文章滚动列表，悬停时暂停，可使用鼠标滚轮浏览" : "文章列表"}
    onPointerEnter={() => { pointerInsideRef.current = true; syncPaused(); }}
    onPointerLeave={() => { pointerInsideRef.current = false; syncPaused(); }}
    onFocusCapture={() => { focusInsideRef.current = true; syncPaused(); }}
    onBlurCapture={handleBlur}
    onWheel={handleWheel}
  >
    <div className="feed-track">{renderedEntries.map((entry, index) =>
      <button
        className="post-entry"
        key={`${entry[4] ?? entry[0]}:${entry[1]}:${index}`}
        aria-hidden={rotating && index >= visibleEntries.length ? true : undefined}
        tabIndex={rotating && index >= visibleEntries.length ? -1 : 0}
        onClick={() => onOpen(entry)}
      >
        <span className="entry-copy"><small>{entry[0]} · {entry[2]}</small><strong>{entry[1]}</strong></span>
        <span className="entry-read">{entry[3]} <img className="entry-arrow" src={arrow} alt="" /></span>
      </button>)}</div>
  </div>;
}
