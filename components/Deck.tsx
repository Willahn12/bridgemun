"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePinHeader } from "@/components/SiteHeader";

/* The home page is a stack of full-screen scenes. Scrolling, swiping or pressing a key does not move the page:
   it swaps to the next scene, whose contents arrive one after another (see the .slide rules in globals.css).
   A scene taller than the screen scrolls inside itself first, then hands over to the next one. */

const PAUSE = 900; // ms during which further input is ignored, so one gesture moves one scene

/* Can this element, or anything above it inside the deck, still scroll in the direction of dy? */
function canScrollInside(start: EventTarget | null, dy: number, deck: HTMLElement): boolean {
  for (let el = start as HTMLElement | null; el && el !== deck.parentElement; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (dy < 0 && el.scrollTop > 0) return true;
    }
    if (el === deck) break;
  }
  return false;
}

export default function Deck({
  slides,
  labels,
  dark,
  fx,
}: {
  slides: React.ReactNode[];
  labels: string[];
  /** Which scenes have a dark background, so the side dots stay visible on them. */
  dark: boolean[];
  /** How each scene moves as a whole: "up" (default), "zoom" or "side". */
  fx: string[];
}) {
  usePinHeader(true);
  const [index, setIndex] = useState(0);
  const [, choose] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const lockedRef = useRef(false);
  const lastWheelRef = useRef(0);
  const spentRef = useRef(false);
  const touchRef = useRef<{ y: number; target: EventTarget | null } | null>(null);
  const last = slides.length - 1;

  const goTo = useCallback(
    (n: number) => {
      const target = Math.max(0, Math.min(last, n));
      if (target === indexRef.current || lockedRef.current) return;
      lockedRef.current = true;
      indexRef.current = target;
      setIndex(target);
      setTimeout(() => {
        lockedRef.current = false;
      }, PAUSE);
    },
    [last],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.deck = "on";
    const deck = deckRef.current;
    if (!deck) return;

    const busy = () => root.dataset.intro === "on";

    const onWheel = (e: WheelEvent) => {
      if (busy()) return e.preventDefault();
      if (Math.abs(e.deltaY) < 4 || canScrollInside(e.target, e.deltaY, deck)) return;
      e.preventDefault();
      // A trackpad keeps sending events for a second after the fingers lift. Count each swipe once.
      const now = performance.now();
      if (now - lastWheelRef.current > 160) spentRef.current = false;
      lastWheelRef.current = now;
      if (spentRef.current) return;
      spentRef.current = true;
      goTo(indexRef.current + (e.deltaY > 0 ? 1 : -1));
    };

    const onKey = (e: KeyboardEvent) => {
      if (busy() || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const onControl = !!t?.closest("button, a");
      if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !onControl && !e.shiftKey)) goTo(indexRef.current + 1);
      else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && !onControl && e.shiftKey)) goTo(indexRef.current - 1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(last);
      else return;
      e.preventDefault();
    };

    deck.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      delete root.dataset.deck;
      deck.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [goTo, last]);

  // Animations play by default. Anyone can switch them off here, and the choice is remembered.
  const fullMotion = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.dataset.motion === "full",
    () => true,
  );

  return (
    <div
      ref={deckRef}
      className="deck"
      onTouchStart={(e) => {
        touchRef.current = { y: e.touches[0].clientY, target: e.target };
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start || document.documentElement.dataset.intro === "on") return;
        const dy = start.y - e.changedTouches[0].clientY;
        if (Math.abs(dy) < 50 || (deckRef.current && canScrollInside(start.target, dy, deckRef.current))) return;
        goTo(indexRef.current + (dy > 0 ? 1 : -1));
      }}
    >
      {slides.map((node, i) => (
        <section
          key={i}
          className="slide"
          data-state={i === index ? "active" : i < index ? "before" : "after"}
          data-fx={fx[i]}
          aria-label={labels[i]}
          aria-hidden={i !== index}
          inert={i !== index}
        >
          {node}
        </section>
      ))}

      <nav aria-label="Sections" className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 sm:right-5">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-label={`Go to ${label}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => goTo(i)}
            className="group grid size-6 place-items-center"
          >
            <span
              className={`block rounded-full border-2 transition-all duration-300 ${
                dark[index] ? "border-white" : "border-ink"
              } ${i === index ? `h-6 w-2.5 ${dark[index] ? "bg-white" : "bg-ink"}` : "size-2.5 bg-transparent group-hover:scale-125"}`}
            />
          </button>
        ))}
      </nav>

      <button
        type="button"
        aria-pressed={!fullMotion}
        onClick={() => {
          const next = fullMotion ? "off" : "on";
          try {
            localStorage.setItem("bridgemun.motion", next);
          } catch {
            /* the choice just will not be remembered */
          }
          if (next === "on") document.documentElement.dataset.motion = "full";
          else delete document.documentElement.dataset.motion;
          choose((n) => n + 1);
        }}
        className="absolute bottom-4 right-4 z-10 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-muted shadow-[var(--shadow)] transition-colors hover:text-ink"
      >
        {fullMotion ? "Reduce motion" : "Play animations"}
      </button>
    </div>
  );
}
