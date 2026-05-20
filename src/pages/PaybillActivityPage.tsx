import { useState } from 'react';
import { Activity, ArrowUpRight, Search, Filter, Download, ArrowDownRight, Eye, Calendar, X, CheckSquare, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const PAYBILL_LOGS = [
  { id: 'LOG-001', date: '25 Jul 2026, 14:32', type: 'C2B Payment', phone: '254711223344', amount: 500, ref: 'INV-001', status: 'Completed', mpesaRef: 'RG1Q2W3E4R', balance: 145000 },
  { id: 'LOG-002', date: '25 Jul 2026, 14:15', type: 'B2C Disbursement', phone: '254722334455', amount: -1500, ref: 'SALARY', status: 'Completed', mpesaRef: 'RG2A3S4D5F', balance: 144500 },
  { id: 'LOG-003', date: '25 Jul 2026, 13:45', type: 'C2B Payment', phone: '254733445566', amount: 250, ref: 'INV-003', status: 'Completed', mpesaRef: 'RG3Z4X5C6V', balance: 146000 },
  { id: 'LOG-004', date: '25 Jul 2026, 13:10', type: 'Reversal', phone: '254744556677', amount: -3000, ref: 'REV-004', status: 'Completed', mpesaRef: 'RG4Q5W6E7R', balance: 145750 },
  { id: 'LOG-005', date: '25 Jul 2026, 11:20', type: 'C2B Payment', phone: '254755667788', amount: 120, ref: 'INV-005', status: 'Completed', mpesaRef: 'RG5A6S7D8F', balance: 148750 },
];

export function PaybillActivityPage() {
  const [selectedLog, setSelectedLog] = useState<typeof PAYBILL_LOGS[0] | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <Activity size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Current Balance</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES 145,000</p>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-status-success flex items-center gap-1">
              <ArrowUpRight size={14} /> +2.4%
            </span>
            <span className="text-brand-text/50 ml-2">from yesterday</span>
          </div>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <ArrowUpRight size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Inflows (Today)</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES 32,450</p>
          <div className="mt-4 text-sm text-brand-text/50">
            Across 142 transactions
          </div>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <ArrowDownRight size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Outflows (Today)</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES 4,500</p>
          <div className="mt-4 text-sm text-brand-text/50">
            Across 8 transactions
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm flex flex-col min-h-[500px]">
        <div className="p-6 border-b border-brand-border flex flex-col sm:flex-row justify-between items-start sm:items-center bg-brand-bg/30 gap-4">
          <div>
            <h3 className="text-lg font-bold text-brand-text">Paybill Activity Log</h3>
            <p className="text-sm text-brand-text/50">Detailed history of all movements in and out of the paybill.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {selectedIds.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsBulkMenuOpen(!isBulkMenuOpen)}
                  className="px-3 py-1.5 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 h-[34px]"
                >
                  <CheckSquare size={16} />
                  Bulk Actions ({selectedIds.length})
                </button>
                <AnimatePresence>
                  {isBulkMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsBulkMenuOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute right-0 top-full mt-2 w-48 bg-brand-panel border border-brand-border shadow-xl rounded-xl z-50 overflow-hidden py-1 text-left"
                      >
                        <button className="w-full px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors">
                          <Download size={14} /> Export Selected
                        </button>
                        <div className="h-px bg-brand-border my-1" />
                        <button className="w-full px-3 py-2 text-sm text-status-error hover:bg-status-error/10 flex items-center gap-2 transition-colors">
                          <Trash2 size={14} /> Delete Selected
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
            
            <button className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors h-[34px] w-[34px] flex items-center justify-center shrink-0">
              <Filter size={16} />
            </button>
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
              <input
                type="text"
                placeholder="Search logs..."
                className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all h-[34px]"
              />
            </div>
            <button className="px-3 py-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center gap-2 h-[34px]">
              <Download size={16} />
              <span className="text-sm font-medium hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-brand-panel z-10 shadow-[0_1px_0_var(--color-brand-border)]">
              <tr className="text-brand-text/50">
                <th className="pb-3 pt-4 px-6 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={PAYBILL_LOGS.length > 0 && selectedIds.length === PAYBILL_LOGS.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(PAYBILL_LOGS.map(l => l.id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                  />
                </th>
                <th className="pb-3 pt-4 px-6 font-medium">Date & Time</th>
                <th className="pb-3 pt-4 px-6 font-medium">Type</th>
                <th className="pb-3 pt-4 px-6 font-medium">Amount</th>
                <th className="pb-3 pt-4 px-6 font-medium">Party / Phone</th>
                <th className="pb-3 pt-4 px-6 font-medium">M-Pesa Ref</th>
                <th className="pb-3 pt-4 px-6 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {PAYBILL_LOGS.map((log) => (
                <tr key={log.id} className={`border-b border-brand-border/50 hover:bg-brand-bg transition-colors ${selectedIds.includes(log.id) ? 'bg-brand-accent/5' : ''}`}>
                  <td className="py-3 px-6">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(log.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds([...selectedIds, log.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== log.id));
                      }}
                      className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-6 text-brand-text/80">{log.date}</td>
                  <td className="py-3 px-6">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-brand-accent/10 border border-brand-accent/20 ${log.amount > 0 ? 'text-status-success' : 'text-status-error'}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="py-3 px-6 font-medium text-brand-text text-right flex items-center gap-1">
                    {log.amount > 0 ? (
                      <span className="text-status-success flex items-center gap-1"><ArrowUpRight size={14} /> KES {log.amount.toLocaleString()}</span>
                    ) : (
                      <span className="text-status-error flex items-center gap-1"><ArrowDownRight size={14} /> KES {Math.abs(log.amount).toLocaleString()}</span>
                    )}
                  </td>
                  <td className="py-3 px-6 font-mono text-brand-text/90">{log.phone}</td>
                  <td className="py-3 px-6 font-mono text-brand-text/80">{log.mpesaRef}</td>
                  <td className="py-3 px-6 text-right">
                    <button 
                      onClick={() => setSelectedLog(log)}
                      className="p-1.5 text-brand-text/50 hover:text-brand-accent hover:bg-brand-accent/10 rounded transition-colors inline-block"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details Modal */}
      <AnimatePresence>
        {selectedLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedLog(null)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-brand-panel border border-brand-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden pointer-events-auto">
                <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-brand-text">Activity Details</h3>
                  <button 
                    onClick={() => setSelectedLog(null)}
                    className="p-1.5 text-brand-text/50 hover:text-brand-text hover:bg-brand-bg rounded-md transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${selectedLog.amount > 0 ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'}`}>
                      {selectedLog.amount > 0 ? <ArrowUpRight size={32} /> : <ArrowDownRight size={32} />}
                    </div>
                    <h4 className="text-3xl font-bold text-brand-text">
                       {selectedLog.amount > 0 ? '+' : '-'}KES {Math.abs(selectedLog.amount).toLocaleString()}
                    </h4>
                    <p className="text-brand-text/60 mt-1">{selectedLog.type}</p>
                    <span className="mt-3 inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-status-success/10 text-status-success">
                      {selectedLog.status}
                    </span>
                  </div>

                  <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden">
                    <div className="divide-y divide-brand-border/50">
                      <div className="p-4 flex justify-between items-center">
                        <span className="text-sm text-brand-text/50">Date & Time</span>
                        <span className="text-sm font-medium text-brand-text flex items-center gap-2">
                          <Calendar size={14} className="text-brand-text/40"/> {selectedLog.date}
                        </span>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <span className="text-sm text-brand-text/50">M-Pesa Reference</span>
                        <span className="text-sm font-mono font-medium text-brand-text">{selectedLog.mpesaRef}</span>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <span className="text-sm text-brand-text/50">Internal Reference</span>
                        <span className="text-sm font-mono font-medium text-brand-text">{selectedLog.ref}</span>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <span className="text-sm text-brand-text/50">Party / Phone</span>
                        <span className="text-sm font-mono font-medium text-brand-text">{selectedLog.phone}</span>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <span className="text-sm text-brand-text/50">Resulting Balance</span>
                        <span className="text-sm font-medium text-brand-text">KES {selectedLog.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-brand-border bg-brand-bg/30">
                  <button 
                    onClick={() => setSelectedLog(null)}
                    className="w-full py-2.5 bg-brand-panel hover:bg-brand-border border border-brand-border rounded-lg text-brand-text font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
