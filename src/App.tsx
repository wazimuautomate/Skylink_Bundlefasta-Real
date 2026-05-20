import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { TransactionsPage } from './pages/TransactionsPage';
import { PaybillActivityPage } from './pages/PaybillActivityPage';
import { STKPushPage } from './pages/STKPushPage';
import { ReversalsPage } from './pages/ReversalsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { CustomersPage } from './pages/CustomersPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PaymentCheckoutPage } from './pages/PaymentCheckoutPage';
import { LoginPage } from './pages/LoginPage';
import { MerchantPaymentsPage } from './pages/MerchantPaymentsPage';
import { TreasuryTopupPage } from './pages/TreasuryTopupPage';
import { BusinessToPochiPage } from './pages/BusinessToPochiPage';
import { useNavigation } from './components/NavigationContext';
import { supabase } from './utils/supabaseClient';

export default function App() {
  const { activePage } = useNavigation();
  const [session, setSession] = useState<any>(null);
  const [isKeywordVerified, setIsKeywordVerified] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const verified = sessionStorage.getItem('keyword_verified') === 'true';
      setIsKeywordVerified(verified && !!session);
      setIsAuthLoading(false);
    });

    // 2. Listen to authentication changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        sessionStorage.removeItem('keyword_verified');
        setIsKeywordVerified(false);
      } else {
        const verified = sessionStorage.getItem('keyword_verified') === 'true';
        setIsKeywordVerified(verified);
      }
      setIsAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'Dashboard': return <Dashboard />;
      case 'Transactions': return <TransactionsPage />;
      case 'Paybill Activity': return <PaybillActivityPage />;
      case 'STK Push': return <STKPushPage />;
      case 'Merchant Payments': return <MerchantPaymentsPage />;
      case 'Treasury': return <TreasuryTopupPage />;
      case 'Business To Pochi': return <BusinessToPochiPage />;
      case 'Payment Checkout': return <PaymentCheckoutPage />;
      case 'Reversals': return <ReversalsPage />;
      case 'Reconciliation': return <ReconciliationPage />;
      case 'Customers': return <CustomersPage />;
      case 'Analytics': return <AnalyticsPage />;
      case 'Settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  };

  const pathname = window.location.pathname;
  const isCheckoutPath = pathname.startsWith('/checkout') || pathname.startsWith('/pay') || window.location.search.includes('slug=') || window.location.search.includes('ref=');

  if (isCheckoutPath) {
    return <PaymentCheckoutPage />;
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-brand-bg">
        <div className="w-10 h-10 border-4 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !isKeywordVerified) {
    return <LoginPage onLoginSuccess={() => setIsKeywordVerified(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg text-brand-text">
      {/* 1. Left Sidebar */}
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-accent/5 rounded-full blur-[100px] pointer-events-none"></div>

        {/* 2. Top Bar */}
        <Header />

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 z-0 pb-24 md:pb-8">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
