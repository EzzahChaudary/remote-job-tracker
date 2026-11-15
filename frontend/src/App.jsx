import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import { REGIONS, locationMatches } from "./regions";

const API = "http://127.0.0.1:8000";
const PAGE = 20;
const SUGGESTIONS = ["react", "python", "designer", "marketing", "support", "devops"];
const TABS = [
  { id: "results", label: "Results" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
];
const POSTED = [
  { v: "any", label: "Any time" },
  { v: "1", label: "Past 24 hours" },
  { v: "7", label: "Past 7 days" },
  { v: "30", label: "Past 30 days" },
];

async function api(path, options) {
  let res;
  try {
    res = await fetch(API + path, options);
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running on port 8000.");
  }
  if (!res.ok) {
    let msg = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      if (body.detail) msg = body.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const ageDays = (j) =>
  j.posted ? (Date.now() - new Date(j.posted + "Z").getTime()) / 86400000 : Infinity;

function timeAgo(j) {
  const d = ageDays(j);
  if (!Number.isFinite(d)) return "";
  if (d < 1) return "Today";
  if (d < 2) return "Yesterday";
  if (d < 30) return `${Math.floor(d)} days ago`;
  return `${Math.floor(d / 30)} mo ago`;
}

const byDate = (a, b) => (b.posted || "").localeCompare(a.posted || "");
const label = (t) => (t || "").replace(/_/g, " ");
const avatarClass = (name = "") => `av av${name.length % 6}`;

const Icon = {
  search: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  bookmark: (filled) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  external: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
    </svg>
  ),
  sun: (
    <svg className="icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg className="icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "dark"
  );
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 450);
  };
  return [theme, toggle];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();

  const [query, setQuery] = useState("react");
  const [byId, setById] = useState({});
  const [resultIds, setResultIds] = useState([]);
  const [tab, setTab] = useState("results");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const [region, setRegion] = useState("all");
  const [country, setCountry] = useState("");
  const [includeWorldwide, setIncludeWorldwide] = useState(true);
  const [posted, setPosted] = useState("any");
  const [sourceFilter, setSourceFilter] = useState("all");
  const deferredCountry = useDeferredValue(country);

  const toastTimer = useRef(null);
  const requestId = useRef(0);
  const inputRef = useRef(null);
  const tabsRef = useRef(null);
  const [ind, setInd] = useState({ x: 0, w: 0, ready: false });

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  const merge = useCallback((list) => {
    setById((prev) => {
      const next = { ...prev };
      list.forEach((j) => {
        next[j.id] = j;
      });
      return next;
    });
  }, []);

  const loadLists = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api("/jobs?saved=true"),
        api("/jobs?applied=true"),
      ]);
      merge([...s, ...a]);
    } catch (e) {
      setError(e.message);
    }
  }, [merge]);

  const search = useCallback(
    async (q) => {
      const term = q.trim();
      if (!term) return;
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      setTab("results");
      setSourceFilter("all");
      try {
        const data = await api(`/search?q=${encodeURIComponent(term)}`);
        if (id !== requestId.current) return;
        merge(data.jobs);
        setResultIds(data.jobs.map((j) => j.id));
        if (data.failed.length) {
          notify(`Couldn't reach: ${data.failed.join(", ")}. Showing the rest.`);
        }
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e.message);
        setResultIds([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [merge]
  );

  useEffect(() => {
    search("react");
    loadLists();
  }, [search, loadLists]);

  const toggle = async (job, action) => {
    const field = action === "save" ? "saved" : "applied";
    const next = !job[field];
    setById((p) => ({ ...p, [job.id]: { ...p[job.id], [field]: next } }));
    notify(
      action === "save"
        ? next ? "Saved to your list" : "Removed from saved"
        : next ? "Marked as applied" : "Unmarked as applied"
    );
    try {
      const updated = await api(`/jobs/${encodeURIComponent(job.id)}/${action}`, {
        method: "POST",
      });
      setById((p) => ({ ...p, [updated.id]: updated }));
    } catch (e) {
      setById((p) => ({ ...p, [job.id]: { ...p[job.id], [field]: !next } }));
      notify(e.message);
    }
  };

  const lists = useMemo(() => {
    const all = Object.values(byId);
    return {
      results: resultIds.map((id) => byId[id]).filter(Boolean),
      saved: all.filter((j) => j.saved).sort(byDate),
      applied: all.filter((j) => j.applied).sort(byDate),
    };
  }, [byId, resultIds]);

  const counts = {
    results: lists.results.length,
    saved: lists.saved.length,
    applied: lists.applied.length,
  };
  const current = lists[tab];
  const sources = useMemo(
    () => [...new Set(current.map((j) => j.source).filter(Boolean))],
    [current]
  );

  const postedDays = posted === "any" ? 0 : Number(posted);
  const filtered = useMemo(
    () =>
      current.filter(
        (j) =>
          (sourceFilter === "all" || j.source === sourceFilter) &&
          (postedDays === 0 || ageDays(j) <= postedDays) &&
          locationMatches(j, { region, country: deferredCountry, includeWorldwide })
      ),
    [current, sourceFilter, postedDays, region, deferredCountry, includeWorldwide]
  );
  const shown = filtered.slice(0, visible);

  const filtersActive =
    region !== "all" || country.trim() !== "" || posted !== "any" || sourceFilter !== "all";

  const clearFilters = () => {
    setRegion("all");
    setCountry("");
    setPosted("any");
    setSourceFilter("all");
  };

  useEffect(() => {
    setVisible(PAGE);
  }, [tab, sourceFilter, region, deferredCountry, includeWorldwide, posted, resultIds]);

  // Sliding tab indicator
  const measure = useCallback(() => {
    const el = tabsRef.current?.querySelector('[aria-selected="true"]');
    if (el) setInd((p) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: p.w > 0 }));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, tab, counts.results, counts.saved, counts.applied]);

  useEffect(() => {
    const node = tabsRef.current;
    if (!node) return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  // Header shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "/" focuses the search box
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    search(query);
  };

  const pick = (term) => {
    setQuery(term);
    search(term);
  };

  const emptyText = {
    results: "No jobs found for that search. Try a broader keyword like “developer” or “designer”.",
    saved: "Nothing saved yet. Use Save on any job to keep it here.",
    applied: "No applications tracked yet. Mark a job as applied to follow your progress.",
  }[tab];

  return (
    <div className="site">
      <a className="skip" href="#main">Skip to results</a>

      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="header-inner">
          <span className="logo">Remote Job Tracker</span>
          <div className="header-right">
            <span className="tag">100% remote · three job boards</span>
            <button
              className="theme-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Light theme" : "Dark theme"}
            >
              {Icon.sun}
              {Icon.moon}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="app">
        <section className="hero">
          <h1>Find your next remote role</h1>
          <p className="lead">
            Search live listings, save the ones you like, and track where you've applied.
          </p>

          <form className="search" onSubmit={onSubmit} role="search">
            <label htmlFor="q" className="sr-only">Search jobs</label>
            <span className="search-icon">{Icon.search}</span>
            <input
              id="q"
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Role or skill, e.g. react developer"
              autoComplete="off"
            />
            <kbd className="kbd" aria-hidden="true">/</kbd>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          <div className="chips" aria-label="Quick searches">
            <span className="chips-label">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => pick(s)}>
                {s}
              </button>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Filters">
          <div className="grid">
            <div className="field">
              <label htmlFor="region">Region</label>
              <select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">All regions</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="country">Country or city</label>
              <input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Pakistan"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="posted">Posted</label>
              <select id="posted" value={posted} onChange={(e) => setPosted(e.target.value)}>
                {POSTED.map((p) => (
                  <option key={p.v} value={p.v}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="source">Source</label>
              <select id="source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeWorldwide}
              onChange={(e) => setIncludeWorldwide(e.target.checked)}
            />
            Include roles open worldwide
          </label>
        </section>

        <div className="tabs" role="tablist" aria-label="Job lists" ref={tabsRef}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? "on" : ""}`}
              onClick={() => {
                setTab(t.id);
                setSourceFilter("all");
              }}
            >
              {t.label}
              <span className="count">{counts[t.id]}</span>
            </button>
          ))}
          <span
            className={`tab-indicator ${ind.ready ? "ready" : ""}`}
            style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}
            aria-hidden="true"
          />
        </div>

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button onClick={() => search(query)}>Try again</button>
          </div>
        )}

        <div className="status-row">
          <p className="status" aria-live="polite">
            {loading
              ? "Searching for jobs…"
              : `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"}${
                  filtersActive ? ` of ${current.length}` : ""
                }`}
          </p>
          {filtersActive && (
            <button className="link-btn" onClick={clearFilters}>Clear filters</button>
          )}
        </div>

        <ul className="list">
          {loading && tab === "results"
            ? Array.from({ length: 6 }).map((_, i) => (
                <li className="card skeleton" key={i} aria-hidden="true">
                  <div className="sk-av" />
                  <div className="sk-lines">
                    <div className="sk-line w60" />
                    <div className="sk-line w40" />
                  </div>
                </li>
              ))
            : shown.map((j, i) => (
                <li className="card" key={j.id} style={{ "--d": `${Math.min(i, 8) * 40}ms` }}>
                  <div className={avatarClass(j.company)} aria-hidden="true">
                    {(j.company || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="info">
                    <h2>
                      <a href={j.url} target="_blank" rel="noreferrer">{j.title}</a>
                    </h2>
                    <div className="meta">
                      <span>{j.company}</span>
                      <span>{j.location || "Not specified"}</span>
                      {j.job_type && j.job_type !== "remote" && (
                        <span className="type">{label(j.job_type)}</span>
                      )}
                      <span className="pill">{j.source}</span>
                      <span>{timeAgo(j)}</span>
                    </div>
                  </div>

                  <div className="actions">
                    <button
                      className={`act ${j.saved ? "on" : ""}`}
                      aria-pressed={j.saved}
                      onClick={() => toggle(j, "save")}
                    >
                      {Icon.bookmark(j.saved)}
                      {j.saved ? "Saved" : "Save"}
                    </button>
                    <button
                      className={`act ${j.applied ? "done" : ""}`}
                      aria-pressed={j.applied}
                      onClick={() => toggle(j, "applied")}
                    >
                      {Icon.check}
                      {j.applied ? "Applied" : "Mark applied"}
                    </button>
                    <a className="act link" href={j.url} target="_blank" rel="noreferrer">
                      View {Icon.external}
                    </a>
                  </div>
                </li>
              ))}
        </ul>

        {!loading && filtered.length > visible && (
          <button className="more" onClick={() => setVisible((v) => v + PAGE)}>
            Show more ({filtered.length - visible} remaining)
          </button>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="empty">
            <p>{filtersActive ? "No jobs match these filters." : emptyText}</p>
            {filtersActive && (
              <button className="link-btn" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <span>Built by Ezzah Chaudary</span>
        <span>
          Job data from{" "}
          <a href="https://remotive.com" target="_blank" rel="noreferrer">Remotive</a>,{" "}
          <a href="https://remoteok.com" target="_blank" rel="noreferrer">Remote OK</a> and{" "}
          <a href="https://www.arbeitnow.com" target="_blank" rel="noreferrer">Arbeitnow</a>
        </span>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}