import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './TransparencyScorecard.module.css';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const TABS = [
  { id: 'scorecard',  label: 'Scorecard' },
  { id: 'shame',      label: 'Hall of Shame' },
  { id: 'leaders',    label: 'Leaders' },
  { id: 'coverage',   label: 'State Coverage' },
];

const ACCESS_COLOR = {
  automatable:     '#22c55e',
  browser_required:'#f59e0b',
  auth_required:   '#f97316',
  dead:            '#ef4444',
  unknown:         '#71717a',
};

const ACCESS_LABEL = {
  automatable:     'Automatable',
  browser_required:'Browser',
  auth_required:   'Auth Wall',
  dead:            'Dead',
  unknown:         'Unknown',
};

function ScoreBar({ value, color }) {
  if (value == null) return <span className={s.na}>—</span>;
  return (
    <div className={s.scoreCell}>
      <div className={s.scoreBar} style={{ width: `${Math.min(100, value)}%`, background: color }} />
      <span className={s.scoreNum}>{value}</span>
    </div>
  );
}

function AccessBadge({ type }) {
  const color = ACCESS_COLOR[type] || '#71717a';
  const label = ACCESS_LABEL[type] || type || '—';
  return <span className={s.badge} style={{ color, borderColor: color + '44' }}>{label}</span>;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function exportCsv(rows, filename) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

function SortTh({ col, sort, onSort, children, left }) {
  const active = sort.col === col;
  return (
    <th className={left ? s.thLeft : ''} onClick={() => onSort(col)}>
      {children}
      <span className={s.sortArrow}>
        {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

function useSort(data, defaultCol, defaultDir = 'desc') {
  const [sort, setSort] = useState({ col: defaultCol, dir: defaultDir });
  const sorted = useMemo(() => {
    if (!data.length) return data;
    return [...data].sort((a, b) => {
      const av = a[sort.col] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = b[sort.col] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [data, sort]);
  const onSort = col => setSort(prev =>
    prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: defaultDir }
  );
  return { sort, onSort, sorted };
}

/* ── Main component ──────────────────────────────────────────────── */
export default function TransparencyScorecard() {
  const [tab, setTab] = useState('scorecard');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');

  const stateQ = state ? `&state=${state}` : '';
  const { data: stats, loading: loadStats } = useApi('/clearnetwork/latest-stats');
  const { data: scorecard = [], loading: loadScore } = useApi(`/clearnetwork/scorecard?limit=500${stateQ}`);
  const { data: shame = [], loading: loadShame } = useApi('/clearnetwork/debt-hall-of-shame?limit=50');
  const { data: leaders = [], loading: loadLeaders } = useApi('/clearnetwork/transparency-leaders?limit=50');
  const { data: coverage = [], loading: loadCoverage } = useApi('/clearnetwork/state-coverage');

  const kpi = stats?.coverage || {};
  const latest = stats?.latest_crawl || null;

  /* Scorecard filter + sort */
  const filteredScore = useMemo(() => {
    let d = scorecard;
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(r => r.insurer_name?.toLowerCase().includes(q));
    }
    return d;
  }, [scorecard, search]);

  const { sort: scSort, onSort: scOnSort, sorted: scRows } = useSort(filteredScore, 'transparency_score', 'desc');
  const { sort: covSort, onSort: covOnSort, sorted: covRows } = useSort(coverage, 'total_insurers', 'desc');

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <h1 className={s.title}>Transparency Scorecard</h1>
        <p className={s.subtitle}>
          ClearNetwork compliance tracking — which insurers are honoring the CMS Transparency in Coverage rule
        </p>
      </div>

      {/* ── KPI Row ── */}
      <div className={s.kpiRow}>
        {[
          {
            label: 'Insurers Tracked',
            value: kpi.total_entries?.toLocaleString() ?? '—',
            sub: `${kpi.states ?? '—'} states`,
          },
          {
            label: 'Automatable',
            value: kpi.automatable?.toLocaleString() ?? '—',
            sub: kpi.total_entries ? `${Math.round(kpi.automatable / kpi.total_entries * 100)}% of tracked` : '',
            good: true,
          },
          {
            label: 'Browser / Auth Wall',
            value: (kpi.browser_required ?? 0).toLocaleString(),
            sub: 'hidden behind UI or auth',
            bad: true,
          },
          {
            label: 'Avg Transparency Score',
            value: kpi.avg_transparency != null ? `${kpi.avg_transparency}/100` : '—',
            sub: 'higher is better',
            good: (kpi.avg_transparency ?? 0) >= 50,
            bad: (kpi.avg_transparency ?? 0) < 50,
          },
          {
            label: 'Avg Digital Debt',
            value: kpi.avg_debt != null ? `${kpi.avg_debt}/100` : '—',
            sub: 'lower is better',
            bad: (kpi.avg_debt ?? 0) >= 40,
            good: (kpi.avg_debt ?? 0) < 40,
          },
        ].map((c, i) => (
          <div key={i} className={s.kpiCard} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={s.kpiLabel}>{c.label}</div>
            <div className={`${s.kpiValue} ${c.good ? s.good : c.bad ? s.bad : ''}`}>{c.value}</div>
            {c.sub && <div className={s.kpiSub}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {/* ── Scorecard tab ── */}
      {tab === 'scorecard' && (
        <Panel
          title="Transparency Scorecard"
          subtitle={`${scRows.length} insurers${state ? ` in ${state}` : ''}`}
          actions={
            <>
              <div className={s.fieldGroup}>
                <span className={s.fieldLabel}>State</span>
                <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
                  <option value="">All States</option>
                  {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div className={s.fieldGroup}>
                <span className={s.fieldLabel}>Search</span>
                <input
                  className={s.searchInput}
                  placeholder="Insurer name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className={s.exportBtn} onClick={() => exportCsv(scRows, 'transparency-scorecard.csv')}>
                Export CSV
              </button>
            </>
          }
        >
          {loadScore ? <Skeleton height={400} /> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <SortTh col="insurer_name" sort={scSort} onSort={scOnSort} left>Insurer</SortTh>
                    <SortTh col="state" sort={scSort} onSort={scOnSort}>State</SortTh>
                    <SortTh col="transparency_score" sort={scSort} onSort={scOnSort}>Transparency</SortTh>
                    <SortTh col="digital_debt_score" sort={scSort} onSort={scOnSort}>Digital Debt</SortTh>
                    <SortTh col="accessibility" sort={scSort} onSort={scOnSort}>Access</SortTh>
                    <SortTh col="index_type" sort={scSort} onSort={scOnSort}>Index Type</SortTh>
                    <SortTh col="response_time_ms" sort={scSort} onSort={scOnSort}>Resp ms</SortTh>
                    <SortTh col="last_probed_at" sort={scSort} onSort={scOnSort}>Last Probed</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {scRows.map((r, i) => (
                    <tr key={i}>
                      <td className={s.tdLeft}>
                        <div className={s.insurerName}>{r.insurer_name}</div>
                        {r.mrf_url && (
                          <a href={r.mrf_url} target="_blank" rel="noopener noreferrer" className={s.mrfLink}>
                            MRF ↗
                          </a>
                        )}
                      </td>
                      <td><span className={s.stateChip}>{r.state}</span></td>
                      <td><ScoreBar value={r.transparency_score} color="#22c55e" /></td>
                      <td><ScoreBar value={r.digital_debt_score} color="#ef4444" /></td>
                      <td><AccessBadge type={r.accessibility} /></td>
                      <td className={s.mono}>{r.index_type || '—'}</td>
                      <td className={s.mono}>{r.response_time_ms ?? '—'}</td>
                      <td className={s.mono}>{fmtDate(r.last_probed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Hall of Shame tab ── */}
      {tab === 'shame' && (
        <Panel
          title="Digital Debt Hall of Shame"
          subtitle="Insurers with the highest technical barriers to transparency"
          actions={
            <button className={s.exportBtn} onClick={() => exportCsv(shame, 'hall-of-shame.csv')}>
              Export CSV
            </button>
          }
        >
          {loadShame ? <Skeleton height={400} /> : shame.length === 0 ? (
            <p className={s.empty}>No data available — run the scout to score insurers.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>#</th>
                    <th className={s.thLeft}>Insurer</th>
                    <th>State</th>
                    <th>Digital Debt</th>
                    <th>Transparency</th>
                    <th>Access</th>
                    <th className={s.thLeft}>Issue</th>
                    <th>Last Probed</th>
                  </tr>
                </thead>
                <tbody>
                  {shame.map((r, i) => (
                    <tr key={i}>
                      <td className={s.rank}>{i + 1}</td>
                      <td className={s.tdLeft}>
                        <div className={s.insurerName}>{r.insurer_name}</div>
                      </td>
                      <td><span className={s.stateChip}>{r.state}</span></td>
                      <td><ScoreBar value={r.digital_debt_score} color="#ef4444" /></td>
                      <td><ScoreBar value={r.transparency_score} color="#22c55e" /></td>
                      <td><AccessBadge type={r.accessibility} /></td>
                      <td className={s.tdLeft}>
                        <span className={s.notes}>{r.notes || '—'}</span>
                      </td>
                      <td className={s.mono}>{fmtDate(r.last_probed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Leaders tab ── */}
      {tab === 'leaders' && (
        <Panel
          title="Transparency Leaders"
          subtitle="Insurers with the highest transparency scores"
          actions={
            <button className={s.exportBtn} onClick={() => exportCsv(leaders, 'transparency-leaders.csv')}>
              Export CSV
            </button>
          }
        >
          {loadLeaders ? <Skeleton height={400} /> : leaders.length === 0 ? (
            <p className={s.empty}>No scored data yet — run the scout to score insurers.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>#</th>
                    <th className={s.thLeft}>Insurer</th>
                    <th>State</th>
                    <th>Transparency</th>
                    <th>Digital Debt</th>
                    <th>Index Type</th>
                    <th>Content-Type</th>
                    <th>SSL</th>
                    <th>Gzip</th>
                    <th>Last Probed</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((r, i) => (
                    <tr key={i}>
                      <td className={s.rank}>{i + 1}</td>
                      <td className={s.tdLeft}>
                        <div className={s.insurerName}>{r.insurer_name}</div>
                        {r.mrf_url && (
                          <a href={r.mrf_url} target="_blank" rel="noopener noreferrer" className={s.mrfLink}>
                            MRF ↗
                          </a>
                        )}
                      </td>
                      <td><span className={s.stateChip}>{r.state}</span></td>
                      <td><ScoreBar value={r.transparency_score} color="#22c55e" /></td>
                      <td><ScoreBar value={r.digital_debt_score} color="#ef4444" /></td>
                      <td className={s.mono}>{r.index_type || '—'}</td>
                      <td className={s.mono}>{r.content_type ? r.content_type.split(';')[0] : '—'}</td>
                      <td>{r.ssl_valid === true ? <span className={s.good}>✓</span> : r.ssl_valid === false ? <span className={s.bad}>✗</span> : '—'}</td>
                      <td>{r.supports_gzip === true ? <span className={s.good}>✓</span> : r.supports_gzip === false ? <span className={s.muted}>✗</span> : '—'}</td>
                      <td className={s.mono}>{fmtDate(r.last_probed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── State Coverage tab ── */}
      {tab === 'coverage' && (
        <Panel
          title="State Coverage"
          subtitle="Insurer tracking density per state"
          actions={
            <button className={s.exportBtn} onClick={() => exportCsv(covRows, 'state-coverage.csv')}>
              Export CSV
            </button>
          }
        >
          {loadCoverage ? <Skeleton height={400} /> : coverage.length === 0 ? (
            <p className={s.empty}>No state coverage data yet.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <SortTh col="state" sort={covSort} onSort={covOnSort} left>State</SortTh>
                    <SortTh col="total_insurers" sort={covSort} onSort={covOnSort}>Total Insurers</SortTh>
                    <SortTh col="automatable" sort={covSort} onSort={covOnSort}>Automatable</SortTh>
                    <SortTh col="browser_required" sort={covSort} onSort={covOnSort}>Browser</SortTh>
                    <SortTh col="dead" sort={covSort} onSort={covOnSort}>Dead</SortTh>
                    <SortTh col="crawl_success" sort={covSort} onSort={covOnSort}>Crawled OK</SortTh>
                    <SortTh col="avg_transparency" sort={covSort} onSort={covOnSort}>Avg Transparency</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {covRows.map((r, i) => (
                    <tr key={i}>
                      <td className={s.tdLeft}><span className={s.stateChip}>{r.state}</span></td>
                      <td>{r.total_insurers}</td>
                      <td><span className={s.good}>{r.automatable || 0}</span></td>
                      <td><span className={s.warn}>{r.browser_required || 0}</span></td>
                      <td><span className={r.dead ? s.bad : ''}>{r.dead || 0}</span></td>
                      <td><span className={s.good}>{r.crawl_success || 0}</span></td>
                      <td>
                        {r.avg_transparency != null
                          ? <ScoreBar value={Math.round(r.avg_transparency)} color="#22c55e" />
                          : <span className={s.na}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Latest crawl info ── */}
      {latest && (
        <div className={s.crawlInfo}>
          Last crawl: {fmtDate(latest.recorded_at)} —
          {' '}{latest.total_insurers_discovered} discovered,
          {' '}{latest.crawl_insurers_succeeded} succeeded,
          {' '}{latest.crawl_providers_linked?.toLocaleString()} providers linked
        </div>
      )}
    </div>
  );
}
