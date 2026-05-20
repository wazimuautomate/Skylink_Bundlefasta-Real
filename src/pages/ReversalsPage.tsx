import { useState } from 'react';
import { RotateCcw, Send, CheckCircle2, XCircle, Clock, Search, Filter, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const RECENT_REVERSALS = [
  { id: 'rev_1', date: '25 Jul 15:30', origTx: 'RG1Q2W3E4R', phone: '254711223344', amount: 500, status: 'Completed' },
  { id: 'rev_2', date: '25 Jul 14:15', origTx: 'RG2A3S4D5F', phone: '254722334455', amount: 1500, status: 'Pending' },
  { id: 'rev_3', date: '25 Jul 11:45', origTx: 'RG3Z4X5C6V', phone: '254733445566', amount: 250, status: 'Failed' },
  { id: 'rev_4', date: '24 Jul 09:10', origTx: 'RG4Q5W6E7R', phone: '254744556677', amount: 3000, status: 'Completed' },
  { id: 'rev_5', date: '23 Jul 16:20', origTx: 'RG5A6S7D8F', phone: '254755667788', amount: 120, status: 'Completed' },
];

export function ReversalsPage() {
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setTransactionId('');
      setAmount('');
      setReason('');
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-warning/10 flex items-center justify-center text-status-warning">
              <RotateCcw size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Reversals</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">145</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Success Rate</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">92.1%</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <XCircle size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Failed Reversals</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">11</p>
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
              <p className="text-sm text-brand-text/60 mt-1">Request a reversal for an incorrect or fraudulent transaction.</p>
            </div>
            <div className="p-6 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Original Transaction ID</label>
                  <input
                    type="text"
                    required
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g. RG1Q2W3E4R"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Reversal Amount (KES)</label>
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
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Reason for Reversal</label>
                  <textarea
                    required
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide a detailed reason..."
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-2.5 bg-status-warning hover:opacity-90 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                <button className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors h-[34px] w-[34px] flex items-center justify-center shrink-0">
                  <Filter size={16} />
                </button>
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                  <input
                    type="text"
                    placeholder="Search by ID or phone..."
                    className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all h-[34px]"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-brand-panel z-10 shadow-[0_1px_0_var(--color-brand-border)]">
                  <tr className="text-brand-text/50">
                    <th className="pb-3 pt-4 px-6 font-medium">Time</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Original Tx</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Phone</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Amount</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_REVERSALS.map((req) => (
                    <tr key={req.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                      <td className="py-3 px-6 text-brand-text/70">{req.date}</td>
                      <td className="py-3 px-6 font-mono text-brand-text/90">{req.origTx}</td>
                      <td className="py-3 px-6 font-mono text-brand-text/90">{req.phone}</td>
                      <td className="py-3 px-6 font-medium text-brand-text">
                        KES {req.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                          req.status === 'Completed' ? 'bg-status-success/10 text-status-success' :
                          req.status === 'Pending' ? 'bg-status-warning/10 text-status-warning' :
                          'bg-status-error/10 text-status-error'
                        }`}>
                          {req.status === 'Completed' && <CheckCircle2 size={12} />}
                          {req.status === 'Pending' && <Clock size={12} />}
                          {req.status === 'Failed' && <XCircle size={12} />}
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-brand-border text-center bg-brand-bg/10 shrink-0">
              <button className="text-sm font-medium text-brand-accent hover:text-brand-accent/80 transition-colors flex items-center justify-center gap-1 w-full">
                View All Reversals <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
