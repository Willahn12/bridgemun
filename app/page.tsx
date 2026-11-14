import Link from "next/link";
import {
  ArrowRight,
  Broadcast,
  Chalkboard,
  GraduationCap,
  MagnifyingGlass,
  Microphone,
  Scales,
} from "@phosphor-icons/react/dist/ssr";
import PlacardStage from "@/components/PlacardStage";
import Deck from "@/components/Deck";
import SpeechStudio from "@/components/SpeechStudio";

const FLOW_COLORS = ["var(--cyan)", "var(--sun)", "var(--coral)", "var(--mint)"];

const FLOW = [
  { verb: "Research", href: "/research", text: "Get a briefing on your country and topic, with sources to check." },
  { verb: "Rehearse", href: "/studio", text: "Dictate your speech, then hear it read back to test the flow." },
  { verb: "Debate", href: "/delegate", text: "Face AI delegates in a session run by a judge, from opening statements to the vote." },
  { verb: "Review", href: "/history", text: "Read your report, get coached, and hand the session in if your teacher set an assignment." },
];

/* Who says what in a session. Each feature speaks for itself, like a delegate. */
const VOICES = [
  {
    who: "Research assistant",
    initial: "R",
    color: "var(--cyan)",
    side: "left",
    text: "Tell me your country, committee and topic. I will brief you on your position, your red lines and likely allies, and where to check every claim.",
    href: "/research",
    cta: "Build a briefing",
  },
  {
    who: "The judge",
    initial: "J",
    color: "var(--sun)",
    side: "right",
    text: "Delegates, take your seats. Opening statements first, then debate, then a vote. Each of you has the floor for about 90 seconds.",
    href: "/delegate",
    cta: "Take the floor",
  },
  {
    who: "Your coach",
    initial: "C",
    color: "var(--mint)",
    side: "left",
    text: "When the session ends I read what you said and show you what to fix first, with exercises to practise before next time.",
    href: "/history",
    cta: "See past chats",
  },
  {
    who: "Your teacher",
    initial: "T",
    color: "var(--coral)",
    side: "right",
    text: "Make a class, share the invite code, set an assignment with a due date, and read each student's report.",
    href: "/org",
    cta: "Set up a class",
  },
] as const;

/* What the site does, in plain words. */
const ICON = { size: 30, weight: "fill", color: "#0c2b4b", "aria-hidden": true } as const;
const FEATURES = [
  {
    title: "Research any country",
    text: "Enter a country, committee and topic. You get its position, its red lines, likely allies, and where to check each claim.",
    color: "var(--cyan)",
    icon: <MagnifyingGlass {...ICON} />,
  },
  {
    title: "Debate AI delegates",
    text: "Practise alone or against a whole committee of AI countries. A judge runs the session and everyone speaks out loud.",
    color: "var(--sun)",
    icon: <Scales {...ICON} />,
  },
  {
    title: "Speak in your own voice",
    text: "Dictate a speech and hear it read back. In online rooms, record yourself and the room hears your real voice.",
    color: "var(--coral)",
    icon: <Microphone {...ICON} />,
  },
  {
    title: "Join live rooms",
    text: "Debate with classmates from your own accounts, with an AI delegate and an AI judge keeping order and time.",
    color: "var(--mint)",
    icon: <Broadcast {...ICON} />,
  },
  {
    title: "Get a report and a coach",
    text: "See scores for clarity, argument and country position, then get coaching on what to fix first, with exercises.",
    color: "var(--sky)",
    icon: <GraduationCap {...ICON} />,
  },
  {
    title: "Run a class",
    text: "Teachers set assignments with due dates and read every report. Students hand in sessions, and the class can chat.",
    color: "var(--sun)",
    icon: <Chalkboard {...ICON} />,
  },
];

/* Sets the order in which things inside a scene arrive. */
const at = (n: number) => ({ "--i": n }) as React.CSSProperties;

const CHIPS = [
  { text: "Research any country", color: "var(--cyan)" },
  { text: "Debate AI delegates out loud", color: "var(--sun)" },
  { text: "Get coached after every session", color: "var(--mint)" },
  { text: "Classes for teachers", color: "var(--coral)" },
];

const LABELS = ["Welcome", "What it does", "Try it", "How it works", "Speech Studio", "The steps", "Get started"];
const DARK = [false, false, false, false, false, false, true];
/* How each scene as a whole arrives and leaves, so they do not all move the same way. */
const FX = ["zoom", "up", "side", "up", "zoom", "side", "zoom"];

