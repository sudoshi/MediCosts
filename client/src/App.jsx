import { useState } from 'react';
import { useApi } from './hooks/useApi';
import DRGSelector from './components/DRGSelector';
import SummaryCards from './components/SummaryCards';
import DrilldownMap from './components/DrilldownMap';
import Top50DRGChart from './components/Top50DRGChart';
import ZipTable from './components/ZipTable';
import ScatterPlot from './components/ScatterPlot';
import './App.css';

export default function App() {
  const [selectedDrg, setSelectedDrg] = useState('ALL');
  const [metric, setMetric] = useState('payment');
  const { data: drgs, loading: drgsLoading, error: drgsError } = useApi('/drgs/top50', []);

  if (drgsLoading || !drgs) {
    return (
      <div className="app">
        <Header />
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
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
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
      <footer className="footer">
        <p>Data: CMS Medicare Inpatient Hospitals – by Provider and Service, Data Year 2023</p>
        <p>Prices reflect averages across providers within each ZIP code.</p>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="header-top">
        <h1>MediCosts</h1>
        <span className="header-year">Data Year 2023</span>
      </div>
      <p className="subtitle">
        Average price of services by ZIP code for the 50 most expensive hospitalizations
      </p>
      <p className="source">
        Source: CMS Medicare Inpatient Hospitals – by Provider and Service (Released May 2025)
      </p>
    </header>
  );
}
