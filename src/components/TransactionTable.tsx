import { Search, Filter, CheckCircle2, XCircle, Clock, Eye, RotateCcw, Download, CheckSquare, HelpCircle, AlertTriangle, Hourglass, Calendar, DollarSign, RefreshCw, X } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../utils/supabaseClient';
import { TransactionModal } from './TransactionModal';

export interface Transaction {
  id: string;
  customer_id: string | null;
  payment_source_id: string | null;
  transaction_type: string;
  direction: string;
  provider: string;
  external_transaction_id: string | null;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  reference: string | null;
  account_reference: string | null;
  normalized_reference: string | null;
  phone_number: string;
  amount: number;
  commission_amount: number;
  processing_fee: number;
  net_amount: number;
  currency: string;
  status: string;
  result_code: string | null;
  result_desc: string | null;
  occurred_at: string;
  created_at: string;
  customers?: {
    full_name: string;
    account_reference: string;
  } | null;
}

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={16} className="text-status-success" />;
    case 'failed':
      return <XCircle size={16} className="text-status-danger" />;
    case 'pending':
      return <Clock size={16} className="text-status-warning" />;
    case 'orphaned':
      return <HelpCircle size={16} className="text-purple-400" />;
    case 'duplicate':
      return <AlertTriangle size={16} className="text-pink-400" />;
    case 'delayed':
      return <Hourglass size={16} className="text-cyan-400" />;
    default:
      return null;
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    case 'failed':
      return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
    case 'pending':
      return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    case 'orphaned':
      return 'bg-purple-500/10 border-purple-500/20 text-purple-400';
    case 'duplicate':
      return 'bg-pink-500/10 border-pink-500/20 text-pink-400';
    case 'delayed':
      return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
    default:
      return 'bg-brand-bg border-brand-border text-brand-text/60';
  }
};

