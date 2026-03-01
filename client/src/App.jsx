import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const OverviewView = lazy(() => import('./views/OverviewView'));
const QualityCommandCenter = lazy(() => import('./views/QualityCommandCenter'));
const HospitalExplorer = lazy(() => import('./views/HospitalExplorer'));
const HospitalDetail = lazy(() => import('./views/HospitalDetail'));
const GeographicAnalysis = lazy(() => import('./views/GeographicAnalysis'));
const CostTrends = lazy(() => import('./views/CostTrends'));
const PostAcuteCare = lazy(() => import('./views/PostAcuteCare'));
const SpendingValue = lazy(() => import('./views/SpendingValue'));
const ClinicianDirectory = lazy(() => import('./views/ClinicianDirectory'));
const PhysicianAnalytics = lazy(() => import('./views/PhysicianAnalytics'));
const AbbyAnalytics = lazy(() => import('./views/AbbyAnalytics'));
const DataConnectors = lazy(() => import('./views/DataConnectors'));
const SettingsView = lazy(() => import('./views/SettingsView'));

function ViewLoader() {
  return (
    <div className="loading">
      <div className="loading-spinner" />
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<ViewLoader />}>
        <Routes>
          <Route element={<AppShell onLogout={() => setIsAuthenticated(false)} />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<ErrorBoundary><OverviewView /></ErrorBoundary>} />
            <Route path="/quality" element={<ErrorBoundary><QualityCommandCenter /></ErrorBoundary>} />
            <Route path="/hospitals" element={<ErrorBoundary><HospitalExplorer /></ErrorBoundary>} />
            <Route path="/hospitals/:ccn" element={<ErrorBoundary><HospitalDetail /></ErrorBoundary>} />
            <Route path="/geography" element={<ErrorBoundary><GeographicAnalysis /></ErrorBoundary>} />
            <Route path="/trends" element={<ErrorBoundary><CostTrends /></ErrorBoundary>} />
            <Route path="/post-acute" element={<ErrorBoundary><PostAcuteCare /></ErrorBoundary>} />
            <Route path="/spending" element={<ErrorBoundary><SpendingValue /></ErrorBoundary>} />
            <Route path="/clinicians" element={<ErrorBoundary><ClinicianDirectory /></ErrorBoundary>} />
            <Route path="/physicians" element={<ErrorBoundary><PhysicianAnalytics /></ErrorBoundary>} />
            <Route path="/abby" element={<ErrorBoundary><AbbyAnalytics /></ErrorBoundary>} />
            <Route path="/connectors" element={<ErrorBoundary><DataConnectors /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsView /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
