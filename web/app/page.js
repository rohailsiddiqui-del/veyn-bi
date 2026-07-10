'use client';
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Sidebar from './components/Sidebar';
import OverviewPage from './pages/OverviewPage';
import AgentsPage from './pages/AgentsPage';
import ParamsPage from './pages/ParamsPage';
import TrendPage from './pages/TrendPage';
import InsightsPage from './pages/InsightsPage';
import ChatPage from './pages/ChatPage';
import UploadPage from './pages/UploadPage';
import AlertSettingsPage from './pages/AlertSettingsPage';
import { Spinner } from './components/ui';

export default function AppShell() {
  const { token, user, globalDate, setGlobalDate } = useAuth();
  const [activePage, setActivePage] = useState('overview');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-bg flex items-center justify-center"><Spinner /></div>;
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'overview': return <OverviewPage />;
      case 'agents': return <AgentsPage />;
      case 'params': return <ParamsPage />;
      case 'trend': return <TrendPage />;
      case 'insights': return <InsightsPage />;
      case 'chat': return <ChatPage />;
      case 'upload': return <UploadPage />;
      case 'settings': return <AlertSettingsPage />;
      default: return <OverviewPage />;
    }
  };

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 ml-[220px] p-8 pb-10">
        
        {/* Global Dashboard Header */}
        <header className="mb-6 flex items-center justify-between bg-surface border border-border p-4 rounded-xl shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-text-main capitalize">{activePage}</h2>
            <p className="text-xs text-text-muted mt-0.5">Veyn BI Intelligence Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-muted">Global Date Filter:</span>
            <DatePicker 
              selected={globalDate ? new Date(globalDate + 'T12:00:00') : null}
              onChange={(date) => setGlobalDate(date ? format(date, 'yyyy-MM-dd') : '')}
              className="bg-bg border border-border2 rounded-lg px-3 py-1.5 text-sm text-text-main focus:border-primary outline-none transition-colors w-[130px]"
              placeholderText="Select date..."
              dateFormat="MMM d, yyyy"
              isClearable
              title="Filter entire dashboard by date"
            />
          </div>
        </header>

        {renderPage()}
      </main>
    </div>
  );
}
