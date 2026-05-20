import { useState, useEffect, useMemo } from 'react';
import { RotateCcw, Send, CheckCircle2, XCircle, Clock, Search, Filter, ArrowUpRight, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../utils/supabaseClient';

interface ReversalItem {
  id: string;
  occurred_at: string;
  reference: string | null;
  phone_number: string;
  amount: number;
  status: string;
}

export function ReversalsPage() {
  const [origTxId, setOrigTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History & Table
  const [reversals, setReversals] = useState<ReversalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReversals = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('transactions')
        .select('id, occurred_at, reference, phone_number, amount, status')
        .eq('transaction_type', 'REVERSAL')
        .order('occurred_at', { ascending: false });

      if (err) throw err;

      const mapped: ReversalItem[] = (data || []).map(tx => ({
        id: tx.id,
        occurred_at: tx.occurred_at,
        reference: tx.reference, // Stores the original transaction receipt/ID
        phone_number: tx.phone_number,
        amount: Number(tx.amount),
        status: tx.status
      }));

      setReversals(mapped);
    } catch (e: any) {
      console.error('Error fetching reversals:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReversals();

    const channel = supabase
      .channel('reversals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.REVERSAL' },
        () => {
          fetchReversals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const metrics = useMemo(() => {
    const total = reversals.length;
    const completed = reversals.filter(r => r.status === 'completed').length;
    const failed = reversals.filter(r => r.status === 'failed').length;
    const successRate = total > 0 ? ((completed / (completed + failed || 1)) * 100).toFixed(1) : '0.0';

    return {
      total,
      successRate,
      failed
    };
  }, [reversals]);

  const filteredReversals = useMemo(() => {
    return reversals.filter(r => {
      const queryLower = searchQuery.toLowerCase();
      return (
        r.phone_number.includes(searchQuery) ||
        (r.reference || '').toLowerCase().includes(queryLower) ||
        r.id.toLowerCase().includes(queryLower)
      );
    });
  }, [reversals, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origTxId.trim() || !amount.trim() || !reason.trim()) {
      alert('Please fill out all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Session expired. Please log in again.');

      // 1. Find original transaction by ID or Receipt ID
      const { data: origTx, error: findError } = await supabase
        .from('transactions')
        .select('*')
        .or(`id.eq.${origTxId},external_transaction_id.eq.${origTxId.trim().toUpperCase()}`)
        .maybeSingle();

      if (findError) throw findError;
      if (!origTx) {
        alert('Error: Original transaction not found. Please verify the ID/Receipt number.');
        setIsSubmitting(false);
        return;
      }

      // 2. Prevent duplicate reversals
      const origReceipt = origTx.external_transaction_id || origTx.id;
      const { data: existingRev, error: checkError } = await supabase
        .from('transactions')
        .select('id')
        .eq('transaction_type', 'REVERSAL')
        .eq('status', 'completed')
        .eq('reference', origReceipt)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingRev) {
        alert(`Block Action: Transaction ${origReceipt} has already been reversed. Duplicate reversals are blocked.`);
        setIsSubmitting(false);
        return;
      }

      // Check if original transaction is completed
      if (origTx.status !== 'completed') {
        alert(`Warning: Original transaction status is "${origTx.status}". You can only reverse completed settlements.`);
        setIsSubmitting(false);
        return;
      }

      // 3. Insert Reversal Transaction
      const revReceipt = `REV-${origReceipt}-${Math.floor(100 + Math.random() * 900)}`;
      const { data: revTx, error: revTxError } = await supabase
        .from('transactions')
        .insert({
          customer_id: origTx.customer_id,
          transaction_type: 'REVERSAL',
          direction: 'outgoing',
          provider: 'mpesa',
          external_transaction_id: revReceipt,
          reference: origReceipt,
          account_reference: origTx.account_reference,
          phone_number: origTx.phone_number,
          amount: Number(amount),
          commission_amount: 0,
          processing_fee: 0,
          currency: origTx.currency,
          status: 'completed',
          occurred_at: new Date().toISOString()
        })
        .select()
        .single();

      if (revTxError) throw revTxError;

      // 4. Double entry ledger adjustments
      // Load ledger entries for the original transaction
      const { data: origLedger } = await supabase
        .from('ledger_entries')
        .select('account_id, entry_type, amount')
        .eq('transaction_id', origTx.id);

      if (origLedger && origLedger.length > 0) {
        // Reverse them
        const revLedger = origLedger.map(entry => ({
          transaction_id: revTx.id,
          account_id: entry.account_id,
          entry_type: entry.entry_type === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          amount: entry.amount
        }));

        await supabase.from('ledger_entries').insert(revLedger);
      }

      // 5. Audit Logging
      await supabase.from('audit_logs').insert({
        user_id: userData.user.id,
        action: 'INITIATE_REVERSAL',
        entity_type: 'transactions',
        entity_id: revTx.id,
        old_values: { original_transaction_id: origTx.id, amount: origTx.amount },
        new_values: { reason: reason, reversal_receipt: revReceipt },
        ip_address: 'reversals_page'
      });

      alert(`Reversal completed successfully. Receipt: ${revReceipt}`);
      setOrigTxId('');
      setAmount('');
      setReason('');
      fetchReversals();
    } catch (err: any) {
      console.error(err);
      alert(`Reversal failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8 font-sans">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-warning/10 flex items-center justify-center text-status-warning">
              <RotateCcw size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Reversals</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text mt-2">{metrics.total}</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Success Rate</h3>
          </div>
          <p className="text-2xl font-bold text-status-success mt-2">{metrics.successRate}%</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <XCircle size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Failed Reversals</h3>
          </div>
          <p className="text-2xl font-bold text-status-danger mt-2">{metrics.failed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Initiate Form */}
        <div className="lg:col-span-1">
          <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-brand-border bg-brand-bg/30">
              <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <RotateCcw size={20} className="text-status-warning" />
                Initiate Reversal
              </h3>
              <p className="text-sm text-brand-text/50 mt-1">Request a reversal for an incorrect or fraudulent transaction.</p>
            </div>
            <div className="p-6 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Original Transaction Receipt or UUID</label>
                  <input
                    type="text"
                    required
                    value={origTxId}
                    onChange={(e) => setOrigTxId(e.target.value)}
                    placeholder="e.g. RG1Q2W3E4R"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Reversal Amount (KES)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Reason for Reversal</label>
                  <textarea
                    required
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide a detailed reason..."
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none text-sm"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-2.5 bg-status-warning hover:opacity-90 text-brand-panel rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-brand-panel/30 border-t-brand-panel rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={18} />
                      Submit Request
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="lg:col-span-2">
          <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm flex flex-col h-[500px]">
            <div className="p-6 border-b border-brand-border flex flex-col sm:flex-row justify-between items-start sm:items-center bg-brand-bg/30 gap-4">
              <h3 className="text-lg font-bold text-brand-text">Recent Reversals</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by receipt/phone..."
                    className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm h-[34px] transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-brand-panel z-10 shadow-[0_1px_0_var(--color-brand-border)]">
                  <tr className="text-brand-text/50">
                    <th className="pb-3 pt-4 px-6 font-medium">Time</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Original Receipt Ref</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Customer Phone</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Amount (KES)</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <RefreshCw size={24} className="text-brand-accent animate-spin" />
                          <span className="text-brand-text/60">Fetching reversals...</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-status-danger">
                        Failed to load: {error}
                      </td>
                    </tr>
                  ) : filteredReversals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-brand-text/40">
                        No reversal requests logged.
                      </td>
                    </tr>
                  ) : (
                    filteredReversals.map((req) => (
                      <tr key={req.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                        <td className="py-3 px-6 text-brand-text/70">{formatDate(req.occurred_at)}</td>
                        <td className="py-3 px-6 font-mono text-brand-text/90">{req.reference || 'N/A'}</td>
                        <td className="py-3 px-6 font-mono text-brand-text/90">{req.phone_number}</td>
                        <td className="py-3 px-6 font-medium text-brand-text">
                          KES {req.amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            req.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {req.status === 'completed' && <CheckCircle2 size={12} />}
                            {req.status === 'pending' && <Clock size={12} />}
                            {req.status === 'failed' && <XCircle size={12} />}
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
