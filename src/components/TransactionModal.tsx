import { X, CheckCircle2, XCircle, Clock, Copy, ArrowRightLeft, CreditCard, Building, RotateCcw, HelpCircle, AlertTriangle, Hourglass, ShieldAlert, BookOpen, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Transaction } from './TransactionTable';

interface TransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

const StatusIcon = ({ status, size = 16 }: { status: string, size?: number }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={size} className="text-status-success" />;
    case 'failed':
      return <XCircle size={size} className="text-status-danger" />;
    case 'pending':
      return <Clock size={size} className="text-status-warning" />;
    case 'orphaned':
      return <HelpCircle size={size} className="text-purple-400" />;
    case 'duplicate':
      return <AlertTriangle size={size} className="text-pink-400" />;
    case 'delayed':
      return <Hourglass size={size} className="text-cyan-400" />;
    default:
      return null;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'pending': return 'Pending';
    case 'orphaned': return 'Orphaned Payment';
    case 'duplicate': return 'Duplicate Callback';
    case 'delayed': return 'Delayed Callback';
    default: return status;
  }
};

const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'C2B_PAYBILL': return <ArrowRightLeft size={16} className="text-brand-accent" />;
    case 'STK_PUSH': return <CreditCard size={16} className="text-blue-400" />;
    case 'B2C': return <Building size={16} className="text-purple-400" />;
    case 'REVERSAL': return <RotateCcw size={16} className="text-orange-400" />;
    default: return <ArrowRightLeft size={16} className="text-brand-text/50" />;
  }
};

const formatType = (type: string) => {
  switch (type) {
    case 'C2B_PAYBILL': return 'C2B Paybill';
    case 'STK_PUSH': return 'STK Push';
    case 'B2C': return 'B2C Disbursement';
    case 'REVERSAL': return 'Reversal';
    default: return type;
  }
};

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });
};

