import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import DRGSelector from '../components/DRGSelector';
import SummaryCards from '../components/SummaryCards';
import DrilldownMap from '../components/DrilldownMap';
import Top50DRGChart from '../components/Top50DRGChart';
import CostVsQualityScatter from '../components/CostVsQualityScatter';
import ZipTable from '../components/ZipTable';
import ScatterPlot from '../components/ScatterPlot';

export default function OverviewView() {
  const [selectedDrg, setSelectedDrg] = useState('ALL');
  const [metric, setMetric] = useState('payment');
  const { data: drgs, loading: drgsLoading, error: drgsError } = useApi('/drgs/top50', []);

  if (drgsLoading || !drgs) {
    return (
      <div className="loading">
        {drgsError ? (
          <>
            <p className="error-msg">Failed to load data: {drgsError}</p>
            <p className="error-hint">
              Ensure the API server is running and PostgreSQL is populated (run{' '}
              <code>npm run load-data</code>).
            </p>
          </>
        ) : (
          <>
            <div className="loading-spinner" />
            <span className="loading-text">Loading dashboard data…</span>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <SummaryCards drg={selectedDrg} />
      <DrilldownMap drg={selectedDrg} metric={metric} />
      <DRGSelector
        drgs={drgs}
        selectedDrg={selectedDrg}
        onDrgChange={setSelectedDrg}
        metric={metric}
        onMetricChange={setMetric}
      />
      <Top50DRGChart drgs={drgs} metric={metric} onDrgSelect={setSelectedDrg} />
      <ScatterPlot drg={selectedDrg} />
      <ZipTable drg={selectedDrg} metric={metric} />
      <CostVsQualityScatter drg={selectedDrg} />
      <footer className="footer">
        <p>Data: CMS Medicare Inpatient, Outpatient, Physician & Other Practitioners (Data Year 2023)</p>
        <p>Hospital Star Ratings, HCAHPS Patient Surveys, Census ACS 5-Year Demographics</p>
        <p>Prices reflect averages across providers within each ZIP code.</p>
        <p className="powered-by">Powered by <span>Acumenus Data Sciences</span></p>
      </footer>
    </>
  );
}
