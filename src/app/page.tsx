'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

export default function Tech24Dashboard() {
  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<'feed' | 'bookmarks'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('impact');
  
  // Data State
  const [events, setEvents] = useState<TechEvent[]>([]);
  const [bookmarks, setBookmarks] = useState<TechEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Drawer UI State
  const [selectedEvent, setSelectedEvent] = useState<TechEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [controlDrawerOpen, setControlDrawerOpen] = useState<boolean>(false);
  
  // Ingestion In-Progress State
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [ingestStats, setIngestStats] = useState<any>(null);

  // Time-Gate Countdown State (counts down to next 30-minute block)
  const [countdownText, setCountdownText] = useState<string>('05:00');

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Fetch Feed
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All') {
        params.append('category', selectedCategory);
      }
      if (sortBy) {
        params.append('sort', sortBy);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load feed');
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, sortBy, searchQuery]);

  // Fetch Bookmarks
  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookmarks');
      if (!res.ok) throw new Error('Failed to load bookmarks');
      const data = await res.json();
      setBookmarks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    if (activeTab === 'feed') {
      fetchFeed();
    } else {
      fetchBookmarks();
    }
  }, [activeTab, fetchFeed, fetchBookmarks]);

  // Bookmarking Action
  const toggleBookmark = async (e: React.MouseEvent, eventId: number) => {
    e.stopPropagation(); // Avoid triggering open drawer
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId })
      });
      if (!res.ok) throw new Error('Bookmark toggle failed');
      const result = await res.json();

      // Update local state
      const updateList = (list: TechEvent[]) =>
        list.map(item =>
          item.id === eventId ? { ...item, bookmarked: result.bookmarked } : item
        );

      setEvents(prev => updateList(prev));
      setBookmarks(prev => prev.filter(item => item.id !== eventId));

      if (selectedEvent && selectedEvent.id === eventId) {
        setSelectedEvent(prev => prev ? { ...prev, bookmarked: result.bookmarked } : null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Ingestion Action
  const triggerIngestion = async () => {
    setIsIngesting(true);
    setIngestStats(null);
    setIngestLogs(['[SYSTEM] Starting pipeline crawl request...', '[SYSTEM] Fetching sources: Hacker News, TechCrunch, arXiv, GitHub...']);
    
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const result = await res.json();
      
      if (result.success) {
        setIngestStats({
          fetched: result.articlesFetched,
          newCount: result.newArticles,
          created: result.eventsCreated
        });
        setIngestLogs(result.logs || ['[SYSTEM] Crawl succeeded!']);
        // Refresh appropriate view
        if (activeTab === 'feed') fetchFeed();
      } else {
        setIngestLogs(prev => [...prev, `[SYSTEM ERROR] Ingestion failed: ${result.error}`]);
      }
    } catch (err: any) {
      setIngestLogs(prev => [...prev, `[SYSTEM ERROR] Connection issue: ${err.message}`]);
    } finally {
      setIsIngesting(false);
    }
  };

  // Auto-refresh feed every 5 minutes silently
  useEffect(() => {
    const AUTO_REFRESH_MS = 5 * 60 * 1000;
    const refreshInterval = setInterval(() => {
      if (activeTab === 'feed') {
        fetchFeed();
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(refreshInterval);
  }, [activeTab, fetchFeed]);

  // Countdown timer logic — counts to next 5-minute boundary
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const totalSeconds = now.getMinutes() * 60 + now.getSeconds();
      // Find seconds elapsed since last 5-min mark
      const secondsSinceMark = totalSeconds % (5 * 60);
      const secondsRemaining = (5 * 60) - secondsSinceMark;
      const remMin = Math.floor(secondsRemaining / 60);
      const remSec = secondsRemaining % 60;
      setCountdownText(`${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // UI helpers
  const getImpactClass = (score: number) => {
    if (score >= 8) return 'high';
    if (score >= 5) return 'mid';
    return 'low';
  };

  const getImpactLabel = (score: number) => {
    if (score >= 8) return 'High';
    if (score >= 5) return 'Medium';
    return 'Low';
  };

  const formatDate = (dateStr: string) => {
    try {
      // Handles UTC timestamp
      const date = new Date(dateStr + 'Z'); // Appends Z to force UTC parse
      const hoursDiff = Math.abs(Date.now() - date.getTime()) / 36e5;
      
      if (hoursDiff < 1) {
        const mins = Math.round(hoursDiff * 60);
        return `${mins === 0 ? 1 : mins}m ago`;
      }
      if (hoursDiff < 24) {
        return `${Math.round(hoursDiff)}h ago`;
      }
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Recent';
    }
  };

  const openEventDrawer = (event: TechEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  const categories = ['All', 'AI/ML', 'Development', 'Business/Tech', 'Science'];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <main className="main-content">
        {/* Header Section */}
        <header className="header">
          <div className="brand-section">
            <div className="logo-badge">T24</div>
            <div>
              <h1 className="brand-title">Tech24</h1>
              <p className="brand-tagline">AI-Enriched 24-Hour Technology Intel</p>
            </div>
          </div>
          
          <div className="time-gate">
            {/* Countdown widget */}
            <div className="countdown-box">
              <span className="pulse-dot"></span>
              <span>Next update in <strong>{countdownText}</strong></span>
            </div>

            {/* Theme Toggle Button */}
            <button 
              className="control-sidebar-toggle"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>

            {/* Ingestion Console Toggle */}
            <button 
              className="control-sidebar-toggle"
              onClick={() => setControlDrawerOpen(true)}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Control Panel
            </button>
          </div>
        </header>

        {/* Dashboard Metrics Panel */}
        <section className="stats-bar">
          <div className="stat-card glass-panel">
            <span className="stat-label">Feed Scope</span>
            <span className="stat-value">Past 24h</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Events Grouped</span>
            <span className="stat-value">{events.length}</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Sources Active</span>
            <span className="stat-value">13 Outlets</span>
          </div>
          <div className="stat-card glass-panel">
            <span className="stat-label">Bookmarks Saved</span>
            <span className="stat-value">{bookmarks.length}</span>
          </div>
        </section>

        {/* Filters and Search Bar */}
        <section className="control-bar">
          <div className="filters-group">
            <button 
              className={`filter-btn ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => { setActiveTab('feed'); setSelectedCategory('All'); }}
            >
              24h Feed
            </button>
            <button 
              className={`filter-btn ${activeTab === 'bookmarks' ? 'active' : ''}`}
              onClick={() => setActiveTab('bookmarks')}
            >
              Bookmarks
            </button>
            
            {activeTab === 'feed' && (
              <>
                <div style={{ width: '1px', background: 'var(--border-light)', margin: '0 8px' }} />
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select 
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="impact">Highest Impact</option>
                  <option value="newest">Most Recent</option>
                </select>
              </>
            )}
          </div>
        </section>

        {/* Content Area */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
            <svg className="spin-icon" width="38" height="38" viewBox="0 0 38 38" stroke="var(--primary)">
              <g fill="none" fillRule="evenodd">
                <g transform="translate(1 1)" strokeWidth="3">
                  <circle strokeOpacity=".2" cx="18" cy="18" r="18"/>
                  <path d="M36 18c0-9.94-8.06-18-18-18" />
                </g>
              </g>
            </svg>
          </div>
        ) : (
          <>
            {activeTab === 'feed' && events.length === 0 && (
              <div className="empty-state">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                <h3 className="empty-title">Feed is empty</h3>
                <p className="empty-desc">No events were generated in the last 24 hours. Go to the Control Panel and trigger ingestion to crawl fresh tech logs!</p>
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
              {(activeTab === 'feed' ? events : bookmarks).map(event => (
                <article
                  key={event.id}
                  className="event-card glass-panel"
                  onClick={() => openEventDrawer(event)}
                  onMouseMove={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    (e.currentTarget as HTMLElement).style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                    (e.currentTarget as HTMLElement).style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                  }}
                >
                  <div className="card-header">
                    <div className="card-tags">
                      <span className="category-tag" data-category={event.category}>{event.category}</span>
                      <span className={`impact-badge ${getImpactClass(event.impact_score)}`}>
                        ⚡ {event.impact_score}/10
                      </span>
                    </div>

                    <button
                      className={`bookmark-btn ${event.bookmarked ? 'active' : ''}`}
                      onClick={(e) => toggleBookmark(e, event.id)}
                      title={event.bookmarked ? 'Remove Bookmark' : 'Save Bookmark'}
                    >
                      <svg width="18" height="18" fill={event.bookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>

                  <div className="card-body">
                    <h2 className="event-title">{event.title}</h2>

                    {/* 2-Bullet Summary Preview */}
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

                  <div className="card-footer">
                    <span>{formatDate(event.created_at)}</span>
                    <div className="source-badges">
                      {Array.from(new Set(event.articles.map(a => a.source_name))).slice(0, 3).map(srcName => (
                        <span key={srcName} className="source-pill">{srcName}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {/* 1. Detail side drawer */}
      <div 
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <span className="category-tag" style={{ marginBottom: '0.5rem', display: 'inline-block' }} data-category={selectedEvent?.category}>
              {selectedEvent?.category}
            </span>
            <h2 className="brand-title" style={{ fontSize: '1.4rem', WebkitTextFillColor: 'unset', color: 'white' }}>
              Event Intel
            </h2>
          </div>
          <button 
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {selectedEvent && (
          <div className="drawer-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`impact-badge ${getImpactClass(selectedEvent.impact_score)}`} style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
                Impact Score: {selectedEvent.impact_score}/10
              </span>
              <button 
                className={`bookmark-btn ${selectedEvent.bookmarked ? 'active' : ''}`}
                onClick={(e) => toggleBookmark(e, selectedEvent.id)}
                style={{ padding: '8px', border: '1px solid var(--border-light)' }}
              >
                <svg width="18" height="18" fill={selectedEvent.bookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </div>

            <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', color: 'white', lineHeight: '1.3' }}>
              {selectedEvent.title}
            </h3>

            {/* AI Summary Section */}
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

            {/* Associated Articles list */}
            <div>
              <div className="drawer-section-title">Aggregated Sources ({selectedEvent.articles.length})</div>
              <div className="sources-list">
                {selectedEvent.articles.map(art => (
                  <a 
                    key={art.id} 
                    href={art.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="source-item-link"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '85%' }}>
                      <span className="source-item-title" title={art.original_title}>
                        {art.original_title}
                      </span>
                      <div className="source-item-meta">
                        <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{art.source_name}</span>
                        <span>•</span>
                        <span>{formatDate(art.fetched_at)}</span>
                      </div>
                    </div>
                    <svg className="arrow-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Control panel & crawler drawer */}
      <div 
        className={`drawer-backdrop ${controlDrawerOpen ? 'open' : ''}`}
        onClick={() => setControlDrawerOpen(false)}
      />
      <div className={`drawer ${controlDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <h2 className="brand-title" style={{ fontSize: '1.4rem', WebkitTextFillColor: 'unset', color: 'white' }}>
              Crawler Console
            </h2>
            <p className="brand-tagline">Manage feeds & AI ingestion</p>
          </div>
          <button 
            className="drawer-close"
            onClick={() => setControlDrawerOpen(false)}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          <div className="detail-bullet-card" style={{ background: 'rgba(255,255,255,0.01)', borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: '600' }}>Pipeline Status</span>
              <span className={`status-badge-pipeline ${isIngesting ? 'running' : ''}`}>
                {isIngesting ? 'CRAWLING & CLUSTERING' : 'IDLE / READY'}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              News is auto-refreshed every <strong>5 minutes</strong> and purged after <strong>24 hours</strong>. Bookmarked items are never deleted.
              Sources: <strong>Hacker News</strong>, <strong>TechCrunch</strong>, <strong>The Verge</strong>, <strong>Wired</strong>, <strong>Ars Technica</strong>, <strong>VentureBeat</strong>, <strong>MIT Tech Review</strong>, <strong>arXiv CS/AI</strong>, <strong>GitHub Trending</strong>, <strong>Dev.to</strong>, <strong>Product Hunt</strong>, <strong>Reddit r/technology</strong>, <strong>Reddit r/MachineLearning</strong>.
            </p>
          </div>

          <button 
            className="btn-primary"
            onClick={triggerIngestion}
            disabled={isIngesting}
            style={{ justifyContent: 'center' }}
          >
            {isIngesting ? (
              <>
                <svg className="spin-icon" width="16" height="16" viewBox="0 0 38 38" stroke="currentColor">
                  <g fill="none" fillRule="evenodd">
                    <g transform="translate(1 1)" strokeWidth="3">
                      <circle strokeOpacity=".2" cx="18" cy="18" r="18"/>
                      <path d="M36 18c0-9.94-8.06-18-18-18" />
                    </g>
                  </g>
                </svg>
                Running AI Ingestion Engine...
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5M4 17a8.001 8.001 0 0015.357-2H17" />
                </svg>
                Trigger Ingestion Pipeline
              </>
            )}
          </button>

          {/* Stats from last ingest */}
          {ingestStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <span className="stat-label" style={{ fontSize: '0.65rem' }}>Fetched</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '0.2rem' }}>{ingestStats.fetched}</div>
              </div>
              <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <span className="stat-label" style={{ fontSize: '0.65rem' }}>New Saved</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '0.2rem', color: 'var(--accent-cyan)' }}>{ingestStats.newCount}</div>
              </div>
              <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center' }}>
                <span className="stat-label" style={{ fontSize: '0.65rem' }}>Events Built</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '0.2rem', color: 'var(--primary)' }}>{ingestStats.created}</div>
              </div>
            </div>
          )}

          {/* Real-time Logs Terminal */}
          <div>
            <div className="drawer-section-title">Console Output</div>
            <div className="log-terminal">
              {ingestLogs.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>[SYSTEM] Ready. Click trigger to begin crawl...</span>
              ) : (
                ingestLogs.map((logStr, idx) => (
                  <div key={idx} className="log-entry">
                    {logStr}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