export function TransactionModal({ transaction, isOpen, onClose, onUpdate }: TransactionModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'callbacks'>('overview');
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [showReversalForm, setShowReversalForm] = useState(false);

  useEffect(() => {
    if (!transaction || !isOpen) return;

    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        // Fetch ledger entries joined with accounts
        const { data: ledgerData, error: ledgerError } = await supabase
          .from('ledger_entries')
          .select(`
            id,
            entry_type,
            amount,
            created_at,
            accounts (
              account_name,
              account_type
            )
          `)
          .eq('transaction_id', transaction.id);

        if (ledgerError) throw ledgerError;
        setLedgerEntries(ledgerData || []);

        // Fetch callback payloads
        const { data: eventsData, error: eventsError } = await supabase
          .from('transaction_events')
          .select('*')
          .eq('transaction_id', transaction.id)
          .order('received_at', { ascending: true });

        if (eventsError) throw eventsError;
        setEvents(eventsData || []);
      } catch (err) {
        console.error('Failed to load transaction trace details:', err);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
    setActiveTab('overview');
    setShowReversalForm(false);
    setReversalReason('');
  }, [transaction, isOpen]);

  if (!transaction) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  };

  const handleReversal = async () => {
    if (!reversalReason.trim()) {
      alert('Please state a reason for this reversal.');
      return;
    }

    setReversing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Unauthorized');

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
          originalTransactionId: transaction.id,
          amount: Number(transaction.amount),
          remarks: reversalReason.trim(),
          userId: userData.user.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Server error occurred during reversal submission.');
      }

      alert(`Reversal query submitted. Conversation ID: ${result.conversation_id || 'Pending'}`);
      if (onUpdate) onUpdate();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Reversal failed: ${err.message}`);
    } finally {
      setReversing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-brand-bg border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] font-sans"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-brand-panel border-b border-brand-border">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-brand-bg border border-brand-border">
                  <TypeIcon type={transaction.transaction_type} />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-brand-text">
                    Audit Inspection
                  </h2>
                  <span className="text-xs text-brand-text/40 font-mono tracking-wider uppercase">
                    ID: {transaction.id}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-brand-text/50 hover:text-brand-text hover:bg-brand-border/50 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-brand-panel/30 border-b border-brand-border px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  activeTab === 'overview'
                    ? 'border-brand-accent text-brand-accent'
                    : 'border-transparent text-brand-text/50 hover:text-brand-text'
                }`}
              >
                <Building size={16} /> Overview
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  activeTab === 'ledger'
                    ? 'border-brand-accent text-brand-accent'
                    : 'border-transparent text-brand-text/50 hover:text-brand-text'
                }`}
              >
                <BookOpen size={16} /> Ledger Verification
              </button>
              <button
                onClick={() => setActiveTab('callbacks')}
                className={`py-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  activeTab === 'callbacks'
                    ? 'border-brand-accent text-brand-accent'
                    : 'border-transparent text-brand-text/50 hover:text-brand-text'
                }`}
              >
                <Terminal size={16} /> Safaricom Traces ({events.length})
              </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetails ? (
                <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={24} className="text-brand-accent animate-spin" />
                  <span className="text-sm text-brand-text/50">Fetching ledger trace...</span>
                </div>
              ) : (
                <>
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div className="space-y-6">
                      {/* Financial Sum Card */}
                      <div className="flex items-center justify-between p-5 bg-brand-panel border border-brand-border rounded-xl">
                        <div>
                          <p className="text-xs font-semibold text-brand-text/40 uppercase tracking-wide mb-1">Status</p>
                          <div className="flex items-center gap-2">
                            <StatusIcon status={transaction.status} size={18} />
                            <span className="font-bold text-brand-text text-base">
                              {getStatusText(transaction.status)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-brand-text/40 uppercase tracking-wide mb-1">Total Amount</p>
                          <span className="font-bold text-brand-text text-2xl tracking-tight">
                            {transaction.currency} {transaction.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Receipt ID</p>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-brand-text font-semibold">{transaction.external_transaction_id || 'N/A'}</span>
                            {transaction.external_transaction_id && (
                              <button 
                                onClick={() => handleCopy(transaction.external_transaction_id!)}
                                className="text-brand-text/30 hover:text-brand-accent transition-colors"
                              >
                                <Copy size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Customer Name</p>
                          <span className="text-brand-text font-semibold">{transaction.customers?.full_name || 'Unidentified Account'}</span>
                        </div>

                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Phone Number</p>
                          <span className="font-mono text-brand-text tracking-tight font-medium">{transaction.phone_number}</span>
                        </div>

                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Operation Type</p>
                          <span className="text-brand-text font-semibold">{formatType(transaction.transaction_type)}</span>
                        </div>

                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Account Reference</p>
                          <span className="font-mono text-brand-text font-medium">{transaction.account_reference || 'N/A'}</span>
                        </div>

                        <div className="p-4 bg-brand-panel/30 border border-brand-border rounded-xl">
                          <p className="text-xs text-brand-text/40 uppercase font-semibold mb-1">Occurred At</p>
                          <span className="text-brand-text font-medium">{formatDate(transaction.occurred_at)}</span>
                        </div>
                      </div>

                      {/* Fee Breakdown */}
                      <div className="p-4 bg-brand-panel/20 border border-brand-border rounded-xl space-y-2">
                        <h4 className="text-xs font-semibold text-brand-text/50 uppercase tracking-wide mb-2">Operational Fee Split</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-text/60">Gross Amount:</span>
                          <span className="text-brand-text font-medium">{transaction.currency} {transaction.amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-text/60">Commission Earned:</span>
                          <span className="text-brand-text/80">- {transaction.currency} {transaction.commission_amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-text/60">Safaricom Fees:</span>
                          <span className="text-brand-text/80">- {transaction.currency} {transaction.processing_fee.toLocaleString()}</span>
                        </div>
                        <div className="h-px bg-brand-border my-2" />
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-brand-text">Net Settlement:</span>
                          <span className="text-brand-accent">{transaction.currency} {transaction.net_amount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LEDGER VERIFICATION TAB */}
                  {activeTab === 'ledger' && (
                    <div className="space-y-4">
                      <div className="p-3 bg-brand-panel/40 border border-brand-border rounded-xl flex items-center gap-3">
                        <ShieldAlert size={20} className="text-brand-accent flex-shrink-0" />
                        <span className="text-xs text-brand-text/60">
                          Verified double-entry bookkeeping traces. Assets must equal equity plus liabilities.
                        </span>
                      </div>

                      <div className="border border-brand-border rounded-xl overflow-hidden bg-brand-panel/10">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-brand-panel text-brand-text/50 border-b border-brand-border">
                              <th className="py-2.5 px-4 font-semibold">Account</th>
                              <th className="py-2.5 px-4 font-semibold">Type</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Debit (KES)</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Credit (KES)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledgerEntries.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-brand-text/40 italic">
                                  No double-entry ledger recordings found for this transaction.
                                </td>
                              </tr>
                            ) : (
                              ledgerEntries.map((entry) => (
                                <tr key={entry.id} className="border-b border-brand-border/60 text-brand-text/80 hover:bg-brand-bg/20">
                                  <td className="py-3 px-4 font-semibold">
                                    {entry.accounts?.account_name || 'General Collections'}
                                  </td>
                                  <td className="py-3 px-4 uppercase text-xs text-brand-text/40">
                                    {entry.accounts?.account_type || 'asset'}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono text-emerald-400">
                                    {entry.entry_type === 'DEBIT' ? entry.amount.toLocaleString() : '-'}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono text-purple-400">
                                    {entry.entry_type === 'CREDIT' ? entry.amount.toLocaleString() : '-'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SAFARICOM CALLBACK TRACES TAB */}
                  {activeTab === 'callbacks' && (
                    <div className="space-y-4">
                      {events.length === 0 ? (
                        <div className="py-12 text-center border border-brand-border border-dashed rounded-xl text-brand-text/40">
                          No raw webhook callback events tracked for this identifier.
                        </div>
                      ) : (
                        events.map((evt, idx) => (
                          <div key={evt.id} className="border border-brand-border rounded-xl bg-brand-panel/30 overflow-hidden">
                            <div className="flex justify-between items-center px-4 py-2 bg-brand-panel border-b border-brand-border text-xs">
                              <span className="font-semibold text-brand-accent uppercase">{evt.event_type}</span>
                              <span className="text-brand-text/40 font-mono">Received: {formatDate(evt.received_at)}</span>
                            </div>
                            <div className="p-4">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-brand-text/50">Raw JSON Payload</span>
                                <button 
                                  onClick={() => handleCopy(JSON.stringify(evt.payload, null, 2))}
                                  className="text-xs text-brand-accent hover:opacity-80 flex items-center gap-1 font-semibold"
                                >
                                  <Copy size={12} /> Copy Payload
                                </button>
                              </div>
                              <pre className="bg-brand-bg p-3 rounded-lg overflow-x-auto text-xs font-mono border border-brand-border text-brand-text/80 max-h-48">
                                {typeof evt.payload === 'string' 
                                  ? JSON.stringify(JSON.parse(evt.payload), null, 2)
                                  : JSON.stringify(evt.payload, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Reversal Inline Form */}
            {showReversalForm && (
              <div className="px-6 py-4 bg-status-warning/10 border-t border-brand-border space-y-3">
                <div className="flex items-center gap-2 text-status-warning">
                  <ShieldAlert size={18} />
                  <h3 className="font-semibold text-sm">Initiate Ledger Reversal</h3>
                </div>
                <p className="text-xs text-brand-text/70">
                  This action will generate a new offset disbursement/reversal transaction and adjust ledger entries. Original records are never deleted.
                </p>
                <input 
                  type="text" 
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Enter reason for reversal (required)..."
                  className="w-full bg-brand-bg border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-status-warning"
                />
                <div className="flex gap-2 justify-end">
                  <button 
                    onClick={() => setShowReversalForm(false)}
                    className="px-3 py-1.5 bg-brand-panel hover:bg-brand-border/40 text-brand-text text-xs font-semibold rounded-lg border border-brand-border transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleReversal}
                    disabled={reversing}
                    className="px-3 py-1.5 bg-status-warning hover:opacity-90 text-brand-panel text-xs font-semibold rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    {reversing ? 'Reversing...' : 'Confirm Reversal'}
                  </button>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            {!showReversalForm && (
              <div className="flex gap-3 p-6 bg-brand-panel border-t border-brand-border">
                {transaction.status === 'completed' && transaction.transaction_type !== 'REVERSAL' && (
                  <button 
                    onClick={() => setShowReversalForm(true)}
                    className="flex-1 py-2.5 bg-status-warning/10 text-status-warning hover:bg-status-warning/20 border border-status-warning/20 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <ArrowRightLeft size={16} /> Initiate Reversal
                  </button>
                )}
                
                <button 
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-brand-bg text-brand-text border border-brand-border hover:bg-brand-border rounded-xl font-semibold transition-colors text-sm"
                >
                  Close Audit trace
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
import { RefreshCw } from 'lucide-react';
