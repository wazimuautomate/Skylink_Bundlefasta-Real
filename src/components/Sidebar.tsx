import { 
  LayoutDashboard, 
  ReceiptText, 
  Activity, 
  Smartphone, 
  RotateCcw, 
  FileCheck2, 
  Users, 
  BarChart3, 
  Settings,
  LogOut,
  X
} from 'lucide-react';
import { useLayout } from './LayoutContext';
import { useNavigation } from './NavigationContext';
import { Tooltip } from './Tooltip';
import { supabase } from '../utils/supabaseClient';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Transactions', icon: ReceiptText },
  { name: 'Paybill Activity', icon: Activity },
  { name: 'STK Push', icon: Smartphone },
  { name: 'Reversals', icon: RotateCcw },
  { name: 'Reconciliation', icon: FileCheck2 },
  { name: 'Customers', icon: Users },
  { name: 'Analytics', icon: BarChart3 },
  { name: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useLayout();
  const { activePage, setActivePage } = useNavigation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside 
        className={`hidden md:flex sticky top-0 left-0 h-screen bg-brand-bg border-r border-brand-border z-40 flex-col transition-all duration-300 ease-in-out shrink-0
          ${isSidebarOpen ? 'w-64' : 'w-[80px]'}
        `}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-transparent">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-8 h-8 rounded-full object-cover shrink-0 bg-brand-panel border border-brand-border" 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.nextElementSibling) {
                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                }
              }}
            />
            <div className="w-8 h-8 shrink-0 rounded-full bg-brand-panel border border-brand-border hidden items-center justify-center text-brand-accent font-bold text-xl leading-none">
              S
            </div>

            {isSidebarOpen && (
              <h1 className="font-bold text-lg tracking-wide uppercase text-brand-text">
                Skylink<br/>
                <span className="text-brand-accent text-sm tracking-widest leading-none block">Bundlefasta</span>
              </h1>
            )}
          </div>
          
          <button 
            onClick={toggleSidebar}
            className="md:hidden p-1 text-brand-text/50 hover:text-brand-text rounded-md hover:bg-brand-panel"
          >
            <X size={20} />
          </button>
        </div>

        <nav className={`flex-1 py-6 space-y-2 overflow-y-auto overflow-x-hidden scrollbar-none ${isSidebarOpen ? 'px-4' : 'px-3 flex flex-col items-center'}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.name;
            const Icon = item.icon;
            
            const buttonContent = (
              <button
                onClick={() => setActivePage(item.name)}
                className={`flex items-center transition-all duration-200 ${
                  isSidebarOpen 
                    ? 'w-full gap-3 px-4 py-3 rounded-xl' 
                    : 'w-12 h-12 justify-center rounded-xl shrink-0'
                } ${
                  isActive 
                    ? 'bg-brand-panel text-brand-text shadow-sm border border-brand-border/30' 
                    : 'text-brand-text/60 hover:bg-brand-panel/30 hover:text-brand-text'
                }`}
              >
                <Icon size={20} className={`shrink-0 ${isActive ? 'text-brand-accent' : ''}`} />
                {isSidebarOpen && <span className="font-medium whitespace-nowrap">{item.name}</span>}
              </button>
            );

            if (!isSidebarOpen) {
              return (
                <Tooltip key={item.name} content={item.name}>
                  {buttonContent}
                </Tooltip>
              );
            }

            return <div key={item.name}>{buttonContent}</div>;
          })}
        </nav>

        <div className={`p-4 border-t border-brand-border ${!isSidebarOpen ? 'flex justify-center' : ''}`}>
          <button
            onClick={handleLogout}
            className={`flex items-center transition-all duration-200 ${
              isSidebarOpen 
                ? 'w-full gap-3 px-4 py-3 rounded-xl' 
                : 'w-12 h-12 justify-center rounded-xl shrink-0'
            } text-brand-text/60 hover:bg-status-danger/10 hover:text-status-danger cursor-pointer`}
          >
            <LogOut size={20} className="shrink-0" />
            {isSidebarOpen && <span className="font-medium whitespace-nowrap">Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-brand-bg/90 backdrop-blur-md border-t border-brand-border rounded-t-2xl z-50 flex items-center px-2 overflow-x-auto scrollbar-none pb-2 sm:pb-0 snap-x snap-mandatory shadow-lg">
        <div className="flex items-center gap-2 px-2 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.name;
            const Icon = item.icon;
            
            return (
              <button
                key={item.name}
                onClick={() => setActivePage(item.name)}
                className={`snap-center shrink-0 flex flex-col items-center justify-center gap-1 w-[72px] h-[64px] rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'text-brand-accent' 
                    : 'text-brand-text/50 hover:text-brand-text'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isActive ? 'bg-brand-accent/10' : ''}`}>
                  <Icon size={20} />
                </div>
                <span className="text-[10px] font-medium text-center leading-tight whitespace-nowrap max-w-full overflow-hidden text-ellipsis px-1">
                  {item.name}
                </span>
              </button>
            );
          })}
          <div className="w-[1px] h-10 bg-brand-border mx-1"></div>
          <button
            onClick={handleLogout}
            className="snap-center shrink-0 flex flex-col items-center justify-center gap-1 w-[72px] h-[64px] rounded-xl text-brand-text/50 hover:text-status-danger transition-all duration-200 group cursor-pointer"
          >
            <div className="p-1.5 rounded-lg group-hover:bg-status-danger/10">
              <LogOut size={20} />
            </div>
            <span className="text-[10px] font-medium text-center leading-tight">Log Out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
