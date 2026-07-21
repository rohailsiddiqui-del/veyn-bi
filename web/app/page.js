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
import CasesPage from './pages/CasesPage';
import { Spinner } from './components/ui';
import { CalendarDays, X } from 'lucide-react';

const PAGE_META = {
  overview:  { title: 'Overview',            sub: 'Performance summary at a glance' },
  agents:    { title: 'Agents',              sub: 'Individual agent performance & coaching' },
  params:    { title: 'Parameters',          sub: 'QA parameter failure analysis' },
  trend:     { title: 'Trends',              sub: 'Daily performance over time' },
  insights:  { title: 'Signal Intelligence', sub: 'AI-powered call & interaction insights' },
  chat:      { title: 'AI Chat',             sub: 'Ask anything about your call data' },
  upload:    { title: 'Upload',              sub: 'Import calls via API pull or CSV upload' },
  settings:  { title: 'Settings',            sub: 'Alert configuration & API credentials' },
  admin:     { title: 'Admin',               sub: 'Manage organisations and tenants' },
  cases:     { title: 'Case Trajectory',     sub: 'Multi-interaction case journey analysis' },
};

export default function AppShell() {
  const { token, user, globalDateFrom, setGlobalDateFrom, globalDateTo, setGlobalDateTo } = useAuth();
  const [activePage, setActivePage] = useState('overview');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (user?.dashboard_mode === 'case') setActivePage('cases');
  }, [user?.dashboard_mode]);

  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;

  useEffect(() => { setMounted(true); }, []);

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
      case 'agents':   return <AgentsPage />;
      case 'params':   return <ParamsPage />;
      case 'trend':    return <TrendPage />;
      case 'insights': return <InsightsPage />;
      case 'chat':     return <ChatPage />;
      case 'upload':   return <UploadPage />;
      case 'settings': return <AlertSettingsPage />;
      case 'admin':    return <AdminPage />;
      case 'cases':    return <CasesPage />;
      default:         return <OverviewPage />;
    }
  };

  const meta = PAGE_META[activePage] ?? { title: activePage, sub: '' };
  const hasDateFilter = !!(globalDateFrom || globalDateTo);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 ml-[220px] flex flex-col min-h-screen">

        {/* Global Dashboard Header */}
        <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur-md border-b border-border px-8 py-3 flex items-center justify-between gap-4">
          {/* Page title + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text-main leading-tight truncate">{meta.title}</h2>
              <p className="text-[11px] text-text-muted leading-tight mt-0.5 truncate hidden sm:block">{meta.sub}</p>
            </div>
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-surface border border-border2 rounded-lg px-3 py-1.5">
              <CalendarDays size={13} className="text-text-muted shrink-0" />
              <DatePicker
                selectsRange
                startDate={startDate}
                endDate={endDate}
                onChange={handleDateChange}
                className="bg-transparent outline-none text-sm text-text-main w-[190px] cursor-pointer placeholder:text-text-muted"
                placeholderText="Filter by upload date…"
                dateFormat="MMM d, yyyy"
              />
            </div>
            {hasDateFilter && (
              <button
                onClick={clearDates}
                title="Clear date filter"
                className="p-1.5 rounded-lg border border-border2 text-text-muted hover:text-danger hover:border-danger/40 transition-colors"
              >
                <X size={13} />
              </button>
            )}
            {hasDateFilter && (
              <span className="text-[10px] font-semibold text-primary-soft bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                {globalDateFrom}{globalDateTo && globalDateFrom !== globalDateTo ? ` → ${globalDateTo}` : ''}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-8 pb-10">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
