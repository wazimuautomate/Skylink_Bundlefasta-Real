import { X, CheckCircle2, XCircle, Clock, Copy, ArrowRightLeft, CreditCard, Building } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Transaction {
  id: string;
  date: string;
  phone: string;
  amount: number;
  type: string;
  status: string;
}

interface TransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

const StatusIcon = ({ status, size = 16 }: { status: string, size?: number }) => {
  switch (status) {
    case 'Success': return <CheckCircle2 size={size} className="text-status-success" />;
    case 'Failed': return <XCircle size={size} className="text-status-danger" />;
    case 'Pending': return <Clock size={size} className="text-status-warning" />;
    default: return null;
  }
};

const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'C2B': return <ArrowRightLeft size={16} className="text-brand-accent" />;
    case 'STK Push': return <CreditCard size={16} className="text-blue-400" />;
    case 'B2C': return <Building size={16} className="text-purple-400" />;
    case 'Reversal': return <RotateCcw size={16} className="text-orange-400" />;
    default: return null;
  }
};
import { RotateCcw } from 'lucide-react';

export function TransactionModal({ transaction, isOpen, onClose }: TransactionModalProps) {
  if (!transaction) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-brand-bg border border-brand-border rounded-2xl shadow-2xl p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
                Transaction Details
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-brand-text/50 hover:text-brand-text hover:bg-brand-border/50 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Status Header */}
              <div className="flex items-center justify-between p-4 bg-brand-panel border border-brand-border rounded-xl">
                <div>
                  <p className="text-sm text-brand-text/50 mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <StatusIcon status={transaction.status} size={20} />
                    <span className="font-semibold text-brand-text text-lg">{transaction.status}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-brand-text/50 mb-1">Amount</p>
                  <span className="font-bold text-brand-text text-2xl">
                    KES {transaction.amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-brand-panel/50 rounded-xl border border-brand-border">
                  <p className="text-xs text-brand-text/50 mb-1 uppercase tracking-wider">Transaction ID</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-brand-text font-medium">{transaction.id}</span>
                    <button className="text-brand-text/40 hover:text-brand-accent transition-colors">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-brand-panel/50 rounded-xl border border-brand-border">
                  <p className="text-xs text-brand-text/50 mb-1 uppercase tracking-wider">Date & Time</p>
                  <span className="text-brand-text font-medium">{transaction.date}</span>
                </div>

                <div className="p-4 bg-brand-panel/50 rounded-xl border border-brand-border">
                  <p className="text-xs text-brand-text/50 mb-1 uppercase tracking-wider">Customer Phone</p>
                  <span className="font-mono text-brand-text font-medium tracking-tight">
                    {transaction.phone}
                  </span>
                </div>

                <div className="p-4 bg-brand-panel/50 rounded-xl border border-brand-border">
                  <p className="text-xs text-brand-text/50 mb-1 uppercase tracking-wider">Operation Type</p>
                  <div className="flex items-center gap-2">
                    <TypeIcon type={transaction.type} />
                    <span className="font-medium text-brand-text">{transaction.type}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-brand-border">
                {transaction.status === 'Failed' && (
                  <button className="flex-1 py-2.5 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 border border-brand-accent/20 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                    <RotateCcw size={16} /> Retry Transaction
                  </button>
                )}
                {transaction.status === 'Success' && transaction.type !== 'Reversal' && (
                  <button className="flex-1 py-2.5 bg-brand-panel text-brand-text/80 hover:text-brand-text border border-brand-border hover:border-brand-text/20 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                    <ArrowRightLeft size={16} /> Initiate Reversal
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-brand-panel text-brand-text border border-brand-border hover:bg-brand-border rounded-xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
