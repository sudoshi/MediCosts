import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Panel from '../components/Panel.jsx';
import { apiFetch } from '../utils/api.js';
import s from './ConsumerWorkspace.module.css';

export default function ConsumerHome() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch('/cases')
      .then(data => { if (!cancelled) setCases(data.cases || []); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const open = cases.filter(c => !['resolved', 'closed', 'archived'].includes(c.status)).length;
    const high = cases.filter(c => ['high', 'urgent'].includes(c.priority)).length;
    const releaseReady = cases.filter(c => c.status === 'ready_for_documents' || c.status === 'needs_documents').length;
    return { open, high, releaseReady };
  }, [cases]);

  const recentCases = cases.slice(0, 5);

  async function createBillCase() {
    const data = await apiFetch('/cases', {
      method: 'POST',
      body: JSON.stringify({
        caseType: 'bill_check',
        title: 'Bill check case',
        status: 'needs_release',
      }),
    });
    navigate(`/cases/${data.case.id}`);
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>My Healthcare Costs</p>
          <h1 className={s.title}>Patient advocacy workspace</h1>
          <p className={s.subtitle}>
            Create private cases for bills, complaints, coverage problems, and medical debt.
            Medical document uploads require a signed HIPAA authorization / medical record release.
          </p>
        </div>
        <div className={s.buttonRow}>
          <button className={s.primaryButton} onClick={createBillCase}>Start Bill Check</button>
          <button className={s.secondaryButton} onClick={() => navigate('/cases')}>View Cases</button>
        </div>
      </header>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.threeGrid}>
        <div className={s.metric}>
          <span className={s.metricValue}>{loading ? '-' : stats.open}</span>
          <span className={s.metricLabel}>Open cases</span>
        </div>
        <div className={s.metric}>
          <span className={s.metricValue}>{loading ? '-' : stats.high}</span>
          <span className={s.metricLabel}>High-priority cases</span>
        </div>
        <div className={s.metric}>
          <span className={s.metricValue}>{loading ? '-' : stats.releaseReady}</span>
          <span className={s.metricLabel}>Release-gated document cases</span>
        </div>
      </div>

      <div className={s.grid}>
        <Panel title="Recent Cases">
          {loading ? (
            <div className={s.empty}>Loading cases...</div>
          ) : recentCases.length ? (
            <div className={s.caseList}>
              {recentCases.map(item => (
                <Link key={item.id} to={`/cases/${item.id}`} className={s.caseItem}>
                  <div>
                    <h3 className={s.caseTitle}>{item.title}</h3>
                    <div className={s.caseMeta}>
                      <span>{labelCaseType(item.caseType)}</span>
                      <span>{labelStatus(item.status)}</span>
                      {item.state && <span>{item.state}</span>}
                    </div>
                  </div>
                  <span className={item.status === 'ready_for_documents' ? s.successBadge : s.badge}>
                    {item.priority}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={s.empty}>No cases yet.</div>
          )}
        </Panel>

        <Panel title="Release-Gated Uploads">
          <div className={s.notice}>
            <p className={s.noticeTitle}>HIPAA authorization required</p>
            Medical records, bills, EOBs, denial letters, insurance cards, plan documents, and collection notices
            can only be uploaded inside a case after the user signs the case-specific release.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function labelCaseType(value) {
  return String(value || '').replaceAll('_', ' ');
}

function labelStatus(value) {
  return String(value || '').replaceAll('_', ' ');
}
