export const REGIONS = [
  "Worldwide",
  "North America",
  "Latin America",
  "Europe",
  "Asia",
  "Africa & Middle East",
  "Oceania",
];

const rx = (words) => new RegExp(`\\b(?:${words.join("|")})\\b`, "i");

const RULES = {
  Worldwide: rx(["worldwide", "anywhere", "global", "globally", "world", "not specified"]),
  "North America": rx(["usa", "us", "united states", "north america", "americas", "canada"]),
  "Latin America": rx([
    "latam", "latin america", "south america", "central america", "americas",
    "mexico", "brazil", "argentina", "colombia", "chile", "peru", "uruguay", "costa rica",
  ]),
  Europe: rx([
    "europe", "european", "eu", "emea", "uk", "united kingdom", "england", "scotland",
    "ireland", "germany", "france", "spain", "portugal", "italy", "netherlands", "belgium",
    "switzerland", "austria", "poland", "sweden", "norway", "denmark", "finland", "czechia",
    "czech republic", "romania", "bulgaria", "greece", "hungary", "ukraine", "estonia",
    "latvia", "lithuania", "cet", "cest",
  ]),
  Asia: rx([
    "asia", "apac", "india", "pakistan", "bangladesh", "sri lanka", "nepal", "china",
    "japan", "korea", "singapore", "philippines", "indonesia", "vietnam", "thailand",
    "malaysia", "hong kong", "taiwan",
  ]),
  "Africa & Middle East": rx([
    "africa", "african", "middle east", "mena", "emea", "nigeria", "kenya", "ghana",
    "egypt", "morocco", "south africa", "uae", "dubai", "saudi arabia", "israel",
    "turkey", "turkiye",
  ]),
  Oceania: rx(["oceania", "apac", "australia", "new zealand", "anz"]),
};

const clean = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/u\.s\.a\.?/g, "usa")
    .replace(/u\.s\.?/g, "usa")
    .replace(/u\.k\.?/g, "uk")
    .trim();

export function regionsOf(job) {
  const loc = clean(job.location);
  if (!loc) return ["Worldwide"];
  const found = REGIONS.filter((r) => RULES[r].test(loc));
  if (!found.length && job.source === "Arbeitnow") return ["Europe"];
  return found;
}

export function locationMatches(job, { region, country, includeWorldwide }) {
  const regions = regionsOf(job);
  const worldwide = regions.includes("Worldwide");
  const loc = clean(job.location);
  const c = (country || "").trim().toLowerCase();

  const regionOk =
    region === "all" || regions.includes(region) || (includeWorldwide && worldwide);
  const countryOk = !c || loc.includes(c) || (includeWorldwide && worldwide);
  return regionOk && countryOk;
}