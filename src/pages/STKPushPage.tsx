import { useState } from 'react';
import { Smartphone, Send, CheckCircle2, XCircle, Clock, Search, Filter, ArrowUpRight, Link as LinkIcon, ExternalLink, Upload, Calendar, Power, Trash2, Copy, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigation } from '../components/NavigationContext';

const RECENT_PUSHES = [
  { id: 'req_1', date: '25 Jul 14:32', phone: '254711223344', amount: 500, ref: 'INV-001', status: 'Success' },
  { id: 'req_2', date: '25 Jul 14:30', phone: '254722334455', amount: 1500, ref: 'INV-002', status: 'Pending' },
  { id: 'req_3', date: '25 Jul 13:45', phone: '254733445566', amount: 250, ref: 'INV-003', status: 'Failed' },
  { id: 'req_4', date: '25 Jul 13:10', phone: '254744556677', amount: 3000, ref: 'INV-004', status: 'Success' },
  { id: 'req_5', date: '25 Jul 11:20', phone: '254755667788', amount: 120, ref: 'INV-005', status: 'Success' },
];

export function STKPushPage() {
  const { setActivePage } = useNavigation();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLinkMenu, setActiveLinkMenu] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setPhone('');
      setAmount('');
      setReference('');
      setDescription('');
      // In a real app, we'd add to the list and show a success toast
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <Send size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Total Initiated</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">1,245</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Success Rate</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">85.4%</p>
        </div>
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center text-status-error">
              <XCircle size={20} />
            </div>
            <h3 className="font-medium text-brand-text/70">Failed Pushes</h3>
          </div>
          <p className="text-2xl font-bold text-brand-text">182</p>
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
              <p className="text-sm text-brand-text/60 mt-1">Send a prompt directly to a customer's phone.</p>
            </div>
            <div className="p-6 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Phone Number (2547...)</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="254712345678"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Amount (KES)</label>
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
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Account Reference</label>
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
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Transaction Description</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Payment for Services"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h3 className="text-lg font-bold text-brand-text">Recent Requests</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button className="p-1.5 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors h-[34px] w-[34px] flex items-center justify-center shrink-0">
                  <Filter size={16} />
                </button>
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text/40" size={14} />
                  <input
                    type="text"
                    placeholder="Search requests..."
                    className="w-full sm:w-48 bg-brand-bg text-brand-text placeholder-brand-text/40 border border-brand-border rounded-lg py-1 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all h-[34px]"
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
                  {RECENT_PUSHES.map((req) => (
                    <tr key={req.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                      <td className="py-3 px-6 text-brand-text/70">{req.date}</td>
                      <td className="py-3 px-6 font-mono text-brand-text/90">{req.phone}</td>
                      <td className="py-3 px-6 font-medium text-brand-text">
                        KES {req.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-6 text-brand-text/80">{req.ref}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                          req.status === 'Success' ? 'bg-status-success/10 text-status-success' :
                          req.status === 'Pending' ? 'bg-status-warning/10 text-status-warning' :
                          'bg-status-error/10 text-status-error'
                        }`}>
                          {req.status === 'Success' && <CheckCircle2 size={12} />}
                          {req.status === 'Pending' && <Clock size={12} />}
                          {req.status === 'Failed' && <XCircle size={12} />}
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-brand-border text-center bg-brand-bg/10 shrink-0">
              <button className="text-sm font-medium text-brand-accent hover:text-brand-accent/80 transition-colors flex items-center justify-center gap-1 w-full">
                View All Requests <ArrowUpRight size={16} />
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
            <p className="text-sm text-brand-text/60 mt-1">Create shareable links for specific collections with customized branding.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-3xl">
            <form className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Page Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Annual Subscription"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Logo</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                    />
                    <label className="flex items-center justify-center bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text/70 hover:text-brand-text hover:bg-brand-panel transition-colors cursor-pointer shrink-0" title="Upload Logo">
                      <Upload size={18} />
                      <input type="file" className="hidden" accept="image/*" />
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="What is this payment for?"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Amount (KES)</label>
                  <input
                    type="number"
                    placeholder="Leave blank for open amount"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Fixed Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. SUB-2024"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                  />
                </div>
              </div>
              <button
                type="button"
                className="w-full sm:w-auto mt-2 px-6 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
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
          <p className="text-sm text-brand-text/60 mt-1">Manage, preview, and share your generated payment links.</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { 
              id: 1,
              title: 'Annual Server Subscription', 
              desc: 'Payment for Annual Server Subscription',
              amount: '5,000', 
              ref: 'SUB-2026-05', 
              url: 'https://pay.acme.com/l/xhj29k',
              logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
              status: 'Active',
              expiry: '2026-12-31'
            },
            { 
              id: 2,
              title: 'Consultation Fee', 
              desc: 'Standard consultation fee block',
              amount: 'Open', 
              ref: 'CONSULT', 
              url: 'https://pay.acme.com/l/p9mq1s',
              logo: '',
              status: 'Disabled',
              expiry: null
            }
          ].map((link) => (
            <div key={link.id} className="bg-brand-bg border border-brand-border rounded-xl overflow-hidden flex flex-col relative group">
              <div className="p-5 border-b border-brand-border/50 text-center relative">
                <div className="absolute top-3 right-3 flex gap-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${link.status === 'Active' ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'}`}>
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
                <p className="text-xs text-brand-text/60 mt-1 line-clamp-2 min-h-[32px]">{link.desc}</p>
                
                <div className="mt-4 p-3 bg-brand-panel border border-brand-border/50 rounded-lg flex justify-between items-center text-left">
                   <div>
                     <p className="text-[10px] text-brand-text/50 uppercase tracking-wider font-medium">Amount</p>
                     <p className="font-bold text-brand-text mt-0.5">{link.amount === 'Open' ? 'Any Amount' : `KES ${link.amount}`}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] text-brand-text/50 uppercase tracking-wider font-medium">Ref</p>
                     <p className="font-mono text-xs text-brand-text/80 mt-0.5">{link.ref}</p>
                   </div>
                </div>
              </div>
              
              <div className="p-4 flex-1 flex items-end">
                <div className="w-full grid grid-cols-2 gap-2">
                  <button className="px-3 py-2 bg-brand-panel hover:bg-brand-border border border-brand-border rounded-lg text-brand-text text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    onClick={() => setActivePage('Payment Checkout')}
                    className="px-3 py-2 bg-brand-accent hover:opacity-90 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
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
                      <div className="fixed inset-0 z-40" onClick={() => setActiveLinkMenu(null)} />
                      <div className="absolute right-0 bottom-full mb-1 w-40 bg-brand-panel border border-brand-border shadow-xl rounded-lg z-50 overflow-hidden text-left py-1">
                        <button className="w-full px-3 py-2 text-xs text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors">
                          <Calendar size={12} /> Set Expiry Date
                        </button>
                        <button className="w-full px-3 py-2 text-xs text-brand-text/80 hover:text-brand-text hover:bg-brand-bg flex items-center gap-2 transition-colors">
                          <Power size={12} /> {link.status === 'Active' ? 'Disable Link' : 'Enable Link'}
                        </button>
                        <div className="h-px bg-brand-border my-1" />
                        <button className="w-full px-3 py-2 text-xs text-status-error hover:bg-status-error/10 flex items-center gap-2 transition-colors">
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