export default function Home() {
  const slides = [
    /* 1. The cover: the name and what the site is. */
    <div key="cover" className="relative flex min-h-full flex-col overflow-hidden bg-[radial-gradient(60rem_40rem_at_50%_42%,#ffffff,var(--sky)_92%)]">
      <span data-pop style={at(0)} aria-hidden="true" className="absolute left-[8%] top-[12%] aspect-square w-44 rounded-full bg-[var(--sun)]" />
      <span data-pop style={at(1)} aria-hidden="true" className="absolute right-[10%] top-[20%] aspect-square w-28 rounded-full bg-[var(--cyan)]" />
      <span data-pop style={at(2)} aria-hidden="true" className="absolute bottom-[18%] left-[14%] aspect-square w-24 rounded-full bg-[var(--coral)]" />
      <span data-pop style={at(3)} aria-hidden="true" className="absolute bottom-[14%] right-[12%] aspect-square w-40 rounded-full bg-[var(--mint)]" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <h1 data-anim="zoom" style={at(0)} className="font-display text-6xl font-extrabold tracking-tight sm:text-8xl lg:text-9xl">
          BridgeMUN
        </h1>
        <p data-anim="flip" style={at(1)} className="mt-5 font-display text-3xl font-bold sm:text-5xl">
          Making Model UN possible for everyone around the globe.
        </p>
        <p data-anim="up" style={at(2)} className="mt-7 max-w-[58ch] text-xl leading-relaxed text-muted sm:text-2xl">
          BridgeMUN is a practice room for Model UN. Research any country, debate AI delegates out loud in a session
          run by a judge, and get coached on what to fix next.
        </p>
        <ul data-anim="drop" style={at(3)} className="mt-10 flex flex-wrap justify-center gap-3">
          {CHIPS.map((c) => (
            <li key={c.text} className="rounded-full border-2 border-ink px-5 py-2 text-base font-bold text-ink" style={{ background: c.color }}>
              {c.text}
            </li>
          ))}
        </ul>
        <p data-anim="blur" style={at(4)} className="mt-10 text-base text-muted">
          A LognCoding capstone for Apas Camp Lapu-Lapu Middle School, Cebu.
        </p>
      </div>
    </div>,

    /* 2. What the site does. */
    <div key="does" className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <h2 data-anim="left" style={at(0)} className="max-w-[20ch] text-4xl font-extrabold md:text-6xl">
          What BridgeMUN does
        </h2>
        <p data-anim="right" style={at(1)} className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted">
          Model UN is hard to practise on your own. BridgeMUN gives you the research, the opponents, the judge and the
          feedback, so you can practise any time.
        </p>
        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} data-anim={["left", "flip", "right"][i % 3]} style={at(i + 2)} className="flex gap-4">
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-ink"
                style={{ background: f.color }}
              >
                {f.icon}
              </span>
              <div>
                <h3 className="font-display text-xl font-bold">{f.title}</h3>
                <p className="mt-1 leading-relaxed text-muted">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,

    /* 3. The placard. */
    <div key="try" className="mx-auto grid min-h-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
      <div data-anim="left" style={at(0)}>
        <h2 className="text-5xl font-extrabold leading-[0.98] md:text-6xl lg:text-7xl">Making Model UN possible for everyone around the globe.</h2>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted">
          Research your country, debate AI delegates out loud, and get coached on what to fix. Made for students new
          to Model UN.
        </p>
      </div>
      <div data-anim="right" style={at(1)}>
        <PlacardStage />
      </div>
    </div>,

    /* 4. The conversation. */
    <div key="talk" className="flex min-h-full flex-col bg-sunk">
      <div className="mx-auto grid w-full flex-1 max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <h2 data-anim="drop" style={at(0)} className="max-w-[14ch] text-4xl font-extrabold md:text-6xl">
          What happens when you sit down
        </h2>
        <ul className="space-y-4">
          {VOICES.map((v, n) => {
            const right = v.side === "right";
            return (
              <li key={v.who} data-anim={right ? "right" : "left"} style={at(n + 1)} className={`flex items-end gap-3 ${right ? "flex-row-reverse lg:ml-12" : "lg:mr-12"}`}>
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-lg font-extrabold text-ink"
                  style={{ background: v.color }}
                >
                  {v.initial}
                </span>
                <div
                  className={`max-w-[34rem] border-2 border-ink p-4 text-ink sm:p-5 ${
                    right ? "bubble-right bg-[var(--sky)] shadow-[5px_5px_0_var(--sun)]" : "bubble-left bg-surface shadow-[5px_5px_0_var(--cyan)]"
                  }`}
                >
                  <p className="text-sm font-bold text-accent">{v.who}</p>
                  <p className="mt-1 leading-relaxed">{v.text}</p>
                  <Link href={v.href} className="group mt-2 inline-flex items-center gap-2 font-bold text-accent">
                    {v.cta}
                    <ArrowRight aria-hidden="true" size={16} weight="bold" className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,

    /* 5. Speech Studio. */
    <div key="speech" className="mx-auto grid min-h-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
      <div data-anim="blur" style={at(0)}>
        <h2 className="text-4xl font-extrabold md:text-6xl">Say it out loud before you say it in the room</h2>
        <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-muted">
          Dictate your speech, then hear it read back. It is the fastest way to find the sentences that trip you up.
        </p>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Microphone aria-hidden="true" size={16} /> Dictation works in Chrome, Edge and Safari.
        </p>
      </div>
      <div data-anim="flip" style={at(1)}>
        <SpeechStudio rows={7} />
      </div>
    </div>,

    /* 6. The steps. */
    <div key="steps" className="flex min-h-full flex-col bg-sunk">
      <div className="mx-auto flex w-full flex-1 max-w-6xl flex-col justify-center px-4 py-10 sm:px-6">
        <h2 data-anim="blur" style={at(0)} className="max-w-[22ch] text-4xl font-extrabold md:text-6xl">
          From assignment to the floor of the committee
        </h2>
        <ol className="relative mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <span aria-hidden="true" className="absolute left-0 right-0 top-[17px] hidden h-1.5 rounded-full bg-[var(--sky)] lg:block" />
          {FLOW.map((f, i) => (
            <li key={f.verb} data-anim="drop" style={at(i + 1)}>
              <Link href={f.href} className="group block rounded-[var(--radius-ui)] outline-offset-8">
                <span
                  aria-hidden="true"
                  className="relative z-10 grid size-9 place-items-center rounded-full border-[3px] border-ink text-sm font-extrabold text-ink transition-transform duration-200 group-hover:scale-125"
                  style={{ background: FLOW_COLORS[i] }}
                >
                  {i + 1}
                </span>
                <span className="mt-4 flex items-center gap-2 font-display text-2xl font-bold group-hover:text-accent">
                  {f.verb}
                  <ArrowRight aria-hidden="true" size={20} weight="bold" className="-translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                </span>
                <span className="mt-2 block max-w-[30ch] leading-relaxed text-muted">{f.text}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>,

    /* 7. Take the floor. */
    <div key="go" className="flex min-h-full flex-col bg-[linear-gradient(160deg,#3a8fd9,#1d63ab)] text-white">
      <div className="mx-auto flex w-full flex-1 max-w-4xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <h2 data-anim="zoom" style={at(0)} className="text-5xl font-extrabold leading-[1] md:text-7xl">
          Ready to take the floor?
        </h2>
        <p data-anim="blur" style={at(1)} className="mt-5 max-w-[44ch] text-lg leading-relaxed text-white/90">
          Pick a country, get your briefing, and face your first AI delegate. It takes about ten minutes.
        </p>
        <div data-anim="flip" style={at(2)} className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/research"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-accent shadow-[0_4px_0_rgb(12_43_75_/_0.35)] transition-transform hover:-translate-y-0.5"
          >
            Start researching
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </Link>
          <Link
            href="/delegate"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white px-6 py-3 font-bold transition-colors hover:bg-white/15"
          >
            Meet the delegate
          </Link>
        </div>
        <p data-anim="up" style={at(3)} className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-white/85">
          <Link href="/history" className="hover:underline">Past chats</Link>
          <Link href="/studio" className="hover:underline">Speech Studio</Link>
          <Link href="/org" className="hover:underline">Classes</Link>
          <Link href="/login" className="hover:underline">Sign in</Link>
        </p>
        <p data-anim="up" style={at(4)} className="mt-8 text-sm text-white/75">
          <span translate="no">BridgeMUN</span>, a LognCoding capstone for Apas Camp Lapu-Lapu Middle School.
        </p>
      </div>
    </div>,
  ];

  return (
    <main>
      <Deck slides={slides} labels={LABELS} dark={DARK} fx={FX} />
    </main>
  );
}
