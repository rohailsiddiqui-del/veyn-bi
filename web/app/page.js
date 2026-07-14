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
import AdminPage from './pages/AdminPage';
import { Spinner } from './components/ui';

export default function AppShell() {
  const { token, user, globalDateFrom, setGlobalDateFrom, globalDateTo, setGlobalDateTo } = useAuth();
  const [activePage, setActivePage] = useState('overview');
  const [mounted, setMounted] = useState(false);
  // react-datepicker range: [startDate, endDate]
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDateChange = (update) => {
    setDateRange(update);
    const [start, end] = update;
    setGlobalDateFrom(start ? format(start, 'yyyy-MM-dd') : '');
    setGlobalDateTo(end ? format(end, 'yyyy-MM-dd') : '');
  };

  const clearDates = () => {
    setDateRange([null, null]);
    setGlobalDateFrom('');
    setGlobalDateTo('');
  };

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
      case 'admin': return <AdminPage />;
      default: return <OverviewPage />;
    }
  };

  const dateLabel = globalDateFrom && globalDateTo
    ? `${globalDateFrom} → ${globalDateTo}`
    : globalDateFrom
    ? `${globalDateFrom} →`
    : 'All dates';

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
            <div className="text-right">
              <span className="text-sm font-medium text-text-muted">Upload Date Range</span>
              <span className="block text-[10px] text-text-muted">filters by when calls were imported</span>
            </div>
            <DatePicker
              selectsRange
              startDate={startDate}
              endDate={endDate}
              onChange={handleDateChange}
              className="bg-bg border border-border2 rounded-lg px-3 py-1.5 text-sm text-text-main focus:border-primary outline-none transition-colors w-[200px]"
              placeholderText="Select date range..."
              dateFormat="MMM d, yyyy"
              title="Filter entire dashboard by date range"
            />
            {(globalDateFrom || globalDateTo) && (
              <button
                onClick={clearDates}
                className="text-xs text-text-muted hover:text-text-main px-2 py-1 rounded border border-border2 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {renderPage()}
      </main>
    </div>
  );
}
