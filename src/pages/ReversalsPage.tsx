import React, { useState, useEffect, useMemo } from 'react';
import { RotateCcw, Send, CheckCircle2, XCircle, Clock, Search, ArrowUpRight, RefreshCw, Eye, X, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../utils/supabaseClient';

interface ReversalQueryItem {
  id: string;
  created_at: string;
  original_receipt: string;
  phone_number: string;
  amount: number;
  status: string;
  reason: string | null;
  raw_request: any;
  raw_response: any;
  raw_result: any;
}

export function ReversalsPage() {
  const [origTxId, setOrigTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History & Table
  const [reversals, setReversals] = useState<ReversalQueryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Payload Inspector Modal state
  const [selectedItem, setSelectedItem] = useState<ReversalQueryItem | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const fetchReversals = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('reversal_queries')
        .select(`
          id,
          created_at,
          original_receipt,
          amount,
          status,
          reason,
          raw_request,
          raw_response,
          raw_result,
          original_transaction:original_transaction_id (
            phone_number
          )
        `)
        .order('created_at', { ascending: false });

      if (err) throw err;

      const mapped: ReversalQueryItem[] = (data || []).map(q => {
        const txObj = q.original_transaction as any;
        return {
          id: q.id,
          created_at: q.created_at,
          original_receipt: q.original_receipt,
          phone_number: txObj?.phone_number || 'N/A',
          amount: Number(q.amount),
          status: q.status,
          reason: q.reason,
          raw_request: q.raw_request,
          raw_response: q.raw_response,
          raw_result: q.raw_result
        };
      });

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
        { event: '*', schema: 'public', table: 'reversal_queries' },
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
        r.original_receipt.toLowerCase().includes(queryLower) ||
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

      // Submit through Express API
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const response = await fetch('/api/mpesa/reversal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          originalTransactionId: origTxId.trim(),
          amount: Number(amount),
          remarks: reason.trim(),
          userId: userData.user.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Server error occurred during reversal submission.');
      }

      alert(`Reversal query submitted. Conversation ID: ${result.conversation_id || 'Pending'}`);
      setOrigTxId('');
      setAmount('');
      setReason('');
      fetchReversals();
    } catch (err: any) {
      console.error(err);
      alert(`Reversal initiation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
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
              <p className="text-sm text-brand-text/50 mt-1">Submit an asynchronous Daraja reversal query request.</p>
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
              <h3 className="text-lg font-bold text-brand-text">Reversal Request Registry</h3>
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
                    <th className="pb-3 pt-4 px-6 font-medium">Initiated</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Original Receipt</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Customer Phone</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Amount (KES)</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Status</th>
                    <th className="pb-3 pt-4 px-6 font-medium text-center">Payloads</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <RefreshCw size={24} className="text-brand-accent animate-spin" />
                          <span className="text-brand-text/60">Fetching query log...</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-status-danger">
                        Failed to load: {error}
                      </td>
                    </tr>
                  ) : filteredReversals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-brand-text/40">
                        No reversal requests logged.
                      </td>
                    </tr>
                  ) : (
                    filteredReversals.map((req) => (
                      <tr key={req.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                        <td className="py-3 px-6 text-brand-text/70">{formatDate(req.created_at)}</td>
                        <td className="py-3 px-6 font-mono text-brand-text/90">{req.original_receipt}</td>
                        <td className="py-3 px-6 font-mono text-brand-text/90">{req.phone_number}</td>
                        <td className="py-3 px-6 font-medium text-brand-text">
                          KES {req.amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            req.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            req.status === 'processing' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            req.status === 'timeout' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {req.status === 'completed' && <CheckCircle2 size={12} />}
                            {(req.status === 'pending' || req.status === 'processing') && <Clock size={12} className="animate-pulse" />}
                            {req.status === 'timeout' && <Clock size={12} />}
                            {req.status === 'failed' && <XCircle size={12} />}
                            {req.status}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <button
                            onClick={() => setSelectedItem(req)}
                            className="p-1 hover:bg-brand-border rounded text-brand-accent transition-colors inline-flex items-center justify-center"
                            title="Inspect Payloads"
                          >
                            <Eye size={16} />
                          </button>
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

      {/* Payload Inspector Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 bg-brand-bg/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-panel border border-brand-border w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/30">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Payload Inspector</h3>
                  <p className="text-xs text-brand-text/50 font-mono mt-0.5">Query ID: {selectedItem.id}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 hover:bg-brand-border rounded-lg text-brand-text/60 hover:text-brand-text transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
                <div className="grid grid-cols-2 gap-4 bg-brand-bg/40 p-4 border border-brand-border rounded-lg">
                  <div>
                    <span className="text-brand-text/50 block text-xs uppercase font-semibold">Original Receipt</span>
                    <span className="text-brand-text font-mono font-medium">{selectedItem.original_receipt}</span>
                  </div>
                  <div>
                    <span className="text-brand-text/50 block text-xs uppercase font-semibold">Reversal Amount</span>
                    <span className="text-brand-text font-medium">KES {selectedItem.amount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-brand-text/50 block text-xs uppercase font-semibold">Reason</span>
                    <span className="text-brand-text">{selectedItem.reason || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-brand-text/50 block text-xs uppercase font-semibold">Current State</span>
                    <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      selectedItem.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                      selectedItem.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                      selectedItem.status === 'processing' ? 'bg-indigo-500/10 text-indigo-400' :
                      'bg-rose-500/10 text-rose-400'
                    }`}>
                      {selectedItem.status}
                    </span>
                  </div>
                </div>

                {/* Tab Containers for JSON blobs */}
                <div className="space-y-4">
                  {/* Tab 1: Outgoing API Request */}
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <div className="bg-brand-bg/40 px-4 py-2 border-b border-brand-border flex justify-between items-center">
                      <span className="font-semibold text-brand-text/80 text-xs font-mono">1. OUTGOING DARAJA REQUEST</span>
                      <button
                        onClick={() => handleCopy(JSON.stringify(selectedItem.raw_request, null, 2), 'request')}
                        className="text-xs text-brand-accent flex items-center gap-1 hover:underline"
                      >
                        <Copy size={12} />
                        {copiedSection === 'request' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-brand-bg text-brand-text/90 font-mono text-xs overflow-x-auto max-h-[160px]">
                      {selectedItem.raw_request ? JSON.stringify(selectedItem.raw_request, null, 2) : '// No request logged'}
                    </pre>
                  </div>

                  {/* Tab 2: Immediate response */}
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <div className="bg-brand-bg/40 px-4 py-2 border-b border-brand-border flex justify-between items-center">
                      <span className="font-semibold text-brand-text/80 text-xs font-mono">2. DARAJA IMMEDIATE RESPONSE (ACK)</span>
                      <button
                        onClick={() => handleCopy(JSON.stringify(selectedItem.raw_response, null, 2), 'response')}
                        className="text-xs text-brand-accent flex items-center gap-1 hover:underline"
                      >
                        <Copy size={12} />
                        {copiedSection === 'response' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-brand-bg text-brand-text/90 font-mono text-xs overflow-x-auto max-h-[160px]">
                      {selectedItem.raw_response ? JSON.stringify(selectedItem.raw_response, null, 2) : '// No response logged'}
                    </pre>
                  </div>

                  {/* Tab 3: Callback payload */}
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <div className="bg-brand-bg/40 px-4 py-2 border-b border-brand-border flex justify-between items-center">
                      <span className="font-semibold text-brand-text/80 text-xs font-mono">3. ASYNCHRONOUS WEBHOOK CALLBACK RESULT</span>
                      <button
                        onClick={() => handleCopy(JSON.stringify(selectedItem.raw_result, null, 2), 'result')}
                        className="text-xs text-brand-accent flex items-center gap-1 hover:underline"
                      >
                        <Copy size={12} />
                        {copiedSection === 'result' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-brand-bg text-brand-text/90 font-mono text-xs overflow-x-auto max-h-[180px]">
                      {selectedItem.raw_result ? JSON.stringify(selectedItem.raw_result, null, 2) : '// Awaiting callback result from Safaricom...'}
                    </pre>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
