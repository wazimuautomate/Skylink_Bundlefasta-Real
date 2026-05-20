import { useState, useMemo } from 'react';
import { Search, Filter, Download, MessageSquare, Ban, CheckCircle2, MoreVertical, ShieldAlert, ChevronLeft, ChevronRight, CheckSquare, Trash2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MOCK_CUSTOMERS = [
  { id: 'CUST-001', name: 'John Doe', phone: '+254711223344', totalSpent: 45000, txCount: 12, lastActive: '25 Jul 14:30', status: 'Active' },
  { id: 'CUST-002', name: 'Jane Smith', phone: '+254722334455', totalSpent: 12000, txCount: 3, lastActive: '24 Jul 09:15', status: 'Active' },
  { id: 'CUST-003', name: 'Michael Johnson', phone: '+254733445566', totalSpent: 85000, txCount: 24, lastActive: '25 Jul 16:45', status: 'Suspended' },
  { id: 'CUST-004', name: 'Sarah Williams', phone: '+254744556677', totalSpent: 3200, txCount: 1, lastActive: '20 Jul 11:20', status: 'Active' },
  { id: 'CUST-005', name: 'David Brown', phone: '+254755667788', totalSpent: 56000, txCount: 8, lastActive: '25 Jul 08:00', status: 'Active' },
  { id: 'CUST-006', name: 'Emily Davis', phone: '+254766778899', totalSpent: 1400, txCount: 2, lastActive: '15 Jul 13:10', status: 'Suspended' },
  { id: 'CUST-007', name: 'James Wilson', phone: '+254777889900', totalSpent: 92000, txCount: 31, lastActive: '25 Jul 10:30', status: 'Active' },
  { id: 'CUST-008', name: 'Linda Martinez', phone: '+254788990011', totalSpent: 21500, txCount: 6, lastActive: '22 Jul 15:45', status: 'Active' },
];

export function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  // Pagination configuration
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const pageRangeDisplayed = 3;

  const filteredCustomers = useMemo(() => {
    return MOCK_CUSTOMERS.filter((cust) => {
      const matchSearch = cust.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          cust.phone.includes(searchQuery);
      const matchStatus = filterStatus === 'All' || cust.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [searchQuery, filterStatus]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  
  const currentCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage, itemsPerPage]);

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

  const hasActiveFilters = filterStatus !== 'All';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
  };

  return (
    <div className="h-[calc(100vh-144px)] flex flex-col pb-8">
      <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 flex-1 flex flex-col transition-colors duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative">
          <div>
            <h3 className="text-xl font-bold text-brand-text">Customer Directory</h3>
            <p className="text-sm text-brand-text/50">Manage your active and suspended customers</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {selectedIds.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsBulkMenuOpen(!isBulkMenuOpen)}
                  className="px-3 py-1.5 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 h-[34px]"
                >
                  <CheckSquare size={16} />
                  Bulk Actions ({selectedIds.length})
                </button>
                {isBulkMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsBulkMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-brand-panel border border-brand-border shadow-xl rounded-xl z-50 overflow-hidden py-1 text-left">
                      <button className="w-full px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors">
                        <Send size={14} /> Send SMS
                      </button>
                      <button className="w-full px-3 py-2 text-sm text-status-success hover:bg-status-success/10 flex items-center gap-2 transition-colors">
                        <CheckCircle2 size={14} /> Activate Selected
                      </button>
                      <button className="w-full px-3 py-2 text-sm text-status-error hover:bg-status-error/10 flex items-center gap-2 transition-colors">
                        <Ban size={14} /> Suspend Selected
                      </button>
                      <div className="h-px bg-brand-border my-1" />
                      <button className="w-full px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors">
                        <Download size={14} /> Export Selected
                      </button>
                      <button className="w-full px-3 py-2 text-sm text-status-error hover:bg-status-error/10 flex items-center gap-2 transition-colors">
                        <Trash2 size={14} /> Delete Selected
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" size={16} />
              <input
                type="text"
                placeholder="Search name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all h-[34px]"
              />
            </div>
            
            <button 
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

              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-brand-panel border border-brand-border rounded-xl shadow-xl z-50 p-3 overflow-hidden">
                  <div className="mb-2">
                    <label className="text-xs font-semibold text-brand-text/50 uppercase tracking-wider mb-2 block">Status</label>
                    <div className="space-y-1">
                      {['All', 'Active', 'Suspended'].map(type => (
                        <button
                          key={type}
                          onClick={() => { setFilterStatus(type); setIsFilterOpen(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                            filterStatus === type 
                              ? 'bg-brand-accent/10 text-brand-accent font-medium' 
                              : 'text-brand-text hover:bg-brand-bg'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <button 
                      onClick={() => setFilterStatus('All')}
                      className="w-full mt-2 pt-2 border-t border-brand-border text-xs text-brand-text/50 hover:text-brand-text text-center transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              )}
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
                    checked={currentCustomers.length > 0 && selectedIds.length === currentCustomers.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(currentCustomers.map(c => c.id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg"
                  />
                </th>
                <th className="pb-3 pt-1 px-4 font-medium">Customer Name</th>
                <th className="pb-3 pt-1 px-4 font-medium">Phone Number</th>
                <th className="pb-3 pt-1 px-4 font-medium">Total Spent</th>
                <th className="pb-3 pt-1 px-4 font-medium">Transactions</th>
                <th className="pb-3 pt-1 px-4 font-medium">Status</th>
                <th className="pb-3 pt-1 px-4 font-medium">Last Active</th>
                <th className="pb-3 pt-1 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {currentCustomers.map((cust) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    key={cust.id} 
                    className={`border-b border-brand-border/50 hover:bg-brand-bg transition-colors group ${selectedIds.includes(cust.id) ? 'bg-brand-accent/5' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(cust.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, cust.id]);
                          else setSelectedIds(selectedIds.filter(id => id !== cust.id));
                        }}
                        className="rounded border-brand-border text-brand-accent focus:ring-brand-accent bg-brand-bg cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-brand-text">{cust.name}</div>
                      <div className="text-xs text-brand-text/50">{cust.id}</div>
                    </td>
                    <td className="py-3 px-4 text-brand-text/90 font-mono text-sm">{cust.phone}</td>
                    <td className="py-3 px-4 font-medium text-brand-text">{formatCurrency(cust.totalSpent)}</td>
                    <td className="py-3 px-4 text-brand-text/80">{cust.txCount}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        cust.status === 'Active' 
                          ? 'bg-status-success/10 text-status-success' 
                          : 'bg-status-error/10 text-status-error'
                      }`}>
                        {cust.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-brand-text/70 text-sm">{cust.lastActive}</td>
                    <td className="py-3 px-4 text-right relative">
                      <button 
                        onClick={() => setActiveMenu(activeMenu === cust.id ? null : cust.id)}
                        className="p-1.5 text-brand-text/50 hover:text-brand-text hover:bg-brand-panel rounded transition-colors inline-block"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {activeMenu === cust.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setActiveMenu(null)}
                          />
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute right-8 top-10 w-48 bg-brand-panel border border-brand-border rounded-xl shadow-xl z-50 p-1.5 overflow-hidden flex flex-col text-left"
                          >
                            <button className="flex items-center gap-2 px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg rounded-md transition-colors w-full text-left">
                              <ShieldAlert size={14} /> View KYC Info
                            </button>
                            <button className="flex items-center gap-2 px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg rounded-md transition-colors w-full text-left">
                              <MessageSquare size={14} /> Send SMS
                            </button>
                            <div className="h-px bg-brand-border my-1" />
                            {cust.status === 'Active' ? (
                              <button className="flex items-center gap-2 px-3 py-2 text-sm text-status-error hover:bg-status-error/10 rounded-md transition-colors w-full text-left">
                                <Ban size={14} /> Suspend User
                              </button>
                            ) : (
                              <button className="flex items-center gap-2 px-3 py-2 text-sm text-status-success hover:bg-status-success/10 rounded-md transition-colors w-full text-left">
                                <CheckCircle2 size={14} /> Activate User
                              </button>
                            )}
                          </motion.div>
                        </>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {currentCustomers.length === 0 && (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-brand-border/50"
                  >
                    <td colSpan={8} className="py-8 text-center text-brand-text/50">
                      No customers found matching your criteria
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-sm text-brand-text/50 pt-4 border-t border-brand-border gap-4 sm:gap-0">
          <span>
            Showing {currentCustomers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} entries
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
    </div>
  );
}

