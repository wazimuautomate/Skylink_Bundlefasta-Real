import React, { useState, useEffect, useMemo } from 'react';
import { Smartphone, Send, CheckCircle2, XCircle, Clock, Search, ArrowUpRight, Link as LinkIcon, ExternalLink, Upload, Calendar, Power, Trash2, Copy, MoreVertical, RefreshCw, X, Share2 } from 'lucide-react';
import { useNavigation } from '../components/NavigationContext';
import { supabase } from '../utils/supabaseClient';
import { motion, AnimatePresence } from 'motion/react';

interface STKRequest {
  id: string;
  phone_number: string;
  amount: number;
  reference: string | null;
  status: string;
  occurred_at: string;
  checkout_request_id: string | null;
}

interface PaymentLink {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  amount: number | null;
  fixed_reference: string;
  logo_url: string | null;
  is_active: boolean;
  expiry_date: string | null;
  created_at: string;
}

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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [linkDesc, setLinkDesc] = useState('');
  const [linkAmount, setLinkAmount] = useState('');
  const [linkRef, setLinkRef] = useState('');
  const [linkExpiry, setLinkExpiry] = useState('');
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [activeLinkMenu, setActiveLinkMenu] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sharingLink, setSharingLink] = useState<PaymentLink | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // STK Query state
  const [queryingId, setQueryingId] = useState<string | null>(null); // tracks which row is being queried
  const [manualQueryId, setManualQueryId] = useState(''); // manual CheckoutRequestID input
  const [isManualQuerying, setIsManualQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<{ success: boolean; message: string; reconciled?: boolean; details?: any } | null>(null);

  const fetchSTKPushes = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('transactions')
        .select('id, phone_number, amount, reference, status, occurred_at, checkout_request_id')
        .eq('transaction_type', 'STK_PUSH')
        .order('occurred_at', { ascending: false });

      if (err) throw err;
      
      const mapped: STKRequest[] = (data || []).map(tx => ({
        id: tx.id,
        phone_number: tx.phone_number,
        amount: Number(tx.amount),
        reference: tx.reference,
        status: tx.status,
        occurred_at: tx.occurred_at,
        checkout_request_id: tx.checkout_request_id || null
      }));

      setRequests(mapped);
    } catch (e: any) {
      console.error('Error fetching STK pushes:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentLinks = async () => {
    try {
      const { data, error: err } = await supabase
        .from('payment_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setPaymentLinks(data || []);
    } catch (e: any) {
      console.error('Error fetching payment links:', e);
    }
  };

  useEffect(() => {
    fetchSTKPushes();
    fetchPaymentLinks();

    const channel = supabase
      .channel('stk-pushes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: 'transaction_type=eq.STK_PUSH' },
        () => {
          fetchSTKPushes();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_links' },
        () => {
          fetchPaymentLinks();
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
          reference: reference,
          description: description
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle || !linkRef) {
      alert('Please provide a title and reference.');
      return;
    }

    if (linkExpiry && new Date(linkExpiry) <= new Date()) {
      alert('Expiry date and time must be in the future.');
      return;
    }

    setUploadingLogo(true);
    let uploadedLogoUrl = '';

    try {
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `logos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('site-logos')
          .upload(filePath, logoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('site-logos')
          .getPublicUrl(filePath);

        uploadedLogoUrl = publicUrl;
      }

      // Generate slug
      const cleanSlug = linkTitle.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

      const { error: insertError } = await supabase
        .from('payment_links')
        .insert({
          title: linkTitle,
          slug: cleanSlug,
          description: linkDesc || null,
          amount: linkAmount ? Number(linkAmount) : null,
          fixed_reference: linkRef,
          logo_url: uploadedLogoUrl || null,
          is_active: true,
          expiry_date: linkExpiry ? new Date(linkExpiry).toISOString() : null
        });

      if (insertError) throw insertError;

      // Reset Form
      setLinkTitle('');
      setLogoFile(null);
      setLinkDesc('');
      setLinkAmount('');
      setLinkRef('');
      setLinkExpiry('');
      alert('Payment link generated successfully!');
      fetchPaymentLinks();
    } catch (err: any) {
      console.error('Error generating link:', err);
      alert(`Error generating payment link: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const deleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment link?')) return;
    try {
      const { error: err } = await supabase
        .from('payment_links')
        .delete()
        .eq('id', id);

      if (err) throw err;
      setActiveLinkMenu(null);
      fetchPaymentLinks();
    } catch (e: any) {
      console.error('Error deleting link:', e);
      alert(`Error deleting link: ${e.message}`);
    }
  };

  const toggleLinkStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error: err } = await supabase
        .from('payment_links')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (err) throw err;
      setActiveLinkMenu(null);
      fetchPaymentLinks();
    } catch (e: any) {
      console.error('Error updating status:', e);
      alert(`Error updating link status: ${e.message}`);
    }
  };

  const getLinkUrl = (link: PaymentLink) => {
    return `${window.location.origin}/checkout?slug=${link.slug}`;
  };

  const handleShareLink = async (link: PaymentLink) => {
    const url = getLinkUrl(link);
    const text = link.description || `Payment link for ${link.title}`;
    
    const shareData = {
      title: link.title,
      text: text,
      url: url
    };
    
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing natively:', err);
        } else {
          return;
        }
      }
    }
    
    setSharingLink(link);
    setCopiedLink(false);
  };

  const handlePreviewLink = (link: PaymentLink) => {
    const url = getLinkUrl(link);
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

  // Query a specific STK Push row by CheckoutRequestID (per-row inline query)
  const handleQueryRowStatus = async (req: STKRequest) => {
    if (!req.checkout_request_id) {
      alert('No CheckoutRequestID available for this transaction.');
      return;
    }
    setQueryingId(req.id);
    try {
      const response = await fetch('/api/mpesa/stkpush/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutRequestId: req.checkout_request_id })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(`Query failed: ${data.error || data.resultDesc}`);
      } else {
        const msg = data.resolved
          ? `✓ Reconciled! ResultCode ${data.resultCode}: ${data.resultDesc}`
          : `Query returned ResultCode ${data.resultCode}: ${data.resultDesc} (no status change needed)`;
        alert(msg);
        fetchSTKPushes();
      }
    } catch (err: any) {
      alert(`Query error: ${err.message}`);
    } finally {
      setQueryingId(null);
    }
  };

  // Manual query by CheckoutRequestID from the standalone form
  const handleManualQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQueryId.trim()) return;
    setIsManualQuerying(true);
    setQueryResult(null);
    try {
      const response = await fetch('/api/mpesa/stkpush/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutRequestId: manualQueryId.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        setQueryResult({ success: false, message: data.error || data.resultDesc || 'Query failed.', details: data });
      } else {
        setQueryResult({
          success: true,
          message: `ResultCode ${data.resultCode}: ${data.resultDesc}`,
          reconciled: !!data.resolved,
          details: data
        });
        if (data.resolved) fetchSTKPushes();
      }
    } catch (err: any) {
      setQueryResult({ success: false, message: err.message || 'Network error.', details: null });
    } finally {
      setIsManualQuerying(false);
    }
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
                    <th className="pb-3 pt-4 px-6 font-medium">Actions</th>
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
                      <td colSpan={6} className="py-20 text-center text-brand-text/40">
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
                        <td className="py-3 px-6">
                          {req.status === 'pending' && req.checkout_request_id && (
                            <button
                              onClick={() => handleQueryRowStatus(req)}
                              disabled={queryingId === req.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-panel hover:bg-brand-border border border-brand-border rounded-lg text-xs font-semibold text-brand-text transition-colors disabled:opacity-50"
                            >
                              {queryingId === req.id
                                ? <RefreshCw size={12} className="animate-spin" />
                                : <Search size={12} />}
                              Query
                            </button>
                          )}
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
                  <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Logo Image Upload</label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="logo-file-upload"
                    />
                    <label
                      htmlFor="logo-file-upload"
                      className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm cursor-pointer hover:border-brand-accent transition-all flex items-center justify-between overflow-hidden text-ellipsis whitespace-nowrap"
                    >
                      <span className="text-brand-text/50 truncate">
                        {logoFile ? logoFile.name : 'Upload logo image...'}
                      </span>
                      <Upload size={16} className="text-brand-text/40 flex-shrink-0" />
                    </label>
                    {logoFile && (
                      <button
                        type="button"
                        onClick={() => setLogoFile(null)}
                        className="px-2 bg-rose-500/10 border border-rose-500/20 text-status-danger rounded-lg text-xs"
                      >
                        Clear
                      </button>
                    )}
                  </div>
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
              <div>
                <label className="block text-sm font-semibold text-brand-text/80 mb-1.5">Link Expiry Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={linkExpiry}
                  onChange={(e) => setLinkExpiry(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent transition-all font-sans"
                />
                <span className="text-[10px] text-brand-text/40 mt-1 block">Specify when this checkout link should stop accepting payments. Leave blank to never expire.</span>
              </div>
              <button
                type="submit"
                disabled={uploadingLogo}
                className="w-full sm:w-auto mt-2 px-6 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploadingLogo ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Generate Link'
                )}
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
          {paymentLinks.length === 0 ? (
            <div className="col-span-full py-10 text-center text-brand-text/40 italic">
              No payment links generated yet. Use the form above to generate your first collection link.
            </div>
          ) : (
            paymentLinks.map((link) => (
              <div key={link.id} className="bg-brand-bg border border-brand-border rounded-xl overflow-hidden flex flex-col relative group">
                <div className="p-5 border-b border-brand-border/50 text-center relative">
                  <div className="absolute top-3 right-3 flex gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${link.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {link.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="w-14 h-14 mx-auto rounded-xl overflow-hidden mb-3 border border-brand-border shadow-sm bg-brand-panel flex items-center justify-center">
                    {link.logo_url ? (
                      <img src={link.logo_url} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-brand-text/30 font-bold text-xl">{link.title.charAt(0)}</span>
                    )}
                  </div>
                  <h5 className="font-bold text-brand-text leading-tight">{link.title}</h5>
                  <p className="text-xs text-brand-text/50 mt-2 line-clamp-2 min-h-[32px]">{link.description || 'No description provided.'}</p>
                  
                  <div className="mt-4 p-3 bg-brand-panel border border-brand-border/50 rounded-lg flex justify-between items-center text-left">
                     <div>
                       <p className="text-[10px] text-brand-text/40 uppercase tracking-wider font-semibold">Amount</p>
                       <p className="font-bold text-brand-text mt-0.5">
                         {link.amount && Number(link.amount) > 0 ? `KES ${Number(link.amount).toLocaleString()}` : 'Flexible'}
                       </p>
                     </div>
                     <div className="text-right">
                       <p className="text-[10px] text-brand-text/40 uppercase tracking-wider font-semibold">Ref</p>
                       <p className="font-mono text-xs text-brand-text/80 mt-0.5">{link.fixed_reference}</p>
                     </div>
                  </div>
                </div>
                
                <div className="p-4 flex-1 flex items-end">
                  <div className="w-full grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => handleShareLink(link)}
                      className="px-3 py-2 bg-brand-panel hover:bg-brand-border border border-brand-border rounded-lg text-brand-text text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Share2 size={14} /> Share
                    </button>
                    <button
                      onClick={() => handlePreviewLink(link)}
                      disabled={!link.is_active}
                      className="px-3 py-2 bg-brand-accent hover:opacity-90 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ExternalLink size={14} /> Preview
                    </button>
                  </div>
                </div>
                
                <div className="px-4 py-3 border-t border-brand-border/50 flex items-center justify-between bg-brand-panel">
                  <div className="flex items-center text-xs gap-1.5">
                    {link.expiry_date ? (
                      (() => {
                        const isExpired = new Date(link.expiry_date) < new Date();
                        return (
                          <span className={`flex items-center gap-1.5 ${isExpired ? 'text-status-danger font-semibold' : 'text-brand-text/50'}`}>
                            {isExpired ? <Clock size={12} className="animate-pulse" /> : <Calendar size={12} />}
                            {isExpired ? 'Expired' : `Expires ${formatDate(link.expiry_date)}`}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-brand-text/50 flex items-center gap-1.5">
                        <Calendar size={12} />
                        No Expiry
                      </span>
                    )}
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
                            onClick={() => toggleLinkStatus(link.id, link.is_active)}
                            className="w-full px-3 py-2 text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors"
                          >
                            <Power size={12} /> {link.is_active ? 'Disable Link' : 'Enable Link'}
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
            ))
          )}
        </div>
      </div>
      {/* STK Push Query — Manual Status Check & Reconciliation */}
      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
            <Search size={20} className="text-brand-accent" />
            M-Pesa Express Query
          </h3>
          <p className="text-sm text-brand-text/50 mt-1">Manually check the status of any STK Push request by CheckoutRequestID. Reconciles pending transactions automatically if a result is found.</p>
        </div>
        <div className="p-6">
          <div className="max-w-xl">
            <form onSubmit={handleManualQuery} className="flex gap-3">
              <input
                type="text"
                required
                value={manualQueryId}
                onChange={(e) => setManualQueryId(e.target.value)}
                placeholder="Enter CheckoutRequestID (e.g. ws_CO_...)" 
                className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-sm"
              />
              <button
                type="submit"
                disabled={isManualQuerying}
                className="px-5 py-2 bg-brand-accent hover:opacity-90 text-black font-bold rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 text-sm shrink-0"
              >
                {isManualQuerying ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                Query
              </button>
            </form>

            {queryResult && (
              <div className={`mt-4 p-4 rounded-xl border ${
                queryResult.success
                  ? queryResult.reconciled
                    ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-400'
                    : 'bg-sky-500/5 border-sky-500/25 text-sky-400'
                  : 'bg-rose-500/5 border-rose-500/25 text-rose-400'
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg mt-0.5">
                    {queryResult.success ? (queryResult.reconciled ? '✓' : 'ℹ') : '✕'}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {queryResult.success
                        ? queryResult.reconciled ? 'Reconciled Successfully' : 'Query Successful'
                        : 'Query Failed'}
                    </p>
                    <p className="text-xs mt-1 opacity-80">{queryResult.message}</p>
                    {queryResult.reconciled && (
                      <p className="text-xs mt-1 font-semibold opacity-90">Transaction status has been updated in the database.</p>
                    )}
                    {queryResult.details && (
                      <details className="mt-3">
                        <summary className="text-[10px] font-mono cursor-pointer opacity-60 hover:opacity-100">View raw response ▾</summary>
                        <pre className="mt-2 p-3 bg-brand-bg rounded-lg text-[9px] font-mono text-brand-text/70 overflow-x-auto max-h-[160px] leading-relaxed border border-brand-border">
                          {JSON.stringify(queryResult.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-brand-text/40">
              Tip: Pending transactions in the history table above also show an inline <strong className="text-brand-text/60">Query</strong> button.
            </p>
          </div>
        </div>
      </div>

      {/* Fallback Share Modal */}
      <AnimatePresence>
        {sharingLink && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSharingLink(null)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-55 w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col font-sans"
            >
              <div className="flex justify-between items-center pb-4 border-b border-brand-border">
                <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
                  <Share2 className="text-brand-accent" size={20} />
                  Share Payment Link
                </h3>
                <button
                  onClick={() => setSharingLink(null)}
                  className="p-1 text-brand-text/50 hover:text-brand-text hover:bg-brand-border/50 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Link Details Preview */}
              <div className="my-5 p-4 bg-brand-bg rounded-xl border border-brand-border/60 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg border border-brand-border overflow-hidden bg-brand-panel flex items-center justify-center flex-shrink-0">
                  {sharingLink.logo_url ? (
                    <img src={sharingLink.logo_url} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-brand-text/30 font-bold text-lg">{sharingLink.title.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-brand-text truncate leading-snug">{sharingLink.title}</h4>
                  <p className="text-xs text-brand-text/50 truncate mt-0.5">
                    {sharingLink.amount && Number(sharingLink.amount) > 0 ? `KES ${Number(sharingLink.amount).toLocaleString()}` : 'Flexible amount'} • Ref: {sharingLink.fixed_reference}
                  </p>
                </div>
              </div>

              {/* Share Options Grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* WhatsApp */}
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Pay for ${sharingLink.title}:\n${getLinkUrl(sharingLink)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-400 rounded-xl font-semibold text-sm transition-all justify-center cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 12.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>

                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getLinkUrl(sharingLink))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/30 text-blue-400 rounded-xl font-semibold text-sm transition-all justify-center cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </a>

                {/* Email */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `Payment Link: ${sharingLink.title}`
                  )}&body=${encodeURIComponent(
                    `${sharingLink.description || 'Payment request'}\n\nPlease pay here: ${getLinkUrl(sharingLink)}`
                  )}`}
                  className="flex items-center gap-3 p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-400 rounded-xl font-semibold text-sm transition-all justify-center cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  Email
                </a>

                {/* Copy Link */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(getLinkUrl(sharingLink));
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="flex items-center gap-3 p-3 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/20 hover:border-brand-accent/30 text-brand-accent rounded-xl font-semibold text-sm transition-all justify-center cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              {/* Raw Link Input */}
              <div className="relative mt-2">
                <input
                  type="text"
                  readOnly
                  value={getLinkUrl(sharingLink)}
                  className="w-full bg-brand-bg border border-brand-border rounded-xl pl-4 pr-12 py-3 text-xs text-brand-text/70 focus:outline-none font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(getLinkUrl(sharingLink));
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-brand-border rounded-lg text-brand-text/50 hover:text-brand-text transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
