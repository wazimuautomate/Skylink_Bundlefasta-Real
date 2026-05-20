import { useState } from 'react';
import { Smartphone, ShieldCheck, ChevronLeft } from 'lucide-react';
import { useNavigation } from '../components/NavigationContext';

export function PaymentCheckoutPage() {
  const { setActivePage } = useNavigation();
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');

  // These would normally be loaded from an API based on the link ID
  const shopDetails = {
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    title: 'Acme Technologies Ltd',
    description: 'Payment for Annual Server Subscription',
    amount: 5000,
    reference: 'SUB-2026-05',
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus('processing');
    
    // Simulate STK Push delay
    setTimeout(() => {
      setIsSubmitting(false);
      setStatus('success');
    }, 2500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center -m-4 md:-m-8 bg-brand-bg/50 backdrop-blur-sm p-4 relative pt-16">
      <button 
        onClick={() => setActivePage('STK Push')}
        className="absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2 text-brand-text/60 hover:text-brand-text transition-colors font-medium z-10"
      >
        <ChevronLeft size={20} />
        Back to Dashboard
      </button>

      <div className="w-full max-w-md bg-brand-panel border border-brand-border rounded-2xl shadow-xl overflow-hidden relative">
        <div className="p-8 text-center border-b border-brand-border/50">
          <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden mb-4 border border-brand-border shadow-sm">
            <img src={shopDetails.logo} alt="Shop Logo" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-bold text-brand-text">{shopDetails.title}</h2>
          <p className="text-brand-text/60 mt-1">{shopDetails.description}</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-brand-bg rounded-xl p-4 flex justify-between items-center border border-brand-border/50">
            <div>
              <p className="text-sm text-brand-text/50 font-medium">Amount Due</p>
              <p className="text-3xl font-bold text-brand-accent mt-0.5">KES {shopDetails.amount.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-brand-text/50 font-medium">Ref</p>
              <p className="text-brand-text font-mono text-sm mt-1">{shopDetails.reference}</p>
            </div>
          </div>

          {status === 'success' ? (
            <div className="bg-status-success/10 border border-status-success/20 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-status-success rounded-full text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-status-success/20">
                <ShieldCheck size={24} />
              </div>
              <h3 className="font-bold text-status-success text-lg">Push Sent Successfully!</h3>
              <p className="text-status-success/80 text-sm mt-1">Please check your phone and enter your M-Pesa PIN to complete the transaction.</p>
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
                <p className="text-xs text-brand-text/40 mt-2 text-center">A prompt will be sent to this number for authorization</p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-[#4CAF50]/20 text-lg"
              >
                {isSubmitting ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Pay with M-Pesa'
                )}
              </button>
            </form>
          )}
        </div>
        
        <div className="bg-brand-bg/50 p-4 text-center border-t border-brand-border/50">
          <p className="text-xs text-brand-text/40 flex items-center justify-center gap-1">
            <ShieldCheck size={14} /> Secured by Safaricom Daraja API
          </p>
        </div>
      </div>
    </div>
  );
}
