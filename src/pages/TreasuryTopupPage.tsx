import React, { useState, useEffect, useMemo } from 'react';
import { 
  Coins, Send, CheckCircle2, XCircle, Clock, Search, RefreshCw, 
  Eye, EyeOff, AlertTriangle, ArrowRight, ShieldCheck, HelpCircle, 
  Lock, Calendar, Database, History, User, CreditCard, ChevronRight, X,
  Activity, ArrowUpRight, ShieldAlert, Check, AlertCircle
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

interface B2CTopupTransaction {
  id: string;
  internal_reference: string;
  parent_transaction_id: string | null;
  originator_conversation_id: string | null;
  conversation_id: string | null;
  transaction_id: string | null;
  initiator_name: string | null;
  source_shortcode: string;
  destination_shortcode: string;
  requester_phone: string | null;
  account_reference: string | null;
  remarks: string | null;
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

interface TreasuryAuditLog {
  id: string;
  topup_id: string;
  action: string;
  metadata: any;
  created_at: string;
}

interface AccountInfo {
  id: string;
  account_name: string;
  account_type: string;
  current_balance: number;
  available_balance: number;
}

export function TreasuryTopupPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Balances
  const [paybillAccount, setPaybillAccount] = useState<AccountInfo | null>(null);
  const [b2cAccount, setB2CAccount] = useState<AccountInfo | null>(null);
  
  // Form Fields
  const [destinationShortcode, setDestinationShortcode] = useState('');
  const [amount, setAmount] = useState('');
  const [accountReference, setAccountReference] = useState('B2C_FLOAT_LOAD');
  const [remarks, setRemarks] = useState('');
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
    maxTxLimit: 100000,
    dailyLimit: 500000,
    cooldownSeconds: 60,
    isPasswordRequired: false
  });

  // Table & Real-time State
  const [transactions, setTransactions] = useState<B2CTopupTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer / Selection State
  const [selectedTx, setSelectedTx] = useState<B2CTopupTransaction | null>(null);
  const [auditLogs, setAuditLogs] = useState<TreasuryAuditLog[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Administrative Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [limitMaxTx, setLimitMaxTx] = useState('100000');
  const [limitDaily, setLimitDaily] = useState('500000');
  const [limitCooldown, setLimitCooldown] = useState('60');
  const [limitPassword, setLimitPassword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Manual Reconcile options
  const [reconcileAction, setReconcileAction] = useState<'query' | 'force'>('query');
  const [manualReceiptId, setManualReceiptId] = useState('');
  const [reconciliationMessage, setReconciliationMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [processingReconciliation, setProcessingReconciliation] = useState(false);

  // Connection diagnostics
  const [connectionCheck, setConnectionCheck] = useState<{ status: 'idle' | 'checking' | 'connected' | 'error', message?: string }>({ status: 'idle' });

  // Account Balance Query State
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'balanceSync'>('history');
  const [balanceQueries, setBalanceQueries] = useState<any[]>([]);
  const [balanceQueryRemarks, setBalanceQueryRemarks] = useState('');
  const [balanceQuerySubmitting, setBalanceQuerySubmitting] = useState(false);
  const [selectedBalanceQuery, setSelectedBalanceQuery] = useState<any>(null);
  const [isBalanceQueryModalOpen, setIsBalanceQueryModalOpen] = useState(false);

  // Load user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);

  // Fetch balances from database ledger accounts
  const fetchBalances = async () => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .in('id', ['a1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333']);

      if (error) throw error;
      if (data) {
        const paybill = data.find(a => a.id === 'a1111111-1111-1111-1111-111111111111');
        const b2c = data.find(a => a.id === 'a3333333-3333-3333-3333-333333333333');
        if (paybill) setPaybillAccount({ ...paybill, current_balance: Number(paybill.current_balance), available_balance: Number(paybill.available_balance) });
        if (b2c) setB2CAccount({ ...b2c, current_balance: Number(b2c.current_balance), available_balance: Number(b2c.available_balance) });
      }
    } catch (err) {
      console.error('Failed to fetch ledger balances:', err);
    }
  };

  // Fetch configs and transactions
  const fetchSafetyConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('mpesa_credentials')
        .select('treasury_max_transaction_limit, treasury_daily_limit, treasury_cooldown_seconds, treasury_confirmation_password')
        .eq('id', 'c1111111-1111-1111-1111-111111111111')
        .maybeSingle();

      if (data) {
        setSafetyConfig({
          maxTxLimit: Number(data.treasury_max_transaction_limit) || 100000,
          dailyLimit: Number(data.treasury_daily_limit) || 500000,
          cooldownSeconds: Number(data.treasury_cooldown_seconds) || 60,
          isPasswordRequired: !!data.treasury_confirmation_password
        });
        setLimitMaxTx(data.treasury_max_transaction_limit?.toString() || '100000');
        setLimitDaily(data.treasury_daily_limit?.toString() || '500000');
        setLimitCooldown(data.treasury_cooldown_seconds?.toString() || '60');
        setLimitPassword(data.treasury_confirmation_password || '');
      }
    } catch (err) {
      console.error('Failed to load safety configurations:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('b2c_account_topups')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      
      const mapped: B2CTopupTransaction[] = (data || []).map(tx => ({
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

  const fetchBalanceQueries = async () => {
    try {
      const { data, error } = await supabase
        .from('account_balance_queries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setBalanceQueries(data || []);
    } catch (err) {
      console.error('Failed to fetch balance queries:', err);
    }
  };

  const handleTriggerBalanceQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBalanceQuerySubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const response = await fetch('/api/mpesa/account/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userData?.user?.id,
          remarks: balanceQueryRemarks || undefined
        })
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to sync balance.');
      }

      alert(`Balance sync query dispatched! Conversation ID: ${responseData.ConversationID || 'Generated'}`);
      setBalanceQueryRemarks('');
      fetchBalanceQueries();
    } catch (err: any) {
      console.error(err);
      alert(`Error syncing balance: ${err.message}`);
    } finally {
      setBalanceQuerySubmitting(false);
    }
  };

  // Setup realtime listener
  useEffect(() => {
    fetchBalances();
    fetchSafetyConfig();
    fetchTransactions();
    fetchBalanceQueries();

    const channel = supabase
      .channel('b2c-topups-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'b2c_account_topups' },
        () => {
          fetchBalances();
          fetchTransactions();
          if (selectedTx) {
            supabase
              .from('b2c_account_topups')
              .select('*')
              .eq('id', selectedTx.id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setSelectedTx({ ...data, amount: Number(data.amount) });
              });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'account_balance_queries' },
        () => {
          fetchBalances();
          fetchBalanceQueries();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts' },
        () => {
          fetchBalances();
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
          .from('treasury_audit_logs')
          .select('*')
          .eq('topup_id', selectedTx.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setAuditLogs(data || []);
      } catch (err: any) {
        console.error('Failed to fetch audit logs:', err);
      } finally {
        setLoadingAudits(false);
      }
    };

    fetchAudits();
  }, [selectedTx]);

  // Handle Form Submission - Open confirmation modal
  const handleInitiateClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationShortcode || !amount || !accountReference || !remarks) {
      alert('Please fill in all required parameters.');
      return;
    }
    if (Number(amount) <= 0) {
      alert('Amount must be a positive number.');
      return;
    }
    setIsConfirmOpen(true);
  };

  // Dispatch B2C Topup to Express Backend
  const handleConfirmSubmit = async () => {
    setIsConfirmOpen(false);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/treasury/b2c-topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationShortcode,
          amount: Number(amount),
          accountReference,
          remarks,
          requesterPhone,
          confirmationPassword,
          userId: currentUser?.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to dispatch top-up request');
      }

      // Reset form on success
      setAmount('');
      setRemarks('');
      setConfirmationPassword('');
      alert('Float Top Up request successfully dispatched to Safaricom Daraja. Transaction state is now queued/submitted.');
      fetchTransactions();
    } catch (err: any) {
      console.error('Submission error:', err);
      alert(`Float Top Up Dispatched Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry failed/timeout transaction
  const handleRetryTransaction = async (tx: B2CTopupTransaction) => {
    if (!window.confirm(`Are you sure you want to retry this KES ${tx.amount.toLocaleString()} top-up request to shortcode ${tx.destination_shortcode}?`)) {
      return;
    }

    const pin = safetyConfig.isPasswordRequired 
      ? window.prompt('Please enter the administrator confirmation password:') 
      : '';

    if (safetyConfig.isPasswordRequired && !pin) {
      alert('Administrator confirmation password is required to retry.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/treasury/b2c-topup/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: tx.id,
          confirmationPassword: pin,
          userId: currentUser?.id
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retry transaction');

      alert('Linked retry transaction successfully spawned!');
      setIsDrawerOpen(false);
      fetchTransactions();
    } catch (err: any) {
      alert(`Retry Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reconcile transaction (Force resolve or Query Daraja status)
  const handleReconciliation = async () => {
    if (!selectedTx) return;
    if (reconcileAction === 'force' && !manualReceiptId) {
      alert('External Receipt ID (M-Pesa Transaction ID) is required for force reconciliation.');
      return;
    }

    setProcessingReconciliation(true);
    setReconciliationMessage(null);

    try {
      const res = await fetch('/api/treasury/b2c-topup/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topupId: selectedTx.id,
          action: reconcileAction,
          externalTransactionId: reconcileAction === 'force' ? manualReceiptId : undefined,
          actor: currentUser?.email || 'admin'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reconciliation request failed');

      setReconciliationMessage({
        type: 'success',
        text: data.message || 'Action executed successfully.'
      });

      if (reconcileAction === 'force') {
        setManualReceiptId('');
        // Reload details
        const { data: refreshed } = await supabase
          .from('b2c_account_topups')
          .select('*')
          .eq('id', selectedTx.id)
          .maybeSingle();
        if (refreshed) setSelectedTx({ ...refreshed, amount: Number(refreshed.amount) });
      }
    } catch (err: any) {
      setReconciliationMessage({
        type: 'error',
        text: err.message || 'An error occurred during reconciliation.'
      });
    } finally {
      setProcessingReconciliation(false);
    }
  };

  // Run Connection Diagnostic
  const handleConnectionDiagnostic = async () => {
    setConnectionCheck({ status: 'checking' });
    try {
      const res = await fetch('/api/mpesa/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'oauth' })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setConnectionCheck({ status: 'connected', message: 'Safaricom Daraja API Connection Verified! Access token retrieved successfully.' });
      } else {
        throw new Error(data.error || 'Connection rejected by Daraja API.');
      }
    } catch (err: any) {
      setConnectionCheck({ status: 'error', message: err.message || 'Failed to authenticate with Daraja.' });
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('mpesa_credentials')
        .update({
          treasury_max_transaction_limit: Number(limitMaxTx),
          treasury_daily_limit: Number(limitDaily),
          treasury_cooldown_seconds: Number(limitCooldown),
          treasury_confirmation_password: limitPassword || null
        })
        .eq('id', 'c1111111-1111-1111-1111-111111111111');

      if (error) throw error;
      alert('Safety safeguards updated successfully.');
      setIsSettingsOpen(false);
      fetchSafetyConfig();
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Statistics Computations
  const stats = useMemo(() => {
    const successTxs = transactions.filter(t => t.status === 'success');
    const totalVolume = successTxs.reduce((sum, t) => sum + t.amount, 0);
    const pendingCount = transactions.filter(t => t.status === 'queued' || t.status === 'submitted' || t.status === 'processing').length;
    const timeoutCount = transactions.filter(t => t.status === 'timeout').length;
    const failedCount = transactions.filter(t => t.status === 'failed').length;

    return {
      totalVolume,
      count: successTxs.length,
      pendingCount,
      timeoutCount,
      failedCount
    };
  }, [transactions]);

  // Chart data computations: Last 7 days top-up volume
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return {
        dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isoDate: d.toISOString().split('T')[0],
        amount: 0
      };
    }).reverse();

    transactions.forEach(t => {
      if (t.status === 'success') {
        const tDate = t.created_at.split('T')[0];
        const match = last7Days.find(day => day.isoDate === tDate);
        if (match) {
          match.amount += t.amount;
        }
      }
    });

    return last7Days;
  }, [transactions]);

  // Bar chart data: Top-ups by shortcode
  const barChartData = useMemo(() => {
    const shortcodeMap: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.status === 'success') {
        shortcodeMap[t.destination_shortcode] = (shortcodeMap[t.destination_shortcode] || 0) + t.amount;
      }
    });
    return Object.keys(shortcodeMap).map(key => ({
      shortcode: key,
      volume: shortcodeMap[key]
    })).sort((a, b) => b.volume - a.volume).slice(0, 5);
  }, [transactions]);

  // Search and Filter Transactions
  const filteredTxs = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = 
        t.internal_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.transaction_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.destination_shortcode.includes(searchQuery) ||
        (t.remarks || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.account_reference || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'All' || t.status === filterStatus.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [transactions, searchQuery, filterStatus]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-status-success/10 text-status-success border-status-success/30';
      case 'failed':
        return 'bg-status-danger/10 text-status-danger border-status-danger/30';
      case 'timeout':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'processing':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30 animate-pulse';
      case 'submitted':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      default:
        return 'bg-brand-panel text-brand-text/60 border-brand-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-brand-border/50 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text flex items-center gap-3">
            <Coins className="text-brand-accent w-8 h-8" />
            B2C Account Float Top Up
          </h1>
          <p className="text-brand-text/60 mt-1">
            Maintain utility payout balances and monitor liquidity across accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleConnectionDiagnostic} 
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-panel hover:bg-brand-panel/80 text-brand-text text-sm font-medium border border-brand-border transition duration-200 cursor-pointer"
          >
            <Activity size={16} className={connectionCheck.status === 'checking' ? 'animate-spin' : ''} />
            Diagnostic Check
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-panel hover:bg-brand-panel/80 text-brand-text text-sm font-medium border border-brand-border transition duration-200 cursor-pointer"
          >
            <Lock size={16} />
            Safety Controls
          </button>
          <button 
            onClick={fetchTransactions} 
            className="p-2 rounded-xl bg-brand-panel hover:bg-brand-panel/80 text-brand-text border border-brand-border transition duration-200 cursor-pointer"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* DIAGNOSTIC ERROR / ALERT PANEL */}
      {connectionCheck.status !== 'idle' && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 relative transition-all duration-300 ${
          connectionCheck.status === 'connected' 
            ? 'bg-status-success/10 border-status-success/30 text-status-success' 
            : connectionCheck.status === 'checking'
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            : 'bg-status-danger/10 border-status-danger/30 text-status-danger'
        }`}>
          {connectionCheck.status === 'connected' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
          {connectionCheck.status === 'checking' && <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />}
          {connectionCheck.status === 'error' && <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <h5 className="font-semibold text-sm">
              {connectionCheck.status === 'checking' ? 'Querying Safaricom Gateway...' : connectionCheck.status === 'connected' ? 'Diagnostic Success' : 'Diagnostic Error'}
            </h5>
            <p className="text-xs opacity-90 mt-1">{connectionCheck.message || 'Checking OAuth credentials authentication pipeline...'}</p>
          </div>
          <button onClick={() => setConnectionCheck({ status: 'idle' })} className="absolute top-3 right-3 opacity-60 hover:opacity-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* LEDGER & LIQUIDITY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Working Bank account ledger value */}
        <div className="bg-brand-panel border border-brand-border/60 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-accent/5 rounded-full blur-xl pointer-events-none group-hover:bg-brand-accent/10 transition duration-300"></div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-text/50">Primary Working Account</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-2xl font-bold text-brand-text">
              {paybillAccount ? `KES ${paybillAccount.available_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'KES 0.00'}
            </span>
          </div>
          <p className="text-xs text-brand-text/40 mt-1">Source ledger code: Collection Main</p>
        </div>

        {/* Disbursements Utility vault ledger value */}
        <div className="bg-brand-panel border border-brand-border/60 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-accent/5 rounded-full blur-xl pointer-events-none group-hover:bg-brand-accent/10 transition duration-300"></div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-text/50">B2C Disbursements Vault</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-2xl font-bold text-brand-text">
              {b2cAccount ? `KES ${b2cAccount.available_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'KES 0.00'}
            </span>
          </div>
          {b2cAccount && b2cAccount.available_balance < 25000 && (
            <div className="flex items-center gap-1.5 text-status-danger text-xs font-medium mt-1">
              <ShieldAlert size={14} />
              Balance critically low! Payouts may stall.
            </div>
          )}
          {(!b2cAccount || b2cAccount.available_balance >= 25000) && (
            <p className="text-xs text-brand-text/40 mt-1">Destination ledger code: Utility Payout</p>
          )}
        </div>

        {/* Successful Topups stats */}
        <div className="bg-brand-panel border border-brand-border/60 rounded-2xl p-5 relative overflow-hidden group">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-text/50">Cumulative Load Volume</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-2xl font-bold text-brand-text">KES {stats.totalVolume.toLocaleString()}</span>
          </div>
          <p className="text-xs text-brand-text/40 mt-1">Through {stats.count} completed top ups</p>
        </div>

        {/* Operational statuses */}
        <div className="bg-brand-panel border border-brand-border/60 rounded-2xl p-5 relative overflow-hidden group">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-text/50">Active Operations</p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-brand-bg/50 rounded-lg p-2 border border-brand-border/30">
              <p className="text-lg font-bold text-blue-400">{stats.pendingCount}</p>
              <p className="text-[10px] text-brand-text/50 uppercase">Active</p>
            </div>
            <div className="bg-brand-bg/50 rounded-lg p-2 border border-brand-border/30">
              <p className="text-lg font-bold text-amber-500">{stats.timeoutCount}</p>
              <p className="text-[10px] text-brand-text/50 uppercase">Timeout</p>
            </div>
            <div className="bg-brand-bg/50 rounded-lg p-2 border border-brand-border/30">
              <p className="text-lg font-bold text-status-danger">{stats.failedCount}</p>
              <p className="text-[10px] text-brand-text/50 uppercase">Failed</p>
            </div>
          </div>
        </div>
      </div>

      {/* CORE WORKFLOW AREA (FORM & TRENDS CHART) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TOP UP DISPATCHER FORM */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-6 relative overflow-hidden lg:col-span-1">
          <h3 className="text-lg font-semibold text-brand-text flex items-center gap-2 mb-4">
            <Send className="text-brand-accent w-5 h-5" />
            Load Float Form
          </h3>

          <form onSubmit={handleInitiateClick} className="space-y-4">
            {/* Source Display */}
            <div>
              <label className="block text-xs font-medium text-brand-text/60 uppercase">Source Channel</label>
              <div className="mt-1.5 flex items-center justify-between p-3 bg-brand-bg/70 border border-brand-border/50 rounded-xl text-sm font-medium text-brand-text">
                <span>Paybill Main (174379)</span>
                <span className="text-xs px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 rounded-md text-brand-accent">MMF/Working</span>
              </div>
            </div>

            {/* Destination input */}
            <div>
              <label htmlFor="destinationShortcode" className="block text-xs font-medium text-brand-text/60 uppercase">
                Destination B2C Shortcode <span className="text-status-danger">*</span>
              </label>
              <input
                id="destinationShortcode"
                type="text"
                required
                placeholder="e.g. 543210"
                value={destinationShortcode}
                onChange={(e) => setDestinationShortcode(e.target.value.replace(/\D/g, ''))}
                className="mt-1.5 block w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition"
              />
            </div>

            {/* Amount input */}
            <div>
              <label htmlFor="amount" className="block text-xs font-medium text-brand-text/60 uppercase">
                Load Amount (KES) <span className="text-status-danger">*</span>
              </label>
              <div className="relative mt-1.5 rounded-xl">
                <input
                  id="amount"
                  type="number"
                  required
                  placeholder="e.g. 25000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="block w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition"
                />
              </div>
              <p className="text-[10px] text-brand-text/40 mt-1">
                Max transaction limit: KES {safetyConfig.maxTxLimit.toLocaleString()}
              </p>
            </div>

            {/* Account Reference */}
            <div>
              <label htmlFor="accountReference" className="block text-xs font-medium text-brand-text/60 uppercase">
                Account Reference <span className="text-status-danger">*</span>
              </label>
              <input
                id="accountReference"
                type="text"
                required
                placeholder="e.g. B2C_FLOAT_LOAD"
                value={accountReference}
                onChange={(e) => setAccountReference(e.target.value)}
                className="mt-1.5 block w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition"
              />
            </div>

            {/* Remarks */}
            <div>
              <label htmlFor="remarks" className="block text-xs font-medium text-brand-text/60 uppercase">
                Remarks <span className="text-status-danger">*</span>
              </label>
              <textarea
                id="remarks"
                required
                rows={2}
                placeholder="Disbursement float replenishment"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1.5 block w-full px-4 py-2.5 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition resize-none"
              />
            </div>

            {/* Requester Phone */}
            <div>
              <label htmlFor="requesterPhone" className="block text-xs font-medium text-brand-text/60 uppercase">
                Notification Phone (Optional)
              </label>
              <input
                id="requesterPhone"
                type="text"
                placeholder="e.g. 254708374149"
                value={requesterPhone}
                onChange={(e) => setRequesterPhone(e.target.value)}
                className="mt-1.5 block w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition"
              />
            </div>

            {/* Admin password verification if required */}
            {safetyConfig.isPasswordRequired && (
              <div>
                <label htmlFor="confirmationPassword" className="block text-xs font-medium text-brand-text/60 uppercase flex items-center gap-1.5">
                  <Lock size={12} className="text-brand-accent" />
                  Confirmation Password <span className="text-status-danger">*</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="confirmationPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter security password"
                    value={confirmationPassword}
                    onChange={(e) => setConfirmationPassword(e.target.value)}
                    className="block w-full px-4 py-3 pr-10 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-brand-text text-sm outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-brand-text/40 hover:text-brand-text cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-accent hover:bg-brand-accent/90 disabled:bg-brand-accent/50 text-brand-bg font-semibold rounded-xl transition duration-200 cursor-pointer shadow-md"
            >
              {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Coins size={18} />}
              Initiate Float Top Up
            </button>
          </form>
        </div>

        {/* TREASURY ANALYTICS / VISUALS */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trend Area Chart */}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-brand-text mb-4 flex items-center gap-2">
              <Activity size={18} className="text-brand-accent" />
              7-Day Top-Up Volume Trends
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dateStr" stroke="rgba(255, 255, 255, 0.4)" fontSize={11} tickLine={false} />
                  <YAxis stroke="rgba(255, 255, 255, 0.4)" fontSize={11} tickLine={false} />
                  <ChartTooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    labelStyle={{ color: '#94A3B8', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Volume distribution */}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-brand-text mb-4">
              Top Load Recipients (By Shortcode)
            </h3>
            {barChartData.length === 0 ? (
              <div className="h-28 flex items-center justify-center border border-dashed border-brand-border/40 rounded-xl text-xs text-brand-text/40">
                No load recipient data available.
              </div>
            ) : (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="shortcode" stroke="rgba(255, 255, 255, 0.4)" fontSize={10} tickLine={false} />
                    <YAxis stroke="rgba(255, 255, 255, 0.4)" fontSize={10} tickLine={false} />
                    <ChartTooltip 
                      contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    />
                    <Bar dataKey="volume" fill="#8B5CF6" radius={[4, 4, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : '#6366F1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TRANSACTION REGISTRY CONTAINER */}
      <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden">
        {/* Table controls */}
        <div className="p-6 border-b border-brand-border/50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveSubTab('history')}
              className={`text-lg font-semibold transition cursor-pointer pb-1 border-b-2 ${
                activeSubTab === 'history'
                  ? 'text-brand-text border-brand-accent'
                  : 'text-brand-text/50 border-transparent hover:text-brand-text'
              }`}
            >
              Top Up History
            </button>
            <button
              onClick={() => setActiveSubTab('balanceSync')}
              className={`text-lg font-semibold transition cursor-pointer pb-1 border-b-2 ${
                activeSubTab === 'balanceSync'
                  ? 'text-brand-text border-brand-accent'
                  : 'text-brand-text/50 border-transparent hover:text-brand-text'
              }`}
            >
              Safaricom Balance Sync
            </button>
          </div>

          {activeSubTab === 'history' ? (
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-brand-text/45 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-64 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent text-brand-text text-sm outline-none transition"
                />
              </div>
              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-brand-text text-sm outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Queued">Queued</option>
                <option value="Submitted">Submitted</option>
                <option value="Processing">Processing</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
                <option value="Timeout">Timeout</option>
              </select>
            </div>
          ) : (
            <form onSubmit={handleTriggerBalanceQuery} className="flex items-center gap-3 w-full md:w-auto">
              <input
                type="text"
                placeholder="Optional remarks (e.g. Weekly Audit)..."
                value={balanceQueryRemarks}
                onChange={(e) => setBalanceQueryRemarks(e.target.value)}
                className="px-4 py-2 rounded-xl bg-brand-bg border border-brand-border focus:border-brand-accent text-brand-text text-sm outline-none transition w-full md:w-64"
              />
              <button
                type="submit"
                disabled={balanceQuerySubmitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent/90 disabled:bg-brand-accent/50 text-brand-bg text-sm font-semibold transition shrink-0 cursor-pointer"
              >
                <RefreshCw size={16} className={balanceQuerySubmitting ? 'animate-spin' : ''} />
                {balanceQuerySubmitting ? 'Querying...' : 'Sync Balance'}
              </button>
            </form>
          )}
        </div>

        {activeSubTab === 'history' ? (
          /* TRANSACTION REGISTRY TABLE */
          loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="animate-spin text-brand-accent" size={32} />
              <p className="text-sm text-brand-text/60">Loading transaction registry...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-status-danger">
              <p className="font-semibold text-sm">Error Loading Registry</p>
              <p className="text-xs opacity-80 mt-1">{error}</p>
            </div>
          ) : filteredTxs.length === 0 ? (
            <div className="p-12 text-center text-brand-text/40">
              <p className="text-sm">No transaction records found matching filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-bg/40 text-[11px] font-semibold uppercase tracking-wider text-brand-text/45 border-b border-brand-border/40">
                    <th className="px-6 py-4">Internal Reference</th>
                    <th className="px-6 py-4">Destination</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Initiated</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/30">
                  {filteredTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-brand-bg/20 transition duration-150">
                      <td className="px-6 py-4">
                        <div className="font-medium text-brand-text text-sm truncate max-w-[180px]">
                          {tx.internal_reference}
                        </div>
                        {tx.transaction_id && (
                          <div className="text-[10px] text-brand-text/40 mt-0.5">M-Pesa ID: {tx.transaction_id}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-brand-text">{tx.destination_shortcode}</div>
                        <div className="text-[10px] text-brand-text/40 mt-0.5">B2C Utility Channel</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-brand-text">KES {tx.amount.toLocaleString()}</div>
                        <div className="text-[10px] text-brand-text/40 mt-0.5">{tx.currency}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusBadgeClass(tx.status)}`}>
                          {tx.status === 'success' && <CheckCircle2 size={12} />}
                          {tx.status === 'failed' && <XCircle size={12} />}
                          {tx.status === 'timeout' && <Clock size={12} />}
                          {tx.status === 'processing' && <RefreshCw size={12} className="animate-spin" />}
                          {tx.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-brand-text/60">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedTx(tx);
                            setIsDrawerOpen(true);
                            setReconciliationMessage(null);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text hover:text-brand-accent text-xs font-semibold transition cursor-pointer"
                        >
                          Inspect
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* STATEFUL BALANCE QUERIES TABLE */
          balanceQueries.length === 0 ? (
            <div className="p-12 text-center text-brand-text/40">
              <p className="text-sm">No account balance query sync logs found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-bg/40 text-[11px] font-semibold uppercase tracking-wider text-brand-text/45 border-b border-brand-border/40">
                    <th className="px-6 py-4">Triggered At</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Conversation ID</th>
                    <th className="px-6 py-4">Originator Conversation ID</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/30">
                  {balanceQueries.map((q) => (
                    <tr key={q.id} className="hover:bg-brand-bg/20 transition duration-150">
                      <td className="px-6 py-4 text-sm text-brand-text/80">
                        {new Date(q.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                          q.status === 'completed'
                            ? 'bg-status-success/15 text-status-success'
                            : q.status === 'failed'
                            ? 'bg-status-danger/15 text-status-danger'
                            : q.status === 'timeout'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {q.status === 'completed' && <CheckCircle2 size={12} />}
                          {q.status === 'failed' && <XCircle size={12} />}
                          {q.status === 'timeout' && <Clock size={12} />}
                          {(q.status === 'pending' || q.status === 'processing') && (
                            <RefreshCw size={12} className="animate-spin" />
                          )}
                          {q.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-brand-text/60 max-w-[150px] truncate">
                        {q.conversation_id || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-brand-text/60 max-w-[150px] truncate">
                        {q.originator_conversation_id || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedBalanceQuery(q);
                            setIsBalanceQueryModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text hover:text-brand-accent text-xs font-medium transition cursor-pointer"
                        >
                          Inspect Payloads
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* CONFIRMATION DRAWER/TIMELINE SLIDE-OVER */}
      {isDrawerOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-brand-bg/60 backdrop-blur-sm transition-opacity duration-300">
          {/* Backdrop closer */}
          <div className="flex-1" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="w-full max-w-xl h-full bg-brand-panel border-l border-brand-border shadow-2xl flex flex-col p-6 overflow-y-auto relative animate-slide-in">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-4 mb-6">
              <div>
                <h4 className="font-bold text-lg text-brand-text">Load Details</h4>
                <p className="text-xs text-brand-text/40 mt-1">Ref: {selectedTx.internal_reference}</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)} 
                className="p-1.5 rounded-xl hover:bg-brand-bg text-brand-text/60 hover:text-brand-text transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Visual Progress Timeline */}
            <div className="mb-6 p-4 bg-brand-bg/50 rounded-xl border border-brand-border/40">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-text/50 mb-3">Transaction Progress</h5>
              <div className="flex items-center justify-between relative px-2">
                {/* Horizontal progress bar */}
                <div className="absolute top-4 left-1/12 right-1/12 h-0.5 bg-brand-border/60 z-0"></div>
                <div className={`absolute top-4 left-1/12 h-0.5 bg-brand-accent z-0 transition-all duration-500`} style={{
                  width: selectedTx.status === 'success' ? '88%' : selectedTx.status === 'timeout' ? '50%' : selectedTx.status === 'failed' ? '88%' : '44%'
                }}></div>

                {/* Node 1: Created */}
                <div className="flex flex-col items-center z-10">
                  <div className="w-8 h-8 rounded-full bg-brand-accent text-brand-bg flex items-center justify-center border-4 border-brand-panel text-xs font-bold shadow-sm">1</div>
                  <span className="text-[10px] font-semibold text-brand-accent mt-1">Queued</span>
                </div>

                {/* Node 2: Sent to Safaricom */}
                <div className="flex flex-col items-center z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-brand-panel text-xs font-bold shadow-sm ${
                    ['submitted', 'processing', 'success', 'failed', 'timeout'].includes(selectedTx.status) ? 'bg-brand-accent text-brand-bg' : 'bg-brand-border text-brand-text/40'
                  }`}>2</div>
                  <span className={`text-[10px] font-semibold mt-1 ${
                    ['submitted', 'processing', 'success', 'failed', 'timeout'].includes(selectedTx.status) ? 'text-brand-accent' : 'text-brand-text/40'
                  }`}>Dispatched</span>
                </div>

                {/* Node 3: Result received */}
                <div className="flex flex-col items-center z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-brand-panel text-xs font-bold shadow-sm ${
                    selectedTx.status === 'success' ? 'bg-status-success text-brand-bg' : selectedTx.status === 'failed' ? 'bg-status-danger text-brand-bg' : selectedTx.status === 'timeout' ? 'bg-amber-500 text-brand-bg' : 'bg-brand-border text-brand-text/40'
                  }`}>3</div>
                  <span className={`text-[10px] font-semibold mt-1 ${
                    selectedTx.status === 'success' ? 'text-status-success' : selectedTx.status === 'failed' ? 'text-status-danger' : selectedTx.status === 'timeout' ? 'text-amber-500' : 'text-brand-text/40'
                  }`}>
                    {selectedTx.status === 'success' ? 'SUCCESS' : selectedTx.status === 'failed' ? 'FAILED' : selectedTx.status === 'timeout' ? 'TIMEOUT' : 'PROCESSING'}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Summary */}
            <div className="space-y-4">
              {/* Fields */}
              <div className="grid grid-cols-2 gap-4 text-sm border-b border-brand-border/40 pb-4">
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Sender Shortcode</p>
                  <p className="font-semibold text-brand-text mt-0.5">{selectedTx.source_shortcode}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Recipient Utility</p>
                  <p className="font-semibold text-brand-text mt-0.5">{selectedTx.destination_shortcode}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Load Amount</p>
                  <p className="font-bold text-brand-text mt-0.5">KES {selectedTx.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Account Reference</p>
                  <p className="font-semibold text-brand-text mt-0.5">{selectedTx.account_reference || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Remarks</p>
                  <p className="font-semibold text-brand-text mt-0.5">{selectedTx.remarks || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">M-Pesa Receipt ID</p>
                  <p className="font-semibold text-brand-text mt-0.5 text-brand-accent">{selectedTx.transaction_id || 'Pending callback'}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">M-Pesa Response Description</p>
                  <p className="font-semibold text-brand-text mt-0.5">{selectedTx.result_description || 'No result details available'}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-text/50 uppercase">Date Logged</p>
                  <p className="font-semibold text-brand-text mt-0.5">{new Date(selectedTx.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Administrative Balances */}
              {(selectedTx.debit_account_balance || selectedTx.debit_party_balance || selectedTx.initiator_balance) && (
                <div className="bg-brand-bg/40 p-4 border border-brand-border/40 rounded-xl space-y-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-text/50 mb-1 flex items-center gap-1.5">
                    <Database size={12} className="text-brand-accent" />
                    Safaricom Query Balances
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selectedTx.debit_account_balance && (
                      <div>
                        <p className="text-brand-text/50">Debit Account Balance:</p>
                        <p className="font-bold text-brand-text">{selectedTx.debit_account_balance}</p>
                      </div>
                    )}
                    {selectedTx.debit_party_balance && (
                      <div>
                        <p className="text-brand-text/50">Debit Party Balance:</p>
                        <p className="font-bold text-brand-text">{selectedTx.debit_party_balance}</p>
                      </div>
                    )}
                    {selectedTx.initiator_balance && (
                      <div>
                        <p className="text-brand-text/50">Initiator Balance:</p>
                        <p className="font-bold text-brand-text">{selectedTx.initiator_balance}</p>
                      </div>
                    )}
                    {selectedTx.receiver_party_name && (
                      <div>
                        <p className="text-brand-text/50">Receiver Public Name:</p>
                        <p className="font-bold text-brand-text">{selectedTx.receiver_party_name}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Administrative Audit Logs inside drawer */}
              <div className="mt-6 border-t border-brand-border/40 pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-text/50 mb-3 flex items-center gap-1.5">
                  <History size={14} className="text-brand-accent" />
                  Operational Audit Trail
                </h5>

                {loadingAudits ? (
                  <div className="py-4 flex justify-center">
                    <RefreshCw className="animate-spin text-brand-accent" size={18} />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <p className="text-xs text-brand-text/40">No audit logs recorded for this transaction.</p>
                ) : (
                  <div className="relative pl-4 border-l border-brand-border/60 space-y-4">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-accent border-2 border-brand-panel"></div>
                        <div className="text-xs font-semibold text-brand-text flex items-center justify-between">
                          <span>{log.action.replace(/_/g, ' ').toUpperCase()}</span>
                          <span className="text-[10px] text-brand-text/40">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        {log.metadata && (
                          <div className="bg-brand-bg/40 p-2 rounded-lg text-[10px] text-brand-text/60 mt-1 overflow-x-auto max-h-24">
                            <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MANUAL RECONCILIATION FOR ADMINISTRATIVE OVERRIDES */}
              {selectedTx.status !== 'success' && (
                <div className="mt-6 border-t border-brand-border/40 pt-4 p-4 bg-brand-bg/50 border border-brand-border/30 rounded-xl">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-text/50 mb-3 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-brand-accent" />
                    Treasury Reconciliation Overrides
                  </h5>

                  <div className="space-y-4 text-xs">
                    {/* Select override action */}
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="reconcileAction"
                          checked={reconcileAction === 'query'}
                          onChange={() => setReconcileAction('query')}
                        />
                        Query Safaricom Gateway
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="reconcileAction"
                          checked={reconcileAction === 'force'}
                          onChange={() => setReconcileAction('force')}
                        />
                        Force Manual Success (Override)
                      </label>
                    </div>

                    {reconcileAction === 'force' && (
                      <div>
                        <label className="block text-brand-text/60 mb-1">M-PESA TRANSACTION RECEIPT ID</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. OHT1234567"
                          value={manualReceiptId}
                          onChange={(e) => setManualReceiptId(e.target.value.toUpperCase())}
                          className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-lg outline-none text-brand-text focus:border-brand-accent"
                        />
                      </div>
                    )}

                    {reconciliationMessage && (
                      <div className={`p-2.5 rounded-lg border text-xs flex items-start gap-1.5 ${
                        reconciliationMessage.type === 'success' ? 'bg-status-success/15 border-status-success/30 text-status-success' : 'bg-status-danger/15 border-status-danger/30 text-status-danger'
                      }`}>
                        {reconciliationMessage.type === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                        <span>{reconciliationMessage.text}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleReconciliation}
                        disabled={processingReconciliation}
                        className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/90 disabled:bg-brand-accent/50 text-brand-bg font-bold rounded-lg transition cursor-pointer"
                      >
                        {processingReconciliation ? 'Executing...' : 'Dispatch Reconciliation'}
                      </button>
                      
                      {(selectedTx.status === 'failed' || selectedTx.status === 'timeout') && (
                        <button
                          onClick={() => handleRetryTransaction(selectedTx)}
                          className="px-4 py-2 bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text font-bold rounded-lg transition cursor-pointer"
                        >
                          Spawn Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* RAW RESPONSE JSON INSPECT */}
              <div className="mt-6 border-t border-brand-border/40 pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-text/50 mb-2">Raw Gateway Logs</h5>
                <details className="text-xs border border-brand-border/40 rounded-xl bg-brand-bg/40 overflow-hidden cursor-pointer">
                  <summary className="px-4 py-2.5 hover:bg-brand-bg/85 font-semibold text-brand-text/60 select-none">
                    View JSON Payload logs
                  </summary>
                  <div className="p-4 border-t border-brand-border/40 text-[10px] text-brand-text/80 font-mono overflow-auto max-h-56">
                    <p className="font-semibold text-brand-accent">RESPONSE ACKNOWLEDGMENT:</p>
                    <pre className="mb-2">{JSON.stringify(selectedTx.raw_response, null, 2)}</pre>
                    <p className="font-semibold text-brand-accent mt-2">CALLBACK RESULT:</p>
                    <pre>{JSON.stringify(selectedTx.raw_result, null, 2)}</pre>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION SUBMIT DIALOG MODAL */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl p-6 shadow-2xl relative animate-scale-up">
            <h4 className="font-bold text-lg text-brand-text flex items-center gap-2">
              <ShieldAlert className="text-amber-500 w-6 h-6" />
              Confirm Treasury Operation
            </h4>
            <p className="text-sm text-brand-text/75 mt-2">
              Are you sure you want to replenishment B2C float using the following parameters? This is treasury movement.
            </p>

            <div className="my-4 bg-brand-bg p-4 border border-brand-border/50 rounded-xl text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-brand-text/50">Load Amount:</span>
                <span className="font-bold text-brand-text text-sm">KES {Number(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/50">Destination Shortcode:</span>
                <span className="font-semibold text-brand-text">{destinationShortcode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/50">Account Reference:</span>
                <span className="font-semibold text-brand-text">{accountReference}</span>
              </div>
              <div className="flex justify-between flex-wrap gap-1">
                <span className="text-brand-text/50">Remarks:</span>
                <span className="font-semibold text-brand-text text-right block max-w-xs">{remarks}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setIsConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text text-sm font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmSubmit}
                className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent/90 text-brand-bg text-sm font-semibold transition cursor-pointer"
              >
                Yes, Execute Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMINISTRATIVE SAFETY CONFIG SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl p-6 shadow-2xl relative animate-scale-up">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-3 mb-4">
              <h4 className="font-bold text-lg text-brand-text flex items-center gap-2">
                <Lock className="text-brand-accent w-5 h-5" />
                Treasury Safety Controls
              </h4>
              <button onClick={() => setIsSettingsOpen(false)} className="opacity-60 hover:opacity-100 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Max Transaction Limit */}
              <div>
                <label className="block text-xs font-semibold text-brand-text/60 uppercase">Max Transaction Limit (KES)</label>
                <input
                  type="number"
                  value={limitMaxTx}
                  onChange={(e) => setLimitMaxTx(e.target.value)}
                  className="mt-1.5 block w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-brand-text focus:border-brand-accent outline-none text-sm"
                />
              </div>

              {/* Daily Payout Limit */}
              <div>
                <label className="block text-xs font-semibold text-brand-text/60 uppercase">Daily Cumulative Limit (KES)</label>
                <input
                  type="number"
                  value={limitDaily}
                  onChange={(e) => setLimitDaily(e.target.value)}
                  className="mt-1.5 block w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-brand-text focus:border-brand-accent outline-none text-sm"
                />
              </div>

              {/* Cooldown Seconds */}
              <div>
                <label className="block text-xs font-semibold text-brand-text/60 uppercase">Duplicate Cooldown (Seconds)</label>
                <input
                  type="number"
                  value={limitCooldown}
                  onChange={(e) => setLimitCooldown(e.target.value)}
                  className="mt-1.5 block w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-brand-text focus:border-brand-accent outline-none text-sm"
                />
              </div>

              {/* Confirmation Password */}
              <div>
                <label className="block text-xs font-semibold text-brand-text/60 uppercase">Confirmation PIN / Password</label>
                <input
                  type="password"
                  placeholder="Set blank to disable password check"
                  value={limitPassword}
                  onChange={(e) => setLimitPassword(e.target.value)}
                  className="mt-1.5 block w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-brand-text focus:border-brand-accent outline-none text-sm"
                />
                <p className="text-[10px] text-brand-text/40 mt-1">
                  Enforces password verification on the float loader dispatcher.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 border-t border-brand-border/60 pt-4">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-xl bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text text-sm font-semibold transition cursor-pointer"
              >
                Close
              </button>
              <button 
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent/90 disabled:bg-brand-accent/50 text-brand-bg text-sm font-semibold transition cursor-pointer"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ACCOUNT BALANCE PAYLOADS INSPECTION MODAL */}
      {isBalanceQueryModalOpen && selectedBalanceQuery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-brand-panel border border-brand-border rounded-2xl p-6 shadow-2xl relative animate-scale-up max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-3 mb-4 shrink-0">
              <h4 className="font-bold text-lg text-brand-text flex items-center gap-2">
                <Database className="text-brand-accent w-5 h-5" />
                Balance Query Payload Inspector
              </h4>
              <button 
                onClick={() => {
                  setIsBalanceQueryModalOpen(false);
                  setSelectedBalanceQuery(null);
                }} 
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto pr-2 text-sm flex-1">
              {/* Parse and show balances if completed */}
              {selectedBalanceQuery.status === 'completed' && (
                <div className="p-4 bg-brand-bg/40 border border-brand-border/40 rounded-xl space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text/50 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-status-success" />
                    Synchronized Balances (Parsed)
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-brand-panel/60 p-3 rounded-lg border border-brand-border/30">
                      <p className="text-brand-text/45 font-semibold">WORKING ACCOUNT (COLLECTIONS)</p>
                      <p className="text-lg font-bold text-brand-text mt-1">
                        KES {selectedBalanceQuery.raw_result?.Result?.ResultParameters?.ResultParameter
                          ?.find((p: any) => p.Name === 'AccountBalance' || p.Key === 'AccountBalance')
                          ?.Value?.split('&')
                          ?.find((a: string) => a.toLowerCase().includes('working'))
                          ?.split('|')[3] || '0.00'}
                      </p>
                      <p className="text-[10px] text-brand-text/30 mt-0.5">Mapped to Paybill Collection Main</p>
                    </div>

                    <div className="bg-brand-panel/60 p-3 rounded-lg border border-brand-border/30">
                      <p className="text-brand-text/45 font-semibold">UTILITY ACCOUNT (DISBURSEMENTS)</p>
                      <p className="text-lg font-bold text-brand-text mt-1">
                        KES {selectedBalanceQuery.raw_result?.Result?.ResultParameters?.ResultParameter
                          ?.find((p: any) => p.Name === 'AccountBalance' || p.Key === 'AccountBalance')
                          ?.Value?.split('&')
                          ?.find((a: string) => a.toLowerCase().includes('utility'))
                          ?.split('|')[3] || '0.00'}
                      </p>
                      <p className="text-[10px] text-brand-text/30 mt-0.5">Mapped to Disbursements Vault</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Request Payload */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text/50 mb-2">1. Request Payload (Initiated)</h5>
                <pre className="p-4 bg-brand-bg rounded-xl text-[11px] font-mono text-brand-text/85 overflow-x-auto border border-brand-border/30">
                  {JSON.stringify(selectedBalanceQuery.raw_request, null, 2)}
                </pre>
              </div>

              {/* Response Payload */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text/50 mb-2">2. Response Acknowledgment (Daraja Gateway)</h5>
                <pre className="p-4 bg-brand-bg rounded-xl text-[11px] font-mono text-brand-text/85 overflow-x-auto border border-brand-border/30">
                  {JSON.stringify(selectedBalanceQuery.raw_response, null, 2)}
                </pre>
              </div>

              {/* Callback Result Payload */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text/50 mb-2">3. Webhook Callback Result (Asynchronous Result)</h5>
                <pre className="p-4 bg-brand-bg rounded-xl text-[11px] font-mono text-brand-text/85 overflow-x-auto border border-brand-border/30">
                  {JSON.stringify(selectedBalanceQuery.raw_result, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-brand-border/60 shrink-0">
              <button 
                onClick={() => {
                  setIsBalanceQueryModalOpen(false);
                  setSelectedBalanceQuery(null);
                }}
                className="px-4 py-2 rounded-xl bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text text-sm font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
