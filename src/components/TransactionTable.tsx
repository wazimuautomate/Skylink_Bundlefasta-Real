import { Search, Filter, CheckCircle2, XCircle, Clock, Eye, RefreshCcw, RotateCcw, Download, CheckSquare, Trash2 } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TransactionModal } from './TransactionModal';

const INITIAL_TRANSACTIONS = [
  { id: 'TRX9Y8X7W6', date: '25 Jul 12:30', phone: '+254712345678', amount: 1500, type: 'C2B', status: 'Success' },
  { id: 'TRX8Z9Y0X1', date: '25 Jul 12:28', phone: '+254722000111', amount: 450, type: 'STK Push', status: 'Failed' },
  { id: 'TRX7A6B5C4', date: '25 Jul 12:15', phone: '+254733999888', amount: 12500, type: 'B2C', status: 'Pending' },
  { id: 'TRX6D5E4F3', date: '25 Jul 11:45', phone: '+254711222333', amount: 800, type: 'C2B', status: 'Success' },
  { id: 'TRX5G4H3I2', date: '25 Jul 11:20', phone: '+254799888777', amount: 250, type: 'Reversal', status: 'Success' },
  { id: 'TRX4J5K6L7', date: '25 Jul 11:05', phone: '+254700112233', amount: 5000, type: 'STK Push', status: 'Success' },
  { id: 'TRX3M4N5O6', date: '25 Jul 10:45', phone: '+254744556677', amount: 3200, type: 'C2B', status: 'Failed' },
  { id: 'TRX2P3Q4R5', date: '25 Jul 10:30', phone: '+254788990011', amount: 150, type: 'B2C', status: 'Success' },
  { id: 'TRX1S2T3U4', date: '25 Jul 10:15', phone: '+254722334455', amount: 8500, type: 'C2B', status: 'Pending' },
  { id: 'TRX0V1W2X3', date: '25 Jul 09:50', phone: '+254755667788', amount: 400, type: 'STK Push', status: 'Success' },
  { id: 'TRX9Y0Z1A2', date: '25 Jul 09:20', phone: '+254711998877', amount: 1200, type: 'Reversal', status: 'Failed' },
  { id: 'TRX8B9C0D1', date: '25 Jul 09:00', phone: '+254733445566', amount: 6700, type: 'B2C', status: 'Success' },
];

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'Success': return <CheckCircle2 size={16} className="text-status-success" />;
    case 'Failed': return <XCircle size={16} className="text-status-danger" />;
    case 'Pending': return <Clock size={16} className="text-status-warning" />;
    default: return null;
  }
};

export function TransactionTable() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  // Pagination configuration
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Adjust how many items per page to show
  const pageRangeDisplayed = 3; // Maximum number of dynamic page buttons to show

  const filteredTransactions = useMemo(() => {
    return INITIAL_TRANSACTIONS.filter((trx) => {
      const matchSearch = trx.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          trx.phone.includes(searchQuery);
      const matchType = filterType === 'All' || trx.type === filterType;
      const matchStatus = filterStatus === 'All' || trx.status === filterStatus;
      
      return matchSearch && matchType && matchStatus;
    });
  }, [searchQuery, filterType, filterStatus]);

  // Reset to first page when dynamic filters or searches change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  
  const currentTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  // Dynamically compute the page numbers to show based on the configured range
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
    const headers = ['Date/Time', 'Phone Number', 'Amount (KES)', 'Type', 'Status', 'Transaction ID'];
    const csvContent = [
      headers.join(','),
      ...filteredTransactions.map(trx => 
        `"${trx.date}","${trx.phone}",${trx.amount},"${trx.type}","${trx.status}","${trx.id}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== void 0) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'transactions_export.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const hasActiveFilters = filterType !== 'All' || filterStatus !== 'All';

  return (
    <>
      <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col transition-colors duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative">
          <div>
            <h3 className="text-xl font-bold text-brand-text">Recent Transactions</h3>
            <p className="text-sm text-brand-text/50">Live feed of all operations</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
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
            <div className="relative flex-1 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID, phone..."
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

            <div className="relative">
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-1.5 border rounded-lg transition-colors relative flex items-center justify-center h-[34px] w-[34px] sm:w-auto sm:px-3 gap-2 ${
                  hasActiveFilters 
                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' 
                    : 'border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text'
                }`}
              >
                <Filter size={18} />
                <span className="text-sm font-medium hidden sm:inline">Filter</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-accent rounded-full border border-brand-panel"></span>
                )}
              </button>

              {/* Filter Dropdown */}
              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 p-4 bg-brand-panel border border-brand-border shadow-xl rounded-xl z-20"
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-2">Type</label>
                        <select 
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                        >
                          <option value="All">All Types</option>
                          <option value="C2B">C2B</option>
                          <option value="STK Push">STK Push</option>
                          <option value="B2C">B2C</option>
                          <option value="Reversal">Reversal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-2">Status</label>
                        <select 
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg py-1.5 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
                        >
                          <option value="All">All Statuses</option>
                          <option value="Success">Success</option>
                          <option value="Failed">Failed</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                      <div className="pt-2 border-t border-brand-border flex justify-end">
                        <button 
                          onClick={() => {
                            setFilterType('All');
                            setFilterStatus('All');
                          }}
                          className="text-sm font-medium text-brand-text/50 hover:text-brand-text transition-colors"
                        >
                          Reset Filters
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

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
                <th className="pb-3 pt-1 px-4 font-medium">Amount (KES)</th>
                <th className="pb-3 pt-1 px-4 font-medium">Type</th>
                <th className="pb-3 pt-1 px-4 font-medium">Status</th>
                <th className="pb-3 pt-1 px-4 font-medium">Transaction ID</th>
                <th className="pb-3 pt-1 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {currentTransactions.map((trx) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, scale: 0.98, backgroundColor: 'rgba(0,191,255,0.1)' }}
                    animate={{ opacity: 1, scale: 1, backgroundColor: 'transparent' }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
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
                    <td className="py-4 px-4 text-brand-text/80">{trx.date}</td>
                    <td className="py-4 px-4 font-mono text-brand-text/90 tracking-tight">{trx.phone}</td>
                    <td className="py-4 px-4 font-medium text-brand-text">{trx.amount.toLocaleString()}</td>
                    <td className="py-4 px-4">
                      <span className="px-2.5 py-1 rounded-md bg-brand-bg border border-brand-border text-xs font-semibold tracking-wide text-brand-text/80">
                        {trx.type}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={trx.status} />
                        <span className="text-brand-text/80">{trx.status}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-brand-text/60 text-xs">{trx.id}</td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setSelectedTransaction(trx)}
                          title="View Details"
                          className="p-1.5 hover:bg-brand-accent/10 hover:text-brand-accent rounded-md text-brand-text/50 transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        {trx.status === 'Failed' && (
                          <button 
                            title="Retry"
                            className="p-1.5 hover:bg-status-success/10 hover:text-status-success rounded-md text-brand-text/50 transition-colors"
                          >
                            <RefreshCcw size={16} />
                          </button>
                        )}
                        {trx.status === 'Success' && trx.type !== 'Reversal' && (
                          <button 
                            title="Reverse"
                            className="p-1.5 hover:bg-status-warning/10 hover:text-status-warning rounded-md text-brand-text/50 transition-colors"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-brand-text/50">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
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
      </div>

      <TransactionModal 
        transaction={selectedTransaction} 
        isOpen={selectedTransaction !== null} 
        onClose={() => setSelectedTransaction(null)} 
      />
    </>
  );
}
