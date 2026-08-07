"use client";

import { useEffect, useRef, type CSSProperties } from "react";

type CubeStyle = CSSProperties & {
  "--cube-size": string;
  "--cube-duration": string;
  "--cube-delay": string;
};

type Bounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

const CUBES = [
  { image: 4, size: 82, depth: 1.35, duration: "6.2s", delay: "-1.1s" },
  { image: 7, size: 45, depth: 0.62, duration: "5.4s", delay: "-3.2s" },
  { image: 6, size: 61, depth: 0.96, duration: "5.1s", delay: "-2.4s" },
  { image: 2, size: 56, depth: 0.9, duration: "4.8s", delay: "-.7s" },
  { image: 1, size: 88, depth: 1.42, duration: "6.6s", delay: "-1.8s" },
  { image: 5, size: 63, depth: 1.02, duration: "5.2s", delay: "-.9s" },
  { image: 3, size: 70, depth: 1.25, duration: "5.8s", delay: "-2.2s" },
] as const;

export function HomeBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const home = backdrop?.parentElement;
    if (!backdrop || !home) return undefined;

    const grid = backdrop.querySelector<HTMLElement>(".home-grid-base");
    const cubes = Array.from(backdrop.querySelectorAll<HTMLElement>(".home-cube"), (element) => ({
      depth: Number.parseFloat(element.dataset.depth ?? "1") || 1,
      element,
    }));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let bounds: Bounds = home.getBoundingClientRect();
    let pointer: { x: number; y: number } | null = null;

    const reset = () => {
      backdrop.style.removeProperty("--spot-x");
      backdrop.style.removeProperty("--spot-y");
      grid?.style.removeProperty("transform");
      cubes.forEach(({ element }) => {
        element.style.removeProperty("transform");
        element.style.removeProperty("--shadow-x");
        element.style.removeProperty("--shadow-y");
      });
    };
    const update = () => {
      frame = 0;
      if (!pointer) return;
      const x = pointer.x - bounds.left;
      const y = pointer.y - bounds.top;
      const normalizedX = Math.max(-0.5, Math.min(0.5, x / Math.max(1, bounds.width) - 0.5));
      const normalizedY = Math.max(-0.5, Math.min(0.5, y / Math.max(1, bounds.height) - 0.5));

      backdrop.style.setProperty("--spot-x", `${x.toFixed(1)}px`);
      backdrop.style.setProperty("--spot-y", `${y.toFixed(1)}px`);
      grid?.style.setProperty("transform", `translate3d(${(-20 * normalizedX).toFixed(1)}px, ${(-16 * normalizedY).toFixed(1)}px, 0)`);
      cubes.forEach(({ depth, element }) => {
        element.style.setProperty("transform", `translate3d(${(-normalizedX * depth * 32).toFixed(1)}px, ${(-normalizedY * depth * 26).toFixed(1)}px, 0)`);
        element.style.setProperty("--shadow-x", `${(5 + normalizedX * depth * 11).toFixed(1)}px`);
        element.style.setProperty("--shadow-y", `${(8 + normalizedY * depth * 9).toFixed(1)}px`);
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || motionPreference.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const handlePointerLeave = () => {
      pointer = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      reset();
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) handlePointerLeave();
    };
    const handleMotionPreference = () => {
      if (motionPreference.matches) handlePointerLeave();
    };
    const resizeObserver = new ResizeObserver(() => {
      bounds = home.getBoundingClientRect();
    });

    resizeObserver.observe(home);
    motionPreference.addEventListener("change", handleMotionPreference);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerOut);
    window.addEventListener("blur", handlePointerLeave);
    return () => {
      resizeObserver.disconnect();
      motionPreference.removeEventListener("change", handleMotionPreference);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", handlePointerLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="home-backdrop" ref={backdropRef} aria-hidden="true">
    <div className="home-grid home-grid-base" />
    <div className="home-grid home-grid-spot" />
    <div className="home-cubes">
      {CUBES.map((cube) => {
        const style = {
          "--cube-size": `${cube.size}px`,
          "--cube-duration": cube.duration,
          "--cube-delay": cube.delay,
        } as CubeStyle;
        return <span className="home-cube" data-depth={cube.depth} style={style} key={cube.image}>
          <img src={`/home/Cube_${cube.image}.png`} alt="" draggable={false} />
        </span>;
      })}
    </div>
  </div>;
}
