import { useState, useEffect, useMemo } from 'react';
import { Smartphone, Send, CheckCircle2, XCircle, Clock, Search, Filter, ArrowUpRight, Link as LinkIcon, ExternalLink, Upload, Calendar, Power, Trash2, Copy, MoreVertical, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigation } from '../components/NavigationContext';
import { supabase } from '../utils/supabaseClient';

interface STKRequest {
  id: string;
  phone_number: string;
  amount: number;
  reference: string | null;
  status: string;
  occurred_at: string;
}

interface PaymentLink {
  id: string;
  title: string;
  desc: string;
  amount: string;
  ref: string;
  logo: string;
  status: 'Active' | 'Disabled';
  expiry: string | null;
}

const DEFAULT_LINKS: PaymentLink[] = [
  { 
    id: 'link-1',
    title: 'Annual Server Subscription', 
    desc: 'Payment for Annual Server Subscription',
    amount: '5000', 
    ref: 'SUB-2026-05', 
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    status: 'Active',
    expiry: '2026-12-31'
  },
  { 
    id: 'link-2',
    title: 'Consultation Fee', 
    desc: 'Standard consultation fee block',
    amount: 'Open', 
    ref: 'CONSULT', 
    logo: '',
    status: 'Active',
    expiry: null
  }
];

