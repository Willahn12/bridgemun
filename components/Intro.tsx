"use client";

import { useEffect, useRef, useState } from "react";

const MOTTO = "Making Model UN possible for everyone around the globe.";

/* Plays once each time the home page is opened or reloaded. An inline script in the layout sets
   data-intro on <html> before the first paint, which locks scrolling and hides the header logo.
   Here the logo pops up, the motto types itself out, and the logo flies to its place in the header.
   Any click, key or scroll skips ahead. */
export default function Intro() {
  const [typed, setTyped] = useState(0);
  const [fly, setFly] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const flyingRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro !== "on") return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let typing: ReturnType<typeof setInterval> | undefined;

    const finish = () => {
      delete root.dataset.intro;
      setGone(true);
    };

    const takeOff = () => {
      if (flyingRef.current) return;
      flyingRef.current = true;
      if (typing) clearInterval(typing);
      setTyped(MOTTO.length);
      const from = logoRef.current?.getBoundingClientRect();
      const to = document.querySelector("[data-header-logo]")?.getBoundingClientRect();
      if (from && to && root.dataset.motion === "full") {
        const s = to.width / from.width;
        setFly(`translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`);
        timers.push(setTimeout(finish, 950));
      } else {
        // Reduced motion: the screen simply fades away.
        setFly("none");
        timers.push(setTimeout(finish, 650));
      }
    };

    timers.push(
      setTimeout(() => {
        let n = 0;
        typing = setInterval(() => {
          n += 1;
          setTyped(n);
          if (n >= MOTTO.length) {
            clearInterval(typing);
            timers.push(setTimeout(takeOff, 900));
          }
        }, 45);
      }, 800),
    );

    const skip = () => takeOff();
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });
    return () => {
      timers.forEach(clearTimeout);
      if (typing) clearInterval(typing);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
    };
  }, []);

  if (gone) return null;

  return (
    <div className="intro" aria-hidden="true" data-flying={fly ? "true" : "false"}>
      <div className="intro-bg">
        <span className="intro-blob" style={{ background: "var(--sun)", left: "8%", top: "14%", width: "9rem" }} />
        <span className="intro-blob" style={{ background: "var(--cyan)", right: "10%", top: "22%", width: "6rem" }} />
        <span className="intro-blob" style={{ background: "var(--coral)", left: "16%", bottom: "16%", width: "5rem" }} />
        <span className="intro-blob" style={{ background: "var(--mint)", right: "14%", bottom: "12%", width: "8rem" }} />
      </div>
      <div className="intro-stage">
        <div
          ref={logoRef}
          className="intro-logo"
          style={fly ? { transform: fly } : undefined}
        >
          <div className="intro-pop flex items-center gap-[0.4em] font-display text-5xl font-bold tracking-tight sm:text-7xl">
            <svg viewBox="0 0 32 32" className="size-[1.4em] text-accent">
              <path d="M2 21h28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path d="M6 21V8m20 13V8M6 8c5 9 15 9 20 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              <path d="M16 17.2V21" stroke="var(--sun)" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <span translate="no">BridgeMUN</span>
          </div>
        </div>
        <p className="intro-motto font-display text-xl font-semibold sm:text-3xl">
          {MOTTO.slice(0, typed)}
          <span className="intro-caret" />
        </p>
      </div>
    </div>
  );
}
