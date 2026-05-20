import { useState } from 'react';
import { Smartphone, ShieldCheck, ChevronLeft } from 'lucide-react';
import { useNavigation } from '../components/NavigationContext';
import { supabase } from '../utils/supabaseClient';

export function PaymentCheckoutPage() {
  const { setActivePage } = useNavigation();
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');

  // Load checkout parameters from the URL query
  const query = new URLSearchParams(window.location.search);
  const amount = Number(query.get('amount')) || 5000;
  const reference = query.get('ref') || 'SUB-2026-05';
  const title = query.get('title') || 'Acme Technologies Ltd';
  const description = query.get('desc') || 'Payment for Annual Server Subscription';
  const logo = query.get('logo') || 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80';

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
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
          amount: amount,
          reference: reference
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to trigger STK push');
      }

      setIsSubmitting(false);
      setStatus('success');
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(`Payment request failed: ${err.message}`);
      setIsSubmitting(false);
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center -m-4 md:-m-8 bg-brand-bg/50 backdrop-blur-sm p-4 relative pt-16 font-sans">
      <button 
        onClick={() => setActivePage('STK Push')}
        className="absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2 text-brand-text/60 hover:text-brand-text transition-colors font-semibold z-10"
      >
        <ChevronLeft size={20} />
        Back to Dashboard
      </button>

      <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="p-8 text-center border-b border-brand-border/50">
          <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden mb-4 border border-brand-border shadow-sm bg-brand-bg flex items-center justify-center">
            {logo ? (
              <img src={logo} alt="Shop Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-brand-text/30 font-bold text-3xl">{title.charAt(0)}</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-brand-text">{title}</h2>
          <p className="text-brand-text/50 text-sm mt-1">{description}</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-brand-bg rounded-xl p-4 flex justify-between items-center border border-brand-border">
            <div>
              <p className="text-xs text-brand-text/40 font-semibold uppercase tracking-wider">Amount Due</p>
              <p className="text-2xl font-bold text-brand-accent mt-0.5">KES {amount.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-brand-text/40 font-semibold uppercase tracking-wider">Ref</p>
              <p className="text-brand-text font-mono font-semibold text-sm mt-1">{reference}</p>
            </div>
          </div>

          {status === 'success' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-status-success rounded-full text-brand-bg flex items-center justify-center mx-auto mb-3 shadow-lg shadow-status-success/20">
                <ShieldCheck size={24} />
              </div>
              <h3 className="font-bold text-emerald-400 text-lg">Push Sent Successfully!</h3>
              <p className="text-brand-text/70 text-sm mt-2">
                A Safaricom M-Pesa PIN prompt has been sent to your device. Please enter your PIN to authorize this payment of KES {amount.toLocaleString()}.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePay} className="space-y-4">
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
          )}
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
