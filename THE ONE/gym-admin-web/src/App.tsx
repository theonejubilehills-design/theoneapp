import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminDataProvider } from './context/AdminDataContext';
import { Sidebar } from './components/Sidebar';
import { preloadClickSound } from './utils/sound';

// Pages

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Bookings from './pages/Bookings';
import Payments from './pages/Payments';
import Concierge from './pages/Concierge';
import Pricing from './pages/Pricing';
import Reviews from './pages/Reviews';
import Settings from './pages/Settings';

const AuthGuard = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#0B0B0B',
        color: '#f1dfd7',
        fontFamily: 'Inter, sans-serif'
      }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: '2.5rem', marginBottom: '1.5rem' }}>THE ONE</h2>
        <div style={{
          width: '32px',
          height: '32px',
          border: '2px solid rgba(201, 122, 70, 0.1)',
          borderTop: '2px solid #C97A46',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

const ReviewsRoute = () => {
  const { userProfile } = useAuth();
  
  if (userProfile?.isSubAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <Reviews />;
};

function App() {
  React.useEffect(() => {
    preloadClickSound();
  }, []);

  return (
    <Router>
      <AuthProvider>
        <AdminDataProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route element={<AuthGuard />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/members" element={<Members />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/concierge" element={<Concierge />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/reviews" element={<ReviewsRoute />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AdminDataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
