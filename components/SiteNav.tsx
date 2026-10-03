"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDown, ClockCounterClockwise, SignOut } from "@phosphor-icons/react";
import { displayName, signOut, useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/research", short: "Research", long: "Research" },
  { href: "/delegate", short: "Delegate", long: "AI Delegate" },
  { href: "/history", short: "History", long: "Past chats" },
  { href: "/studio", short: "Studio", long: "Speech Studio" },
  { href: "/org", short: "Org", long: "Organization" },
];

/* The signed-in person: their name where Sign in and Register were, with a small menu. */
function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border-2 border-ink bg-surface py-1 pl-1 pr-3 text-sm font-bold transition-colors hover:bg-sunk"
      >
        <span
          aria-hidden="true"
          className="grid size-7 place-items-center rounded-full border-2 border-ink bg-[var(--sun)] font-display text-sm font-extrabold text-[#0c2b4b]"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[9rem] truncate">{name}</span>
        <CaretDown aria-hidden="true" size={14} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-[var(--radius-ui)] border-2 border-ink bg-surface p-1.5 shadow-[4px_4px_0_var(--cyan)]"
        >
          <Link
            href="/history"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-sunk"
          >
            <ClockCounterClockwise aria-hidden="true" size={18} /> Past chats
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-sunk"
          >
            <SignOut aria-hidden="true" size={18} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  const { user, ready } = useAuth();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
      {/* The pages, in the middle. */}
      <nav aria-label="Main" className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto text-sm">
        {LINKS.map(({ href, short, long }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-[var(--radius-ui)] px-2.5 py-2 transition-colors sm:px-3 ${
                active ? "bg-sunk font-semibold text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{long}</span>
            </Link>
          );
        })}
      </nav>

      {/* A line sections off the account area, which sits at the far right. */}
      <span aria-hidden="true" className="h-7 w-0.5 shrink-0 rounded-full bg-ink/30" />
      <div className="flex shrink-0 items-center gap-2 text-sm">
        {!ready ? (
          <span className="block h-9 w-28" aria-hidden="true" />
        ) : user ? (
          <AccountMenu name={displayName(user)} />
        ) : (
          <>
            <Link
              href="/login"
              className={`rounded-full border-2 border-ink px-4 py-1.5 font-bold transition-colors hover:bg-sunk ${
                pathname === "/login" ? "bg-sunk" : "bg-surface"
              }`}
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary !px-4 !py-1.5">
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
