'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Receipt,
  Scale,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  History,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  User,
  Menu,
  CreditCard,
  Plus
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ShellProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

export default function Shell({ activeTab, setActiveTab, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check initial system theme or localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    const initialTheme = savedTheme || 'light';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }

    // Get user session info
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (user) {
        setUserEmail(user.email || 'User');
      }
    });
  }, [supabase]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };



  // Nav Items configuration for laptop sidebar
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', name: 'Transactions', icon: Receipt },
    { id: 'balance', name: 'Balance Snapshot', icon: RefreshCw },
    { id: 'stk', name: 'STK Push', icon: ArrowUpRight },
    { id: 'b2c', name: 'B2C Payout', icon: ArrowDownLeft },
    { id: 'reversals', name: 'Reversals', icon: Scale },
    { id: 'analytics', name: 'Analytics', icon: TrendingUp },
    { id: 'audit', name: 'Audit Logs', icon: History },
  ];

  // Mobile navigation tabs mapping (groups operations into one tab)
  const mobileNavItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', name: 'Transactions', icon: Receipt },
    { id: 'stk', name: 'Operations', icon: CreditCard }, // Will display STK Push, B2C and Reversal triggers
    { id: 'analytics', name: 'Analytics', icon: TrendingUp },
    { id: 'audit', name: 'Audit Logs', icon: History },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background font-outfit text-text-main antialiased transition-colors duration-200">
      
      {/* 1. LAPTOP SIDEBAR */}
      <aside className={`hidden md:flex flex-col border-r border-border-main bg-panel transition-all duration-300 relative ${collapsed ? 'w-20' : 'w-64'}`}>
        
        {/* Logo and App Title */}
        <div className="flex items-center justify-between p-5 border-b border-border-main">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-panel border border-border-main shrink-0 relative">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.nextElementSibling) {
                    (target.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div className="absolute inset-0 bg-panel flex items-center justify-center text-accent font-bold text-sm hidden">
                SL
              </div>
            </div>
            {!collapsed && (
              <span className="font-bold text-lg tracking-tight truncate">Skylink OS</span>
            )}
          </div>
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-background border border-border-main rounded-md hidden md:block shrink-0 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Sidebar Menu Items */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id || 
              (item.id === 'stk' && (activeTab === 'b2c' || activeTab === 'reversals' || activeTab === 'stk'));
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group duration-150 relative ${
                  activeTab === item.id
                    ? 'bg-accent/10 text-accent'
                    : 'hover:bg-background text-muted-main hover:text-text-main'
                }`}
              >
                {activeTab === item.id && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-accent rounded-r-md"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={20} className={activeTab === item.id ? 'text-accent' : 'text-muted-main group-hover:text-text-main'} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Profile */}
        <div className="p-4 border-t border-border-main space-y-2 shrink-0">

          <div className="flex items-center gap-3 py-2 px-2 hover:bg-background rounded-lg transition-colors overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-border-main flex items-center justify-center shrink-0">
              <User size={16} />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{userEmail}</p>
                <button 
                  onClick={handleLogout}
                  className="text-[10px] text-danger font-medium hover:underline block leading-tight mt-0.5"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* 2. TOP HEADER */}
        <header className="h-16 border-b border-border-main bg-panel flex items-center justify-between px-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-panel border border-border-main shrink-0 relative">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.nextElementSibling) {
                    (target.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div className="absolute inset-0 bg-panel flex items-center justify-center text-accent font-bold text-sm hidden">
                SL
              </div>
            </div>
            <h1 className="font-bold text-lg md:text-xl tracking-tight capitalize">
              {menuItems.find(item => item.id === activeTab)?.name || activeTab}
            </h1>
          </div>

          <div className="flex items-center gap-2">


            {/* Light/Dark Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 border border-border-main hover:bg-background rounded-lg text-muted-main hover:text-text-main transition-colors duration-200"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <div className="md:hidden flex items-center">
              <button 
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs border border-border-main hover:bg-background rounded-lg text-danger font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* 3. CORE PAGE CONTENT VIEW */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative bg-background">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* 4. MOBILE BOTTOM NAVIGATION */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border-main bg-panel flex justify-around items-center px-2 pb-safe z-30">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            // Handle Operations group selection (includes stk, b2c, reversals tabs)
            const isSelected = item.id === 'stk'
              ? (activeTab === 'stk' || activeTab === 'b2c' || activeTab === 'reversals' || activeTab === 'balance')
              : activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center w-16 h-12 rounded-lg relative ${
                  isSelected ? 'text-accent' : 'text-muted-main'
                }`}
              >
                <Icon size={20} className={isSelected ? 'scale-110 transition-transform duration-200' : ''} />
                <span className="text-[10px] font-medium mt-1 truncate max-w-full">
                  {item.name}
                </span>
                {isSelected && (
                  <motion.div
                    layoutId="mobile-indicator"
                    className="absolute -top-2 w-5 h-1 bg-accent rounded-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>



    </div>
  );
}
