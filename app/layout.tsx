import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Intro from "@/components/Intro";
import SiteHeader from "@/components/SiteHeader";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-bric",
  subsets: ["latin"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BridgeMUN",
  description:
    "Research any country and topic, then debate an AI delegate out loud. Built for students new to Model UN.",
};

export const viewport: Viewport = {
  themeColor: "#fbfdff",
};

/* Applies a saved theme choice before the first paint, so there is no flash. */
const THEME_INIT = `try{var off=false;try{off=localStorage.getItem("bridgemun.motion")==="off"}catch(e){}if(!off||location.search.indexOf("motion=on")>-1)document.documentElement.dataset.motion="full";if(location.pathname==="/"){document.documentElement.dataset.intro="on";setTimeout(function(){delete document.documentElement.dataset.intro},9000)}}catch(e){}try{var t=localStorage.getItem("bridgemun.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Intro />
        <a
          href="#main"
          className="sr-only rounded-[var(--radius-ui)] bg-accent px-4 py-2 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to main content
        </a>
        <SiteHeader>
          <div className="flex h-16 items-center gap-4 px-4 sm:gap-8 sm:px-8 lg:px-12">
            <Link href="/" data-header-logo translate="no" className="flex shrink-0 items-center gap-2 font-display text-xl font-bold tracking-tight">
              <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 text-accent">
                <path d="M2 21h28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M6 21V8m20 13V8M6 8c5 9 15 9 20 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                <path d="M16 17.2V21" stroke="var(--sun)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              BridgeMUN
            </Link>
            <SiteNav />
          </div>
        </SiteHeader>
        <div id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        <footer className="border-t border-line py-8 text-sm text-muted">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
            <p>
              <span translate="no">BridgeMUN</span>, a LognCoding capstone for Apas Camp Lapu-Lapu Middle School.
            </p>
            <ThemeToggle />
          </div>
        </footer>
      </body>
    </html>
  );
}
