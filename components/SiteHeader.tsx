"use client";

import { useEffect, useState } from "react";

/* Chat screens call this so the header stays put while the conversation scrolls in its own box. */
export function usePinHeader(on = true) {
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.dataset.pinHeader = "true";
    window.dispatchEvent(new Event("pinheader"));
    return () => {
      delete root.dataset.pinHeader;
    };
  }, [on]);
}

/* Slides away when you scroll down the page and comes back when you scroll up. */
export default function SiteHeader({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (document.documentElement.dataset.pinHeader || y < 80) setHidden(false);
      else if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
    };
    const show = () => setHidden(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pinheader", show);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pinheader", show);
    };
  }, []);

  return (
    <header
      onFocusCapture={() => setHidden(false)}
      className={`sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur transition-transform duration-200 motion-reduce:transition-none ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {children}
    </header>
  );
}
