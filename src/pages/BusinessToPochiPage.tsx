import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserCheck, Send, CheckCircle2, XCircle, Clock, Search, RefreshCw, 
  Eye, EyeOff, AlertTriangle, ArrowRight, ShieldCheck, HelpCircle, 
  Lock, Calendar, Database, History, User, CreditCard, ChevronRight, X, Phone
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

interface PochiTransaction {
  id: string;
  internal_reference: string;
  parent_transaction_id: string | null;
  originator_conversation_id: string | null;
  conversation_id: string | null;
  transaction_id: string | null;
  initiator_name: string | null;
  sender_shortcode: string;
  receiver_phone: string;
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

export function BusinessToPochiPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Form Fields
  const [receiverPhone, setReceiverPhone] = useState('');
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
  const [transactions, setTransactions] = useState<PochiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer / Selection State
  const [selectedTx, setSelectedTx] = useState<PochiTransaction | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Safety Settings state
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
        .select('pochi_max_transaction_limit, pochi_daily_payout_limit, pochi_cooldown_seconds, pochi_confirmation_password')
        .eq('id', 'c1111111-1111-1111-1111-111111111111')
        .maybeSingle();

      if (data) {
        setSafetyConfig({
          maxTxLimit: Number(data.pochi_max_transaction_limit) || 50000,
          dailyPayoutLimit: Number(data.pochi_daily_payout_limit) || 250000,
          cooldownSeconds: Number(data.pochi_cooldown_seconds) || 60,
          isPasswordRequired: !!data.pochi_confirmation_password
        });
        setLimitMaxTx(data.pochi_max_transaction_limit?.toString() || '50000');
        setLimitDaily(data.pochi_daily_payout_limit?.toString() || '250000');
        setLimitCooldown(data.pochi_cooldown_seconds?.toString() || '60');
        setLimitPassword(data.pochi_confirmation_password || '');
      }
    } catch (err) {
      console.error('Failed to load safety configurations:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('business_to_pochi_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      
      const mapped: PochiTransaction[] = (data || []).map(tx => ({
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
      .channel('pochi-transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_to_pochi_transactions' },
        () => {
          fetchTransactions();
          // Update selected transaction details in the drawer if currently open
          if (selectedTx) {
            supabase
              .from('business_to_pochi_transactions')
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
          .from('pochi_audit_logs')
          .select('*')
          .eq('pochi_transaction_id', selectedTx.id)
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
          pochi_max_transaction_limit: Number(limitMaxTx),
          pochi_daily_payout_limit: Number(limitDaily),
          pochi_cooldown_seconds: Number(limitCooldown),
          pochi_confirmation_password: limitPassword || null
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
    if (!/^(?:254|\+254|0)?(7|1)\d{8}$/.test(receiverPhone)) {
      alert('Receiver phone must be a valid Kenyan mobile number (e.g. 0712345678 or 254712345678).');
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
      const response = await fetch('/api/business-to-pochi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverPhone,
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

      alert(`Pochi payout initiated successfully. Current Status: ${data.status}`);

      // Clear Form Fields
      setReceiverPhone('');
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
  const handleRetryTx = async (tx: PochiTransaction) => {
    if (!window.confirm(`Are you sure you want to retry the payment of KES ${tx.amount.toLocaleString()} to Phone ${tx.receiver_phone}? This will submit a new API call with a linked parent ID.`)) {
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
      const response = await fetch('/api/business-to-pochi/retry', {
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
        tx.receiver_phone.includes(q) ||
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

  const topReceiversData = useMemo(() => {
    const phones: Record<string, { amount: number; count: number }> = {};
    transactions.forEach(t => {
      if (t.status === 'success') {
        if (!phones[t.receiver_phone]) phones[t.receiver_phone] = { amount: 0, count: 0 };
        phones[t.receiver_phone].amount += t.amount;
        phones[t.receiver_phone].count += 1;
      }
    });

    return Object.entries(phones)
      .map(([phone, data]) => ({ phone, amount: data.amount, count: data.count }))
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
    <div className="space-y-8 pb-12 font-sans text-brand-text">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-text mb-1 flex items-center gap-2">
            <UserCheck className="text-brand-accent" size={24} />
            M-Pesa Business To Pochi
          </h2>
          <p className="text-brand-text/50 text-xs md:text-sm">
            Disburse payout funds directly from your vault to personal MSISDN wallets (Pochi La Biashara).
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
              <h3 className="font-semibold text-brand-text text-sm">Disburse Pochi Funds</h3>
            </div>

            <form onSubmit={handleInitiateClick} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Receiver Mobile Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. 0712345678 or 254712345678" 
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
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
                  placeholder="e.g. Salary, Payment" 
                  value={accountReference}
                  onChange={(e) => setAccountReference(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Remarks</label>
                <input 
                  type="text" 
                  maxLength={100}
                  placeholder="e.g. Disbursing to Biashara Wallet" 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Occasion (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. MayPayout" 
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Requester Notification Phone (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. 0722000000" 
                  value={requesterPhone}
                  onChange={(e) => setRequesterPhone(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                />
              </div>

              {safetyConfig.isPasswordRequired && (
                <div>
                  <label className="block text-xs font-semibold text-brand-text/70 mb-1.5 uppercase tracking-wider">Confirmation Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      placeholder="Enter security password" 
                      value={confirmationPassword}
                      onChange={(e) => setConfirmationPassword(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg pl-3 pr-10 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-brand-text/40 hover:text-brand-text/70"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Initiate Payout
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Analytical Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart 1: Outbound Payout Trend */}
          <div className="bg-brand-panel border border-brand-border rounded-xl p-5 shadow-sm">
            <h4 className="text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar size={14} className="text-brand-accent" />
              7-Day Outbound Payout Trend (Volume KES)
            </h4>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pochiColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A3E635" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#A3E635" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#ffffff" opacity={0.3} fontSize={10} tickLine={false} />
                  <YAxis stroke="#ffffff" opacity={0.3} fontSize={10} tickLine={false} />
                  <ChartTooltip 
                    contentStyle={{ backgroundColor: '#1A1D20', borderColor: '#343A40', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                    itemStyle={{ color: '#A3E635', fontSize: '12px' }}
                    formatter={(val) => [`KES ${Number(val).toLocaleString()}`, 'Disbursed']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#A3E635" strokeWidth={2} fillOpacity={1} fill="url(#pochiColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Top Receivers */}
          <div className="bg-brand-panel border border-brand-border rounded-xl p-5 shadow-sm">
            <h4 className="text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-4 flex items-center gap-2">
              <History size={14} className="text-brand-accent" />
              Top 5 Receivers (By Disbursed Volume KES)
            </h4>
            <div className="h-[140px]">
              {topReceiversData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-brand-text/30">
                  No successful disbursements logged yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topReceiversData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="phone" stroke="#ffffff" opacity={0.3} fontSize={9} tickLine={false} />
                    <YAxis stroke="#ffffff" opacity={0.3} fontSize={9} tickLine={false} />
                    <ChartTooltip 
                      contentStyle={{ backgroundColor: '#1A1D20', borderColor: '#343A40', borderRadius: '8px' }}
                      labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                      itemStyle={{ color: '#A3E635', fontSize: '12px' }}
                      formatter={(val) => [`KES ${Number(val).toLocaleString()}`, 'Total Paid']}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {topReceiversData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#A3E635' : '#84cc16'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-brand-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <History size={18} className="text-brand-accent" />
            Payout History Log
          </h3>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <span className="absolute left-3 top-2.5 text-brand-text/30">
                <Search size={14} />
              </span>
              <input 
                type="text" 
                placeholder="Search phone, ID, reference..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-lg pl-9 pr-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-accent transition-all text-xs font-semibold w-full sm:w-[220px]"
              />
            </div>

            {/* Status Filters */}
            <div className="flex rounded-lg border border-brand-border bg-brand-bg p-0.5">
              {['All', 'success', 'processing', 'failed', 'timeout'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all uppercase tracking-wider ${
                    filterStatus === status 
                      ? 'bg-brand-accent text-brand-bg' 
                      : 'text-brand-text/50 hover:text-brand-text hover:bg-brand-panel/50'
                  }`}
                >
                  {status === 'All' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-brand-text/40">
              <RefreshCw size={24} className="animate-spin text-brand-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider">Syncing Ledger Vault...</span>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-rose-400 text-xs font-semibold">
              Failed to load transactions: {error}
            </div>
          ) : filteredTxs.length === 0 ? (
            <div className="p-12 text-center text-brand-text/30 text-xs font-semibold">
              No transactions match your current query or filters.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50 text-[10px] font-bold text-brand-text/50 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Completed At</th>
                  <th className="py-3.5 px-5">Receiver Phone</th>
                  <th className="py-3.5 px-5">Reference</th>
                  <th className="py-3.5 px-5">Amount</th>
                  <th className="py-3.5 px-5">M-Pesa Receipt</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-xs font-medium">
                {filteredTxs.map((tx) => (
                  <tr 
                    key={tx.id} 
                    className="hover:bg-brand-bg/30 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedTx(tx);
                      setIsDrawerOpen(true);
                    }}
                  >
                    <td className="py-4 px-5 text-brand-text/60">
                      {tx.transaction_completed_at 
                        ? new Date(tx.transaction_completed_at).toLocaleString() 
                        : new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td className="py-4 px-5 font-bold text-brand-text">
                      {tx.receiver_phone}
                      {tx.receiver_party_name && (
                        <span className="block text-[10px] text-brand-text/40 font-normal mt-0.5">{tx.receiver_party_name}</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-semibold text-brand-text/80">{tx.account_reference}</span>
                      {tx.remarks && <span className="block text-[10px] text-brand-text/40 font-normal mt-0.5">{tx.remarks}</span>}
                    </td>
                    <td className="py-4 px-5 font-bold text-brand-text">
                      KES {tx.amount.toLocaleString()}
                    </td>
                    <td className="py-4 px-5 font-mono text-[11px] text-brand-text/70">
                      {tx.transaction_id || <span className="text-brand-text/30">N/A</span>}
                    </td>
                    <td className="py-4 px-5">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedTx(tx);
                          setIsDrawerOpen(true);
                        }}
                        className="p-1 bg-brand-panel hover:bg-brand-border/40 text-brand-text rounded-md transition-colors"
                        title="View Details"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-brand-panel border border-brand-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-brand-accent border-b border-brand-border pb-3">
              <ShieldCheck size={20} />
              <h3 className="font-bold text-base">Confirm Pochi Transaction</h3>
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Sender Shortcode:</span>
                <span className="font-semibold text-right">Default B2C Vault</span>
              </div>
              <div className="grid grid-cols-2 py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Receiver Phone:</span>
                <span className="font-bold text-right text-brand-text">{receiverPhone}</span>
              </div>
              <div className="grid grid-cols-2 py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Amount to Send:</span>
                <span className="font-bold text-right text-brand-accent">KES {Number(amount).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Reference:</span>
                <span className="font-semibold text-right">{accountReference}</span>
              </div>
              <div className="grid grid-cols-2 py-1.5">
                <span className="text-brand-text/50">Remarks:</span>
                <span className="text-right truncate max-w-[200px]" title={remarks}>{remarks}</span>
              </div>
            </div>

            <div className="bg-brand-bg rounded-lg p-3 border border-brand-border flex items-start gap-2.5">
              <AlertTriangle className="text-amber-400 shrink-0" size={16} />
              <p className="text-[10px] text-brand-text/70 leading-relaxed">
                Warning: Outbound B2C disbursements to mobile numbers are instantaneous and non-reversible from this screen. Double check the phone number before proceeding.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="flex-1 py-2 border border-brand-border hover:bg-brand-panel/50 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="flex-1 py-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-lg text-xs cursor-pointer"
              >
                Confirm Disburse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveSettings} className="bg-brand-panel border border-brand-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-border pb-3">
              <div className="flex items-center gap-2 text-brand-accent">
                <Lock size={18} />
                <h3 className="font-bold text-base">Pochi Safety Settings</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsSettingsOpen(false)}
                className="text-brand-text/40 hover:text-brand-text/70"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1">Max Per-Transaction Limit (KES)</label>
                <input 
                  type="number" 
                  value={limitMaxTx}
                  onChange={(e) => setLimitMaxTx(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1">Daily Cap Limit (KES)</label>
                <input 
                  type="number" 
                  value={limitDaily}
                  onChange={(e) => setLimitDaily(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1">Rate Cooldown (Seconds)</label>
                <input 
                  type="number" 
                  value={limitCooldown}
                  onChange={(e) => setLimitCooldown(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text/70 mb-1">Confirmation Password (Leave blank to disable)</label>
                <input 
                  type="password" 
                  value={limitPassword}
                  onChange={(e) => setLimitPassword(e.target.value)}
                  placeholder="Set password to guard payouts"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              {savingSettings ? <RefreshCw size={14} className="animate-spin" /> : null}
              Save Configuration
            </button>
          </form>
        </div>
      )}

      {/* Detail Drawer overlay */}
      {isDrawerOpen && selectedTx && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-brand-panel border-l border-brand-border shadow-2xl flex flex-col h-full transform transition-all duration-300">
          {/* Drawer Header */}
          <div className="p-5 border-b border-brand-border flex justify-between items-center bg-brand-bg/40">
            <div>
              <h3 className="font-bold text-sm text-brand-text">Transaction Details</h3>
              <p className="text-[10px] text-brand-text/40 font-mono mt-0.5">{selectedTx.internal_reference}</p>
            </div>
            <button 
              onClick={() => {
                setIsDrawerOpen(false);
                setSelectedTx(null);
              }}
              className="p-1.5 hover:bg-brand-border rounded-lg transition-colors text-brand-text/50 hover:text-brand-text"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Quick Status Box */}
            <div className={`p-4 rounded-xl border flex justify-between items-center ${
              selectedTx.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' :
              selectedTx.status === 'failed' ? 'bg-rose-500/5 border-rose-500/20 text-rose-400' :
              selectedTx.status === 'timeout' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
              'bg-sky-500/5 border-sky-500/20 text-sky-400'
            }`}>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Status Code: {selectedTx.result_code || 'N/A'}</span>
                <p className="text-xs font-semibold leading-relaxed">{selectedTx.result_description || 'Awaiting webhook callback result...'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">KES {selectedTx.amount.toLocaleString()}</p>
                <span className="text-[9px] opacity-60">Outbound Disbursement</span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="bg-brand-bg/30 border border-brand-border/60 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">M-Pesa Receipt ID</span>
                <span className="font-mono font-bold text-brand-text">{selectedTx.transaction_id || 'AWAITING'}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Receiver Phone</span>
                <span className="font-bold text-brand-text">{selectedTx.receiver_phone}</span>
              </div>
              {selectedTx.receiver_party_name && (
                <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                  <span className="text-brand-text/50">Registered Name</span>
                  <span className="font-semibold text-brand-text">{selectedTx.receiver_party_name}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Account Reference</span>
                <span className="font-semibold text-brand-text">{selectedTx.account_reference}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Remarks</span>
                <span className="text-brand-text">{selectedTx.remarks}</span>
              </div>
              {selectedTx.occasion && (
                <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                  <span className="text-brand-text/50">Occasion</span>
                  <span className="text-brand-text">{selectedTx.occasion}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Retry Count</span>
                <span className="font-mono text-brand-text bg-brand-panel px-1.5 py-0.5 rounded text-[10px]">{selectedTx.retry_count} retries</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                <span className="text-brand-text/50">Sender Utility Shortcode</span>
                <span className="text-brand-text font-semibold">{selectedTx.sender_shortcode}</span>
              </div>
              {selectedTx.debit_account_balance && (
                <div className="flex justify-between items-center py-1.5 border-b border-brand-border/40">
                  <span className="text-brand-text/50">Debit Account Balance</span>
                  <span className="font-mono font-bold text-brand-text">KES {Number(selectedTx.debit_account_balance).toLocaleString()}</span>
                </div>
              )}
              {selectedTx.initiator_balance && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-brand-text/50">Initiator Wallet Balance</span>
                  <span className="font-mono font-bold text-brand-text">KES {Number(selectedTx.initiator_balance).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Action buttons (Retry / Re-query) */}
            <div className="flex gap-3">
              {(selectedTx.status === 'failed' || selectedTx.status === 'timeout') && (
                <button
                  onClick={() => handleRetryTx(selectedTx)}
                  className="flex-1 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <RefreshCw size={14} />
                  Retry Disbursement
                </button>
              )}
            </div>

            {/* Real-time Audit Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-brand-text/50 uppercase tracking-wider flex items-center gap-1.5">
                <Database size={13} className="text-brand-accent" />
                Webhook Audit Trail
              </h4>
              
              {loadingAudits ? (
                <div className="p-6 text-center text-xs text-brand-text/30 animate-pulse uppercase tracking-wider font-semibold">
                  Unpacking event timeline...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-4 bg-brand-bg/20 rounded-xl text-center text-xs text-brand-text/30 border border-brand-border/40">
                  No audit events found for this payout.
                </div>
              ) : (
                <div className="relative border-l border-brand-border/80 pl-4 ml-2.5 space-y-4">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="relative text-xs">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21.5px] top-1 w-2.5 h-2.5 bg-brand-accent rounded-full ring-4 ring-brand-panel" />
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <p className="font-bold text-brand-text/80 uppercase tracking-wide text-[10px]">{log.action.replace(/_/g, ' ')}</p>
                          <span className="block text-[9px] text-brand-text/40 font-mono mt-0.5">Actor: {log.actor || 'system'}</span>
                        </div>
                        <span className="text-[10px] text-brand-text/40 font-mono shrink-0">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <pre className="mt-1.5 p-2 bg-brand-bg rounded-lg border border-brand-border/60 text-[9px] font-mono text-brand-text/70 overflow-x-auto leading-relaxed max-h-[120px]">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Raw payloads inspector */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-brand-text/50 uppercase tracking-wider flex items-center gap-1.5">
                <Database size={13} className="text-brand-accent" />
                Raw Payload Inspector
              </h4>
              <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden">
                {/* Tabs */}
                <div className="flex bg-brand-panel border-b border-brand-border text-[10px] font-bold text-brand-text/50 uppercase tracking-wider">
                  <div className="px-4 py-2 border-r border-brand-border text-brand-accent bg-brand-bg/40 font-semibold">Request</div>
                  <div className="px-4 py-2 border-r border-brand-border text-brand-accent bg-brand-bg/40 font-semibold">Response</div>
                  <div className="px-4 py-2 text-brand-accent bg-brand-bg/40 font-semibold">Callback</div>
                </div>
                <pre className="p-4 text-[9px] font-mono text-brand-text/80 leading-relaxed overflow-x-auto max-h-[220px]">
                  {JSON.stringify({
                    request: selectedTx.raw_request,
                    response: selectedTx.raw_response,
                    callback: selectedTx.raw_result
                  }, null, 2)}
                </pre>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
