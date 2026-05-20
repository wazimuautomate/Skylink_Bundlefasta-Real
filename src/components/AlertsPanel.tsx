import { AlertTriangle, AlertCircle, RotateCcw, Activity } from 'lucide-react';

const ALERTS = [
  {
    id: 1,
    type: 'warning',
    message: 'Duplicate callback detected for TRX8Z9Y0X1. Ignored.',
    time: '2 mins ago',
    icon: AlertTriangle,
    color: 'text-status-warning'
  },
  {
    id: 2,
    type: 'error',
    message: 'STK Push timeout rate spike (+12%) in last 5 mins.',
    time: '5 mins ago',
    icon: AlertCircle,
    color: 'text-status-danger'
  },
  {
    id: 3,
    type: 'info',
    message: 'Reversal TRX5G4H3I2 completed successfully.',
    time: '15 mins ago',
    icon: RotateCcw,
    color: 'text-brand-accent'
  },
  {
    id: 4,
    type: 'success',
    message: 'Daraja API latency normal (120ms).',
    time: '30 mins ago',
    icon: Activity,
    color: 'text-status-success'
  }
];

export function AlertsPanel() {
  return (
    <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col transition-colors duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-brand-text">System Alerts</h3>
          <p className="text-sm text-brand-text/50">Real-time health insights</p>
        </div>
        <div className="relative">
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-status-danger rounded-full animate-pulse"></span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        {ALERTS.map(alert => {
          const Icon = alert.icon;
          return (
            <div 
              key={alert.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-brand-bg/50 border border-brand-border/50 hover:border-brand-border transition-colors duration-300"
            >
              <div className={`mt-0.5 ${alert.color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm text-brand-text/90 leading-snug">{alert.message}</p>
                <span className="text-xs text-brand-text/40 mt-1 block">{alert.time}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      <button className="w-full mt-4 py-2.5 text-sm font-semibold text-brand-text/80 hover:text-brand-accent bg-brand-panel border border-brand-border hover:border-brand-accent/50 rounded-xl hover:bg-brand-accent/10 focus:ring-2 focus:ring-brand-accent focus:outline-none transition-all duration-300">
        View All Alerts
      </button>
    </div>
  );
}
