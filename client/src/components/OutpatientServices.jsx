import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber } from '../utils/format';

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};

const thStyle = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '10px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border-mid)',
  position: 'sticky',
  top: 0,
};

const tdStyle = {
  padding: '9px 12px',
  borderBottom: '1px solid var(--border-dim)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
};

const tdMonoStyle = {
  ...tdStyle,
  fontFamily: "var(--font-mono)",
  fontSize: '11px',
  color: 'var(--accent-light)',
};

const tdMutedStyle = {
  ...tdMonoStyle,
  color: 'var(--text-secondary)',
};

export default function OutpatientServices({ ccn }) {
  const { data, loading, error } = useApi(`/outpatient/provider/${ccn}`, [ccn]);

  if (loading || !data) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
        Loading outpatient services…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
        Failed to load: {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
        No outpatient services found for this hospital.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', maxHeight: 320 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>APC</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Services</th>
            <th style={thStyle}>Charges</th>
            <th style={thStyle}>Medicare</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} style={i % 2 ? { background: 'rgba(28, 28, 31, 0.5)' } : {}}>
              <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {r.apc_cd}
              </td>
              <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.apc_desc}>
                {r.apc_desc}
              </td>
              <td style={tdMutedStyle}>{fmtNumber(r.total_services)}</td>
              <td style={tdMonoStyle}>{fmtCurrency(r.avg_charges)}</td>
              <td style={tdMutedStyle}>{fmtCurrency(r.avg_medicare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
