import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ChangePasswordModal from './components/ChangePasswordModal';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { setUnauthorizedHandler } from './hooks/useApi';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const OverviewView = lazy(() => import('./views/OverviewView'));
const QualityCommandCenter = lazy(() => import('./views/QualityCommandCenter'));
const HospitalExplorer = lazy(() => import('./views/HospitalExplorer'));
const HospitalDetail = lazy(() => import('./views/HospitalDetail'));
const GeographicAnalysis = lazy(() => import('./views/GeographicAnalysis'));
const CostTrends = lazy(() => import('./views/CostTrends'));
const PostAcuteCare = lazy(() => import('./views/PostAcuteCare'));
const SpendingValue = lazy(() => import('./views/SpendingValue'));
const ClinicianDirectory = lazy(() => import('./views/ClinicianDirectory'));
const NursingHomeDetail = lazy(() => import('./views/NursingHomeDetail'));
const DialysisDetail = lazy(() => import('./views/DialysisDetail'));
const HomeHealthDetail = lazy(() => import('./views/HomeHealthDetail'));
const HospiceDetail = lazy(() => import('./views/HospiceDetail'));
const RehabDetail = lazy(() => import('./views/RehabDetail'));
const ClinicianProfile = lazy(() => import('./views/ClinicianProfile'));
const PhysicianAnalytics = lazy(() => import('./views/PhysicianAnalytics'));
const AbbyAnalytics = lazy(() => import('./views/AbbyAnalytics'));
const AccountabilityDashboard = lazy(() => import('./views/AccountabilityDashboard'));
const HospitalCompare = lazy(() => import('./views/HospitalCompare'));
const CostEstimator = lazy(() => import('./views/CostEstimator'));
const ForPatients = lazy(() => import('./views/ForPatients'));
const DataConnectors = lazy(() => import('./views/DataConnectors'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const PaymentsExplorer = lazy(() => import('./views/PaymentsExplorer'));
const FinancialsExplorer = lazy(() => import('./views/FinancialsExplorer'));

function ViewLoader() {
  return (
    <div className="loading">
      <div className="loading-spinner" />
    </div>
  );
}

export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Validate stored token on startup
  useEffect(() => {
    if (!authToken) {
      setAuthChecked(true);
      return;
    }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('invalid');
        return r.json();
      })
      .then(data => {
        setUser(data);
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire 401 handler so useApi can trigger logout
  useEffect(() => {
    setUnauthorizedHandler(() => handleLogout());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogin(token, userData) {
    localStorage.setItem('authToken', token);
    setAuthToken(token);
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setUser(null);
  }

  function handlePasswordChanged(newToken, newUser) {
    localStorage.setItem('authToken', newToken);
    setAuthToken(newToken);
    setUser(newUser);
  }

  // Still verifying token
  if (!authChecked) {
    return <ViewLoader />;
  }

  const isAuthenticated = !!user;

  // Not logged in — show login or register
  if (!isAuthenticated) {
    if (showRegister) {
      return <RegisterPage onSignIn={() => setShowRegister(false)} />;
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={() => setShowRegister(true)}
      />
    );
  }

  return (
    <>
      {/* Blocking modal if password must be changed */}
      {user.mustChangePassword && (
        <ChangePasswordModal
          token={authToken}
          onSuccess={handlePasswordChanged}
        />
      )}

      <BrowserRouter>
        <Suspense fallback={<ViewLoader />}>
          <Routes>
            <Route element={<AppShell onLogout={handleLogout} />}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<ErrorBoundary><OverviewView /></ErrorBoundary>} />
              <Route path="/quality" element={<ErrorBoundary><QualityCommandCenter /></ErrorBoundary>} />
              <Route path="/hospitals" element={<ErrorBoundary><HospitalExplorer /></ErrorBoundary>} />
              <Route path="/hospitals/:ccn" element={<ErrorBoundary><HospitalDetail /></ErrorBoundary>} />
              <Route path="/geography" element={<ErrorBoundary><GeographicAnalysis /></ErrorBoundary>} />
              <Route path="/trends" element={<ErrorBoundary><CostTrends /></ErrorBoundary>} />
              <Route path="/post-acute" element={<ErrorBoundary><PostAcuteCare /></ErrorBoundary>} />
              <Route path="/nursing-homes/:ccn" element={<ErrorBoundary><NursingHomeDetail /></ErrorBoundary>} />
              <Route path="/dialysis/:ccn" element={<ErrorBoundary><DialysisDetail /></ErrorBoundary>} />
              <Route path="/home-health/:ccn" element={<ErrorBoundary><HomeHealthDetail /></ErrorBoundary>} />
              <Route path="/hospice/:ccn" element={<ErrorBoundary><HospiceDetail /></ErrorBoundary>} />
              <Route path="/irf/:ccn" element={<ErrorBoundary><RehabDetail type="irf" /></ErrorBoundary>} />
              <Route path="/ltch/:ccn" element={<ErrorBoundary><RehabDetail type="ltch" /></ErrorBoundary>} />
              <Route path="/accountability" element={<ErrorBoundary><AccountabilityDashboard /></ErrorBoundary>} />
              <Route path="/compare" element={<ErrorBoundary><HospitalCompare /></ErrorBoundary>} />
              <Route path="/estimate" element={<ErrorBoundary><CostEstimator /></ErrorBoundary>} />
              <Route path="/for-patients" element={<ErrorBoundary><ForPatients /></ErrorBoundary>} />
              <Route path="/spending" element={<ErrorBoundary><SpendingValue /></ErrorBoundary>} />
              <Route path="/clinicians" element={<ErrorBoundary><ClinicianDirectory /></ErrorBoundary>} />
              <Route path="/clinicians/:npi" element={<ErrorBoundary><ClinicianProfile /></ErrorBoundary>} />
              <Route path="/physicians" element={<ErrorBoundary><PhysicianAnalytics /></ErrorBoundary>} />
              <Route path="/abby" element={<ErrorBoundary><AbbyAnalytics /></ErrorBoundary>} />
              <Route path="/payments" element={<ErrorBoundary><PaymentsExplorer /></ErrorBoundary>} />
              <Route path="/financials" element={<ErrorBoundary><FinancialsExplorer /></ErrorBoundary>} />
              <Route path="/connectors" element={<ErrorBoundary><DataConnectors /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><SettingsView /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}
