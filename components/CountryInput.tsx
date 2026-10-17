"use client";

import { useId, useState } from "react";
import Flag from "@/components/Flag";
import { flagUrl, searchCountries } from "@/components/countries";

/* A text box for a country name. As you type, a list of matching UN member states drops down with their
   flags; arrow keys and Enter pick one. Anything else typed is still allowed (observers, made-up states). */
export default function CountryInput({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  exclude = [],
  className = "",
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** Called when a country is chosen from the list, or Enter is pressed with no list open. */
  onPick?: (v: string) => void;
  placeholder?: string;
  /** Countries already used elsewhere in the form, left out of the list. */
  exclude?: string[];
  className?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const taken = new Set(exclude.map((c) => c.toLowerCase()));
  const matches = searchCountries(value, 12)
    .filter((c) => !taken.has(c.toLowerCase()) && c.toLowerCase() !== value.trim().toLowerCase())
    .slice(0, 8);
  const showing = open && matches.length > 0;

  function pick(c: string) {
    onChange(c);
    onPick?.(c);
    setOpen(false);
  }

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      {flagUrl(value) && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Flag country={value} className="h-4 w-6" />
        </span>
      )}
      <input
        id={id}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        className={`field ${flagUrl(value) ? "pl-11" : ""}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && matches.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (showing ? (a + 1) % matches.length : 0));
          } else if (e.key === "ArrowUp" && showing) {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            if (showing) {
              e.preventDefault();
              pick(matches[active]);
            } else if (onPick) {
              e.preventDefault();
              onPick(value);
            }
          } else if (e.key === "Escape" && showing) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        {...aria}
      />
      {showing && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-ui)] border border-line bg-surface p-1 shadow-lg"
        >
          {matches.map((c, i) => (
            <li
              key={c}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click, so the choice lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius-ui)-2px)] px-2.5 py-2 text-sm ${
                i === active ? "bg-sunk font-semibold" : ""
              }`}
            >
              <Flag country={c} className="h-4 w-6" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
