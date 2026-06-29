'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface RawArticle {
  id: number;
  original_title: string;
  url: string;
  fetched_at: string;
  source_name: string;
}

interface EventSummary {
  what: string;
  why: string;
  who: string;
}

interface TechEvent {
  id: number;
  title: string;
  ai_summary: EventSummary;
  impact_score: number;
  category: string;
  primary_link: string;
  created_at: string;
  bookmarked: boolean;
  articles: RawArticle[];
}

/* ─── SVG Donut Chart ─────────────────────────── */
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</div>;

  const r = 42, cx = 56, cy = 56, stroke = 18;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
      <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const dashLen = (d.value / total) * circumference;
          const dashGap = circumference - dashLen;
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          );
          offset += dashLen;
          return seg;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-primary)" fontSize="16" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-muted)" fontSize="9">events</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 0 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Horizontal Bar Chart ────────────────────── */
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.76rem' }}>
          <span style={{ color: 'var(--text-muted)', width: 55, textAlign: 'right', flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(d.value / max) * 100}%`,
              background: d.color,
              borderRadius: 4,
              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <span style={{ color: 'var(--text-secondary)', width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Impact Score Meter ──────────────────────── */
function ImpactMeter({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? '#8b5cf6' : score >= 5 ? '#06b6d4' : '#4a4a6a';
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', marginTop: 'auto' }}>
      <div style={{
        height: '100%', width: `${pct}%`, background: color,
        borderRadius: 2, transition: 'width 0.8s ease',
        boxShadow: `0 0 6px ${color}88`
      }} />
    </div>
  );
}

/* ─── Sparkline (mini category icon) ─────────── */
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, JSX.Element> = {
    'AI/ML': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    'Development': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    'Business/Tech': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    'Science': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  };
  return icons[category] || null;
}

/* ════════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════════ */
export default function Tech24Dashboard() {
  const [activeTab, setActiveTab] = useState<'feed' | 'bookmarks'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('impact');
  const [events, setEvents] = useState<TechEvent[]>([]);
  const [bookmarks, setBookmarks] = useState<TechEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<TechEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [controlDrawerOpen, setControlDrawerOpen] = useState<boolean>(false);
  const [analyticsOpen, setAnalyticsOpen] = useState<boolean>(false);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [ingestStats, setIngestStats] = useState<any>(null);
  const [countdownText, setCountdownText] = useState<string>('01:00');
  const [countdownPct, setCountdownPct] = useState<number>(100);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All') params.append('category', selectedCategory);
      if (sortBy) params.append('sort', sortBy);
      if (searchQuery) params.append('search', searchQuery);
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load feed');
      setEvents(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedCategory, sortBy, searchQuery]);

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookmarks');
      if (!res.ok) throw new Error('Failed to load bookmarks');
      setBookmarks(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'feed') fetchFeed(); else fetchBookmarks();
  }, [activeTab, fetchFeed, fetchBookmarks]);

  // Auto-refresh every 1 minute
  useEffect(() => {
    const id = setInterval(() => { if (activeTab === 'feed') fetchFeed(); }, 60_000);
    return () => clearInterval(id);
  }, [activeTab, fetchFeed]);

  // Countdown — 1-minute boundary
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const secSinceMark = now.getSeconds();
      const remaining = 60 - secSinceMark;
      setCountdownText(`00:${String(remaining).padStart(2, '0')}`);
      setCountdownPct((remaining / 60) * 100);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleBookmark = async (e: React.MouseEvent, eventId: number) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) throw new Error('Bookmark toggle failed');
      const result = await res.json();
      const updateList = (list: TechEvent[]) => list.map(item => item.id === eventId ? { ...item, bookmarked: result.bookmarked } : item);
      setEvents(prev => updateList(prev));
      setBookmarks(prev => prev.filter(item => item.id !== eventId));
      if (selectedEvent?.id === eventId) setSelectedEvent(prev => prev ? { ...prev, bookmarked: result.bookmarked } : null);
    } catch (err) { console.error(err); }
  };

  const triggerIngestion = async () => {
    setIsIngesting(true);
    setIngestStats(null);
    setIngestLogs(['[SYSTEM] Starting pipeline crawl request...']);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setIngestStats({ fetched: result.articlesFetched, newCount: result.newArticles, created: result.eventsCreated });
        setIngestLogs(result.logs || ['[SYSTEM] Crawl succeeded!']);
        if (activeTab === 'feed') fetchFeed();
      } else {
        setIngestLogs(prev => [...prev, `[ERROR] ${result.error}`]);
      }
    } catch (err: any) {
      setIngestLogs(prev => [...prev, `[ERROR] ${err.message}`]);
    } finally { setIsIngesting(false); }
  };

  const getImpactClass = (s: number) => s >= 8 ? 'high' : s >= 5 ? 'mid' : 'low';
  const getImpactLabel = (s: number) => s >= 8 ? 'High' : s >= 5 ? 'Med' : 'Low';

  const formatDate = (d: string) => {
    try {
      const date = new Date(d + 'Z');
      const h = Math.abs(Date.now() - date.getTime()) / 36e5;
      if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
      if (h < 24) return `${Math.round(h)}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return 'Recent'; }
  };

  const openEventDrawer = (event: TechEvent) => { setSelectedEvent(event); setDrawerOpen(true); };
  const categories = ['All', 'AI/ML', 'Development', 'Business/Tech', 'Science'];

  /* ─── Analytics Data ─── */
  const catColors: Record<string, string> = {
    'AI/ML': '#8b5cf6',
    'Development': '#10b981',
    'Business/Tech': '#06b6d4',
    'Science': '#f59e0b',
  };

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
    return Object.entries(counts).map(([label, value]) => ({ label, value, color: catColors[label] || '#6b7280' }));
  }, [events]);

  const impactDistribution = useMemo(() => [
    { label: 'High (8–10)', value: events.filter(e => e.impact_score >= 8).length, color: '#8b5cf6' },
    { label: 'Med (5–7)', value: events.filter(e => e.impact_score >= 5 && e.impact_score < 8).length, color: '#06b6d4' },
    { label: 'Low (1–4)', value: events.filter(e => e.impact_score < 5).length, color: '#4a4a6a' },
  ], [events]);

  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(ev => ev.articles.forEach(a => { counts[a.source_name] = (counts[a.source_name] || 0) + 1; }));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        label, value,
        color: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa'][i % 6],
      }));
  }, [events]);

  const avgImpact = useMemo(() =>
    events.length ? (events.reduce((s, e) => s + e.impact_score, 0) / events.length).toFixed(1) : '—',
  [events]);

  const displayEvents = activeTab === 'feed' ? events : bookmarks;

  return (
    <div className="app-container">
      <main className="main-content">

        {/* ── HEADER ── */}
        <header className="header">
          <div className="brand-section">
            <div className="logo-badge">T24</div>
            <div>
              <h1 className="brand-title">Tech24</h1>
              <p className="brand-tagline">AI-Enriched 24-Hour Technology Intel</p>
            </div>
          </div>

          <div className="time-gate">
            {/* Countdown with ring */}
            <div className="countdown-box">
              <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="2.5" />
                <circle
                  cx="11" cy="11" r="9" fill="none"
                  stroke="var(--purple)" strokeWidth="2.5"
                  strokeDasharray={`${(countdownPct / 100) * 56.5} 56.5`}
                  strokeDashoffset="14.125"
                  transform="rotate(-90 11 11)"
                  style={{ transition: 'stroke-dasharray 1s linear' }}
                />
              </svg>
              <span>Next update <strong>{countdownText}</strong></span>
            </div>

            <button className="control-sidebar-toggle" onClick={() => setAnalyticsOpen(v => !v)} title="Analytics">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </button>

            <button className="control-sidebar-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>

            <button className="control-sidebar-toggle" onClick={() => setControlDrawerOpen(true)}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Control
            </button>
          </div>
        </header>

        {/* ── STATS BAR ── */}
        <section className="stats-bar">
          <div className="stat-card glass-panel">
            <span className="stat-label">Feed Scope</span>
            <span className="stat-value">24h</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Events Grouped</span>
            <span className="stat-value">{events.length}</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Avg Impact</span>
            <span className="stat-value">{avgImpact}</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Bookmarks</span>
            <span className="stat-value">{bookmarks.length}</span>
          </div>
        </section>

        {/* ── ANALYTICS PANEL (collapsible) ── */}
        {analyticsOpen && (
          <section className="analytics-panel glass-panel" style={{ marginBottom: '1.75rem', padding: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--purple-light)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                📊 Feed Analytics
              </h2>
              <button onClick={() => setAnalyticsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem' }}>

              {/* Category Donut */}
              <div className="chart-card">
                <p className="chart-title">Category Breakdown</p>
                <DonutChart data={categoryData} />
              </div>

              {/* Impact Distribution */}
              <div className="chart-card">
                <p className="chart-title">Impact Distribution</p>
                <BarChart data={impactDistribution} />
              </div>

              {/* Top Sources */}
              <div className="chart-card">
                <p className="chart-title">Top Sources by Articles</p>
                <BarChart data={sourceData} />
              </div>

              {/* Quick numbers */}
              <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <p className="chart-title">Quick Stats</p>
                {[
                  { label: 'High Impact (≥8)', value: events.filter(e => e.impact_score >= 8).length, color: '#8b5cf6' },
                  { label: 'AI/ML Events', value: events.filter(e => e.category === 'AI/ML').length, color: '#8b5cf6' },
                  { label: 'Dev Events', value: events.filter(e => e.category === 'Development').length, color: '#10b981' },
                  { label: 'Sources Active', value: 10, color: '#06b6d4' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color, fontSize: '1rem' }}>{item.value}</span>
                  </div>
                ))}
              </div>

            </div>
          </section>
        )}

        {/* ── FILTERS ── */}
        <section className="control-bar">
          <div className="filters-group">
            <button className={`filter-btn ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => { setActiveTab('feed'); setSelectedCategory('All'); }}>
              24h Feed
            </button>
            <button className={`filter-btn ${activeTab === 'bookmarks' ? 'active' : ''}`} onClick={() => setActiveTab('bookmarks')}>
              Bookmarks
            </button>

            {activeTab === 'feed' && (
              <>
                <div style={{ width: '1px', background: 'var(--border-light)', margin: '0 6px' }} />
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat !== 'All' && <CategoryIcon category={cat} />}
                    {cat}
                    {cat !== 'All' && events.length > 0 && (
                      <span style={{
                        marginLeft: '0.3rem', fontSize: '0.65rem', fontWeight: 700,
                        background: selectedCategory === cat ? 'rgba(255,255,255,0.25)' : 'var(--purple-dim)',
                        color: selectedCategory === cat ? '#fff' : 'var(--purple-light)',
                        borderRadius: '9999px', padding: '0 5px', lineHeight: '1.6',
                      }}>
                        {events.filter(e => e.category === cat).length}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="search-sort-group">
            {activeTab === 'feed' && (
              <>
                <div className="search-input-wrapper">
                  <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search titles & summaries..."
                    className="search-input"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="impact">Highest Impact</option>
                  <option value="newest">Most Recent</option>
                </select>
              </>
            )}
          </div>
        </section>

        {/* ── CONTENT ── */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem', gap: '1rem' }}>
            <svg className="spin-icon" width="38" height="38" viewBox="0 0 38 38" stroke="var(--purple)">
              <g fill="none" fillRule="evenodd"><g transform="translate(1 1)" strokeWidth="3">
                <circle strokeOpacity=".2" cx="18" cy="18" r="18" />
                <path d="M36 18c0-9.94-8.06-18-18-18" />
              </g></g>
            </svg>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading feed…</span>
          </div>
        ) : (
          <>
            {activeTab === 'feed' && events.length === 0 && (
              <div className="empty-state">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                <h3 className="empty-title">Feed is empty</h3>
                <p className="empty-desc">No events in the last 24 hours. Open the Control Panel and trigger ingestion to crawl fresh tech news!</p>
                <button className="btn-primary" onClick={() => setControlDrawerOpen(true)}>Open Control Panel</button>
              </div>
            )}

            {activeTab === 'bookmarks' && bookmarks.length === 0 && (
              <div className="empty-state">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <h3 className="empty-title">No bookmarks saved</h3>
                <p className="empty-desc">Bookmark tech events from the feed to save them for later reference.</p>
                <button className="btn-primary" onClick={() => setActiveTab('feed')}>View 24h Feed</button>
              </div>
            )}

            <div className="events-grid">
              {displayEvents.map((event, idx) => (
                <article
                  key={event.id}
                  className="event-card glass-panel"
                  style={{ animationDelay: `${idx * 40}ms` }}
                  onClick={() => openEventDrawer(event)}
                  onMouseMove={e => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    (e.currentTarget as HTMLElement).style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                    (e.currentTarget as HTMLElement).style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                  }}
                >
                  <div className="card-header">
                    <div className="card-tags">
                      <span className="category-tag" data-category={event.category}>
                        <CategoryIcon category={event.category} />
                        {event.category}
                      </span>
                      <span className={`impact-badge ${getImpactClass(event.impact_score)}`}>
                        ⚡ {event.impact_score}/10
                      </span>
                    </div>
                    <button
                      className={`bookmark-btn ${event.bookmarked ? 'active' : ''}`}
                      onClick={e => toggleBookmark(e, event.id)}
                      title={event.bookmarked ? 'Remove Bookmark' : 'Save Bookmark'}
                    >
                      <svg width="17" height="17" fill={event.bookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>

                  <div className="card-body">
                    <h2 className="event-title">{event.title}</h2>
                    <div className="bullet-list">
                      <div className="bullet-item">
                        <span className="bullet-icon">▸</span>
                        <span>{event.ai_summary.what}</span>
                      </div>
                      <div className="bullet-item">
                        <span className="bullet-icon">▸</span>
                        <span>{event.ai_summary.why}</span>
                      </div>
                    </div>
                  </div>

                  {/* Impact meter bar */}
                  <ImpactMeter score={event.impact_score} />

                  <div className="card-footer">
                    <span>{formatDate(event.created_at)}</span>
                    <div className="source-badges">
                      {Array.from(new Set(event.articles.map(a => a.source_name))).slice(0, 3).map(src => (
                        <span key={src} className="source-pill">{src}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── EVENT DETAIL DRAWER ── */}
      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <span className="category-tag" style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} data-category={selectedEvent?.category}>
              <CategoryIcon category={selectedEvent?.category || ''} />
              {selectedEvent?.category}
            </span>
            <h2 className="brand-title" style={{ fontSize: '1.4rem', WebkitTextFillColor: 'unset' }}>Event Intel</h2>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {selectedEvent && (
          <div className="drawer-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`impact-badge ${getImpactClass(selectedEvent.impact_score)}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
                ⚡ {selectedEvent.impact_score}/10 — {getImpactLabel(selectedEvent.impact_score)} Impact
              </span>
              <button
                className={`bookmark-btn ${selectedEvent.bookmarked ? 'active' : ''}`}
                onClick={e => toggleBookmark(e, selectedEvent.id)}
                style={{ padding: '8px', border: '1px solid var(--border-light)', borderRadius: '10px' }}
              >
                <svg width="18" height="18" fill={selectedEvent.bookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </div>

            {/* Impact visual meter */}
            <div style={{ margin: '-0.5rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                <span>Impact Score</span><span>{selectedEvent.impact_score}/10</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(selectedEvent.impact_score / 10) * 100}%`,
                  background: `linear-gradient(90deg, #8b5cf6, #06b6d4)`,
                  borderRadius: 3,
                  boxShadow: '0 0 8px rgba(139,92,246,0.5)',
                  transition: 'width 0.8s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <span key={n} style={{ color: n <= selectedEvent.impact_score ? 'var(--purple-light)' : 'var(--text-muted)', fontWeight: n <= selectedEvent.impact_score ? 700 : 400 }}>{n}</span>
                ))}
              </div>
            </div>

            <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', color: 'var(--text-primary)', lineHeight: '1.4', fontWeight: 700 }}>
              {selectedEvent.title}
            </h3>

            {/* AI Briefing */}
            <div>
              <div className="drawer-section-title">AI Briefing</div>
              <div className="detail-bullet-card cyan">
                <span className="detail-bullet-label">What is it?</span>
                <p className="detail-bullet-desc">{selectedEvent.ai_summary.what}</p>
              </div>
              <div className="detail-bullet-card indigo">
                <span className="detail-bullet-label">Why does it matter?</span>
                <p className="detail-bullet-desc">{selectedEvent.ai_summary.why}</p>
              </div>
              <div className="detail-bullet-card pink">
                <span className="detail-bullet-label">Who does it impact?</span>
                <p className="detail-bullet-desc">{selectedEvent.ai_summary.who}</p>
              </div>
            </div>

            {/* Sources */}
            <div>
              <div className="drawer-section-title">Sources ({selectedEvent.articles.length})</div>
              <div className="sources-list">
                {selectedEvent.articles.map(art => (
                  <a key={art.id} href={art.url} target="_blank" rel="noopener noreferrer" className="source-item-link" onClick={e => e.stopPropagation()}>
                    <div>
                      <div className="source-item-title">{art.original_title}</div>
                      <div className="source-item-meta">
                        <span className="source-pill">{art.source_name}</span>
                        <span>·</span>
                        <span>{formatDate(art.fetched_at)}</span>
                      </div>
                    </div>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="arrow-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Read full article */}
            <a
              href={selectedEvent.primary_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ textDecoration: 'none', justifyContent: 'center' }}
              onClick={e => e.stopPropagation()}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Read Full Article
            </a>
          </div>
        )}
      </div>

      {/* ── CONTROL PANEL DRAWER ── */}
      <div className={`drawer-backdrop ${controlDrawerOpen ? 'open' : ''}`} onClick={() => setControlDrawerOpen(false)} />
      <div className={`drawer ${controlDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <h2 className="brand-title" style={{ fontSize: '1.4rem', WebkitTextFillColor: 'unset' }}>Control Panel</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Crawler Console — 10 active sources</p>
          </div>
          <button className="drawer-close" onClick={() => setControlDrawerOpen(false)}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="drawer-section-title" style={{ margin: 0, flex: 1 }}>Pipeline Status</div>
            <span className={`status-badge-pipeline ${isIngesting ? 'running' : ''}`}>
              {isIngesting ? '⚙ Running' : '● Idle'}
            </span>
          </div>

          <button className="btn-primary" onClick={triggerIngestion} disabled={isIngesting} style={{ width: '100%', justifyContent: 'center' }}>
            {isIngesting ? (
              <><svg className="spin-icon" width="16" height="16" viewBox="0 0 38 38" stroke="currentColor"><g fill="none"><g transform="translate(1 1)" strokeWidth="3"><circle strokeOpacity=".4" cx="18" cy="18" r="18" /><path d="M36 18c0-9.94-8.06-18-18-18" /></g></g></svg>Crawling…</>
            ) : (
              <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Trigger Ingestion Now</>
            )}
          </button>

          {ingestStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {[
                { label: 'Fetched', value: ingestStats.fetched, color: '#8b5cf6' },
                { label: 'New', value: ingestStats.newCount, color: '#10b981' },
                { label: 'Events', value: ingestStats.created, color: '#06b6d4' },
              ].map(s => (
                <div key={s.label} className="glass-panel" style={{ padding: '0.85rem', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
                  <div style={{ fontFamily: 'var(--font-title)', fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="drawer-section-title">Crawler Log</div>
            <div className="log-terminal">
              {ingestLogs.length === 0
                ? <span style={{ color: 'var(--text-muted)' }}>Waiting for crawl trigger…</span>
                : ingestLogs.map((log, i) => <div key={i} className="log-entry">{log}</div>)
              }
            </div>
          </div>

          <div>
            <div className="drawer-section-title">Active Sources</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {['Hacker News','TechCrunch','GitHub Trending','The Verge','Wired','Ars Technica','VentureBeat','Dev.to','arXiv CS/AI','MIT Tech Review'].map((src, i) => (
                <div key={src} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.6rem 0.8rem', borderRadius: '10px',
                  background: 'rgba(139,92,246,0.04)', border: '1px solid var(--border-light)',
                  fontSize: '0.78rem', color: 'var(--text-secondary)',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0, boxShadow: '0 0 5px #10b981' }} />
                  {src}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="drawer-section-title">System Config</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[
                { key: 'Poll Interval', val: '1 minute' },
                { key: 'Retention', val: '24 hours' },
                { key: 'AI Model', val: 'Gemini 2.5 Flash' },
                { key: 'Clustering', val: 'Jaccard ≥ 0.22' },
              ].map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{item.key}</span>
                  <span style={{ color: 'var(--purple-light)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
