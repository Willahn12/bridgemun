import { toneStyle } from "@/lib/tone";

/* The frame every sign-in page shares: a folded placard on the left, the form on the right. */
export default function AuthShell({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <main
      style={toneStyle("delegate")}
      className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div>
        <div className="relative mb-10 hidden h-44 w-72 lg:block" aria-hidden="true">
          <div className="placard absolute inset-x-2 top-0 h-32 -rotate-6 !bg-[var(--sun)]" />
          <div className="placard absolute inset-x-0 bottom-0 top-8 flex flex-col items-center justify-center rotate-2">
            <p className="text-sm font-medium text-muted">Delegate of</p>
            <p className="font-display text-4xl font-extrabold leading-none tracking-tight">You</p>
          </div>
        </div>
        <h1 className="text-4xl font-extrabold leading-[1.02] md:text-6xl">{title}</h1>
        <p className="mt-4 max-w-[40ch] text-lg leading-relaxed text-muted">{text}</p>
      </div>
      <div>{children}</div>
    </main>
  );
}