export function STKPushPage() {
  const { setActivePage } = useNavigation();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // Real-time Requests
  const [requests, setRequests] = useState<STKRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment Link Generator State
  const [linkTitle, setLinkTitle] = useState('');
  const [linkLogo, setLinkLogo] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [linkAmount, setLinkAmount] = useState('');
  const [linkRef, setLinkRef] = useState('');
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [activeLinkMenu, setActiveLinkMenu] = useState<string | null>(null);

  // Load payment links from local storage or defaults
  useEffect(() => {
    const saved = localStorage.getItem('skylink_payment_links');
    if (saved) {
      try {
        setPaymentLinks(JSON.parse(saved));
      } catch {
        setPaymentLinks(DEFAULT_LINKS);
      }
    } else {
      setPaymentLinks(DEFAULT_LINKS);
      localStorage.setItem('skylink_payment_links', JSON.stringify(DEFAULT_LINKS));
    }
  }, []);

  const fetchSTKPushes = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('transactions')
        .select('id, phone_number, amount, reference, status, occurred_at')
        .eq('transaction_type', 'STK_PUSH')
        .order('occurred_at', { ascending: false });

      if (err) throw err;
      
      const mapped: STKRequest[] = (data || []).map(tx => ({
        id: tx.id,
        phone_number: tx.phone_number,
        amount: Number(tx.amount),
        reference: tx.reference,
        status: tx.status,
        occurred_at: tx.occurred_at
      }));

      setRequests(mapped);
    } catch (e: any) {
      console.error('Error fetching STK pushes:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSTKPushes();

    const channel = supabase
      .channel('stk-pushes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.STK_PUSH' },
        () => {
          fetchSTKPushes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const success = requests.filter(r => r.status === 'completed').length;
    const failed = requests.filter(r => r.status === 'failed').length;
    const successRate = total > 0 ? ((success / (success + failed || 1)) * 100).toFixed(1) : '0.0';

    return {
      total,
      successRate,
      failed
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchSearch = 
        req.phone_number.includes(searchQuery) ||
        (req.reference || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'All' || req.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [requests, searchQuery, filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          amount: Number(amount),
          reference: reference
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to dispatch STK push');
      }

      const result = await response.json();
      alert(`STK Push dispatched successfully! Request ID: ${result.CheckoutRequestID}`);

      // Reset form fields
      setPhone('');
      setAmount('');
      setReference('');
      setDescription('');
    } catch (err: any) {
      console.error('STK push error:', err);
      alert(`STK push error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle || !linkRef) {
      alert('Please provide a title and reference.');
      return;
    }

    const newLink: PaymentLink = {
      id: `link-${Date.now()}`,
      title: linkTitle,
      desc: linkDesc || 'No description provided.',
      amount: linkAmount || 'Open',
      ref: linkRef,
      logo: linkLogo,
      status: 'Active',
      expiry: null
    };

    const updated = [newLink, ...paymentLinks];
    setPaymentLinks(updated);
    localStorage.setItem('skylink_payment_links', JSON.stringify(updated));

    // Reset Form
    setLinkTitle('');
    setLinkLogo('');
    setLinkDesc('');
    setLinkAmount('');
    setLinkRef('');
    alert('Payment link generated!');
  };

  const deleteLink = (id: string) => {
    const updated = paymentLinks.filter(l => l.id !== id);
    setPaymentLinks(updated);
    localStorage.setItem('skylink_payment_links', JSON.stringify(updated));
    setActiveLinkMenu(null);
  };

  const toggleLinkStatus = (id: string) => {
    const updated = paymentLinks.map(l => {
      if (l.id === id) {
        return { ...l, status: l.status === 'Active' ? 'Disabled' as const : 'Active' as const };
      }
      return l;
    });
    setPaymentLinks(updated);
    localStorage.setItem('skylink_payment_links', JSON.stringify(updated));
    setActiveLinkMenu(null);
  };

  const getLinkUrl = (link: PaymentLink) => {
    const path = `${window.location.origin}/checkout`;
    const params = new URLSearchParams({
      amount: link.amount === 'Open' ? '100' : link.amount,
      ref: link.ref,
      title: link.title,
      desc: link.desc,
      logo: link.logo
    });
    return `${path}?${params.toString()}`;
  };

  const handleCopyLink = (link: PaymentLink) => {
    const url = getLinkUrl(link);
    navigator.clipboard.writeText(url);
    alert('Payment URL copied to clipboard');
  };

  const handlePreviewLink = (link: PaymentLink) => {
    const url = getLinkUrl(link);
    // Standard react-router is bypassed for simple demo flow using custom navigation
    window.history.pushState({}, '', url);
    setActivePage('Payment Checkout');
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8 font-sans">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <Send size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Pushes</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text mt-2">{metrics.total}</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Completion Success</h3>
          </div>
          <p className="text-2xl font-bold text-status-success mt-2">{metrics.successRate}%</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <XCircle size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Failed Pushes</h3>
          </div>
          <p className="text-2xl font-bold text-status-danger mt-2">{metrics.failed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Initiate Form */}
        <div className="lg:col-span-1">
          <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-brand-border bg-brand-bg/30">
              <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <Smartphone size={20} className="text-brand-accent" />
                Initiate STK Push
              </h3>
              <p className="text-sm text-brand-text/50 mt-1">Send a prompt directly to a customer's phone.</p>
            </div>
            <div className="p-6 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Phone Number (2547...)</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="2547XXXXXXXX"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Amount (KES)</label>
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
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Account Reference</label>
                  <input
                    type="text"
                    required
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. INV-001"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Transaction Description</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Server hosting fee"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={18} />
                      Send Prompt
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
              <h3 className="text-lg font-bold text-brand-text">Push Requests Trace</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded-lg py-1 px-3 text-xs text-brand-text focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>

                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search phone, ref..."
                    className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm h-[34px] transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-brand-panel z-10 shadow-[0_1px_0_var(--color-brand-border)]">
                  <tr className="text-brand-text/50">
                    <th className="pb-3 pt-4 px-6 font-medium">Time</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Phone</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Amount</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Reference</th>
                    <th className="pb-3 pt-4 px-6 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <RefreshCw size={24} className="text-brand-accent animate-spin" />
                          <span className="text-brand-text/60">Fetching pushes...</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-status-danger">
                        Failed to load: {error}
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-brand-text/40">
                        No push history found.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => (
                      <tr key={req.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                        <td className="py-3 px-6 text-brand-text/70">{formatDate(req.occurred_at)}</td>
                        <td className="py-3 px-6 font-mono text-brand-text/95">{req.phone_number}</td>
                        <td className="py-3 px-6 font-medium text-brand-text">
                          KES {req.amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-6 text-brand-text/80">{req.reference || 'N/A'}</td>
                        <td className="py-3 px-6">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            req.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {req.status === 'completed' && <CheckCircle2 size={12} />}
                            {req.status === 'pending' && <Clock size={12} />}
                            {req.status === 'failed' && <XCircle size={12} />}
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-brand-border text-center bg-brand-bg/10 shrink-0">
              <button 
                onClick={() => setActivePage('Transactions')}
                className="text-sm font-semibold text-brand-accent hover:opacity-80 transition-colors flex items-center justify-center gap-1 w-full"
              >
                View Full Audit Logs <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Links Section */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-brand-border flex items-center justify-between bg-brand-bg/30">
          <div>
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
              <LinkIcon size={20} className="text-brand-accent" />
              Generate Payment Link
            </h3>
            <p className="text-sm text-brand-text/60 mt-1">Create shareable URLs for quick collections.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-3xl">
            <form onSubmit={handleGenerateLink} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Page Title</label>
                  <input
                    type="text"
                    required
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="e.g. Annual Subscription"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Logo URL</label>
                  <input
                    type="url"
                    value={linkLogo}
                    onChange={(e) => setLinkLogo(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={linkDesc}
                  onChange={(e) => setLinkDesc(e.target.value)}
                  placeholder="What is this payment for?"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Amount (KES)</label>
                  <input
                    type="number"
                    value={linkAmount}
                    onChange={(e) => setLinkAmount(e.target.value)}
                    placeholder="Leave blank for open amount"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Fixed Reference</label>
                  <input
                    type="text"
                    required
                    value={linkRef}
                    onChange={(e) => setLinkRef(e.target.value)}
                    placeholder="e.g. SUB-2026-05"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto mt-2 px-6 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
              >
                Generate Link
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Generated Links Section */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30">
          <h3 className="text-lg font-bold text-brand-text">Generated Links</h3>
          <p className="text-sm text-brand-text/60 mt-1">Manage and share generated URLs.</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paymentLinks.map((link) => (
            <div key={link.id} className="bg-brand-bg border border-brand-border rounded-xl overflow-hidden flex flex-col relative group">
              <div className="p-5 border-b border-brand-border/50 text-center relative">
                <div className="absolute top-3 right-3 flex gap-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${link.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {link.status}
                  </span>
                </div>
                <div className="w-14 h-14 mx-auto rounded-xl overflow-hidden mb-3 border border-brand-border shadow-sm bg-brand-panel flex items-center justify-center">
                  {link.logo ? (
                    <img src={link.logo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-brand-text/30 font-bold text-xl">{link.title.charAt(0)}</span>
                  )}
                </div>
                <h5 className="font-bold text-brand-text leading-tight">{link.title}</h5>
                <p className="text-xs text-brand-text/50 mt-2 line-clamp-2 min-h-[32px]">{link.desc}</p>
                
                <div className="mt-4 p-3 bg-brand-panel border border-brand-border/50 rounded-lg flex justify-between items-center text-left">
                   <div>
                     <p className="text-[10px] text-brand-text/40 uppercase tracking-wider font-semibold">Amount</p>
                     <p className="font-bold text-brand-text mt-0.5">{link.amount === 'Open' ? 'Any Amount' : `KES ${Number(link.amount).toLocaleString()}`}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] text-brand-text/40 uppercase tracking-wider font-semibold">Ref</p>
                     <p className="font-mono text-xs text-brand-text/80 mt-0.5">{link.ref}</p>
                   </div>
                </div>
              </div>
              
              <div className="p-4 flex-1 flex items-end">
                <div className="w-full grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleCopyLink(link)}
                    className="px-3 py-2 bg-brand-panel hover:bg-brand-border border border-brand-border rounded-lg text-brand-text text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    onClick={() => handlePreviewLink(link)}
                    disabled={link.status !== 'Active'}
                    className="px-3 py-2 bg-brand-accent hover:opacity-90 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ExternalLink size={14} /> Preview
                  </button>
                </div>
              </div>
              
              <div className="px-4 py-3 border-t border-brand-border/50 flex items-center justify-between bg-brand-panel">
                <div className="flex items-center text-xs text-brand-text/50 gap-1.5">
                  <Calendar size={12} />
                  {link.expiry ? `Expires ${link.expiry}` : 'No Expiry'}
                </div>
                
                <div className="relative">
                  <button 
                    onClick={() => setActiveLinkMenu(activeLinkMenu === link.id ? null : link.id)}
                    className="p-1 text-brand-text/40 hover:text-brand-text hover:bg-brand-border rounded"
                  >
                    <MoreVertical size={14} />
                  </button>
                  
                  {activeLinkMenu === link.id && (
                    <>
                      <div className="fixed inset-0 z-45" onClick={() => setActiveLinkMenu(null)} />
                      <div className="absolute right-0 bottom-full mb-1 w-40 bg-brand-panel border border-brand-border shadow-xl rounded-lg z-50 overflow-hidden text-left py-1 text-xs">
                        <button 
                          onClick={() => toggleLinkStatus(link.id)}
                          className="w-full px-3 py-2 text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors"
                        >
                          <Power size={12} /> {link.status === 'Active' ? 'Disable Link' : 'Enable Link'}
                        </button>
                        <div className="h-px bg-brand-border my-1" />
                        <button 
                          onClick={() => deleteLink(link.id)}
                          className="w-full px-3 py-2 text-status-danger hover:bg-status-danger/10 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={12} /> Delete Link
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
