import { useState, Fragment } from 'react';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber, fmtPercent, fmtStars } from '../utils/format';
import HospitalQualityCard from './HospitalQualityCard';

const STAR_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#fbbf24', 4: '#22c55e', 5: '#3b82f6' };

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};

const thStyle = {
  background: '#1c1c1f',
  color: '#71717a',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '10px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #2a2a2d',
  position: 'sticky',
  top: 0,
};

const tdStyle = {
  padding: '9px 12px',
  borderBottom: '1px solid #1e1e21',
  color: '#e4e4e7',
  fontFamily: 'Inter, sans-serif',
};

const tdMonoStyle = {
  ...tdStyle,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  color: '#60a5fa',
};

const tdMutedStyle = {
  ...tdMonoStyle,
  color: '#71717a',
};

export default function ProviderDetail({ zip, city, state, drg }) {
  const { data, loading, error } = useApi(
    `/providers?zip=${zip}&drg=${drg}`,
    [zip, drg]
  );
  const [expandedCcn, setExpandedCcn] = useState(null);

  if (loading || !data) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#71717a', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Loading providers…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#ef4444', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Failed to load: {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#71717a', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        No providers found for this ZIP code.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#71717a' }}>
        {data.length} record{data.length !== 1 ? 's' : ''} at <span style={{ color: '#e4e4e7', fontWeight: 500 }}>{zip} — {city}, {state}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Provider</th>
              <th style={thStyle}>Stars</th>
              <th style={thStyle}>DRG</th>
              <th style={thStyle}>Charges</th>
              <th style={thStyle}>Payment</th>
              <th style={thStyle}>Reimb. Rate</th>
              <th style={thStyle}>Medicare</th>
              <th style={thStyle}>Disch.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const isExpanded = expandedCcn === `${r.provider_ccn}-${i}`;
              return (
                <Fragment key={i}>
                  <tr
                    style={{
                      ...(i % 2 ? { background: 'rgba(28, 28, 31, 0.5)' } : {}),
                      cursor: r.provider_ccn ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (!r.provider_ccn) return;
                      setExpandedCcn(isExpanded ? null : `${r.provider_ccn}-${i}`);
                    }}
                  >
                    <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.provider_name}>
                      {r.provider_ccn && (
                        <span style={{ color: '#3f3f46', fontSize: 10, marginRight: 6 }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      )}
                      {r.provider_name}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 13, letterSpacing: 1 }}>
                      {r.star_rating != null ? (
                        <span style={{ color: STAR_COLORS[Number(r.star_rating)] || '#71717a' }}>
                          {fmtStars(r.star_rating)}
                        </span>
                      ) : (
                        <span style={{ color: '#3f3f46', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: '#71717a', whiteSpace: 'nowrap' }} title={r.drg_desc}>
                      {r.drg_cd}
                    </td>
                    <td style={tdMonoStyle}>{fmtCurrency(r.avg_covered_charges)}</td>
                    <td style={tdMonoStyle}>{fmtCurrency(r.avg_total_payments)}</td>
                    <td style={{
                      ...tdMonoStyle,
                      color: (() => {
                        const rate = r.avg_covered_charges > 0 ? r.avg_total_payments / r.avg_covered_charges : null;
                        if (rate == null) return '#71717a';
                        if (rate < 0.15) return '#ef4444';
                        if (rate < 0.30) return '#f59e0b';
                        return '#22c55e';
                      })(),
                    }}>
                      {r.avg_covered_charges > 0 ? fmtPercent(r.avg_total_payments / r.avg_covered_charges) : '—'}
                    </td>
                    <td style={tdMutedStyle}>{fmtCurrency(r.avg_medicare_payments)}</td>
                    <td style={tdMutedStyle}>{fmtNumber(r.total_discharges)}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={8} style={{ padding: '20px 16px', background: '#111113', borderBottom: '1px solid #1e1e21' }}>
                        <HospitalQualityCard ccn={r.provider_ccn} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
