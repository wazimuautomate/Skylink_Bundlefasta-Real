import { useState } from 'react';
import { ShieldCheck, Upload, RefreshCcw, CheckCircle2, AlertCircle, FileText, Search, Filter, Download } from 'lucide-react';
import { ReconciliationWidget } from '../components/ReconciliationWidget';

const DISCREPANCIES = [
  { id: 'RC-001', date: '25 Jul 2026', mpesaRef: 'RG1Q2W3E4R', internalRef: 'SYS-8921', mpesaAmt: 5000, internalAmt: 4500, status: 'Amount Mismatch' },
  { id: 'RC-002', date: '25 Jul 2026', mpesaRef: 'RG2A3S4D5F', internalRef: '-', mpesaAmt: 1200, internalAmt: null, status: 'Missing in Internal' },
  { id: 'RC-003', date: '24 Jul 2026', mpesaRef: '-', internalRef: 'SYS-8890', mpesaAmt: null, internalAmt: 3500, status: 'Missing in M-Pesa' },
];

export function ReconciliationPage() {
  const [isReconciling, setIsReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState<'discrepancies' | 'history'>('discrepancies');

  const handleRunReconciliation = () => {
    setIsReconciling(true);
    setTimeout(() => {
      setIsReconciling(false);
    }, 2500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Header specific to Reconciliation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <ShieldCheck className="text-status-success" size={24} />
            Reconciliation Center
          </h2>
          <p className="text-sm text-brand-text/60 mt-1">Match M-Pesa statements against your internal system records.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none px-4 py-2 border border-brand-border text-brand-text/80 hover:text-brand-text hover:bg-brand-bg rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Upload size={16} /> Upload System Export
          </button>
          <button 
            onClick={handleRunReconciliation}
            disabled={isReconciling}
            className="flex-1 sm:flex-none px-4 py-2 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isReconciling ? (
              <RefreshCcw size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            Run Auto-Match
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <ReconciliationWidget />
        </div>
        <div className="md:col-span-2 flex gap-6">
          <div className="flex-1 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
                <CheckCircle2 size={20} />
              </div>
              <h3 className="font-medium text-brand-text/70">Perfect Matches</h3>
            </div>
            <p className="text-3xl font-bold text-brand-text">14,289</p>
            <p className="text-sm text-status-success mt-2 flex items-center gap-1">
              <span>98.2% match rate today</span>
            </p>
          </div>
          <div className="flex-1 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
                <AlertCircle size={20} />
              </div>
              <h3 className="font-medium text-brand-text/70">Discrepancies</h3>
            </div>
            <p className="text-3xl font-bold text-brand-text">12</p>
            <p className="text-sm text-status-error mt-2 flex items-center gap-1">
              <span>Requires manual review</span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm flex flex-col">
        <div className="border-b border-brand-border px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-bg/30">
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('discrepancies')}
              className={`text-sm font-medium flex items-center gap-2 pb-4 -mb-4 border-b-2 transition-colors ${
                activeTab === 'discrepancies' 
                  ? 'border-brand-accent text-brand-text' 
                  : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
              }`}
            >
              <AlertCircle size={16} className={activeTab === 'discrepancies' ? 'text-status-error' : ''} />
              Active Discrepancies (12)
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`text-sm font-medium flex items-center gap-2 pb-4 -mb-4 border-b-2 transition-colors ${
                activeTab === 'history' 
                  ? 'border-brand-accent text-brand-text' 
                  : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
              }`}
            >
              <FileText size={16} />
              Reconciliation History
            </button>
          </div>
          
          {activeTab === 'discrepancies' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                <input
                  type="text"
                  placeholder="Search refs..."
                  className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1.5 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all h-[34px]"
                />
              </div>
              <button className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors h-[34px] flex items-center justify-center shrink-0 px-3 gap-2">
                <Download size={16} />
                <span className="text-sm hidden sm:inline">Export</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="p-0 overflow-auto min-h-[300px]">
          {activeTab === 'discrepancies' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-brand-bg/50 border-b border-brand-border">
                <tr className="text-brand-text/50">
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-6 font-medium">M-Pesa Ref</th>
                  <th className="py-3 px-6 font-medium">Internal Ref</th>
                  <th className="py-3 px-6 font-medium text-right">M-Pesa Amount</th>
                  <th className="py-3 px-6 font-medium text-right">Internal Amount</th>
                  <th className="py-3 px-6 font-medium">Issue Type</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {DISCREPANCIES.map((item) => (
                  <tr key={item.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                    <td className="py-4 px-6 text-brand-text/70">{item.date}</td>
                    <td className="py-4 px-6 font-mono text-brand-text/90">{item.mpesaRef}</td>
                    <td className="py-4 px-6 font-mono text-brand-text/90">{item.internalRef}</td>
                    <td className="py-4 px-6 font-medium text-brand-text text-right">
                      {item.mpesaAmt ? `KES ${item.mpesaAmt.toLocaleString()}` : <span className="text-brand-text/30">-</span>}
                    </td>
                    <td className="py-4 px-6 font-medium text-brand-text text-right">
                      {item.internalAmt ? `KES ${item.internalAmt.toLocaleString()}` : <span className="text-brand-text/30">-</span>}
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-status-error/10 text-status-error border border-status-error/20">
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className="px-3 py-1.5 bg-brand-panel hover:bg-brand-border border border-brand-border rounded text-brand-text text-xs font-medium transition-colors">
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-brand-text/50">
              <FileText size={48} className="mb-4 opacity-50" />
              <p>Reconciliation history records will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
