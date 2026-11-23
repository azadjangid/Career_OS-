import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { lazy, Suspense, useEffect } from 'react';

// Layouts
import AppLayout from '@/layouts/AppLayout';
import Toaster from '@/components/ui/Toaster';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';

// App pages
const DashboardPage = lazy(() => import('@/pages/app/DashboardPage'));
const JobsPage = lazy(() => import('@/pages/app/JobsPage'));
const ApplicationsPage = lazy(() => import('@/pages/app/ApplicationsPage'));
const ResumesPage = lazy(() => import('@/pages/app/ResumesPage'));
const AIPage = lazy(() => import('@/pages/app/AIPage'));
const AnalyticsPage = lazy(() => import('@/pages/app/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/pages/app/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/app/ProfilePage'));
const OnboardingPage = lazy(() => import('@/pages/onboarding/OnboardingPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const theme = useUIStore(s => s.theme);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg-primary)' }} role="status" aria-label="Loading" />}>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />

        {/* First-run wizard (outside the app shell so it has no sidebar) */}
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

        {/* App routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/resumes" element={<ResumesPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
