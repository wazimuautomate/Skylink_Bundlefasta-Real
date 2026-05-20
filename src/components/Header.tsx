import { Search, Bell, Menu, Sun, Moon } from 'lucide-react';
import { useSearch } from './SearchContext';
import { useLayout } from './LayoutContext';
import { useTheme } from './ThemeProvider';

export function Header() {
  const { globalSearch, setGlobalSearch } = useSearch();
  const { toggleSidebar } = useLayout();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="sticky top-0 z-10 pt-2 pb-2 md:pt-0 md:pb-0 px-4 md:px-0 bg-brand-bg/90 md:bg-transparent backdrop-blur-md md:backdrop-blur-none">
      <header className="h-14 md:h-20 px-4 md:px-8 flex items-center justify-between bg-brand-bg/80 backdrop-blur-md border border-brand-border md:border-t-0 md:border-l-0 md:border-r-0 md:border-b rounded-full md:rounded-none transition-colors duration-300">
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <button 
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-brand-border text-brand-text transition-colors hidden md:block"
          >
            <Menu size={24} />
          </button>
          
          {/* Mobile Logo */}
          <div className="md:hidden flex items-center shrink-0">
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
          </div>

          <div className="hidden md:block">
            <h2 className="text-xl md:text-2xl font-semibold text-brand-text">Welcome back, Admin</h2>
            <p className="text-xs md:text-sm text-brand-text/60 mt-1 hidden sm:block">Monitor your Paybill operations in real-time</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6 flex-1 justify-end">
          {/* Search */}
          <div className="relative group/search flex-1 md:flex-none ml-2 md:ml-0">
            <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-brand-text/40 sm:w-[18px] sm:h-[18px] group-focus-within/search:text-brand-accent transition-colors" />
            </div>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search..."
              className="w-full md:w-48 lg:w-72 bg-brand-panel text-brand-text placeholder-brand-text/40 border border-brand-border rounded-full py-1.5 sm:py-2 pl-8 sm:pl-10 pr-3 sm:pr-4 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all text-[13px] sm:text-base"
            />
          </div>

          {/* Notifications */}
          <button className="relative p-1.5 sm:p-2 rounded-full hover:bg-brand-border text-brand-text/80 transition-colors shrink-0">
            <Bell size={18} className="sm:w-5 sm:h-5" />
            <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2 h-2 bg-brand-accent rounded-full border-2 border-brand-bg"></span>
          </button>

          {/* Theme */}
          <div className="flex items-center shrink-0">
            <button 
              onClick={toggleTheme}
              title="Toggle Theme" 
              className="p-1.5 sm:p-2 rounded-full hover:bg-brand-panel text-brand-text/60 hover:text-brand-text transition-colors"
            >
              {theme === 'dark' ? <Sun size={18} className="sm:w-5 sm:h-5" /> : <Moon size={18} className="sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
