
import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import RegisterView from './components/RegisterView';
import LookupView from './components/LookupView';
import HistoryView from './components/HistoryView';
import ServiceQueueView from './components/ServiceQueueView';
import DashboardView from './components/DashboardView';
import WorkflowView from './components/WorkflowView';
import LoginView from './components/LoginView';
import { SparePartsChecklistView } from './components/SparePartsChecklistView';
import { PlusIcon } from './components/icons/PlusIcon';
import { SearchIcon } from './components/icons/SearchIcon';
import { MenuIcon } from './components/icons/MenuIcon';
import { XIcon } from './components/icons/XIcon';
import { QueueListIcon } from './components/icons/QueueListIcon';
import { ChartBarIcon } from './components/icons/ChartBarIcon';
import { KanbanIcon } from './components/icons/KanbanIcon';
import { ClipboardListIcon } from './components/icons/ClipboardListIcon';

export type SparePartsContext = { machineId: string, model: string, make?: string, partNumber?: string, serialNumber?: string };

type View = 'register' | 'lookup' | 'history' | 'queue' | 'dashboard' | 'workflow' | 'spare_parts_checklist';

export type QueueFilter = 'all' | 'active' | 'flagged' | 'status-inspection' | 'status-parts' | 'status-service' | 'status-completed' | 'time-1h' | 'time-4h' | 'time-24h' | 'time-over24h';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<View>('register');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('active');
  const [sparePartsContext, setSparePartsContext] = useState<SparePartsContext | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleNavClick = (view: View) => {
    setActiveView(view);
    setIsSidebarOpen(false);
  };

  const handleSignOut = async () => {
      await supabase.auth.signOut();
  };

  if (isLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  if (!session) {
      return <LoginView />;
  }

  const SidebarItem = ({ view, label, icon }: { view: View; label: string; icon?: React.ReactNode }) => (
      <button
        onClick={() => handleNavClick(view)}
        className={`w-full text-left px-6 py-4 flex items-center gap-4 transition-colors duration-200 border-l-4 ${
            activeView === view 
            ? 'bg-gray-100 border-black text-black dark:bg-gray-800 dark:border-white dark:text-white' 
            : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
        }`}
      >
          {icon}
          <span className="font-medium text-lg">{label}</span>
      </button>
  );

  return (
    <div className={`min-h-screen bg-gray-50 font-sans text-gray-900 relative overflow-x-hidden transition-colors duration-300 ${isDarkMode ? 'dark bg-gray-900 text-white' : ''}`}>
      
      {/* Sidebar Backdrop */}
      {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
      )}

      {/* Sidebar Drawer */}
      <div className={`fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 ease-in-out shadow-2xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-wider">MENU</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white p-1">
                  <XIcon />
              </button>
          </div>
          <nav className="mt-4 flex-grow overflow-y-auto">
              <SidebarItem view="register" label="Register Machine" icon={<PlusIcon />} />
              <SidebarItem view="lookup" label="Find Machine" icon={<SearchIcon />} />
              <SidebarItem view="queue" label="Service Queue" icon={<QueueListIcon />} />
              <SidebarItem view="workflow" label="Workflow Board" icon={<KanbanIcon />} />
              
              <SidebarItem view="dashboard" label="Analytics & Settings" icon={<ChartBarIcon />} />
              <SidebarItem 
                view="history" 
                label="Registration History" 
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                } 
              />
          </nav>
          
          <div className="p-6 border-t border-gray-100 dark:border-gray-800">
               <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                       {session.user.user_metadata.avatar_url ? (
                           <img src={session.user.user_metadata.avatar_url} alt="User" className="w-full h-full object-cover" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
                               {session.user.email?.charAt(0).toUpperCase()}
                           </div>
                       )}
                   </div>
                   <div className="flex-1 min-w-0">
                       <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                           {session.user.user_metadata.full_name || 'User'}
                       </p>
                       <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                           {session.user.email}
                       </p>
                   </div>
               </div>
               <button 
                   onClick={handleSignOut}
                   className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors"
               >
                   Sign Out
               </button>
          </div>

          <div className="w-full p-6 border-t border-gray-100 dark:border-gray-800 text-gray-500 text-sm bg-gray-50 dark:bg-black/20">
               <p>POFIS Service Mapping</p>
               <p className="text-xs mt-1">v1.2.0</p>
          </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl transition-all duration-300">
        <header className="flex items-center justify-between mb-8 bg-white/80 dark:bg-gray-900/80 p-4 rounded-xl backdrop-blur-sm sticky top-0 z-30 border border-gray-200 dark:border-gray-700 shadow-sm">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition"
            aria-label="Open Menu"
          >
            <MenuIcon />
          </button>
          
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white text-center flex-grow pr-8">
            POFIS Service Mapping
          </h1>
        </header>

        <main>
          {activeView === 'register' && <RegisterView />}
          {activeView === 'lookup' && <LookupView />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'queue' && <ServiceQueueView filter={queueFilter} onRequestParts={(ctx) => { setSparePartsContext(ctx); setActiveView('spare_parts_checklist'); }} />}
          {activeView === 'workflow' && <WorkflowView onRequestParts={(ctx) => { setSparePartsContext(ctx); setActiveView('spare_parts_checklist'); }} />}
          {activeView === 'spare_parts_checklist' && <SparePartsChecklistView context={sparePartsContext} onBack={() => setActiveView('workflow')} />}
          {activeView === 'dashboard' && <DashboardView isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} onNavigateToQueue={(filter) => { setQueueFilter(filter); setActiveView('queue'); }} />}
        </main>
        
        <footer className="text-center mt-12 text-gray-500 text-sm pb-8">
            <p>&copy; {new Date().getFullYear()} POFIS Service Mapping. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
