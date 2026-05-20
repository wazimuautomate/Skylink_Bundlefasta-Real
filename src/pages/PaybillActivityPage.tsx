import { useState, useMemo, useEffect } from 'react';
import { Activity, ArrowUpRight, Search, Filter, Download, ArrowDownRight, Eye, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../utils/supabaseClient';
import { TransactionModal } from '../components/TransactionModal';
import { Transaction } from '../components/TransactionTable';

export function PaybillActivityPage() {
  const [balance, setBalance] = useState<number>(145000);
  const [inflowToday, setInflowToday] = useState<number>(0);
  const [inflowCount, setInflowCount] = useState<number>(0);
  const [outflowToday, setOutflowToday] = useState<number>(0);
  const [outflowCount, setOutflowCount] = useState<number>(0);

  const [logs, setLogs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  // Pagination config
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchPaybillData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch current balance
      const { data: acctData } = await supabase
        .from('accounts')
        .select('current_balance')
        .eq('id', 'a1111111-1111-1111-1111-111111111111')
        .single();
      if (acctData) {
        setBalance(Number(acctData.current_balance));
      }

      // 2. Fetch today's transactions to calculate inflows/outflows
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: todayTxs, error: txError } = await supabase
        .from('transactions')
        .select('amount, direction, status')
        .eq('status', 'completed')
        .gte('occurred_at', startOfToday.toISOString());

      if (txError) throw txError;

      let inflowSum = 0;
      let inflowCountTemp = 0;
      let outflowSum = 0;
      let outflowCountTemp = 0;

      (todayTxs || []).forEach(tx => {
        const amt = Number(tx.amount);
        if (tx.direction === 'incoming') {
          inflowSum += amt;
          inflowCountTemp += 1;
        } else {
          outflowSum += amt;
          outflowCountTemp += 1;
        }
      });

      setInflowToday(inflowSum);
      setInflowCount(inflowCountTemp);
      setOutflowToday(outflowSum);
      setOutflowCount(outflowCountTemp);

      // 3. Fetch log feed
      const { data: logsData, error: logsError } = await supabase
        .from('transactions')
        .select(`
          *,
          customers:customer_id (
            full_name,
            account_reference
          )
        `)
        .order('occurred_at', { ascending: false });

      if (logsError) throw logsError;
      setLogs(logsData || []);

    } catch (err: any) {
      console.error('Error fetching paybill activity:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaybillData();

    // Setup real-time listeners for updates
    const channel = supabase
      .channel('paybill-activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchPaybillData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        fetchPaybillData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        (log.external_transaction_id || '').toLowerCase().includes(searchLower) ||
        (log.phone_number || '').includes(searchQuery) ||
        (log.reference || '').toLowerCase().includes(searchLower) ||
        (log.customers?.full_name || '').toLowerCase().includes(searchLower);

      const matchType = filterType === 'All' || log.transaction_type === filterType;

      return matchSearch && matchType;
    });
  }, [logs, searchQuery, filterType]);

  // Reset page when query/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  
  const currentLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const exportToCSV = () => {
    const headers = ['Date/Time', 'Type', 'Amount (KES)', 'Direction', 'Receipt ID', 'Reference', 'Phone'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(l => 
        `"${l.occurred_at}","${l.transaction_type}",${l.amount},"${l.direction}","${l.external_transaction_id || ''}","${l.reference || ''}","${l.phone_number}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== void 0) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `paybill_activity_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const exportSelectedToCSV = () => {
    const selectedTxs = logs.filter(t => selectedIds.includes(t.id));
    const headers = ['Date/Time', 'Type', 'Amount (KES)', 'Direction', 'Receipt ID', 'Reference', 'Phone'];
    const csvContent = [
      headers.join(','),
      ...selectedTxs.map(l => 
        `"${l.occurred_at}","${l.transaction_type}",${l.amount},"${l.direction}","${l.external_transaction_id || ''}","${l.reference || ''}","${l.phone_number}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== void 0) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `selected_paybill_activity_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setSelectedIds([]);
    setIsBulkMenuOpen(false);
  };

  const flagSelectedForAudit = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { error: auditError } = await supabase.from('audit_logs').insert(
        selectedIds.map(id => ({
          user_id: userData.user.id,
          action: 'PAYBILL_LOG_AUDIT_FLAG',
          entity_type: 'transactions',
          entity_id: id,
          new_values: { flagged: true, source: 'paybill_activity_log' }
        }))
      );

      if (auditError) throw auditError;
      alert(`Successfully flagged ${selectedIds.length} logs for manual trace audits.`);
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Failed to flag logs: ${err.message}`);
    }
    setIsBulkMenuOpen(false);
  };

  const formatType = (type: string) => {
    switch (type) {
      case 'C2B_PAYBILL': return 'C2B Payment';
      case 'STK_PUSH': return 'STK Push';
      case 'B2C': return 'Disbursement';
      case 'REVERSAL': return 'Reversal';
      default: return type;
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Balance */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <Activity size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Main Paybill Vault</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES {balance.toLocaleString()}</p>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-status-success flex items-center gap-1 font-semibold">
              <ArrowUpRight size={14} /> Settlement Liquid
            </span>
            <span className="text-brand-text/40 ml-2">Real-time ledger value</span>
          </div>
        </div>

        {/* Card 2: Inflows */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <ArrowUpRight size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Inflows (Today)</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES {inflowToday.toLocaleString()}</p>
          <div className="mt-4 text-sm text-brand-text/50">
            Across {inflowCount} completed callback settlements
          </div>
        </div>

        {/* Card 3: Outflows */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <ArrowDownRight size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Outflows (Today)</h3>
          </div>
          <p className="text-3xl font-bold text-brand-text mt-2">KES {outflowToday.toLocaleString()}</p>
          <div className="mt-4 text-sm text-brand-text/50">
            Across {outflowCount} B2C & Reversal adjustments
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm flex flex-col min-h-[500px]">
        <div className="p-6 border-b border-brand-border flex flex-col sm:flex-row justify-between items-start sm:items-center bg-brand-bg/30 gap-4">
          <div>
            <h3 className="text-lg font-bold text-brand-text">Paybill Ledger Trace</h3>
            <p className="text-sm text-brand-text/50">Dense operational record of all balance changes.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            {selectedIds.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsBulkMenuOpen(!isBulkMenuOpen)}
                  className="px-3 py-1.5 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 h-[34px]"
                >
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
                        <button 
                          onClick={exportSelectedToCSV}
                          className="w-full px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors"
                        >
                          Export Selected
                        </button>
                        <div className="h-px bg-brand-border my-1" />
                        <button 
                          onClick={flagSelectedForAudit}
                          className="w-full px-3 py-2 text-sm text-status-warning hover:bg-status-warning/10 flex items-center gap-2 transition-colors"
                        >
                          Flag for Verification
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
            
            {/* Type Filter */}
            <div className="relative">
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-1.5 border rounded-lg transition-colors flex items-center justify-center h-[34px] w-[34px] ${
                  filterType !== 'All' 
                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' 
                    : 'border-brand-border hover:bg-brand-bg text-brand-text/70'
                }`}
              >
                <Filter size={16} />
              </button>
              
              <AnimatePresence>
                {isFilterOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsFilterOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-48 p-2 bg-brand-panel border border-brand-border shadow-xl rounded-xl z-30"
                    >
                      <select 
                        value={filterType}
                        onChange={(e) => {
                          setFilterType(e.target.value);
                          setIsFilterOpen(false);
                        }}
                        className="w-full bg-brand-bg border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none"
                      >
                        <option value="All">All Movements</option>
                        <option value="C2B_PAYBILL">C2B Paybill</option>
                        <option value="STK_PUSH">STK Push</option>
                        <option value="B2C">Disbursement</option>
                        <option value="REVERSAL">Reversal</option>
                      </select>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phone, receipt..."
                className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm h-[34px] transition-all"
              />
            </div>

            <button 
              onClick={exportToCSV}
              className="px-3 py-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center gap-2 h-[34px]"
            >
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
                    checked={currentLogs.length > 0 && selectedIds.length === currentLogs.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(currentLogs.map(l => l.id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                  />
                </th>
                <th className="pb-3 pt-4 px-6 font-medium">Date & Time</th>
                <th className="pb-3 pt-4 px-6 font-medium">Type</th>
                <th className="pb-3 pt-4 px-6 font-medium text-right">Amount</th>
                <th className="pb-3 pt-4 px-6 font-medium">Party / Phone</th>
                <th className="pb-3 pt-4 px-6 font-medium">M-Pesa Ref</th>
                <th className="pb-3 pt-4 px-6 font-medium">Internal Ref</th>
                <th className="pb-3 pt-4 px-6 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw size={24} className="text-brand-accent animate-spin" />
                      <span className="text-brand-text/60">Fetching live audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-status-danger">
                    Error loading logs: {error}
                  </td>
                </tr>
              ) : currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-brand-text/40">
                    No activity logs found.
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => {
                  const isIncoming = log.direction === 'incoming';
                  return (
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
                      <td className="py-3 px-6 text-brand-text/80">{formatDate(log.occurred_at)}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${isIncoming ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                          {formatType(log.transaction_type)}
                        </span>
                      </td>
                      <td className="py-3 px-6 font-medium text-right">
                        {isIncoming ? (
                          <span className="text-status-success inline-flex items-center gap-1"><ArrowUpRight size={14} /> +KES {log.amount.toLocaleString()}</span>
                        ) : (
                          <span className="text-status-error inline-flex items-center gap-1"><ArrowDownRight size={14} /> -KES {log.amount.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="py-3 px-6 font-mono text-brand-text/90">{log.phone_number}</td>
                      <td className="py-3 px-6 font-mono text-brand-text/80">{log.external_transaction_id || log.checkout_request_id || 'N/A'}</td>
                      <td className="py-3 px-6 text-brand-text/60 font-mono text-xs">{log.reference || 'N/A'}</td>
                      <td className="py-3 px-6 text-right">
                        <button 
                          onClick={() => setSelectedTransaction(log)}
                          className="p-1.5 text-brand-text/50 hover:text-brand-accent hover:bg-brand-accent/10 rounded transition-colors inline-block"
                          title="Verify Trace"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && !error && filteredLogs.length > 0 && (
          <div className="p-6 border-t border-brand-border flex flex-col sm:flex-row justify-between items-center text-sm text-brand-text/50 gap-4 sm:gap-0">
            <span>
              Showing {currentLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} ledger logs
            </span>
            <div className="flex items-center gap-1 sm:gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-brand-bg hover:bg-brand-panel border border-brand-border/50 hover:border-brand-border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 bg-brand-bg hover:bg-brand-panel border border-brand-border/50 hover:border-brand-border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <TransactionModal 
        transaction={selectedTransaction} 
        isOpen={selectedTransaction !== null} 
        onClose={() => setSelectedTransaction(null)}
        onUpdate={fetchPaybillData}
      />
    </div>
  );
}
