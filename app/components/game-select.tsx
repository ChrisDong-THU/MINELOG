"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "../browser-storage";

export type GameSelectOption = {
  value: string;
  label: string;
  icon?: string;
};

type PopupPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  opensUp: boolean;
};

export function GameSelect({
  value,
  options,
  onChange,
  ariaLabel,
  size = "regular",
}: {
  value: string;
  options: GameSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: "compact" | "regular";
}) {
  const [open, setOpen] = useState(false);
  const portalReady = useHydrated();
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ left: 0, top: 0, width: 0, maxHeight: 220, opensUp: false });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selected = options[selectedIndex];

  const positionPopup = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const viewportGap = 8;
    const popupGap = 4;
    const availableBelow = window.innerHeight - bounds.bottom - viewportGap - popupGap;
    const availableAbove = bounds.top - viewportGap - popupGap;
    const opensUp = availableBelow < 180 && availableAbove > availableBelow;
    const availableHeight = Math.max(48, opensUp ? availableAbove : availableBelow);
    const width = Math.min(bounds.width, window.innerWidth - viewportGap * 2);
    const left = Math.min(Math.max(viewportGap, bounds.left), window.innerWidth - viewportGap - width);

    setPopupPosition({
      left,
      width,
      top: opensUp ? undefined : bounds.bottom + popupGap,
      bottom: opensUp ? window.innerHeight - bounds.top + popupGap : undefined,
      maxHeight: Math.min(220, availableHeight),
      opensUp,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    };
    const reposition = () => positionPopup();
    document.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open, positionPopup]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = optionsRef.current;
      const option = optionRefs.current[activeIndex];
      if (!list || !option) return;
      const optionTop = option.offsetTop - list.offsetTop;
      const optionBottom = optionTop + option.offsetHeight;
      const visibleHeight = Math.min(list.scrollHeight, popupPosition.maxHeight);
      if (optionTop < list.scrollTop) list.scrollTop = optionTop;
      else if (optionBottom > list.scrollTop + visibleHeight) list.scrollTop = optionBottom - visibleHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, open, popupPosition.maxHeight]);

  const openMenu = () => {
    if (options.length === 0) return;
    setActiveIndex(selectedIndex);
    positionPopup();
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    setActiveIndex(index);
    setOpen(false);
    onChange(option.value);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const move = (direction: -1 | 1) => {
    if (!open) {
      openMenu();
      return;
    }
    setActiveIndex((index) => (index + direction + options.length) % options.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else openMenu();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") setOpen(false);
  };

  const popupStyle: CSSProperties = {
    left: popupPosition.left,
    width: popupPosition.width,
    top: popupPosition.top,
    bottom: popupPosition.bottom,
  };

  const popup = portalReady ? createPortal(<div
    ref={popupRef}
    className={`game-select__popup game-select__popup--${size}${open ? " is-open" : ""}${popupPosition.opensUp ? " is-up" : ""}`}
    style={popupStyle}
    aria-hidden={!open}
    inert={!open}
  >
    <div className="game-select__popup-inner">
      <div ref={optionsRef} id={listboxId} className="game-select__options" role="listbox" aria-label={ariaLabel} style={{ maxHeight: popupPosition.maxHeight }}>
        {options.map((option, index) => <button
          key={option.value}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          ref={(element) => { optionRefs.current[index] = element; }}
          tabIndex={-1}
          aria-selected={option.value === value}
          className={index === activeIndex ? "is-active" : undefined}
          onPointerDown={(event) => event.preventDefault()}
          onPointerEnter={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        >
          {option.icon && <img src={option.icon} alt="" />}
          <span>{option.label}</span>
          <i aria-hidden="true">{option.value === value ? "✓" : ""}</i>
        </button>)}
      </div>
    </div>
  </div>, document.body) : null;

  return <>
    <div ref={rootRef} className={`game-select game-select--${size}${open ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="game-select__trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={options.length === 0}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
      >
        {selected?.icon && <img src={selected.icon} alt="" />}
        <span>{selected?.label ?? "暂无可选项"}</span>
        <i aria-hidden="true" />
      </button>
    </div>
    {popup}
  </>;
}