import { useRef, useEffect, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import { scaleLinear } from 'd3-scale';
import { interpolateYlOrRd } from './colorScale';
import { useApi } from '../hooks/useApi';
import { fmtCurrency, fmtNumber } from '../utils/format';
import Panel from './Panel';
import styles from './DrilldownMap.module.css';
import zipCentroids from '../data/zipCentroids.json';

/* ── Constants ─────────────────────────────────────────────────────── */

const FIPS_TO_ABBR = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

const ABBR_TO_NAME = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin',
  WY:'Wyoming',
};

const METRIC_KEY = {
  payment:  'avg_total_payment',
  charges:  'avg_covered_charge',
  medicare: 'avg_medicare_payment',
};

const METRIC_LABEL = {
  payment:  'Avg Total Payment',
  charges:  'Avg Covered Charges',
  medicare: 'Avg Medicare Payment',
};

const STATES_TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const API_BASE        = import.meta.env.VITE_API_URL || '/api';

const LEGEND_STOPS = [0, 0.25, 0.5, 0.75, 1].map((t) => interpolateYlOrRd(t));

/* ── Component ─────────────────────────────────────────────────────── */

export default function DrilldownMap({ drg, metric }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const statesGeoRef   = useRef(null);
  const hoveredStateId = useRef(null);
  const selectedRef    = useRef(null);
  const drillFnRef     = useRef(null);
  const popupRef       = useRef(null);

  const [mapLoaded,     setMapLoaded]     = useState(false);
  const [selectedState, setSelectedState] = useState(null);
  const [zipLoading,    setZipLoading]    = useState(false);
  const [hoveredItem,   setHoveredItem]   = useState(null);
  const [colorDomain,   setColorDomain]   = useState([0, 1]);

  selectedRef.current = selectedState;

  const { data: stateData } = useApi(`/states/summary?drg=${drg}`, [drg]);

  const metricKey   = METRIC_KEY[metric]   || 'avg_total_payment';
  const metricLabel = METRIC_LABEL[metric] || 'Avg Cost';

  /* Compute per-state colors */
  const stateColors = useMemo(() => {
    if (!stateData) return {};
    const values = stateData.map((d) => Number(d[metricKey])).filter((v) => v > 0);
    if (!values.length) return {};
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scale = scaleLinear().domain([min, max]).range([0.1, 1]);
    const out = {};
    for (const d of stateData) {
      const val = Number(d[metricKey]);
      out[d.state_abbr] = { color: val > 0 ? interpolateYlOrRd(scale(val)) : '#1e1e21', ...d };
    }
    return out;
  }, [stateData, metricKey]);

  /* Sorted state list for selector */
  const sortedStateAbbrs = useMemo(
    () => Object.keys(stateColors).sort((a, b) => ABBR_TO_NAME[a]?.localeCompare(ABBR_TO_NAME[b])),
    [stateColors],
  );

  /* ── Init map once ────────────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0c0c0e' } }],
      },
      center: [-97, 39],
      zoom: 3.5,
      minZoom: 2,
      maxZoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => setMapLoaded(true));

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── Build / refresh state choropleth ────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !Object.keys(stateColors).length) return;

    const buildStates = async () => {
      if (!statesGeoRef.current) {
        const topo = await fetch(STATES_TOPO_URL).then((r) => r.json());
        statesGeoRef.current = feature(topo, topo.objects.states);
      }

      const enriched = {
        ...statesGeoRef.current,
        features: statesGeoRef.current.features.map((f) => {
          const fips = String(f.id).padStart(2, '0');
          const abbr = FIPS_TO_ABBR[fips];
          const info = stateColors[abbr] || {};
          return {
            ...f,
            properties: {
              abbr,
              fullName:             ABBR_TO_NAME[abbr] || abbr,
              fill:                 info.color || '#1e1e21',
              avg_total_payment:    info.avg_total_payment    || 0,
              avg_covered_charge:   info.avg_covered_charge   || 0,
              avg_medicare_payment: info.avg_medicare_payment || 0,
              total_discharges:     info.total_discharges     || 0,
              num_providers:        info.num_providers        || 0,
            },
          };
        }),
      };

      if (map.getSource('states')) {
        map.getSource('states').setData(enriched);
        return;
      }

      map.addSource('states', { type: 'geojson', data: enriched, generateId: true });
      map.addLayer({
        id: 'states-fill', type: 'fill', source: 'states',
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.85],
        },
      });
      map.addLayer({
        id: 'states-line', type: 'line', source: 'states',
        paint: { 'line-color': '#0c0c0e', 'line-width': 1 },
      });

      map.on('mousemove', 'states-fill', (e) => {
        if (!e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features[0];
        if (hoveredStateId.current !== null)
          map.setFeatureState({ source: 'states', id: hoveredStateId.current }, { hover: false });
        hoveredStateId.current = feat.id;
        map.setFeatureState({ source: 'states', id: feat.id }, { hover: true });
        setHoveredItem({ type: 'state', ...feat.properties });
      });
      map.on('mouseleave', 'states-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredStateId.current !== null)
          map.setFeatureState({ source: 'states', id: hoveredStateId.current }, { hover: false });
        hoveredStateId.current = null;
        setHoveredItem(null);
      });

      map.on('click', 'states-fill', (e) => {
        const abbr = e.features[0]?.properties?.abbr;
        if (abbr) drillFnRef.current?.(abbr);
      });
    };

    buildStates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, stateColors]);

  /* ── Re-drill when DRG / metric changes while inside a state ─────── */
  useEffect(() => {
    const map = mapRef.current;
    if (selectedRef.current && map) drillToState(selectedRef.current, map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drg, metric]);

  /* ── Drill-down: circle markers from centroids ─────────────────────── */
  async function drillToState(abbr, map) {
    if (!map) map = mapRef.current;
    if (!map || !abbr) return;

    setSelectedState(abbr);
    setZipLoading(true);
    setHoveredItem(null);

    try {
      const zipCosts = await fetch(`${API_BASE}/states/${abbr}/zips?drg=${drg}`).then((r) => r.json());

      const vals = zipCosts.map((d) => Number(d[metricKey])).filter((v) => v > 0);
      const [min, max] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
      const zipScale = scaleLinear().domain([min, max]).range([0.1, 1]);
      setColorDomain([min, max]);

      // Build GeoJSON FeatureCollection with Point geometry from centroids
      const bounds = new maplibregl.LngLatBounds();
      const features = [];

      for (const d of zipCosts) {
        const zip = String(d.zip5).padStart(5, '0');
        const coords = zipCentroids[zip];
        if (!coords) continue; // skip zips without centroid data

        const [lat, lng] = coords;
        const val = Number(d[metricKey]);
        const color = val > 0 ? interpolateYlOrRd(zipScale(val)) : '#1e3a6e';

        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            zip5: zip,
            city: d.provider_city || '',
            fill: color,
            value: val,
            total_discharges: d.total_discharges || 0,
            num_providers: d.num_providers || 0,
            avg_total_payment: d.avg_total_payment || 0,
            avg_covered_charge: d.avg_covered_charge || 0,
            avg_medicare_payment: d.avg_medicare_payment || 0,
          },
        });

        bounds.extend([lng, lat]);
      }

      const zipGeoJson = { type: 'FeatureCollection', features };

      /* CartoDB dark basemap (free, no key) */
      if (!map.getSource('carto-dark')) {
        map.addSource('carto-dark', {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© CARTO © OpenStreetMap contributors',
        });
        map.addLayer(
          { id: 'basemap', type: 'raster', source: 'carto-dark', paint: { 'raster-opacity': 0.55 } },
          'states-fill',
        );
        map.setLayoutProperty('basemap', 'visibility', 'none');
      }

      if (map.getSource('zips')) {
        map.getSource('zips').setData(zipGeoJson);
      } else {
        map.addSource('zips', { type: 'geojson', data: zipGeoJson });

        // Circle layer — each ZIP is a colored dot
        map.addLayer({
          id: 'zip-circles', type: 'circle', source: 'zips',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              5, 6,
              8, 10,
              12, 16,
            ],
            'circle-color': ['get', 'fill'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#0c0c0e',
          },
        });

        // ZIP code labels — visible at higher zoom levels
        map.addLayer({
          id: 'zip-labels', type: 'symbol', source: 'zips',
          minzoom: 8,
          layout: {
            'text-field': ['get', 'zip5'],
            'text-font': ['Open Sans Regular'],
            'text-size': 11,
            'text-offset': [0, -1.5],
            'text-anchor': 'bottom',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#ddd5c5',
            'text-halo-color': '#0c0c0e',
            'text-halo-width': 1.5,
          },
        });

        // Hover interaction
        map.on('mousemove', 'zip-circles', (e) => {
          if (!e.features.length) return;
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features[0];
          setHoveredItem({ type: 'zip', ...feat.properties });
        });
        map.on('mouseleave', 'zip-circles', () => {
          map.getCanvas().style.cursor = '';
          setHoveredItem(null);
        });

        // Click popup with details
        map.on('click', 'zip-circles', (e) => {
          if (!e.features.length) return;
          const feat = e.features[0];
          const p = feat.properties;
          const coords = feat.geometry.coordinates.slice();

          if (popupRef.current) popupRef.current.remove();

          popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
            .setLngLat(coords)
            .setHTML(`
              <div style="font-family:Barlow,sans-serif;color:#ddd5c5;line-height:1.5">
                <strong style="font-size:14px">ZIP ${p.zip5}</strong>
                ${p.city ? `<span style="color:#7a8a9e;font-size:12px"> · ${p.city}</span>` : ''}
                <hr style="border:none;border-top:1px solid #1a2845;margin:6px 0"/>
                <div style="font-family:'JetBrains Mono',monospace;font-size:12px">
                  <div style="display:flex;justify-content:space-between"><span style="color:#7a8a9e">${metricLabel}:</span><span style="color:#f0a500">${fmtCurrency(p.value || p[metricKey])}</span></div>
                  <div style="display:flex;justify-content:space-between"><span style="color:#7a8a9e">Discharges:</span><span>${fmtNumber(p.total_discharges)}</span></div>
                  <div style="display:flex;justify-content:space-between"><span style="color:#7a8a9e">Providers:</span><span>${fmtNumber(p.num_providers)}</span></div>
                </div>
              </div>
            `)
            .addTo(map);
        });
      }

      // Hide states, show basemap + zip circles
      map.setLayoutProperty('states-fill', 'visibility', 'none');
      map.setLayoutProperty('states-line', 'visibility', 'none');
      map.setLayoutProperty('basemap',      'visibility', 'visible');
      map.setLayoutProperty('zip-circles',  'visibility', 'visible');
      map.setLayoutProperty('zip-labels',   'visibility', 'visible');

      if (features.length) {
        map.fitBounds(bounds, { padding: 60, duration: 1200 });
      }
    } catch (err) {
      console.error('DrilldownMap: failed to load zip data', err);
    } finally {
      setZipLoading(false);
    }
  }

  // Keep drillFnRef current on every render
  drillFnRef.current = (abbr) => drillToState(abbr);

  /* ── Back to national view ────────────────────────────────────────── */
  function handleBack() {
    const map = mapRef.current;
    if (!map) return;

    setSelectedState(null);
    setHoveredItem(null);
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    const vals = Object.values(stateColors).map((d) => Number(d[metricKey])).filter((v) => v > 0);
    if (vals.length) setColorDomain([Math.min(...vals), Math.max(...vals)]);

    map.setLayoutProperty('states-fill', 'visibility', 'visible');
    map.setLayoutProperty('states-line', 'visibility', 'visible');
    if (map.getLayer('basemap'))     map.setLayoutProperty('basemap',     'visibility', 'none');
    if (map.getLayer('zip-circles')) map.setLayoutProperty('zip-circles', 'visibility', 'none');
    if (map.getLayer('zip-labels'))  map.setLayoutProperty('zip-labels',  'visibility', 'none');

    map.flyTo({ center: [-97, 39], zoom: 3.5, duration: 1000 });
  }

  /* ── Info bar content ──────────────────────────────────────────────── */
  function InfoBar() {
    if (!hoveredItem) {
      return (
        <p className={styles.infoPlaceholder}>
          {selectedState
            ? 'Hover a ZIP circle to see cost details — click for full breakdown'
            : 'Hover a state for details — select one above or click the map to drill in'}
        </p>
      );
    }

    const stats = hoveredItem.type === 'state'
      ? [
          { label: metricLabel,  val: fmtCurrency(hoveredItem[metricKey]) },
          { label: 'Discharges', val: fmtNumber(hoveredItem.total_discharges) },
          { label: 'Providers',  val: fmtNumber(hoveredItem.num_providers) },
        ]
      : [
          { label: metricLabel,  val: fmtCurrency(hoveredItem.value || hoveredItem[metricKey]) },
          { label: 'Discharges', val: fmtNumber(hoveredItem.total_discharges) },
          { label: 'Providers',  val: fmtNumber(hoveredItem.num_providers) },
        ];

    const title = hoveredItem.type === 'state'
      ? hoveredItem.fullName
      : `ZIP ${hoveredItem.zip5}${hoveredItem.city ? ` · ${hoveredItem.city}` : ''}`;

    return (
      <>
        <div className={styles.infoName}>{title}</div>
        <div className={styles.infoStats}>
          {stats.map((s, i) => (
            <span key={i} className={styles.infoStat}>
              <span className={styles.infoStatLabel}>{s.label}</span>
              <span className={styles.infoStatVal}>{s.val}</span>
            </span>
          ))}
        </div>
      </>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <Panel>
      {/* Header */}
      <div className={styles.mapHeader}>
        <div className={styles.breadcrumb}>
          {selectedState ? (
            <>
              <button className={styles.backBtn} onClick={handleBack}>← All States</button>
              <span className={styles.sep}>/</span>
              <span className={styles.crumbCurrent}>{ABBR_TO_NAME[selectedState]}</span>
              {zipLoading && <span className={styles.zipSpinner}>Loading…</span>}
            </>
          ) : (
            <span className={styles.panelTitle}>{metricLabel} by State</span>
          )}
        </div>

        {/* State selector */}
        <select
          className={styles.stateSelect}
          value={selectedState || ''}
          onChange={(e) => {
            if (e.target.value) drillToState(e.target.value);
            else handleBack();
          }}
        >
          <option value="">All States</option>
          {sortedStateAbbrs.map((abbr) => (
            <option key={abbr} value={abbr}>{ABBR_TO_NAME[abbr]}</option>
          ))}
        </select>
      </div>

      {/* Map */}
      <div className={styles.mapWrap}>
        <div ref={containerRef} className={styles.mapEl} />
        {!selectedState && (
          <div className={styles.mapHint}>Click any state to drill into ZIP codes</div>
        )}
      </div>

      {/* Info bar */}
      <div className={styles.infoBar}>
        <InfoBar />
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>{fmtCurrency(colorDomain[0])}</span>
        <div
          className={styles.legendBar}
          style={{ background: `linear-gradient(to right, ${LEGEND_STOPS.join(', ')})` }}
        />
        <span className={styles.legendLabel}>{fmtCurrency(colorDomain[1])}</span>
      </div>
    </Panel>
  );
}
