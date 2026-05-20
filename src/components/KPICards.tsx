import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';
import { Tooltip } from './Tooltip';

const KPIS = [
  {
    title: 'Total Collections',
    value: 'KES 4,520,000',
    change: '+14.5%',
    isPositive: true,
    active: false,
    icon: Activity,
    tooltip: 'Total inflow of funds via M-Pesa C2B Paybill this period. Indicates overall business revenue volume.'
  },
  {
    title: 'Successful STK Pushes',
    value: '23,450',
    change: '+8.2%',
    isPositive: true,
    active: true, // Example of active glowing state
    icon: TrendingUp,
    tooltip: 'Number of M-Pesa Express (STK Push) requests successfully completed by customers.'
  },
  {
    title: 'Failed Transactions',
    value: '142',
    change: '-2.4%',
    isPositive: true, // Failed going down is positive
    active: false,
    icon: AlertCircle,
    tooltip: 'Total failed transactions including STK push timeouts, insufficient funds, and C2B validation errors. Down is good.'
  },
  {
    title: 'Pending Reconciliation',
    value: 'KES 125,400',
    change: '+1.1%',
    isPositive: false, // Pending going up might be negative
    active: false,
    icon: TrendingDown,
    tooltip: 'Total monetary value currently mismatched between Safaricom callback logs and the internal ledger.'
  }
];

export function KPICards() {
  return (
    <div className="flex md:grid overflow-x-auto md:overflow-visible pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 snap-x snap-mandatory scrollbar-none">
      {KPIS.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div key={idx} className="w-[85vw] sm:w-[320px] md:w-auto shrink-0 snap-center h-full">
            <Tooltip content={
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b border-brand-bg/20 pb-2">
                  <span className="font-semibold opacity-90">{kpi.title}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${kpi.isPositive ? 'bg-status-success text-white' : 'bg-status-danger text-white'}`}>
                    {kpi.change}
                  </span>
                </div>
                <p className="text-xs opacity-80 leading-snug">{kpi.tooltip}</p>
                <div className="pt-1 font-mono text-[10px] opacity-60">Exact Value: {kpi.value}</div>
              </div>
            }>
              <div 
                className={`
                  w-full h-full p-6 rounded-2xl bg-brand-panel border transition-all duration-300 shadow-sm
                  ${kpi.active 
                    ? 'border-brand-accent shadow-[0_0_15px_rgba(0,191,255,0.2)]' 
                    : 'border-brand-border hover:border-brand-text/30'}
                `}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-brand-text/70 font-medium text-sm">{kpi.title}</span>
                  <div className={`p-2 rounded-lg bg-brand-bg ${kpi.active ? 'text-brand-accent' : 'text-brand-text/50'}`}>
                    <Icon size={18} />
                  </div>
                </div>
                
                <div className="flex items-end gap-3">
                  <h3 className="text-3xl font-bold text-brand-text tracking-wide">{kpi.value}</h3>
                </div>
                
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-md font-medium ${kpi.isPositive ? 'bg-status-success/15 text-status-success' : 'bg-status-danger/15 text-status-danger'}`}>
                    {kpi.change}
                  </span>
                  <span className="text-brand-text/50">vs last period</span>
                </div>
              </div>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
