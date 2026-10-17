/* The 193 UN member states, in the names students use. */
export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin",
  "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia",
  "Comoros", "Congo", "Costa Rica", "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "DR Congo", "Denmark",
  "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea",
  "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
  "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland",
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro",
  "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger",
  "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia",
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo",
  "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe",
] as const;

/* ISO 3166 two-letter codes, for flag images. */
const ISO: Record<string, string> = {
  Afghanistan: "af", Albania: "al", Algeria: "dz", Andorra: "ad", Angola: "ao", "Antigua and Barbuda": "ag",
  Argentina: "ar", Armenia: "am", Australia: "au", Austria: "at", Azerbaijan: "az", Bahamas: "bs", Bahrain: "bh",
  Bangladesh: "bd", Barbados: "bb", Belarus: "by", Belgium: "be", Belize: "bz", Benin: "bj", Bhutan: "bt",
  Bolivia: "bo", "Bosnia and Herzegovina": "ba", Botswana: "bw", Brazil: "br", Brunei: "bn", Bulgaria: "bg",
  "Burkina Faso": "bf", Burundi: "bi", "Cabo Verde": "cv", Cambodia: "kh", Cameroon: "cm", Canada: "ca",
  "Central African Republic": "cf", Chad: "td", Chile: "cl", China: "cn", Colombia: "co", Comoros: "km", Congo: "cg",
  "Costa Rica": "cr", "Côte d'Ivoire": "ci", Croatia: "hr", Cuba: "cu", Cyprus: "cy", Czechia: "cz", "DR Congo": "cd",
  Denmark: "dk", Djibouti: "dj", Dominica: "dm", "Dominican Republic": "do", Ecuador: "ec", Egypt: "eg",
  "El Salvador": "sv", "Equatorial Guinea": "gq", Eritrea: "er", Estonia: "ee", Eswatini: "sz", Ethiopia: "et",
  Fiji: "fj", Finland: "fi", France: "fr", Gabon: "ga", Gambia: "gm", Georgia: "ge", Germany: "de", Ghana: "gh",
  Greece: "gr", Grenada: "gd", Guatemala: "gt", Guinea: "gn", "Guinea-Bissau": "gw", Guyana: "gy", Haiti: "ht",
  Honduras: "hn", Hungary: "hu", Iceland: "is", India: "in", Indonesia: "id", Iran: "ir", Iraq: "iq", Ireland: "ie",
  Israel: "il", Italy: "it", Jamaica: "jm", Japan: "jp", Jordan: "jo", Kazakhstan: "kz", Kenya: "ke", Kiribati: "ki",
  Kuwait: "kw", Kyrgyzstan: "kg", Laos: "la", Latvia: "lv", Lebanon: "lb", Lesotho: "ls", Liberia: "lr", Libya: "ly",
  Liechtenstein: "li", Lithuania: "lt", Luxembourg: "lu", Madagascar: "mg", Malawi: "mw", Malaysia: "my",
  Maldives: "mv", Mali: "ml", Malta: "mt", "Marshall Islands": "mh", Mauritania: "mr", Mauritius: "mu", Mexico: "mx",
  Micronesia: "fm", Moldova: "md", Monaco: "mc", Mongolia: "mn", Montenegro: "me", Morocco: "ma", Mozambique: "mz",
  Myanmar: "mm", Namibia: "na", Nauru: "nr", Nepal: "np", Netherlands: "nl", "New Zealand": "nz", Nicaragua: "ni",
  Niger: "ne", Nigeria: "ng", "North Korea": "kp", "North Macedonia": "mk", Norway: "no", Oman: "om", Pakistan: "pk",
  Palau: "pw", Panama: "pa", "Papua New Guinea": "pg", Paraguay: "py", Peru: "pe", Philippines: "ph", Poland: "pl",
  Portugal: "pt", Qatar: "qa", Romania: "ro", Russia: "ru", Rwanda: "rw", "Saint Kitts and Nevis": "kn",
  "Saint Lucia": "lc", "Saint Vincent and the Grenadines": "vc", Samoa: "ws", "San Marino": "sm",
  "Sao Tome and Principe": "st", "Saudi Arabia": "sa", Senegal: "sn", Serbia: "rs", Seychelles: "sc",
  "Sierra Leone": "sl", Singapore: "sg", Slovakia: "sk", Slovenia: "si", "Solomon Islands": "sb", Somalia: "so",
  "South Africa": "za", "South Korea": "kr", "South Sudan": "ss", Spain: "es", "Sri Lanka": "lk", Sudan: "sd",
  Suriname: "sr", Sweden: "se", Switzerland: "ch", Syria: "sy", Tajikistan: "tj", Tanzania: "tz", Thailand: "th",
  "Timor-Leste": "tl", Togo: "tg", Tonga: "to", "Trinidad and Tobago": "tt", Tunisia: "tn", Turkey: "tr",
  Turkmenistan: "tm", Tuvalu: "tv", Uganda: "ug", Ukraine: "ua", "United Arab Emirates": "ae", "United Kingdom": "gb",
  "United States": "us", Uruguay: "uy", Uzbekistan: "uz", Vanuatu: "vu", Venezuela: "ve", Vietnam: "vn", Yemen: "ye",
  Zambia: "zm", Zimbabwe: "zw",
};

/* Names students often type instead of the listed ones. */
const ALIASES: Record<string, string> = {
  usa: "United States", us: "United States", america: "United States", "united states of america": "United States",
  uk: "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", england: "United Kingdom",
  korea: "South Korea", "republic of korea": "South Korea", drc: "DR Congo", uae: "United Arab Emirates",
  "ivory coast": "Côte d'Ivoire", "czech republic": "Czechia", turkiye: "Turkey", "türkiye": "Turkey",
  "east timor": "Timor-Leste", "cape verde": "Cabo Verde", burma: "Myanmar", swaziland: "Eswatini",
};

/** The listed name for what someone typed, or the trimmed input if it is not a known country. */
export function canonicalCountry(name: string): string {
  const t = name.trim();
  const lower = t.toLowerCase();
  return ALIASES[lower] ?? COUNTRIES.find((c) => c.toLowerCase() === lower) ?? t;
}

/** A small flag image for a country, or null if the name is not a UN member state. */
export function flagUrl(name: string): string | null {
  const code = ISO[canonicalCountry(name)];
  return code ? `https://flagcdn.com/w80/${code}.png` : null;
}

/** Countries matching what someone has typed: names that start with it first, then any word that does
    ("korea" finds South and North Korea), then common short names ("usa", "uk"). */
export function searchCountries(q: string, limit = 8): string[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const starts: string[] = [];
  const word: string[] = [];
  for (const c of COUNTRIES) {
    const l = c.toLowerCase();
    if (l.startsWith(t)) starts.push(c);
    else if (l.split(/[\s-]+/).some((w) => w.startsWith(t))) word.push(c);
  }
  const alias = Object.entries(ALIASES)
    .filter(([a]) => a.startsWith(t))
    .map(([, c]) => c);
  return [...new Set([...starts, ...word, ...alias])].slice(0, limit);
}
