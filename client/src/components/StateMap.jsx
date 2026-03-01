import { useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { useApi } from '../hooks/useApi';
import { interpolateYlOrRd } from './colorScale';
import { fmtCurrency, fmtNumber } from '../utils/format';
import Panel from './Panel';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const METRIC_KEY = {
  payment:  'avg_total_payment',
  charges:  'avg_covered_charge',
  medicare: 'avg_medicare_payment',
};

// FIPS → state abbreviation for joining
const FIPS_TO_ABBR = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};

export default function StateMap({ drg, metric }) {
  const key = METRIC_KEY[metric] || 'avg_total_payment';
  const { data, loading } = useApi(`/states/summary?drg=${drg}`, [drg]);

  const { lookup, domain } = useMemo(() => {
    if (!data) return { lookup: {}, domain: [0, 1] };
    const map = {};
    let min = Infinity, max = -Infinity;
    for (const row of data) {
      const val = Number(row[key]);
      map[row.state_abbr] = { ...row, value: val };
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return { lookup: map, domain: [min, max] };
  }, [data, key]);

  const colorScale = scaleLinear().domain(domain).range([0.1, 1]);

  return (
    <Panel title="Average Price by State">
      {loading ? (
        <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>Loading map…</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <ComposableMap projection="geoAlbersUsa" width={700} height={400} style={{ width: '100%', height: 'auto', background: 'transparent' }}>
            <ZoomableGroup>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const fips = geo.id;
                    const abbr = FIPS_TO_ABBR[fips];
                    const row = lookup[abbr];
                    const fill = row ? interpolateYlOrRd(colorScale(row.value)) : '#1e1e21';
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#0c0c0e"
                        strokeWidth={1}
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', fill: '#60a5fa', cursor: 'pointer', opacity: 0.9 },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={() => {}}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#71717a', whiteSpace: 'nowrap' }}>{fmtCurrency(domain[0])}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: `linear-gradient(to right, ${interpolateYlOrRd(0.05)}, ${interpolateYlOrRd(0.4)}, ${interpolateYlOrRd(0.7)}, ${interpolateYlOrRd(1)})` }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#71717a', whiteSpace: 'nowrap' }}>{fmtCurrency(domain[1])}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
