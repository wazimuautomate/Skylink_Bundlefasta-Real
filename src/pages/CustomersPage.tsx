import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Download, MessageSquare, Ban, CheckCircle2, MoreVertical, ShieldAlert, CheckSquare, Trash2, Send, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../utils/supabaseClient';

interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  txCount: number;
  lastActive: string;
  status: string;
  accountRef: string;
}

export function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);

  // Pagination configuration
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Real-time State
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomersData = async () => {
    try {
      setLoading(true);

      // Fetch all customers
      const { data: custData, error: custError } = await supabase
        .from('customers')
        .select('*');

      if (custError) throw custError;

      // Fetch all transactions for aggregation
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('customer_id, amount, status, occurred_at')
        .eq('status', 'completed');

      if (txError) throw txError;

      const txMap: Record<string, { totalSpent: number; txCount: number; lastActive: string }> = {};
      (txData || []).forEach(tx => {
        if (!tx.customer_id) return;
        if (!txMap[tx.customer_id]) {
          txMap[tx.customer_id] = { totalSpent: 0, txCount: 0, lastActive: '' };
        }
        txMap[tx.customer_id].totalSpent += Number(tx.amount);
        txMap[tx.customer_id].txCount += 1;
        if (!txMap[tx.customer_id].lastActive || new Date(tx.occurred_at) > new Date(txMap[tx.customer_id].lastActive)) {
          txMap[tx.customer_id].lastActive = tx.occurred_at;
        }
      });

      const records: CustomerRecord[] = (custData || []).map(cust => {
        const stats = txMap[cust.id] || { totalSpent: 0, txCount: 0, lastActive: '' };
        return {
          id: cust.id,
          name: cust.full_name || 'Unnamed Customer',
          phone: cust.phone_number || 'N/A',
          totalSpent: stats.totalSpent,
          txCount: stats.txCount,
          lastActive: stats.lastActive ? new Date(stats.lastActive).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }) : new Date(cust.created_at).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short'
          }),
          status: cust.metadata?.status || 'Active',
          accountRef: cust.account_reference || 'N/A'
        };
      });

      setCustomers(records);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomersData();

    const channel1 = supabase
      .channel('customers-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchCustomersData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchCustomersData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
    };
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: 'Active' | 'Suspended') => {
    try {
      // Fetch current metadata
      const { data: cust } = await supabase
        .from('customers')
        .select('metadata')
        .eq('id', id)
        .single();

      const updatedMeta = {
        ...(cust?.metadata || {}),
        status: newStatus
      };

      const { error: upError } = await supabase
        .from('customers')
        .update({ metadata: updatedMeta })
        .eq('id', id);

      if (upError) throw upError;
      alert(`Customer status updated to ${newStatus}`);
      fetchCustomersData();
      setActiveMenu(null);
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleBulkStatus = async (newStatus: 'Active' | 'Suspended') => {
    if (selectedIds.length === 0) return;
    try {
      for (const id of selectedIds) {
        const { data: cust } = await supabase
          .from('customers')
          .select('metadata')
          .eq('id', id)
          .single();

        const updatedMeta = {
          ...(cust?.metadata || {}),
          status: newStatus
        };

        await supabase
          .from('customers')
          .update({ metadata: updatedMeta })
          .eq('id', id);
      }
      alert(`Bulk updated ${selectedIds.length} customer(s) to ${newStatus}`);
      setSelectedIds([]);
      setIsBulkMenuOpen(false);
      fetchCustomersData();
    } catch (err: any) {
      alert(`Bulk update failed: ${err.message}`);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const matchSearch = cust.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          cust.phone.includes(searchQuery) ||
                          cust.accountRef.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'All' || cust.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [customers, searchQuery, filterStatus]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  
  const currentCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage, itemsPerPage]);

  const getPageNumbers = () => {
    const range = [];
    for (let i = 1; i <= totalPages; i++) {
      range.push(i);
    }
    return range;
  };

  const hasActiveFilters = filterStatus !== 'All';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
  };

  const exportCSV = () => {
    const headers = ['Customer ID', 'Full Name', 'Account Ref', 'Phone Number', 'Total Spent (KES)', 'Tx Count', 'Status', 'Last Active'];
    const rows = filteredCustomers.map(c => [
      c.id,
      c.name,
      c.accountRef,
      c.phone,
      c.totalSpent,
      c.txCount,
      c.status,
      c.lastActive
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `skylink_customers_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-[calc(100vh-144px)] flex flex-col pb-8 font-sans">
      <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 flex-1 flex flex-col transition-colors duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative">
          <div>
            <h3 className="text-xl font-bold text-brand-text font-sans">Customer Directory</h3>
            <p className="text-sm text-brand-text/50">Manage KYC profiles and ledger statistics</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {selectedIds.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsBulkMenuOpen(!isBulkMenuOpen)}
                  className="px-3 py-1.5 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 h-[34px]"
                >
                  <CheckSquare size={16} />
                  Bulk Actions ({selectedIds.length})
                </button>
                {isBulkMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsBulkMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-brand-panel border border-brand-border shadow-xl rounded-xl z-50 overflow-hidden py-1 text-left text-xs">
                      <button 
                        onClick={() => handleBulkStatus('Active')}
                        className="w-full px-3 py-2 text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2 transition-colors font-semibold"
                      >
                        <CheckCircle2 size={14} /> Activate Selected
                      </button>
                      <button 
                        onClick={() => handleBulkStatus('Suspended')}
                        className="w-full px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors font-semibold"
                      >
                        <Ban size={14} /> Suspend Selected
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
                placeholder="Search name, phone, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm h-[34px] transition-all"
              />
            </div>
            
            <button 
              onClick={exportCSV}
              className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center h-[34px] px-2 sm:px-3 gap-2"
            >
              <Download size={18} />
              <span className="text-sm font-semibold hidden sm:inline">Export CSV</span>
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
                <span className="text-sm font-semibold hidden sm:inline">Filter</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-accent rounded-full border border-brand-panel"></span>
                )}
              </button>

              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-brand-panel border border-brand-border rounded-xl shadow-xl z-50 p-3 overflow-hidden text-xs">
                  <div className="mb-2">
                    <label className="text-[10px] font-bold text-brand-text/40 uppercase tracking-wider mb-2 block">Status</label>
                    <div className="space-y-1">
                      {['All', 'Active', 'Suspended'].map(type => (
                        <button
                          key={type}
                          onClick={() => { setFilterStatus(type); setIsFilterOpen(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                            filterStatus === type 
                              ? 'bg-brand-accent/10 text-brand-accent font-semibold' 
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
                <th className="pb-3 pt-1 px-4 font-medium">Account Ref</th>
                <th className="pb-3 pt-1 px-4 font-medium">Phone Number</th>
                <th className="pb-3 pt-1 px-4 font-medium">Total Spent</th>
                <th className="pb-3 pt-1 px-4 font-medium">Transactions</th>
                <th className="pb-3 pt-1 px-4 font-medium">Status</th>
                <th className="pb-3 pt-1 px-4 font-medium">Last Active</th>
                <th className="pb-3 pt-1 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw size={24} className="text-brand-accent animate-spin" />
                      <span className="text-brand-text/60">Fetching customer profiles...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-status-danger">
                    Failed to load: {error}
                  </td>
                </tr>
              ) : currentCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-brand-text/40 italic">
                    No customers found matching search parameters.
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {currentCustomers.map((cust) => (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
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
                        <div className="font-semibold text-brand-text">{cust.name}</div>
                        <div className="text-[10px] text-brand-text/40 font-mono mt-0.5">{cust.id}</div>
                      </td>
                      <td className="py-3 px-4 text-brand-text/90 font-mono text-sm">{cust.accountRef}</td>
                      <td className="py-3 px-4 text-brand-text/90 font-mono text-sm">{cust.phone}</td>
                      <td className="py-3 px-4 font-semibold text-brand-text">{formatCurrency(cust.totalSpent)}</td>
                      <td className="py-3 px-4 text-brand-text/80">{cust.txCount}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                          cust.status === 'Active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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
                              className="absolute right-8 top-10 w-48 bg-brand-panel border border-brand-border rounded-xl shadow-xl z-50 p-1.5 overflow-hidden flex flex-col text-left text-xs"
                            >
                              <button 
                                onClick={() => {
                                  alert(`KyC Details:\nName: ${cust.name}\nPhone: ${cust.phone}\nRef: ${cust.accountRef}`);
                                  setActiveMenu(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg rounded-md transition-colors w-full text-left"
                              >
                                <ShieldAlert size={14} /> View KYC Info
                              </button>
                              <button 
                                onClick={() => {
                                  const text = prompt('Enter message to send via SMS:');
                                  if (text) alert(`SMS sent to ${cust.phone}: "${text}"`);
                                  setActiveMenu(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-brand-text/80 hover:text-brand-text hover:bg-brand-bg rounded-md transition-colors w-full text-left"
                              >
                                <MessageSquare size={14} /> Send SMS
                              </button>
                              <div className="h-px bg-brand-border my-1" />
                              {cust.status === 'Active' ? (
                                <button 
                                  onClick={() => handleUpdateStatus(cust.id, 'Suspended')}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors w-full text-left font-semibold"
                                >
                                  <Ban size={14} /> Suspend User
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleUpdateStatus(cust.id, 'Active')}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors w-full text-left font-semibold"
                                >
                                  <CheckCircle2 size={14} /> Activate User
                                </button>
                              )}
                            </motion.div>
                          </>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-sm text-brand-text/50 pt-4 border-t border-brand-border gap-4 sm:gap-0 shrink-0">
          <span>
            Showing {filteredCustomers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} entries
          </span>
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-brand-bg hover:bg-brand-panel border border-brand-border/50 hover:border-brand-border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs"
            >
              Prev
            </button>
            
            <div className="flex items-center gap-1">
              {getPageNumbers().map((num) => (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={`w-7 h-7 text-xs flex items-center justify-center rounded-md transition-colors border ${
                    currentPage === num
                      ? 'bg-brand-accent/20 border-brand-accent text-brand-accent font-semibold'
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
              className="px-3 py-1 bg-brand-bg hover:bg-brand-panel border border-brand-border/50 hover:border-brand-border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
