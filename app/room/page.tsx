"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, Globe, Lock, Plus, UsersThree, X } from "@phosphor-icons/react";
import PageHero from "@/components/PageHero";
import { useAuth } from "@/lib/auth";
import { createRoom, friendlyRoomError, joinRoom, listPublicRooms, type PublicRoom } from "@/lib/rooms";
import { toneStyle } from "@/lib/tone";

type Tab = "find" | "host" | "join";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export default function RoomLandingPage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  const [tab, setTab] = useState<Tab>("find");
  const [committee, setCommittee] = useState("");
  const [topic, setTopic] = useState("");
  const [ais, setAis] = useState<string[]>([""]);
  const [myCountry, setMyCountry] = useState("");
  const [judge, setJudge] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState("");
  const [joinCountry, setJoinCountry] = useState("");
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

  // "Japan, Korea" typed into one box becomes two AI countries.
  const aiList = ais.flatMap((a) => a.split(",")).map((a) => a.trim()).filter(Boolean);
  const lower = aiList.map((a) => a.toLowerCase());
  const problem =
    aiList.length > 4
      ? "Add at most 4 AI countries."
      : new Set(lower).size !== lower.length
        ? "The AI countries must all be different."
        : myCountry.trim() && lower.includes(myCountry.trim().toLowerCase())
          ? "You cannot represent the same country as an AI delegate."
          : null;
  const canCreate = committee.trim().length >= 2 && topic.trim().length >= 2 && aiList.length >= 1;

  const tabs: [Tab, string, number | null][] = [
    ["find", "Find a room", rooms?.length ?? null],
    ["host", "Host a room", null],
    ["join", "Join with a code", null],
  ];

  return (
    <main style={toneStyle("room")}>
      <PageHero kind="room" title="Online room">
        <p>
          Comp mode over the internet. Everyone joins from their own account. The judge draws the speaking order,
          then every delegate, human or AI, takes a turn: opening statements, two rounds of debate, closing statements.
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
                  Public rooms waiting for players
                </h2>
                <p className="mt-1 text-muted">Anyone can join these until the host starts the session.</p>
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
                      <p className="mt-3 flex flex-wrap gap-1.5 text-sm">
                        {r.aiCountries.map((c) => (
                          <span key={c} className="rounded-full bg-sunk px-2.5 py-0.5 font-medium">
                            {c} <span className="text-xs text-muted">AI</span>
                          </span>
                        ))}
                        {r.judge && <span className="rounded-full bg-sunk px-2.5 py-0.5 font-medium">AI judge</span>}
                      </p>
                      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                        <UsersThree aria-hidden="true" size={16} /> {r.players} joined, hosted by {r.hostName}, {ago(r.createdAt)}
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
                        <input
                          id={`c-${r.id}`}
                          className="field min-w-0 flex-1"
                          maxLength={100}
                          autoComplete="off"
                          placeholder="Your country (optional)"
                          value={mine}
                          onChange={(e) => setCountryFor({ ...countryFor, [r.id]: e.target.value })}
                        />
                        <button type="submit" disabled={busy !== null} className="btn btn-primary">
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
              run("create", () => createRoom({ committee, topic, aiCountries: aiList, judge, country: myCountry, isPublic }));
            }}
          >
            <h2 className="font-display text-2xl font-bold">Host a session</h2>
            <div className="mt-5 grid gap-5">
              <fieldset>
                <legend className="label">Who can find this room?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      [false, "Private", "Only people you give the code to can join.", Lock, "var(--sun)"],
                      [true, "Public", "Listed under Find a room. Anyone signed in can join until you start.", Globe, "var(--mint)"],
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
                <input id="r-topic" name="topic" autoComplete="off" className="field" maxLength={200} value={topic} placeholder="Plastic pollution in the oceans…" onChange={(e) => setTopic(e.target.value)} />
              </div>
              <fieldset>
                <legend className="label">AI delegates represent</legend>
                <div className="grid gap-2">
                  {ais.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        aria-label={`AI country ${i + 1}`}
                        name={`ai-country-${i + 1}`}
                        autoComplete="off"
                        className="field"
                        maxLength={100}
                        value={c}
                        placeholder={["Japan…", "Korea…", "Brazil…", "Nigeria…"][i]}
                        onChange={(e) => setAis(ais.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                      {ais.length > 1 && (
                        <button type="button" className="btn" aria-label={`Remove AI country ${i + 1}`} onClick={() => setAis(ais.filter((_, j) => j !== i))}>
                          <X aria-hidden="true" size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {ais.length < 4 && (
                  <button type="button" className="btn mt-2" onClick={() => setAis([...ais, ""])}>
                    <Plus aria-hidden="true" size={16} /> Add AI country
                  </button>
                )}
                <p className="helper">One country per box, up to 4. Each AI takes its own turn.</p>
              </fieldset>
              <div>
                <label htmlFor="r-me" className="label">You represent</label>
                <input id="r-me" name="my-country" autoComplete="off" className="field" maxLength={100} value={myCountry} placeholder="Kenya…" onChange={(e) => setMyCountry(e.target.value)} />
                <p className="helper">Optional. Your name is used if you leave it blank.</p>
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
              {busy === "create" ? "Creating…" : isPublic ? "Create public room" : "Create private room"}
            </button>
            <p className="helper">
              {isPublic ? "It appears under Find a room straight away. " : "You get a code to share. "}
              The session runs automatically from your browser, so keep this tab open.
            </p>
          </form>
        )}

        {/* ---------- Join with a code ---------- */}
        {tab === "join" && (
          <form
            className="tone-card mx-auto mt-8 max-w-lg p-5 sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              run("join", () => joinRoom(code, joinCountry));
            }}
          >
            <h2 className="font-display text-2xl font-bold">Join a session</h2>
            <p className="mt-1 text-muted">For private rooms, or any room whose host gave you the code.</p>
            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="j-code" className="label">Room code</label>
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
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="j-country" className="label">You represent</label>
                <input id="j-country" name="join-country" autoComplete="off" className="field" maxLength={100} value={joinCountry} placeholder="Brazil…" onChange={(e) => setJoinCountry(e.target.value)} />
                <p className="helper">Optional. Your name is used if you leave it blank.</p>
              </div>
            </div>
            {error?.form === "join" && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error.message}
              </p>
            )}
            <button type="submit" disabled={code.trim().length < 4 || busy !== null} className="btn btn-primary mt-5 w-full">
              {busy === "join" ? "Joining…" : "Join Room"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
