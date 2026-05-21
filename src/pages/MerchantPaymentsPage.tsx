import React, { useState, useEffect, useMemo } from 'react';
import { 
  Store, Send, CheckCircle2, XCircle, Clock, Search, RefreshCw, 
  Eye, EyeOff, AlertTriangle, ArrowRight, ShieldCheck, HelpCircle, 
  Lock, Calendar, Database, History, User, CreditCard, ChevronRight, X
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

interface B2BTransaction {
  id: string;
  internal_reference: string;
  parent_transaction_id: string | null;
  originator_conversation_id: string | null;
  conversation_id: string | null;
  transaction_id: string | null;
  initiator_name: string | null;
  sender_shortcode: string;
  receiver_till: string;
  requester_phone: string | null;
  account_reference: string | null;
  remarks: string | null;
  occasion: string | null;
  amount: number;
  currency: string;
  status: 'queued' | 'submitted' | 'processing' | 'success' | 'failed' | 'timeout';
  result_code: string | null;
  result_description: string | null;
  debit_account_balance: string | null;
  debit_party_balance: string | null;
  initiator_balance: string | null;
  receiver_party_name: string | null;
  transaction_completed_at: string | null;
  timeout_received: boolean;
  raw_request: any;
  raw_response: any;
  raw_result: any;
  retry_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  actor: string | null;
  metadata: any;
  created_at: string;
}

export function MerchantPaymentsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Form Fields
  const [receiverTill, setReceiverTill] = useState('');
  const [amount, setAmount] = useState('');
  const [accountReference, setAccountReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [occasion, setOccasion] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [confirmationPassword, setConfirmationPassword] = useState('');
  
  // UI Controls
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // Safety Config state (fetched from DB)
  const [safetyConfig, setSafetyConfig] = useState({
    maxTxLimit: 50000,
    dailyPayoutLimit: 250000,
    cooldownSeconds: 60,
    isPasswordRequired: false
  });

  // Table & Real-time State
  const [transactions, setTransactions] = useState<B2BTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer / Selection State
  const [selectedTx, setSelectedTx] = useState<B2BTransaction | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Connection Test State inside Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [limitMaxTx, setLimitMaxTx] = useState('50000');
  const [limitDaily, setLimitDaily] = useState('250000');
  const [limitCooldown, setLimitCooldown] = useState('60');
  const [limitPassword, setLimitPassword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Load user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);

  // Fetch configs and transactions
  const fetchSafetyConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('mpesa_credentials')
        .select('b2b_max_transaction_limit, b2b_daily_payout_limit, b2b_cooldown_seconds, b2b_confirmation_password')
        .eq('id', 'c1111111-1111-1111-1111-111111111111')
        .maybeSingle();

      if (data) {
        setSafetyConfig({
          maxTxLimit: Number(data.b2b_max_transaction_limit) || 50000,
          dailyPayoutLimit: Number(data.b2b_daily_payout_limit) || 250000,
          cooldownSeconds: Number(data.b2b_cooldown_seconds) || 60,
          isPasswordRequired: !!data.b2b_confirmation_password
        });
        setLimitMaxTx(data.b2b_max_transaction_limit?.toString() || '50000');
        setLimitDaily(data.b2b_daily_payout_limit?.toString() || '250000');
        setLimitCooldown(data.b2b_cooldown_seconds?.toString() || '60');
        setLimitPassword(data.b2b_confirmation_password || '');
      }
    } catch (err) {
      console.error('Failed to load safety configurations:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('business_buy_goods_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      
      const mapped: B2BTransaction[] = (data || []).map(tx => ({
        ...tx,
        amount: Number(tx.amount)
      }));

      setTransactions(mapped);
      setError(null);
    } catch (e: any) {
      console.error('Error fetching transactions:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Setup realtime listener
  useEffect(() => {
    fetchSafetyConfig();
    fetchTransactions();

    const channel = supabase
      .channel('b2b-transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_buy_goods_transactions' },
        () => {
          fetchTransactions();
          // Update selected transaction details in the drawer if currently open
          if (selectedTx) {
            supabase
              .from('business_buy_goods_transactions')
              .select('*')
              .eq('id', selectedTx.id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setSelectedTx({ ...data, amount: Number(data.amount) });
              });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTx]);

  // Load audit logs when transaction is selected
  useEffect(() => {
    if (!selectedTx) return;

    const fetchAudits = async () => {
      try {
        setLoadingAudits(true);
        const { data, error } = await supabase
          .from('payout_audit_logs')
          .select('*')
          .eq('payout_id', selectedTx.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setAuditLogs(data || []);
      } catch (err) {
        console.error('Failed to fetch audits:', err);
      } finally {
        setLoadingAudits(false);
      }
    };

    fetchAudits();
  }, [selectedTx]);

  // Handle settings update
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('mpesa_credentials')
        .update({
          b2b_max_transaction_limit: Number(limitMaxTx),
          b2b_daily_payout_limit: Number(limitDaily),
          b2b_cooldown_seconds: Number(limitCooldown),
          b2b_confirmation_password: limitPassword || null
        })
        .eq('id', 'c1111111-1111-1111-1111-111111111111');

      if (error) throw error;
      alert('Safety configurations updated successfully.');
      fetchSafetyConfig();
      setIsSettingsOpen(false);
    } catch (err: any) {
      alert(`Settings update failed: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle payment initiation
  const handleInitiateClick = (e: React.FormEvent) => {
    e.preventDefault();

    // Field Validations
    if (!/^\d{5,6}$/.test(receiverTill)) {
      alert('Receiver Till must be 5 or 6 digits.');
      return;
    }

    const amtNum = Number(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      alert('Enter a valid amount.');
      return;
    }

    if (amtNum > safetyConfig.maxTxLimit) {
      alert(`Amount exceeds the single transaction limit of KES ${safetyConfig.maxTxLimit.toLocaleString()}`);
      return;
    }

    if (!accountReference || accountReference.length > 13) {
      alert('Account Reference is required and must not exceed 13 characters.');
      return;
    }

    if (!remarks || remarks.length > 100) {
      alert('Remarks are required and must not exceed 100 characters.');
      return;
    }

    if (requesterPhone && !/^(?:254|\+254|0)?(7|1)\d{8}$/.test(requesterPhone)) {
      alert('Enter a valid Kenyan phone number.');
      return;
    }

    // Open Confirmation Dialog
    setIsConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setIsConfirmOpen(false);
    setIsSubmitting(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const response = await fetch('/api/business-buy-goods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverTill,
          amount: Number(amount),
          accountReference,
          remarks,
          occasion: occasion || undefined,
          requesterPhone: requesterPhone || undefined,
          confirmationPassword: safetyConfig.isPasswordRequired ? confirmationPassword : undefined,
          userId: currentUser?.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit payment.');
      }

      alert(`B2B merchant payment initiated successfully. Current Status: ${data.status}`);

      // Clear Form Fields
      setReceiverTill('');
      setAmount('');
      setAccountReference('');
      setRemarks('');
      setOccasion('');
      setRequesterPhone('');
      setConfirmationPassword('');
    } catch (err: any) {
      console.error(err);
      alert(`Payment dispatch failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Retrying a failed payout
  const handleRetryTx = async (tx: B2BTransaction) => {
    if (!window.confirm(`Are you sure you want to retry the payment of KES ${tx.amount.toLocaleString()} to Till ${tx.receiver_till}? This will submit a new API call with a linked parent ID.`)) {
      return;
    }

    let retryPassword = '';
    if (safetyConfig.isPasswordRequired) {
      const pw = window.prompt('Enter confirmation password:');
      if (pw === null) return;
      retryPassword = pw;
    }

    setIsSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const response = await fetch('/api/business-buy-goods/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transactionId: tx.id,
          confirmationPassword: safetyConfig.isPasswordRequired ? retryPassword : undefined,
          userId: currentUser?.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retry payment.');
      }

      alert(`Retry dispatched successfully. Transaction status: ${data.status}`);
      setIsDrawerOpen(false);
      setSelectedTx(null);
    } catch (err: any) {
      alert(`Retry submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const todayTxs = transactions.filter(t => new Date(t.created_at) >= today);
    const successfulToday = todayTxs.filter(t => t.status === 'success');
    const totalPaidToday = successfulToday.reduce((acc, curr) => acc + curr.amount, 0);

    const pending = transactions.filter(t => ['queued', 'submitted', 'processing'].includes(t.status)).length;
    const failedCount = transactions.filter(t => t.status === 'failed').length;
    const timeoutCount = transactions.filter(t => t.status === 'timeout' || t.timeout_received).length;

    const totalVolume = transactions.filter(t => t.status === 'success').reduce((acc, curr) => acc + curr.amount, 0);

    return {
      totalPaidToday,
      pending,
      failedCount,
      timeoutCount,
      totalVolume,
      totalCount: transactions.length
    };
  }, [transactions]);

  // Search & Filtering
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      const q = searchQuery.toLowerCase();
      const matchQuery = 
        tx.receiver_till.includes(q) ||
        (tx.account_reference || '').toLowerCase().includes(q) ||
        (tx.transaction_id || '').toLowerCase().includes(q) ||
        (tx.internal_reference).toLowerCase().includes(q) ||
        (tx.receiver_party_name || '').toLowerCase().includes(q);

      const matchStatus = filterStatus === 'All' || tx.status === filterStatus;
      return matchQuery && matchStatus;
    });
  }, [transactions, searchQuery, filterStatus]);

  // Chart Data preparation
  const chartData = useMemo(() => {
    // 1. Outbound daily trend (last 7 days)
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days[str] = 0;
    }

    transactions.forEach(t => {
      if (t.status === 'success') {
        const dStr = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (days[dStr] !== undefined) {
          days[dStr] += t.amount;
        }
      }
    });

    return Object.entries(days).map(([date, amount]) => ({ date, amount }));
  }, [transactions]);

  const topTillsData = useMemo(() => {
    // 2. Frequency of Top 5 Tills
    const tills: Record<string, { amount: number; count: number }> = {};
    transactions.forEach(t => {
      if (t.status === 'success') {
        if (!tills[t.receiver_till]) tills[t.receiver_till] = { amount: 0, count: 0 };
        tills[t.receiver_till].amount += t.amount;
        tills[t.receiver_till].count += 1;
      }
    });

    return Object.entries(tills)
      .map(([till, data]) => ({ till, amount: data.amount, count: data.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

  // Color mappings
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} /> Success
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle size={12} /> Failed
          </span>
        );
      case 'timeout':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={12} /> Timeout
          </span>
        );
      case 'queued':
      case 'submitted':
      case 'processing':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse">
            <RefreshCw size={12} className="animate-spin" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-12 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-text mb-1 flex items-center gap-2">
            <Store className="text-brand-accent" size={24} />
            M-Pesa Business Buy Goods
          </h2>
          <p className="text-brand-text/50 text-xs md:text-sm">
            Disburse funds securely from MMF/Working Account to Merchant Tills (B2B API gateway).
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-4 py-2 bg-brand-panel hover:bg-brand-panel/80 border border-brand-border text-brand-text rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
          >
            <Lock size={14} />
            Safety Settings
          </button>
          <button
            onClick={fetchTransactions}
            className="p-2 bg-brand-panel hover:bg-brand-panel/80 border border-brand-border text-brand-text rounded-lg transition-colors"
            title="Refresh Transactions"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-5 flex items-center gap-4 shadow-sm hover:border-brand-border/80 transition-colors">
          <div className="p-3 bg-brand-accent/10 rounded-lg text-brand-accent">
            <CreditCard size={20} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-brand-text/50 uppercase tracking-wider">Paid Today</p>
            <p className="text-lg md:text-xl font-bold text-brand-text mt-0.5">KES {metrics.totalPaidToday.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-5 flex items-center gap-4 shadow-sm hover:border-brand-border/80 transition-colors">
          <div className="p-3 bg-sky-500/10 rounded-lg text-sky-400">
            <RefreshCw size={20} className={metrics.pending > 0 ? 'animate-spin' : ''} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-brand-text/50 uppercase tracking-wider">Pending/Processing</p>
            <p className="text-lg md:text-xl font-bold text-brand-text mt-0.5">{metrics.pending} payouts</p>
          </div>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-5 flex items-center gap-4 shadow-sm hover:border-brand-border/80 transition-colors">
          <div className="p-3 bg-rose-500/10 rounded-lg text-rose-400">
            <XCircle size={20} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-brand-text/50 uppercase tracking-wider">Failed Transactions</p>
            <p className="text-lg md:text-xl font-bold text-brand-text mt-0.5">{metrics.failedCount} failures</p>
          </div>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-5 flex items-center gap-4 shadow-sm hover:border-brand-border/80 transition-colors">
          <div className="p-3 bg-amber-500/10 rounded-lg text-amber-400">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-brand-text/50 uppercase tracking-wider">Timed Out</p>
            <p className="text-lg md:text-xl font-bold text-brand-text mt-0.5">{metrics.timeoutCount} timeouts</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Form + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side Payout Form */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-brand-border pb-3">
              <Send size={18} className="text-brand-accent" />
              <h3 className="font-semibold text-brand-text text-sm">Disburse Outbound Funds</h3>
            </div>

            <form onSubmit={handleInitiateClick} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Receiver Merchant Till</label>
                <input 
                  type="text" 
                  maxLength={6}
                  placeholder="e.g. 512345 (5-6 digits)" 
                  value={receiverTill}
                  onChange={(e) => setReceiverTill(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Amount (KES)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="e.g. 15000" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                  required
                />
                <span className="text-[10px] text-brand-text/40 mt-1 block">Max limit: KES {safetyConfig.maxTxLimit.toLocaleString()}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Account Reference</label>
                <input 
                  type="text" 
                  maxLength={13}
                  placeholder="e.g. INV-90412 (Max 13 chars)" 
                  value={accountReference}
                  onChange={(e) => setAccountReference(e.target.value.replace(/[^A-Za-z0-9\-]/g, ''))}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Remarks / Purpose</label>
                <input 
                  type="text" 
                  maxLength={100}
                  placeholder="e.g. Supplier payment for inventory" 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Occasion (Opt)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Salary" 
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Req. Phone (Opt)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 254708..." 
                    value={requesterPhone}
                    onChange={(e) => setRequesterPhone(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-xs font-mono"
                  />
                </div>
              </div>

              {safetyConfig.isPasswordRequired && (
                <div className="pt-2 border-t border-brand-border/50">
                  <label className="block text-xs font-semibold text-status-warning mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Lock size={12} />
                    Confirmation Password Required
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      placeholder="Enter verification password" 
                      value={confirmationPassword}
                      onChange={(e) => setConfirmationPassword(e.target.value)}
                      className="w-full bg-brand-bg border border-status-warning/40 rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-text"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-brand-accent hover:bg-brand-accent/90 text-white rounded-lg text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} />
                    Disbursing Funds...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Submit Payment
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side Charts */}
        <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
          {/* Payout Trend Chart */}
          <div className="bg-brand-panel border border-brand-border rounded-xl p-5 shadow-sm flex-1 flex flex-col">
            <h3 className="font-semibold text-brand-text text-sm mb-3 flex items-center gap-2">
              <Calendar className="text-brand-accent" size={16} />
              7-Day Outbound Volume (KES)
            </h3>
            <div className="flex-1 min-h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="payoutColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-brand-accent, #ec4899)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-brand-accent, #ec4899)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="currentColor" className="text-brand-text/40 text-[10px]" tickLine={false} axisLine={false} />
                  <YAxis stroke="currentColor" className="text-brand-text/40 text-[10px]" tickLine={false} axisLine={false} tickFormatter={(v) => `KES ${v.toLocaleString()}`} />
                  <ChartTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-brand-panel, #1f2937)', borderColor: 'var(--color-brand-border, #374151)' }}
                    labelStyle={{ color: 'var(--color-brand-text, #f3f4f6)', fontWeight: 'bold' }}
                    itemStyle={{ color: 'var(--color-brand-accent, #ec4899)' }}
                    formatter={(v) => [`KES ${v.toLocaleString()}`, 'Amount']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="var(--color-brand-accent, #ec4899)" strokeWidth={2} fillOpacity={1} fill="url(#payoutColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Tills Chart */}
          <div className="bg-brand-panel border border-brand-border rounded-xl p-5 shadow-sm flex-1 flex flex-col">
            <h3 className="font-semibold text-brand-text text-sm mb-3 flex items-center gap-2">
              <Database className="text-brand-accent" size={16} />
              Top Disbursement Recipient Tills
            </h3>
            <div className="flex-1 min-h-[140px]">
              {topTillsData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-brand-text/30">
                  No successful disbursements logged yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTillsData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <XAxis dataKey="till" stroke="currentColor" className="text-brand-text/40 text-[10px]" tickLine={false} axisLine={false} />
                    <YAxis stroke="currentColor" className="text-brand-text/40 text-[10px]" tickLine={false} axisLine={false} tickFormatter={(v) => `KES ${v.toLocaleString()}`} />
                    <ChartTooltip 
                      contentStyle={{ backgroundColor: 'var(--color-brand-panel, #1f2937)', borderColor: 'var(--color-brand-border, #374151)' }}
                      labelStyle={{ color: 'var(--color-brand-text, #f3f4f6)', fontWeight: 'bold' }}
                      itemStyle={{ color: 'var(--color-brand-accent, #ec4899)' }}
                      formatter={(v) => [`KES ${v.toLocaleString()}`, 'Total Disbursed']}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {topTillsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--color-brand-accent)' : 'rgba(236,72,153,0.5)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Transactions Section */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        
        {/* Filter bar */}
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <History className="text-brand-accent" size={18} />
            <h3 className="font-semibold text-brand-text text-sm">Disbursement Registry</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative group flex-1 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40 group-focus-within:text-brand-accent transition-colors" />
              <input
                type="text"
                placeholder="Search till, reference, id..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:border-brand-accent transition-all text-xs"
              />
            </div>

            {/* Status Select */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-xs focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="timeout">Timeout</option>
              <option value="processing">Processing</option>
              <option value="queued">Queued</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/10 text-brand-text/50 font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-4 px-6">Timestamp</th>
                <th className="py-4 px-6">Internal Ref</th>
                <th className="py-4 px-6">Receiver Till</th>
                <th className="py-4 px-6">Account Ref</th>
                <th className="py-4 px-6">Amount</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-brand-text/50">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-brand-accent" size={24} />
                      Loading logs...
                    </div>
                  </td>
                </tr>
              ) : filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-brand-text/40">
                    No disbursement records match the criteria.
                  </td>
                </tr>
              ) : (
                filteredTxs.map((tx) => (
                  <tr 
                    key={tx.id} 
                    onClick={() => {
                      setSelectedTx(tx);
                      setIsDrawerOpen(true);
                    }}
                    className="hover:bg-brand-panel/60 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6 text-brand-text/70">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-brand-text/50 group-hover:text-brand-accent">
                      {tx.internal_reference.substring(0, 8)}...
                    </td>
                    <td className="py-4 px-6 font-bold text-brand-text">
                      {tx.receiver_till}
                      {tx.receiver_party_name && (
                        <span className="block text-[10px] text-brand-text/40 font-normal">{tx.receiver_party_name}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-brand-text/80">
                      {tx.account_reference || '-'}
                    </td>
                    <td className="py-4 px-6 font-bold text-brand-text">
                      KES {tx.amount.toLocaleString()}
                    </td>
                    <td className="py-4 px-6">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedTx(tx);
                          setIsDrawerOpen(true);
                        }}
                        className="p-1.5 hover:bg-brand-border text-brand-text/60 hover:text-brand-text rounded-md transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-brand-panel border border-brand-border rounded-xl p-6 max-w-md w-full shadow-xl space-y-6">
            <div className="flex items-center gap-3 text-status-warning">
              <ShieldCheck size={28} />
              <div>
                <h3 className="font-bold text-brand-text text-base">Authorization Confirmation</h3>
                <p className="text-xs text-brand-text/50">Verify transaction details before proceeding.</p>
              </div>
            </div>

            <div className="bg-brand-bg rounded-lg p-4 border border-brand-border/60 space-y-3 font-semibold text-xs">
              <div className="flex justify-between">
                <span className="text-brand-text/50">Disbursing To Till</span>
                <span className="text-brand-text font-bold">{receiverTill}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/50">Disbursement Amount</span>
                <span className="text-brand-text font-bold text-sm text-brand-accent">KES {Number(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/50">Account Reference</span>
                <span className="text-brand-text font-mono">{accountReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/50">Remarks</span>
                <span className="text-brand-text font-normal">{remarks}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsConfirmOpen(false)}
                className="flex-1 py-2.5 bg-brand-bg hover:bg-brand-panel border border-brand-border text-brand-text text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-brand-bg text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ShieldCheck size={14} />
                Authorize Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-panel border border-brand-border rounded-xl p-6 max-w-md w-full shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-brand-border pb-3">
              <div className="flex items-center gap-2">
                <Lock className="text-brand-accent" size={18} />
                <h3 className="font-bold text-brand-text text-sm">Payout Safety Controls</h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-brand-text/40 hover:text-brand-text">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text/80 mb-1.5">Max Transaction Size (KES)</label>
                <input 
                  type="number"
                  value={limitMaxTx}
                  onChange={(e) => setLimitMaxTx(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/80 mb-1.5">Daily Cumulative limit (KES)</label>
                <input 
                  type="number"
                  value={limitDaily}
                  onChange={(e) => setLimitDaily(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/80 mb-1.5">Duplicate Cooldown Period (Seconds)</label>
                <input 
                  type="number"
                  value={limitCooldown}
                  onChange={(e) => setLimitCooldown(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-status-warning mb-1.5 flex items-center gap-1">
                  <Lock size={12} />
                  Optional Confirmation Password
                </label>
                <input 
                  type="text"
                  placeholder="Set password or leave blank to disable"
                  value={limitPassword}
                  onChange={(e) => setLimitPassword(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none text-xs font-semibold"
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-brand-border/50">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-2 bg-brand-bg border border-brand-border text-brand-text text-xs rounded-lg transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-2 bg-brand-accent hover:opacity-90 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingSettings ? <RefreshCw className="animate-spin" size={12} /> : 'Save Controls'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Slide-over Drawer */}
      {isDrawerOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsDrawerOpen(false)} />

          {/* Drawer container */}
          <div className="relative w-full max-w-xl bg-brand-panel border-l border-brand-border h-full flex flex-col shadow-2xl animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/30">
              <div>
                <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest">Payout Details</span>
                <h4 className="font-bold text-brand-text text-sm mt-0.5 font-mono">{selectedTx.internal_reference}</h4>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 text-brand-text/50 hover:text-brand-text rounded-md hover:bg-brand-border"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              
              {/* Status and Big amount */}
              <div className="bg-brand-bg/40 border border-brand-border rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-3">
                <span className="text-2xl md:text-3xl font-extrabold text-brand-text">KES {selectedTx.amount.toLocaleString()}</span>
                {getStatusBadge(selectedTx.status)}
                
                {selectedTx.receiver_party_name && (
                  <p className="text-xs text-brand-text/60 mt-1">Paid to: <span className="font-semibold text-brand-text">{selectedTx.receiver_party_name}</span></p>
                )}
              </div>

              {/* Transaction Key Details */}
              <div className="bg-brand-panel border border-brand-border rounded-xl p-4 space-y-3.5 text-xs">
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Receiver Till</span>
                  <span className="font-bold text-brand-text">{selectedTx.receiver_till}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Account Reference</span>
                  <span className="font-bold text-brand-text font-mono">{selectedTx.account_reference || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Remarks</span>
                  <span className="font-medium text-brand-text">{selectedTx.remarks || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">M-Pesa ID</span>
                  <span className="font-mono font-bold text-brand-text">{selectedTx.transaction_id || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Conversation ID</span>
                  <span className="font-mono text-brand-text/70">{selectedTx.conversation_id || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Debit Account Balance</span>
                  <span className="font-semibold text-brand-text">{selectedTx.debit_account_balance || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Sender Shortcode</span>
                  <span className="font-semibold text-brand-text">{selectedTx.sender_shortcode}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Requester Phone</span>
                  <span className="font-mono text-brand-text">{selectedTx.requester_phone || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-brand-border/20">
                  <span className="text-brand-text/50">Response Code / Desc</span>
                  <span className="font-semibold text-brand-text">{selectedTx.result_code || '-'} ({selectedTx.result_description || 'None'})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-brand-text/50">Retry Count</span>
                  <span className="font-semibold text-brand-text">{selectedTx.retry_count}</span>
                </div>
              </div>

              {/* Progress Tracker / Timeline */}
              <div className="space-y-3">
                <h5 className="font-bold text-xs text-brand-text/50 uppercase tracking-wider">Transaction Progress Timeline</h5>
                <div className="bg-brand-panel border border-brand-border rounded-xl p-5 space-y-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 rounded-full bg-brand-accent/20 border border-brand-accent text-brand-accent flex items-center justify-center text-[10px] font-bold">1</div>
                      <div className="w-[2px] h-8 bg-brand-border"></div>
                    </div>
                    <div>
                      <h6 className="font-semibold text-brand-text text-xs">Payout Created</h6>
                      <p className="text-[10px] text-brand-text/50">{new Date(selectedTx.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        ['submitted', 'processing', 'success', 'failed', 'timeout'].includes(selectedTx.status)
                          ? 'bg-brand-accent/20 border border-brand-accent text-brand-accent'
                          : 'bg-brand-bg border border-brand-border text-brand-text/30'
                      }`}>2</div>
                      <div className="w-[2px] h-8 bg-brand-border"></div>
                    </div>
                    <div>
                      <h6 className="font-semibold text-brand-text text-xs">Submitted to Safaricom Daraja</h6>
                      <p className="text-[10px] text-brand-text/50">
                        {['submitted', 'processing', 'success', 'failed', 'timeout'].includes(selectedTx.status) ? 'Gateway Payment Request Sent' : 'Awaiting API submission'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        ['success', 'failed', 'timeout'].includes(selectedTx.status)
                          ? selectedTx.status === 'success'
                            ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400'
                            : 'bg-rose-500/20 border border-rose-500 text-rose-400'
                          : 'bg-brand-bg border border-brand-border text-brand-text/30'
                      }`}>3</div>
                    </div>
                    <div>
                      <h6 className="font-semibold text-brand-text text-xs">Callback Completed</h6>
                      <p className="text-[10px] text-brand-text/50">
                        {selectedTx.status === 'success' && `Result resolved successfully at ${selectedTx.transaction_completed_at ? new Date(selectedTx.transaction_completed_at).toLocaleString() : ''}`}
                        {selectedTx.status === 'failed' && `Result failed: ${selectedTx.result_description || 'No result details'}`}
                        {selectedTx.status === 'timeout' && 'Gateway connection timeout received.'}
                        {['queued', 'submitted', 'processing'].includes(selectedTx.status) && 'Awaiting asynchronous webhook callback from M-Pesa'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Audit Trail Logs */}
              <div className="space-y-3">
                <h5 className="font-bold text-xs text-brand-text/50 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={14} />
                  Outbound Payout Audit History
                </h5>
                <div className="bg-brand-panel border border-brand-border rounded-xl p-4 divide-y divide-brand-border/30 text-xs max-h-48 overflow-y-auto scrollbar-thin">
                  {loadingAudits ? (
                    <div className="text-center py-4 text-brand-text/40">Loading audits...</div>
                  ) : auditLogs.length === 0 ? (
                    <div className="text-center py-4 text-brand-text/40">No audit details recorded.</div>
                  ) : (
                    auditLogs.map((log) => (
                      <div key={log.id} className="py-2.5 first:pt-0 last:pb-0 flex justify-between gap-3">
                        <div>
                          <p className="font-bold text-brand-text">{log.action}</p>
                          <p className="text-[10px] text-brand-text/40 mt-0.5">Actor: {log.actor || 'system'}</p>
                          {log.metadata && (
                            <pre className="mt-1 bg-brand-bg/60 border border-brand-border/40 p-1.5 rounded font-mono text-[9px] max-w-full overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                        <span className="text-[10px] text-brand-text/50 whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Collapsible raw payloads JSON */}
              <div className="space-y-3 pt-2">
                <details className="bg-brand-panel border border-brand-border rounded-xl group overflow-hidden">
                  <summary className="p-4 font-bold text-xs text-brand-text/70 cursor-pointer hover:bg-brand-bg/30 flex justify-between items-center select-none">
                    <span className="flex items-center gap-1.5">
                      <Database size={14} />
                      Raw API payloads (Request / Response / Callback)
                    </span>
                    <span className="transition-transform group-open:rotate-90">▶</span>
                  </summary>
                  <div className="p-4 border-t border-brand-border bg-brand-bg/25 space-y-4 max-h-[300px] overflow-y-auto font-mono text-[10px]">
                    <div>
                      <p className="font-bold text-brand-accent/80 mb-1 border-b border-brand-border/40 pb-0.5">RAW REQUEST METADATA</p>
                      <pre className="bg-brand-panel border border-brand-border rounded p-2.5 overflow-x-auto">
                        {JSON.stringify(selectedTx.raw_request || { message: 'No request payload logged' }, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-bold text-brand-accent/80 mb-1 border-b border-brand-border/40 pb-0.5">RAW DARAJA GATEWAY RESPONSE</p>
                      <pre className="bg-brand-panel border border-brand-border rounded p-2.5 overflow-x-auto">
                        {JSON.stringify(selectedTx.raw_response || { message: 'No response logged' }, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-bold text-brand-accent/80 mb-1 border-b border-brand-border/40 pb-0.5">RAW WEBHOOK RESULT CALLBACK</p>
                      <pre className="bg-brand-panel border border-brand-border rounded p-2.5 overflow-x-auto">
                        {JSON.stringify(selectedTx.raw_result || { message: 'No callback received yet' }, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>
              </div>

            </div>

            {/* Footer / Actions */}
            <div className="p-6 border-t border-brand-border bg-brand-bg/30 flex gap-4">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="flex-1 py-2.5 bg-brand-panel hover:bg-brand-border border border-brand-border text-brand-text text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Close Details
              </button>
              {['failed', 'timeout'].includes(selectedTx.status) && (
                <button
                  onClick={() => handleRetryTx(selectedTx)}
                  className="flex-1 py-2.5 bg-brand-accent hover:opacity-90 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} />
                  Retry Payout
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