const formatType = (type: string) => {
  switch (type) {
    case 'C2B_PAYBILL': return 'C2B';
    case 'STK_PUSH': return 'STK Push';
    case 'B2C': return 'B2C';
    case 'REVERSAL': return 'Reversal';
    default: return type;
  }
};

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function TransactionTable() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // Advanced filters
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  // Pagination configuration
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const pageRangeDisplayed = 3;

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          customers:customer_id (
            full_name,
            account_reference
          )
        `)
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('transactions-realtime-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((trx) => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        (trx.id || '').toLowerCase().includes(searchLower) ||
        (trx.external_transaction_id || '').toLowerCase().includes(searchLower) ||
        (trx.reference || '').toLowerCase().includes(searchLower) ||
        (trx.account_reference || '').toLowerCase().includes(searchLower) ||
        (trx.phone_number || '').includes(searchQuery) ||
        (trx.customers?.full_name || '').toLowerCase().includes(searchLower);

      const matchType = filterType === 'All' || trx.transaction_type === filterType;
      const matchStatus = filterStatus === 'All' || trx.status === filterStatus;
      
      const matchMinAmount = minAmount === '' || trx.amount >= Number(minAmount);
      const matchMaxAmount = maxAmount === '' || trx.amount <= Number(maxAmount);

      let matchDate = true;
      if (startDate) {
        matchDate = matchDate && new Date(trx.occurred_at) >= new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchDate = matchDate && new Date(trx.occurred_at) <= end;
      }

      return matchSearch && matchType && matchStatus && matchMinAmount && matchMaxAmount && matchDate;
    });
  }, [transactions, searchQuery, filterType, filterStatus, minAmount, maxAmount, startDate, endDate]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus, minAmount, maxAmount, startDate, endDate]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  
  const currentTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  const getPageNumbers = () => {
    if (totalPages <= pageRangeDisplayed) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = currentPage - Math.floor(pageRangeDisplayed / 2);
    let end = currentPage + Math.floor(pageRangeDisplayed / 2);
    
    if (start < 1) {
      start = 1;
      end = pageRangeDisplayed;
    }
    if (end > totalPages) {
      end = totalPages;
      start = totalPages - pageRangeDisplayed + 1;
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const exportToCSV = () => {
    const headers = ['Occurred At', 'Transaction ID', 'Receipt ID', 'Phone Number', 'Amount (KES)', 'Type', 'Status', 'Reference', 'Account Reference'];
    const csvContent = [
      headers.join(','),
      ...filteredTransactions.map(trx => 
        `"${trx.occurred_at}","${trx.id}","${trx.external_transaction_id || ''}","${trx.phone_number}",${trx.amount},"${trx.transaction_type}","${trx.status}","${trx.reference || ''}","${trx.account_reference || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== void 0) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const exportSelectedToCSV = () => {
    const selectedTxs = transactions.filter(t => selectedIds.includes(t.id));
    const headers = ['Occurred At', 'Transaction ID', 'Receipt ID', 'Phone Number', 'Amount (KES)', 'Type', 'Status', 'Reference', 'Account Reference'];
    const csvContent = [
      headers.join(','),
      ...selectedTxs.map(trx => 
        `"${trx.occurred_at}","${trx.id}","${trx.external_transaction_id || ''}","${trx.phone_number}",${trx.amount},"${trx.transaction_type}","${trx.status}","${trx.reference || ''}","${trx.account_reference || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== void 0) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `selected_transactions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setIsBulkMenuOpen(false);
  };

  const flagSelectedForAudit = async () => {
    // Write an audit log entry for bulk flagging
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { error: auditError } = await supabase.from('audit_logs').insert(
        selectedIds.map(id => ({
          user_id: userData.user.id,
          action: 'BULK_FLAG_AUDIT',
          entity_type: 'transactions',
          entity_id: id,
          new_values: { flagged: true, timestamp: new Date().toISOString() }
        }))
      );

      if (auditError) throw auditError;
      alert(`Successfully flagged ${selectedIds.length} transactions for manual audit in logs.`);
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Error flagging transactions: ${err.message}`);
    }
    setIsBulkMenuOpen(false);
  };

  const hasActiveFilters = filterType !== 'All' || filterStatus !== 'All' || minAmount !== '' || maxAmount !== '' || startDate !== '' || endDate !== '';

  const resetFilters = () => {
    setFilterType('All');
    setFilterStatus('All');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <>
      <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col transition-colors duration-300">
        {/* Header and Controls */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
            <div>
              <h3 className="text-xl font-bold text-brand-text">Transactions Command Feed</h3>
              <p className="text-sm text-brand-text/50">Real-time ledger updates and callback states</p>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
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
                          <button 
                            onClick={exportSelectedToCSV}
                            className="w-full px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors"
                          >
                            <Download size={14} /> Export Selected
                          </button>
                          <div className="h-px bg-brand-border my-1" />
                          <button 
                            onClick={flagSelectedForAudit}
                            className="w-full px-3 py-2 text-sm text-status-warning hover:bg-status-warning/10 flex items-center gap-2 transition-colors"
                          >
                            <AlertTriangle size={14} /> Flag for Manual Audit
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="relative flex-1 sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID, phone, reference..."
                  className="w-full bg-brand-bg border border-brand-border rounded-lg py-1.5 pl-9 pr-3 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all duration-300"
                />
              </div>
              
              <button 
                onClick={exportToCSV}
                title="Export to CSV"
                className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center h-[34px] px-2 sm:px-3 gap-2"
              >
                <Download size={18} />
                <span className="text-sm font-medium hidden sm:inline">Export</span>
              </button>

              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-1.5 border rounded-lg transition-colors relative flex items-center justify-center h-[34px] sm:px-3 gap-2 ${
                  isFilterOpen || hasActiveFilters 
                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' 
                    : 'border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text'
                }`}
              >
                <Filter size={18} />
                <span className="text-sm font-medium hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-accent rounded-full border border-brand-panel"></span>
                )}
              </button>
            </div>
          </div>

          {/* Expanded Inline Filter Panel */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden bg-brand-bg/40 border border-brand-border rounded-xl p-4 mt-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Type Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-1.5">Type</label>
                    <select 
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                    >
                      <option value="All">All Types</option>
                      <option value="C2B_PAYBILL">C2B Paybill</option>
                      <option value="STK_PUSH">STK Push</option>
                      <option value="B2C">B2C Disbursement</option>
                      <option value="REVERSAL">Reversal</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-1.5">Status</label>
                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                    >
                      <option value="All">All Statuses</option>
                      <option value="completed">Completed (Success)</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="orphaned">Orphaned</option>
                      <option value="duplicate">Duplicate Callback</option>
                      <option value="delayed">Delayed Callback</option>
                    </select>
                  </div>

                  {/* Amount Range */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-1.5">Amount (KES)</label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        placeholder="Min"
                        className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                      />
                      <input 
                        type="number" 
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                        placeholder="Max"
                        className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                      />
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-1.5">Date Range</label>
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                      />
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-brand-panel border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-border flex justify-between items-center">
                  <span className="text-xs text-brand-text/40">
                    Matches: <strong className="text-brand-text/75">{filteredTransactions.length}</strong> transactions
                  </span>
                  {hasActiveFilters && (
                    <button 
                      onClick={resetFilters}
                      className="text-sm font-semibold text-brand-accent hover:opacity-85 flex items-center gap-1 transition-all"
                    >
                      <X size={14} /> Clear All Filters
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left text-sm whitespace-nowrap relative">
            <thead className="sticky top-0 bg-brand-panel z-10 shadow-[0_1px_0_var(--color-brand-border)]">
              <tr className="text-brand-text/50">
                <th className="pb-3 pt-1 px-4 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={currentTransactions.length > 0 && selectedIds.length === currentTransactions.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(currentTransactions.map(t => t.id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                  />
                </th>
                <th className="pb-3 pt-1 px-4 font-medium">Date/Time</th>
                <th className="pb-3 pt-1 px-4 font-medium">Phone Number</th>
                <th className="pb-3 pt-1 px-4 font-medium">Customer Reference</th>
                <th className="pb-3 pt-1 px-4 font-medium">Amount (KES)</th>
                <th className="pb-3 pt-1 px-4 font-medium">Type</th>
                <th className="pb-3 pt-1 px-4 font-medium">Status</th>
                <th className="pb-3 pt-1 px-4 font-medium">M-Pesa Receipt</th>
                <th className="pb-3 pt-1 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw size={24} className="text-brand-accent animate-spin" />
                      <span className="text-brand-text/60">Fetching live ledger data...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-status-danger">
                    Error loading transactions: {error}
                  </td>
                </tr>
              ) : currentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-brand-text/50">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {currentTransactions.map((trx) => (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={trx.id} 
                      className={`border-b border-brand-border hover:bg-brand-bg/50 transition-colors group ${selectedIds.includes(trx.id) ? 'bg-brand-accent/5' : ''}`}
                    >
                      <td className="py-4 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(trx.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, trx.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== trx.id));
                          }}
                          className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4 text-brand-text/80">{formatDate(trx.occurred_at)}</td>
                      <td className="py-4 px-4 font-mono text-brand-text/90 tracking-tight">{trx.phone_number}</td>
                      <td className="py-4 px-4 text-brand-text/80">
                        {trx.customers ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-brand-text">{trx.customers.full_name}</span>
                            <span className="text-xs text-brand-text/40">{trx.account_reference || 'No Ref'}</span>
                          </div>
                        ) : (
                          <span className="text-brand-text/30 italic">Unidentified Account</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-medium text-brand-text">{trx.amount.toLocaleString()}</td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 rounded-md bg-brand-bg border border-brand-border text-xs font-semibold tracking-wide text-brand-text/80">
                          {formatType(trx.transaction_type)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${getStatusBadgeClass(trx.status)}`}>
                          <StatusIcon status={trx.status} />
                          {trx.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-brand-text/60 text-xs">{trx.external_transaction_id || trx.checkout_request_id || 'N/A'}</td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setSelectedTransaction(trx)}
                            title="Inspect Details"
                            className="p-1.5 hover:bg-brand-accent/10 hover:text-brand-accent rounded-md text-brand-text/50 transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {!loading && !error && filteredTransactions.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-sm text-brand-text/50 pt-4 border-t border-brand-border gap-4 sm:gap-0">
            <span>
              Showing {currentTransactions.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} entries
            </span>
            <div className="flex items-center gap-1 sm:gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-brand-bg hover:bg-brand-panel border border-brand-border/50 hover:border-brand-border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              
              <div className="flex items-center gap-1 hidden sm:flex">
                {getPageNumbers().map((num) => (
                  <button
                    key={num}
                    onClick={() => setCurrentPage(num)}
                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors border ${
                      currentPage === num
                        ? 'bg-brand-accent/20 border-brand-accent text-brand-accent font-medium'
                        : 'bg-brand-bg border-transparent hover:border-brand-border text-brand-text/70 hover:text-brand-text'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

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
      />
    </>
  );
}
