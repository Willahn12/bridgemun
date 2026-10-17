"use client";

import CountryInput from "@/components/CountryInput";

export interface SetupValues {
  country: string;
  committee: string;
  topic: string;
}

const FIELDS: { key: keyof SetupValues; label: string; placeholder: string; helper: string }[] = [
  { key: "country", label: "Country", placeholder: "Philippines", helper: "Any UN member state or observer." },
  { key: "committee", label: "Committee", placeholder: "UN Environment Assembly", helper: "For example SPECPOL, WHO, Security Council." },
  { key: "topic", label: "Topic", placeholder: "Financing climate adaptation in developing countries", helper: "The agenda item you were given." },
];

export default function SetupFields({
  values,
  onChange,
}: {
  values: SetupValues;
  onChange: (next: SetupValues) => void;
}) {
  return (
    <div className="grid gap-4">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={`setup-${f.key}`} className="label">
            {f.label}
          </label>
          {f.key === "country" ? (
            <CountryInput
              id={`setup-${f.key}`}
              value={values.country}
              placeholder={f.placeholder}
              onChange={(v) => onChange({ ...values, country: v })}
            />
          ) : (
            <input
              id={`setup-${f.key}`}
              className="field"
              value={values[f.key]}
              maxLength={200}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          )}
          <p className="helper">{f.helper}</p>
        </div>
      ))}
    </div>
  );
}

export const isComplete = (v: SetupValues) =>
  v.country.trim() !== "" && v.committee.trim() !== "" && v.topic.trim() !== "";
