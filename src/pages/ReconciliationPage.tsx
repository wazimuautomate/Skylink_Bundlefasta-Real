import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Upload, RefreshCcw, CheckCircle2, AlertCircle, FileText, Search, Download, Eye, Check, X } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { ReconciliationWidget } from '../components/ReconciliationWidget';

interface DiscrepancyItem {
  id: string;
  occurred_at: string;
  external_transaction_id: string | null;
  reference: string | null;
  phone_number: string;
  amount: number;
  status: string;
  customer_id: string | null;
}

interface ReportItem {
  id: string;
  report_date: string;
  expected_amount: number;
  actual_amount: number;
  variance: number;
  status: string;
  generated_at: string;
}

interface CustomerItem {
  id: string;
  full_name: string;
  account_reference: string;
}

export function ReconciliationPage() {
  const [isReconciling, setIsReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState<'discrepancies' | 'history'>('discrepancies');
  
  // Data State
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [history, setHistory] = useState<ReportItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Resolve State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DiscrepancyItem | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [resolving, setResolving] = useState(false);

  // General metrics
  const [matchCount, setMatchCount] = useState(0);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch discrepancies: transactions with orphaned, duplicate, delayed status
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .in('status', ['orphaned', 'duplicate', 'delayed'])
        .order('occurred_at', { ascending: false });

      if (txError) throw txError;
      setDiscrepancies(
        (txData || []).map(t => ({
          id: t.id,
          occurred_at: t.occurred_at,
          external_transaction_id: t.external_transaction_id,
          reference: t.reference,
          phone_number: t.phone_number,
          amount: Number(t.amount),
          status: t.status,
          customer_id: t.customer_id
        }))
      );

      // 2. Fetch today's matched count
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('occurred_at', startOfToday.toISOString());
      
      setMatchCount(count || 0);

      // 3. Fetch reconciliation report history
      const { data: repData, error: repError } = await supabase
        .from('reconciliation_reports')
        .select('*')
        .order('report_date', { ascending: false });

      if (repError) throw repError;
      setHistory(
        (repData || []).map(r => ({
          id: r.id,
          report_date: r.report_date,
          expected_amount: Number(r.expected_amount),
          actual_amount: Number(r.actual_amount),
          variance: Number(r.variance),
          status: r.status,
          generated_at: r.generated_at
        }))
      );

      // 4. Fetch customers for manual resolution dropdown
      const { data: custData } = await supabase
        .from('customers')
        .select('id, full_name, account_reference')
        .order('full_name', { ascending: true });

      setCustomers(custData || []);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('reconciliation-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_reports' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredDiscrepancies = useMemo(() => {
    return discrepancies.filter(d => {
      const searchLower = searchQuery.toLowerCase();
      return (
        d.phone_number.includes(searchQuery) ||
        (d.reference || '').toLowerCase().includes(searchLower) ||
        (d.external_transaction_id || '').toLowerCase().includes(searchLower)
      );
    });
  }, [discrepancies, searchQuery]);

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Unauthorized');

      // 1. Fetch active orphaned transactions
      const { data: orphanedTxs, error: oError } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'orphaned');

      if (oError) throw oError;

      let matchedCount = 0;

      // 2. Loop and attempt automatic matches against customers table
      for (const tx of orphanedTxs || []) {
        // Try matching reference or normalized_reference to customer account_reference
        const refToSearch = (tx.reference || tx.account_reference || '').trim().toUpperCase();
        if (!refToSearch) continue;

        const { data: matchedCustomer } = await supabase
          .from('customers')
          .select('id, account_reference')
          .ilike('account_reference', refToSearch)
          .maybeSingle();

        if (matchedCustomer) {
          // Perform auto-match resolution
          const { data: updatedTx, error: upError } = await supabase
            .from('transactions')
            .update({
              customer_id: matchedCustomer.id,
              status: 'completed',
              result_code: '0',
              result_desc: 'Reconciled via auto-match engine'
            })
            .eq('id', tx.id)
            .select()
            .single();

          if (upError) {
            console.error('Auto-match transaction update failed:', upError);
            continue;
          }

          if (updatedTx) {
            // Write ledger entries
            await supabase.from('ledger_entries').insert([
              {
                transaction_id: updatedTx.id,
                account_id: 'a1111111-1111-1111-1111-111111111111', // Paybill Collection Main
                entry_type: 'DEBIT',
                amount: updatedTx.amount
              },
              {
                transaction_id: updatedTx.id,
                account_id: 'c2222222-2222-2222-2222-222222222222', // Accounts Receivable
                entry_type: 'CREDIT',
                amount: updatedTx.amount
              }
            ]);

            // Write audit log
            await supabase.from('audit_logs').insert({
              user_id: userData.user.id,
              action: 'AUTO_MATCH_RECONCILE',
              entity_type: 'transactions',
              entity_id: updatedTx.id,
              new_values: { customer_id: matchedCustomer.id, reference: refToSearch },
              ip_address: 'auto_match_engine'
            });

            matchedCount++;
          }
        }
      }

      // 3. Create a summary reconciliation report for today
      // Sum up completed transactions total for today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: todayCompletions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'completed')
        .gte('occurred_at', startOfToday.toISOString());

      const totalExpected = (todayCompletions || []).reduce((sum, t) => sum + Number(t.amount), 0);

      // Fetch Paybill balance
      const { data: paybillAcct } = await supabase
        .from('accounts')
        .select('current_balance')
        .eq('id', 'a1111111-1111-1111-1111-111111111111')
        .single();
      const actualBalance = paybillAcct ? Number(paybillAcct.current_balance) : totalExpected;

      // Variance is actual vault balance vs expected total
      const variance = actualBalance - totalExpected;

      // Check if any discrepancies remain
      const { count: remainingOrphans } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'orphaned');

      const reportStatus = (remainingOrphans || 0) > 0 ? 'DISCREPANCY' : 'MATCHED';

      const { error: repError } = await supabase
        .from('reconciliation_reports')
        .insert({
          report_date: new Date().toISOString().split('T')[0],
          expected_amount: totalExpected,
          actual_amount: actualBalance,
          variance: variance,
          status: reportStatus,
          generated_at: new Date().toISOString()
        });

      if (repError) throw repError;

      alert(`Auto-match complete! Resolved ${matchedCount} transactions and generated today's report.`);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`Auto-match failed: ${err.message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleResolveManual = async () => {
    if (!selectedDiscrepancy || !selectedCustomerId) {
      alert('Please select a customer to match.');
      return;
    }

    setResolving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Unauthorized');

      // 1. Update the transaction
      const { data: updatedTx, error: upError } = await supabase
        .from('transactions')
        .update({
          customer_id: selectedCustomerId,
          status: 'completed',
          result_code: '0',
          result_desc: 'Reconciled manually by administrator'
        })
        .eq('id', selectedDiscrepancy.id)
        .select()
        .single();

      if (upError) throw upError;

      if (updatedTx) {
        // 2. Insert balancing ledger entries
        await supabase.from('ledger_entries').insert([
          {
            transaction_id: updatedTx.id,
            account_id: 'a1111111-1111-1111-1111-111111111111', // Paybill Collection Main
            entry_type: 'DEBIT',
            amount: updatedTx.amount
          },
          {
            transaction_id: updatedTx.id,
            account_id: 'c2222222-2222-2222-2222-222222222222', // Accounts Receivable
            entry_type: 'CREDIT',
            amount: updatedTx.amount
          }
        ]);

        // 3. Write Audit Log
        await supabase.from('audit_logs').insert({
          user_id: userData.user.id,
          action: 'MANUAL_RECONCILE',
          entity_type: 'transactions',
          entity_id: updatedTx.id,
          new_values: { customer_id: selectedCustomerId, source: 'manual_reconciliation_page' },
          ip_address: 'reconciliation_dashboard'
        });
      }

      alert('Transaction reconciled successfully!');
      setSelectedDiscrepancy(null);
      setSelectedCustomerId('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`Manual reconciliation failed: ${err.message}`);
    } finally {
      setResolving(false);
    }
  };

  const getDiscrepancyLabel = (status: string) => {
    switch (status) {
      case 'orphaned': return 'Missing Reference (Orphaned)';
      case 'duplicate': return 'Duplicate Callback Alert';
      case 'delayed': return 'Delayed Callback Sync';
      default: return status;
    }
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

  const formatReportDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8 font-sans">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <ShieldCheck className="text-status-success" size={24} />
            Reconciliation Center
          </h2>
          <p className="text-sm text-brand-text/50 mt-1">Match M-Pesa settlements against system invoices and accounts.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={handleRunReconciliation}
            disabled={isReconciling}
            className="flex-1 sm:flex-none px-4 py-2 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
              <h3 className="font-semibold text-brand-text/70 text-sm">Perfect Matches (Today)</h3>
            </div>
            <p className="text-3xl font-bold text-brand-text mt-2">{matchCount}</p>
            <p className="text-xs text-status-success mt-3 font-semibold flex items-center gap-1">
              <span>Automatic webhook mapping active</span>
            </p>
          </div>
          <div className="flex-1 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
                <AlertCircle size={20} />
              </div>
              <h3 className="font-semibold text-brand-text/70 text-sm">Active Discrepancies</h3>
            </div>
            <p className="text-3xl font-bold text-status-danger mt-2">{discrepancies.length}</p>
            <p className="text-xs text-status-error mt-3 font-semibold">
              Requires manual administrator review
            </p>
          </div>
        </div>
      </div>

      {/* Discrepancy / History Tabs */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm flex flex-col min-h-[300px]">
        <div className="border-b border-brand-border px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-bg/30">
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('discrepancies')}
              className={`text-sm font-semibold flex items-center gap-2 pb-4 -mb-4 border-b-2 transition-colors ${
                activeTab === 'discrepancies' 
                  ? 'border-brand-accent text-brand-text' 
                  : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
              }`}
            >
              <AlertCircle size={16} className={activeTab === 'discrepancies' ? 'text-status-error' : ''} />
              Active Discrepancies ({discrepancies.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`text-sm font-semibold flex items-center gap-2 pb-4 -mb-4 border-b-2 transition-colors ${
                activeTab === 'history' 
                  ? 'border-brand-accent text-brand-text' 
                  : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
              }`}
            >
              <FileText size={16} />
              Reconciliation Run History
            </button>
          </div>
          
          {activeTab === 'discrepancies' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ref/phone..."
                  className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1.5 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm h-[34px] transition-all"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="overflow-auto min-h-[300px]">
          {activeTab === 'discrepancies' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-brand-bg/50 border-b border-brand-border">
                <tr className="text-brand-text/50">
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-6 font-medium">M-Pesa Receipt</th>
                  <th className="py-3 px-6 font-medium">Customer Ref</th>
                  <th className="py-3 px-6 font-medium">Phone Number</th>
                  <th className="py-3 px-6 font-medium text-right">Amount (KES)</th>
                  <th className="py-3 px-6 font-medium">Issue Type</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-brand-text/50">
                        <RefreshCw size={16} className="animate-spin text-brand-accent" />
                        <span>Loading discrepancies...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredDiscrepancies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-brand-text/40 italic">
                      Zero unresolved discrepancies. System is fully balanced!
                    </td>
                  </tr>
                ) : (
                  filteredDiscrepancies.map((item) => (
                    <tr key={item.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                      <td className="py-4 px-6 text-brand-text/70">{formatDate(item.occurred_at)}</td>
                      <td className="py-4 px-6 font-mono text-brand-text/90">{item.external_transaction_id || 'N/A'}</td>
                      <td className="py-4 px-6 font-mono text-brand-text/90">{item.reference || 'N/A'}</td>
                      <td className="py-4 px-6 font-mono text-brand-text/90">{item.phone_number}</td>
                      <td className="py-4 px-6 font-semibold text-brand-text text-right">
                        {item.amount.toLocaleString()}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-status-danger border border-rose-500/20">
                          {getDiscrepancyLabel(item.status)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button 
                          onClick={() => setSelectedDiscrepancy(item)}
                          className="px-3 py-1.5 bg-brand-accent/10 border border-brand-accent/20 text-brand-accent hover:bg-brand-accent/20 rounded text-xs font-semibold transition-all"
                        >
                          Resolve Match
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-brand-bg/50 border-b border-brand-border">
                <tr className="text-brand-text/50">
                  <th className="py-3 px-6 font-medium">Run Date</th>
                  <th className="py-3 px-6 font-medium text-right">Expected Ledger (KES)</th>
                  <th className="py-3 px-6 font-medium text-right">Actual Paybill Balance (KES)</th>
                  <th className="py-3 px-6 font-medium text-right">Variance</th>
                  <th className="py-3 px-6 font-medium">Run Outcome</th>
                  <th className="py-3 px-6 font-medium text-right">Generated At</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-brand-text/50">
                        <RefreshCw size={16} className="animate-spin text-brand-accent" />
                        <span>Loading history...</span>
                      </div>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-brand-text/40 italic">
                      No reconciliation runs logged.
                    </td>
                  </tr>
                ) : (
                  history.map((rep) => (
                    <tr key={rep.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                      <td className="py-4 px-6 font-medium text-brand-text">{formatReportDate(rep.report_date)}</td>
                      <td className="py-4 px-6 text-right font-mono text-brand-text/80">{rep.expected_amount.toLocaleString()}</td>
                      <td className="py-4 px-6 text-right font-mono text-brand-text/80">{rep.actual_amount.toLocaleString()}</td>
                      <td className={`py-4 px-6 text-right font-mono font-semibold ${rep.variance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {rep.variance === 0 ? '0' : rep.variance.toLocaleString()}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          rep.status === 'MATCHED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {rep.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right text-brand-text/50 font-mono text-xs">{formatDate(rep.generated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manual Resolution Overlay Modal */}
      {selectedDiscrepancy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedDiscrepancy(null)} />
          
          <div className="bg-brand-panel border border-brand-border shadow-2xl rounded-2xl w-full max-w-md overflow-hidden relative z-50 p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
                  <ShieldCheck size={20} className="text-brand-accent" />
                  Manual Match Settlement
                </h3>
                <p className="text-xs text-brand-text/50 mt-1">Associate orphaned payment to a client account.</p>
              </div>
              <button 
                onClick={() => setSelectedDiscrepancy(null)}
                className="p-1 text-brand-text/40 hover:text-brand-text rounded-full hover:bg-brand-border/40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-brand-bg border border-brand-border rounded-xl p-4 space-y-2 text-sm text-brand-text/80 font-medium">
              <div className="flex justify-between">
                <span className="text-brand-text/40">Receipt ID:</span>
                <span className="font-mono text-brand-text">{selectedDiscrepancy.external_transaction_id || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/40">Reference Sent:</span>
                <span className="font-mono text-brand-text">{selectedDiscrepancy.reference || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-text/40">Customer Phone:</span>
                <span className="font-mono text-brand-text">{selectedDiscrepancy.phone_number}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-brand-text">Amount:</span>
                <span className="text-brand-accent">KES {selectedDiscrepancy.amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-brand-text/60 uppercase tracking-wide">Select Target Customer</label>
              <select 
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg py-2 px-3 text-sm text-brand-text focus:outline-none focus:border-brand-accent"
              >
                <option value="">-- Choose Account --</option>
                {customers.map(cust => (
                  <option key={cust.id} value={cust.id}>
                    {cust.full_name} ({cust.account_reference})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4 border-t border-brand-border justify-end">
              <button 
                onClick={() => setSelectedDiscrepancy(null)}
                className="px-4 py-2 border border-brand-border hover:bg-brand-border text-brand-text text-sm font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleResolveManual}
                disabled={resolving || !selectedCustomerId}
                className="px-4 py-2 bg-brand-accent hover:opacity-90 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                {resolving ? 'Settling...' : 'Apply Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
