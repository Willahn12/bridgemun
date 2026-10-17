"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CalendarBlank, Clock, Globe, Lock, MagnifyingGlass, Plus, Robot, UsersThree, X } from "@phosphor-icons/react";
import PageHero from "@/components/PageHero";
import Flag from "@/components/Flag";
import { canonicalCountry } from "@/components/countries";
import CountryInput from "@/components/CountryInput";
import { useAuth } from "@/lib/auth";
import {
  createRoom,
  findRoomByCode,
  friendlyRoomError,
  joinRoom,
  listPublicRooms,
  MAX_SEATS,
  MIN_SEATS,
  openSeats,
  type PublicRoom,
  type Room,
  type Seat,
} from "@/lib/rooms";
import { toneStyle } from "@/lib/tone";

type Tab = "find" | "host" | "join";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

/** "Starts today at 3:30 PM", "Starts Sat 18 Oct, 9:00 AM", or "Starts when the host is ready". */
/** "30 min", "Ends 4:00 PM", or "No end time". */
export function endLabel(durationMin: number | null, endAt: string | null): string {
  if (endAt) return `Ends ${new Date(endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return durationMin ? `${durationMin} min` : "No end time";
}

export function startLabel(iso: string | null): string {
  if (!iso) return "Starts when the host is ready";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Starts today at ${time}`;
  return `Starts ${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/* The example list from the client's brief. */
const DEFAULT_SEATS: Seat[] = ["South Korea", "China", "Japan", "United States", "France"].map((country) => ({ country, ai: false }));

/** Seats, people joined, AI and open, in one line. */
function SeatSummary({ seats, taken, players }: { seats: Seat[]; taken: string[]; players: number }) {
  const ai = seats.filter((s) => s.ai).length;
  const open = openSeats(seats, taken.map((country) => ({ country }))).length;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-display text-lg font-bold">
        {players} / {seats.length - ai} joined
      </span>
      <span className="text-muted">
        {seats.length} countries · {ai} AI · {open} open
      </span>
    </p>
  );
}

export default function RoomLandingPage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  const [tab, setTab] = useState<Tab>("find");
  const [committee, setCommittee] = useState("");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS);
  const [newSeat, setNewSeat] = useState("");
  const [hostSeat, setHostSeat] = useState<string>(""); // "" = moderate without a seat
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [endMode, setEndMode] = useState<"30" | "60" | "at" | "none">("30");
  const [endAtLocal, setEndAtLocal] = useState("");
  const [lateJoin, setLateJoin] = useState(false);
  const [judge, setJudge] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState("");
  const [joinCountry, setJoinCountry] = useState("");
  const [found, setFound] = useState<{ room: Room; open: Seat[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ form: string; message: string } | null>(null);

  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [countryFor, setCountryFor] = useState<Record<string, string>>({});

  const userId = user?.id;

  /* The list of public rooms, refreshed every few seconds while it is showing. */
  useEffect(() => {
    if (!userId || tab !== "find") return;
    let cancelled = false;
    listPublicRooms()
      .then((r) => {
        if (cancelled) return;
        setRooms(r);
        setListError(null);
      })
      .catch((e) => {
        if (!cancelled) setListError(friendlyRoomError(e instanceof Error ? e.message : "Could not load rooms."));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tab, tick]);

  useEffect(() => {
    if (!userId || tab !== "find") return;
    const t = setInterval(() => setTick((n) => n + 1), 8000);
    return () => clearInterval(t);
  }, [userId, tab]);

  async function run(form: string, action: () => Promise<string>) {
    setBusy(form);
    setError(null);
    try {
      router.push(`/room/${await action()}`);
    } catch (e) {
      setError({ form, message: friendlyRoomError(e instanceof Error ? e.message : "Something went wrong") });
      setBusy(null);
    }
  }

  if (!ready) return <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6" />;

  if (!user) {
    return (
      <main style={toneStyle("room")}>
        <PageHero kind="room" title="Online room">
          <p>Everyone joins the same session from their own computer, with AI delegates and a judge. You need an account first.</p>
        </PageHero>
        <div className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 py-10 sm:px-6">
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/signup" className="btn">
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  const humanSeats = seats.filter((s) => !s.ai);
  const startMs = when === "later" && startsAt ? Date.parse(startsAt) : null;
  const problem =
    seats.length < MIN_SEATS
      ? `Add at least ${MIN_SEATS} countries.`
      : seats.length > MAX_SEATS
        ? `A forum can have at most ${MAX_SEATS} countries.`
        : when === "later" && !startMs
          ? "Choose the date and time it starts."
          : endMode === "at" && !endAtLocal
            ? "Choose the time it ends."
            : null;
  const canCreate = committee.trim().length >= 2 && topic.trim().length >= 2 && seats.length >= MIN_SEATS;

  function addSeat(typed = newSeat) {
    const country = canonicalCountry(typed);
    if (country.length < 2) return;
    if (seats.some((s) => s.country.toLowerCase() === country.toLowerCase())) {
      setError({ form: "create", message: `${country} is already in the list.` });
      return;
    }
    if (seats.length >= MAX_SEATS) {
      setError({ form: "create", message: `A forum can have at most ${MAX_SEATS} countries.` });
      return;
    }
    setSeats([...seats, { country, ai: false }]);
    setNewSeat("");
    setError(null);
  }

  function toggleAi(country: string) {
    setSeats(seats.map((s) => (s.country === country ? { ...s, ai: !s.ai } : s)));
    if (hostSeat === country) setHostSeat("");
  }

  const tabs: [Tab, string, number | null][] = [
    ["find", "Find a room", rooms?.length ?? null],
    ["host", "Create a forum", null],
    ["join", "Join with a code", null],
  ];

  return (
    <main style={toneStyle("room")}>
      <PageHero kind="room" title="Online room">
        <p>
          A live forum over the internet. Everyone joins from their own account and takes a country; AI delegates fill
          the rest. The judge draws the speaking order: opening statements, debate until time is nearly up, closing
          statements, with floor votes along the way.
        </p>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div role="tablist" aria-label="Online room" className="flex flex-wrap gap-2">
          {tabs.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setError(null);
              }}
              className={`rounded-full border-2 border-ink px-5 py-2 text-sm font-bold transition-all ${
                tab === key ? "bg-[var(--tone)] shadow-[3px_3px_0_var(--ink)]" : "bg-surface hover:-translate-y-0.5"
              }`}
            >
              {label}
              {n !== null && <span className="ml-1.5 font-mono text-xs">{n}</span>}
            </button>
          ))}
        </div>

        {/* ---------- Find a public room ---------- */}
        {tab === "find" && (
          <section className="mt-8" aria-labelledby="find-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="find-title" className="font-display text-2xl font-bold">
                  Public forums you can join
                </h2>
                <p className="mt-1 text-muted">Anyone can join until the host starts, or later if the host allows late joining.</p>
              </div>
              <button type="button" className="btn" onClick={() => setTick((n) => n + 1)}>
                <ArrowsClockwise aria-hidden="true" size={16} /> Refresh
              </button>
            </div>

            {listError && (
              <p role="alert" className="tone-card mt-6 p-4 text-sm text-danger">
                {listError}
              </p>
            )}
            {!listError && rooms === null && (
              <div className="mt-6 grid gap-5 md:grid-cols-2" aria-label="Loading rooms">
                {[0, 1].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-[var(--radius-ui)] bg-sunk" />
                ))}
              </div>
            )}
            {!listError && rooms?.length === 0 && (
              <div className="tone-card mt-6 p-6">
                <p className="font-display text-xl font-bold">No public rooms right now.</p>
                <p className="mt-1 max-w-[56ch] text-muted">
                  Be the first: host a public room and others will see it here. Or join a private room with its code.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primary" onClick={() => { setIsPublic(true); setTab("host"); }}>
                    Host a public room
                  </button>
                  <button type="button" className="btn" onClick={() => setTab("join")}>
                    I have a code
                  </button>
                </div>
              </div>
            )}
            {!listError && rooms && rooms.length > 0 && (
              <ul className="mt-6 grid gap-5 md:grid-cols-2">
                {rooms.map((r) => {
                  const mine = countryFor[r.id] ?? "";
                  return (
                    <li key={r.id} className="tone-card flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-xl font-bold leading-tight">{r.topic}</p>
                          <p className="mt-0.5 text-sm text-muted">{r.committee}</p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-[var(--mint)] px-2.5 py-0.5 text-xs font-bold">
                          <Globe aria-hidden="true" size={14} weight="bold" /> Public
                        </span>
                      </div>
                      {r.subtopic && <p className="mt-1 text-sm font-medium">Subtopic: {r.subtopic}</p>}
                      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                        <span className="flex items-center gap-1.5">
                          <CalendarBlank aria-hidden="true" size={16} /> {r.live ? "Started" : startLabel(r.startsAt)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock aria-hidden="true" size={16} /> {endLabel(r.durationMin, r.endAt)}
                        </span>
                        {r.live && <span className="font-semibold text-danger">Live now · late joining open</span>}
                        {r.judge && <span>AI judge</span>}
                      </p>
                      {r.seats ? (
                        <div className="mt-3">
                          <SeatSummary seats={r.seats} taken={r.taken} players={r.players} />
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Countries in this forum">
                            {r.seats.map((seat) => {
                              const takenBy = r.taken.some((t) => t.toLowerCase() === seat.country.toLowerCase());
                              return (
                                <li
                                  key={seat.country}
                                  title={`${seat.country}: ${seat.ai ? "AI" : takenBy ? "taken" : "open"}`}
                                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                                    seat.ai ? "border-line bg-sunk" : takenBy ? "border-ink bg-surface font-semibold" : "border-dashed border-line"
                                  }`}
                                >
                                  <Flag country={seat.country} className="h-3 w-4" />
                                  {seat.country}
                                  {seat.ai && <span className="text-muted">AI</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 flex flex-wrap gap-1.5 text-sm">
                            {r.aiCountries.map((c) => (
                              <span key={c} className="rounded-full bg-sunk px-2.5 py-0.5 font-medium">
                                {c} <span className="text-xs text-muted">AI</span>
                              </span>
                            ))}
                          </p>
                          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                            <UsersThree aria-hidden="true" size={16} /> {r.players} joined
                          </p>
                        </>
                      )}
                      <p className="mt-2 text-xs text-muted">
                        Hosted by {r.hostName}, {ago(r.createdAt)}
                      </p>
                      <form
                        className="mt-4 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(`find-${r.id}`, () => joinRoom(r.code, mine));
                        }}
                      >
                        <label htmlFor={`c-${r.id}`} className="sr-only">
                          The country you represent
                        </label>
                        {r.seats ? (
                          <select
                            id={`c-${r.id}`}
                            className="field min-w-0 flex-1"
                            value={mine}
                            onChange={(e) => setCountryFor({ ...countryFor, [r.id]: e.target.value })}
                          >
                            <option value="">
                              {openSeats(r.seats, r.taken.map((country) => ({ country }))).length ? "Choose your country…" : "No open seats"}
                            </option>
                            {openSeats(r.seats, r.taken.map((country) => ({ country }))).map((seat) => (
                              <option key={seat.country} value={seat.country}>
                                {seat.country}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`c-${r.id}`}
                            className="field min-w-0 flex-1"
                            maxLength={100}
                            autoComplete="off"
                            placeholder="Your country (optional)"
                            value={mine}
                            onChange={(e) => setCountryFor({ ...countryFor, [r.id]: e.target.value })}
                          />
                        )}
                        <button type="submit" disabled={busy !== null || (!!r.seats && !mine)} className="btn btn-primary">
                          {busy === `find-${r.id}` ? "Joining…" : "Join"}
                        </button>
                      </form>
                      {error?.form === `find-${r.id}` && (
                        <p role="alert" className="mt-3 text-sm text-danger">
                          {error.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ---------- Host a room ---------- */}
        {tab === "host" && (
          <form
            className="tone-card mx-auto mt-8 max-w-2xl p-5 sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              if (problem) return setError({ form: "create", message: problem });
              if (startMs && startMs < Date.now() - 60000) return setError({ form: "create", message: "Choose a start time in the future." });
              const endMs = endMode === "at" ? Date.parse(endAtLocal) : null;
              if (endMs && endMs < (startMs ?? Date.now()) + 10 * 60000)
                return setError({ form: "create", message: "The end time must be at least 10 minutes after it starts." });
              run("create", () =>
                createRoom({
                  committee,
                  topic,
                  subtopic,
                  seats,
                  hostSeat: hostSeat || null,
                  judge,
                  isPublic,
                  startsAt: startMs ? new Date(startMs).toISOString() : null,
                  durationMin: endMode === "30" || endMode === "60" ? Number(endMode) : null,
                  endAt: endMs ? new Date(endMs).toISOString() : null,
                  lateJoin,
                }),
              );
            }}
          >
            <h2 className="font-display text-2xl font-bold">Create a forum</h2>
            <div className="mt-5 grid gap-5">
              <fieldset>
                <legend className="label">Who can find this room?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      [false, "Private", "Only people you give the code to can join.", Lock, "var(--sun)"],
                      [true, "Public", "Listed under Find a room. Anyone signed in can join until you start, or later with late joining.", Globe, "var(--mint)"],
                    ] as const
                  ).map(([value, name, text, Icon, color]) => (
                    <label
                      key={name}
                      className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-ui)] border-2 border-ink p-4 transition-all ${
                        isPublic === value ? "shadow-[4px_4px_0_var(--ink)]" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ background: isPublic === value ? color : "var(--surface)" }}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        className="sr-only"
                        checked={isPublic === value}
                        onChange={() => setIsPublic(value)}
                      />
                      <Icon aria-hidden="true" size={26} weight="fill" color="#0c2b4b" className="mt-0.5 shrink-0" />
                      <span className="text-[#0c2b4b]">
                        <span className="block font-display text-lg font-bold">{name}</span>
                        <span className="block text-sm leading-snug">{text}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="r-committee" className="label">Committee</label>
                <input id="r-committee" name="committee" autoComplete="off" className="field" maxLength={200} value={committee} placeholder="UN Environment Assembly…" onChange={(e) => setCommittee(e.target.value)} />
              </div>
              <div>
                <label htmlFor="r-topic" className="label">Topic</label>
                <input id="r-topic" name="topic" autoComplete="off" className="field" maxLength={200} value={topic} placeholder="Climate change…" onChange={(e) => setTopic(e.target.value)} />
              </div>
              <div>
                <label htmlFor="r-subtopic" className="label">
                  Subtopic <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="r-subtopic" name="subtopic" autoComplete="off" className="field" maxLength={200} value={subtopic} placeholder="Sea-level rise…" onChange={(e) => setSubtopic(e.target.value)} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <fieldset>
                  <legend className="label">When does it start?</legend>
                  <div className="flex gap-2">
                    {(
                      [
                        ["now", "When I'm ready"],
                        ["later", "At a set time"],
                      ] as const
                    ).map(([value, name]) => (
                      <label
                        key={value}
                        className={`flex-1 cursor-pointer rounded-full border-2 border-ink px-3 py-2 text-center text-sm font-bold transition-all ${
                          when === value ? "bg-[var(--tone)] shadow-[3px_3px_0_var(--ink)]" : "bg-surface opacity-70 hover:opacity-100"
                        }`}
                      >
                        <input type="radio" name="when" className="sr-only" checked={when === value} onChange={() => setWhen(value)} />
                        {name}
                      </label>
                    ))}
                  </div>
                  {when === "later" && (
                    <>
                      <label htmlFor="r-starts" className="sr-only">
                        Start date and time
                      </label>
                      <input
                        id="r-starts"
                        type="datetime-local"
                        className="field mt-2"
                        value={startsAt}
                        onChange={(e) => setStartsAt(e.target.value)}
                      />
                      <p className="helper">It starts on its own at this time if your tab is open. You can also start early.</p>
                    </>
                  )}
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={lateJoin} onChange={(e) => setLateJoin(e.target.checked)} />
                    <span>
                      <span className="font-medium">Allow late joining</span>
                      <span className="block text-muted">People can take an open country after it starts. They join the end of the speaking order.</span>
                    </span>
                  </label>
                </fieldset>
                <fieldset>
                  <legend className="label">When does it end?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["30", "30 minutes"],
                        ["60", "60 minutes"],
                        ["at", "At a set time"],
                        ["none", "No end time"],
                      ] as const
                    ).map(([value, name]) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-full border-2 border-ink px-3 py-2 text-center text-sm font-bold transition-all ${
                          endMode === value ? "bg-[var(--tone)] shadow-[3px_3px_0_var(--ink)]" : "bg-surface opacity-70 hover:opacity-100"
                        }`}
                      >
                        <input type="radio" name="end" className="sr-only" checked={endMode === value} onChange={() => setEndMode(value)} />
                        {name}
                      </label>
                    ))}
                  </div>
                  {endMode === "at" && (
                    <>
                      <label htmlFor="r-ends" className="sr-only">
                        End date and time
                      </label>
                      <input id="r-ends" type="datetime-local" className="field mt-2" value={endAtLocal} onChange={(e) => setEndAtLocal(e.target.value)} />
                    </>
                  )}
                  <p className="helper">
                    {endMode === "none"
                      ? "It ends after closing statements, or when you end it. Speakers get the usual 2 minutes, 90 seconds in debate."
                      : "When it starts, the time is shared equally between the countries. Everyone sees how long each of their speeches can be."}
                  </p>
                </fieldset>
              </div>

              <fieldset>
                <legend className="label">
                  Participating countries{" "}
                  <span className={`font-normal ${seats.length < MIN_SEATS || seats.length > MAX_SEATS ? "text-danger" : "text-muted"}`}>
                    ({seats.length}, between {MIN_SEATS} and {MAX_SEATS})
                  </span>
                </legend>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {seats.map((seat) => (
                    <li key={seat.country} className="flex items-center gap-2 rounded-[var(--radius-ui)] border border-line bg-surface py-1.5 pl-2.5 pr-1.5">
                      <Flag country={seat.country} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{seat.country}</span>
                      <button
                        type="button"
                        aria-pressed={seat.ai}
                        aria-label={`${seat.country} played by AI`}
                        onClick={() => toggleAi(seat.country)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold transition-colors ${
                          seat.ai ? "border-ink bg-[var(--violet)] text-[#0c2b4b]" : "border-line text-muted hover:border-ink"
                        }`}
                      >
                        <Robot aria-hidden="true" size={13} weight={seat.ai ? "fill" : "regular"} /> AI {seat.ai ? "on" : "off"}
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted hover:bg-sunk hover:text-ink"
                        aria-label={`Remove ${seat.country}`}
                        onClick={() => {
                          setSeats(seats.filter((x) => x.country !== seat.country));
                          if (hostSeat === seat.country) setHostSeat("");
                        }}
                      >
                        <X aria-hidden="true" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <label htmlFor="r-add" className="sr-only">
                    Add a country
                  </label>
                  <CountryInput
                    id="r-add"
                    value={newSeat}
                    placeholder="Start typing a country…"
                    exclude={seats.map((s) => s.country)}
                    onChange={setNewSeat}
                    onPick={addSeat}
                  />
                  <button type="button" className="btn" disabled={newSeat.trim().length < 2 || seats.length >= MAX_SEATS} onClick={() => addSeat()}>
                    <Plus aria-hidden="true" size={16} /> Add
                  </button>
                </div>
                <p className="helper">
                  Turn on AI for any country no one will play. Open countries are taken by people when they join. You can change this in the lobby too.
                </p>
              </fieldset>

              <div>
                <label htmlFor="r-me" className="label">Your seat</label>
                <select id="r-me" className="field" value={hostSeat} onChange={(e) => setHostSeat(e.target.value)}>
                  <option value="">Moderate only (no country)</option>
                  {humanSeats.map((s) => (
                    <option key={s.country} value={s.country}>
                      {s.country}
                    </option>
                  ))}
                </select>
                <p className="helper">As the host you run the forum either way: start it, open floor voting and end it.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={judge} onChange={(e) => setJudge(e.target.checked)} />
                <span>
                  <span className="font-medium">AI judge presides</span>
                  <span className="block text-muted">Opens the session, draws who goes first, steps in with rulings and closes it.</span>
                </span>
              </label>
            </div>
            {error?.form === "create" && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error.message}
              </p>
            )}
            <button type="submit" disabled={!canCreate || busy !== null} className="btn btn-primary mt-6 w-full">
              {busy === "create" ? "Creating…" : isPublic ? "Create public forum" : "Create private forum"}
            </button>
            <p className="helper">
              {isPublic ? "It appears under Find a room straight away. " : "You get a code to share. "}
              The forum runs from your browser, so keep that tab open while it is live.
            </p>
          </form>
        )}

        {/* ---------- Join with a code ---------- */}
        {tab === "join" && (
          <form
            className="tone-card mx-auto mt-8 max-w-lg p-5 sm:p-7"
            onSubmit={async (e) => {
              e.preventDefault();
              if (found) return run("join", () => joinRoom(found.room.code, joinCountry));
              setBusy("find");
              setError(null);
              try {
                const f = await findRoomByCode(code);
                if (f.room.status === "ended") throw new Error("This session has ended");
                setFound(f);
                setJoinCountry("");
              } catch (err) {
                setError({ form: "join", message: friendlyRoomError(err instanceof Error ? err.message : "Could not find that room.") });
              } finally {
                setBusy(null);
              }
            }}
          >
            <h2 className="font-display text-2xl font-bold">Join a forum</h2>
            <p className="mt-1 text-muted">For private forums, or any forum whose host gave you the code.</p>
            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="j-code" className="label">Room code</label>
                <div className="flex gap-2">
                  <input
                    id="j-code"
                    name="room-code"
                    className="field font-mono uppercase tracking-widest"
                    value={code}
                    maxLength={12}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="A1B2C3…"
                    onChange={(e) => {
                      setCode(e.target.value);
                      setFound(null);
                    }}
                  />
                  {!found && (
                    <button type="submit" disabled={code.trim().length < 4 || busy !== null} className="btn btn-primary shrink-0">
                      <MagnifyingGlass aria-hidden="true" size={16} /> {busy === "find" ? "Finding…" : "Find"}
                    </button>
                  )}
                </div>
              </div>
              {found && (
                <div className="rounded-[var(--radius-ui)] border border-line bg-surface p-4">
                  <p className="font-display text-xl font-bold leading-tight">{found.room.topic}</p>
                  {found.room.subtopic && <p className="text-sm font-medium">Subtopic: {found.room.subtopic}</p>}
                  <p className="text-sm text-muted">{found.room.committee}</p>
                  <p className="mt-2 text-sm text-muted">
                    {found.room.status === "live" ? "Started" : startLabel(found.room.startsAt)} · {endLabel(found.room.durationMin, found.room.endAt)}
                  </p>
                  {found.room.seats && (
                    <div className="mt-3">
                      <SeatSummary
                        seats={found.room.seats}
                        taken={found.room.seats
                          .filter((s) => !s.ai && !found.open.some((o) => o.country === s.country))
                          .map((s) => s.country)}
                        players={found.room.seats.filter((s) => !s.ai).length - found.open.length}
                      />
                    </div>
                  )}
                  {found.room.status !== "lobby" && !found.room.lateJoin && (
                    <p className="mt-2 text-sm text-danger">This forum has already started, so only its members can go back in.</p>
                  )}
                  {found.room.status === "live" && found.room.lateJoin && (
                    <p className="mt-2 text-sm font-medium">It has started, but late joining is open. You join the end of the speaking order.</p>
                  )}
                </div>
              )}
              {found && (
                <div>
                  <label htmlFor="j-country" className="label">You represent</label>
                  {found.room.seats ? (
                    <select id="j-country" className="field" value={joinCountry} onChange={(e) => setJoinCountry(e.target.value)}>
                      <option value="">{found.open.length ? "Choose an open country…" : "No open seats left"}</option>
                      {found.open.map((s) => (
                        <option key={s.country} value={s.country}>
                          {s.country}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input id="j-country" name="join-country" autoComplete="off" className="field" maxLength={100} value={joinCountry} placeholder="Brazil…" onChange={(e) => setJoinCountry(e.target.value)} />
                      <p className="helper">Optional. Your name is used if you leave it blank.</p>
                    </>
                  )}
                </div>
              )}
            </div>
            {error?.form === "join" && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error.message}
              </p>
            )}
            {found && (
              <button
                type="submit"
                disabled={busy !== null || (!!found.room.seats && !joinCountry && (found.room.status === "lobby" || found.room.lateJoin))}
                className="btn btn-primary mt-5 w-full"
              >
                {busy === "join" ? "Joining…" : found.room.status === "lobby" || found.room.lateJoin ? "Join forum" : "Go back in"}
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
