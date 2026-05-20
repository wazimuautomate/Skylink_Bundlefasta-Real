import React, { useState, useEffect } from 'react';
import { Smartphone, ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export function PaymentCheckoutPage() {
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');

  // Extract slug from query param or pathname
  const getSlugFromUrl = () => {
    const query = new URLSearchParams(window.location.search);
    const querySlug = query.get('slug');
    if (querySlug) return querySlug;

    // Check pathname (e.g. /pay/harambee or /checkout/harambee)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && (pathParts[0] === 'pay' || pathParts[0] === 'checkout')) {
      return pathParts[1];
    }
    return null;
  };

  const slug = getSlugFromUrl();

  // Legacy fallback parameters if no slug is provided
  const query = new URLSearchParams(window.location.search);
  const fallbackAmount = Number(query.get('amount')) || 5000;
  const fallbackReference = query.get('ref') || 'SUB-2026-05';
  const fallbackTitle = query.get('title') || 'Acme Technologies Ltd';
  const fallbackDescription = query.get('desc') || 'Payment for Annual Server Subscription';
  const fallbackLogo = query.get('logo') || 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80';

  // DB payment link state
  const [paymentLink, setPaymentLink] = useState<any>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [loadingLink, setLoadingLink] = useState(!!slug);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [hasPaid, setHasPaid] = useState(slug ? sessionStorage.getItem('paid_' + slug) === 'true' : false);

  const handleClose = () => {
    window.close();
    setTimeout(() => {
      alert("Browser security blocked automatic closing. You can now close this tab manually.");
    }, 500);
  };

  useEffect(() => {
    if (!slug) return;

    async function fetchPaymentLink() {
      try {
        setLoadingLink(true);
        const { data, error } = await supabase
          .from('payment_links')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (error) throw error;
        
        // Check expiry date
        if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
          setIsExpired(true);
          throw new Error('This payment link has expired.');
        }

        setPaymentLink(data);
      } catch (err: any) {
        console.error('Error fetching payment link:', err);
        if (err.message === 'This payment link has expired.') {
          setIsExpired(true);
        }
        setLoadError(err.message || 'Payment link not found or inactive.');
      } finally {
        setLoadingLink(false);
      }
    }

    fetchPaymentLink();
  }, [slug]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verify expiry date at submit time
    if (paymentLink && paymentLink.expiry_date && new Date(paymentLink.expiry_date) < new Date()) {
      setIsExpired(true);
      setLoadError('This payment link has expired.');
      return;
    }

    setIsSubmitting(true);
    setStatus('processing');
    
    try {
      const response = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          amount: displayAmount,
          reference: displayReference,
          paymentLinkId: paymentLink?.id || null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to trigger STK push');
      }

      if (slug) {
        sessionStorage.setItem(`paid_${slug}`, 'true');
      }
      setHasPaid(true);
      setIsSubmitting(false);
      setStatus('success');
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(`Payment request failed: ${err.message}`);
      setIsSubmitting(false);
      setStatus('idle');
    }
  };

  // Determine display values (DB values or fallbacks)
  const displayTitle = paymentLink ? paymentLink.title : fallbackTitle;
  const displayDescription = paymentLink ? (paymentLink.description || '') : fallbackDescription;
  const displayLogo = paymentLink ? paymentLink.logo_url : fallbackLogo;
  const displayReference = paymentLink ? paymentLink.fixed_reference : fallbackReference;
  const isFixedAmount = paymentLink ? paymentLink.amount !== null : true;
  const displayAmount = paymentLink 
    ? (paymentLink.amount !== null ? paymentLink.amount : Number(customAmount)) 
    : fallbackAmount;

  if (loadingLink) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-brand-bg">
        <div className="w-10 h-10 border-4 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Persistent success/thank-you view
  if (hasPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg/50 backdrop-blur-sm p-4 relative pt-16 font-sans">
        <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative p-8 text-center animate-fade-in">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-[40px] pointer-events-none"></div>
          
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full text-status-success flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
            <ShieldCheck size={32} className="animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-bold text-brand-text tracking-tight">Payment Successful!</h2>
          <p className="text-brand-text/50 mt-3 text-sm leading-relaxed">
            Thank you! Your payment process has been initiated successfully. An M-Pesa prompt has been sent to your phone.
          </p>
          
          <div className="mt-8 pt-6 border-t border-brand-border/60">
            <button 
              onClick={handleClose}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-brand-bg rounded-xl font-bold text-lg transition-all shadow-md shadow-emerald-500/20"
            >
              Close Page
            </button>
            <p className="text-[10px] text-brand-text/30 mt-3">
              If the page does not close automatically, you can safely close this browser tab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Expired link view
  if (isExpired || loadError === 'This payment link has expired.') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg/50 backdrop-blur-sm p-4 relative pt-16 font-sans">
        <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative p-8 text-center animate-fade-in">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-status-warning/10 rounded-full blur-[40px] pointer-events-none"></div>
          
          <div className="w-16 h-16 bg-status-warning/10 rounded-full text-status-warning flex items-center justify-center mx-auto mb-6 relative border border-status-warning/20">
            <Clock size={32} className="animate-pulse" />
          </div>
          
          <h2 className="text-2xl font-bold text-brand-text tracking-tight">This payment link has expired</h2>
          <p className="text-brand-text/50 mt-3 text-sm leading-relaxed">
            The merchant set an expiry time for this link, and it is no longer accepting payments. Please request a new payment link from the merchant.
          </p>
        </div>
      </div>
    );
  }

  // Generic invalid link view
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4 font-sans text-center">
        <div className="max-w-md bg-brand-panel border border-brand-border rounded-2xl p-8 shadow-xl">
          <div className="w-12 h-12 bg-rose-500/10 rounded-full text-status-danger flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={24} />
          </div>
          <h2 className="text-xl font-bold text-brand-text">Invalid Payment Link</h2>
          <p className="text-brand-text/60 mt-2 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center -m-4 md:-m-8 bg-brand-bg/50 backdrop-blur-sm p-4 relative pt-16 font-sans">
      <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="p-8 text-center border-b border-brand-border/50">
          <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden mb-4 border border-brand-border shadow-sm bg-brand-bg flex items-center justify-center">
            {displayLogo ? (
              <img src={displayLogo} alt="Shop Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-brand-text/30 font-bold text-3xl">{displayTitle.charAt(0)}</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-brand-text">{displayTitle}</h2>
          <p className="text-brand-text/50 text-sm mt-1">{displayDescription}</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-brand-bg rounded-xl p-4 flex justify-between items-center border border-brand-border">
            <div>
              <p className="text-xs text-brand-text/40 font-semibold uppercase tracking-wider">Amount Due</p>
              <p className="text-2xl font-bold text-brand-accent mt-0.5">
                {isFixedAmount ? `KES ${displayAmount.toLocaleString()}` : 'Flexible'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-brand-text/40 font-semibold uppercase tracking-wider">Ref</p>
              <p className="text-brand-text font-mono font-semibold text-sm mt-1">{displayReference}</p>
            </div>
          </div>

          <form onSubmit={handlePay} className="space-y-4">
            {!isFixedAmount && (
              <div>
                <label className="block text-sm font-medium text-brand-text/80 mb-1.5">
                  Amount to Pay (KES)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter custom amount"
                  className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-brand-text text-lg focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1.5 flex items-center gap-2">
                <Smartphone size={16} className="text-brand-accent" />
                M-Pesa Phone Number
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
                className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-brand-text text-lg focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono"
              />
              <p className="text-xs text-brand-text/40 mt-3 text-center">
                A Daraja push request will be sent to authorization server.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-brand-bg rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 text-lg"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-2 border-brand-bg/30 border-t-brand-bg rounded-full animate-spin" />
              ) : (
                'Pay with M-Pesa'
              )}
            </button>
          </form>
        </div>
        
        <div className="bg-brand-bg/50 p-4 text-center border-t border-brand-border">
          <p className="text-xs text-brand-text/40 flex items-center justify-center gap-1.5">
            <ShieldCheck size={14} /> Secured by Safaricom Daraja API
          </p>
        </div>
      </div>
    </div>
  );
}
