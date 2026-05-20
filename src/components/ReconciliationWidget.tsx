import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { useTheme } from './ThemeProvider';

const data = [
  { name: 'Reconciled', value: 850000 },
  { name: 'Unreconciled', value: 125400 },
];
const COLORS = ['#00BFFF', '#FF4500'];

export function ReconciliationWidget() {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const unreconciled = data.find(d => d.name === 'Unreconciled')?.value || 0;
  const mismatchPercent = ((unreconciled / total) * 100).toFixed(1);
  const { theme } = useTheme();

  return (
    <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col relative overflow-hidden transition-colors duration-300">
      {/* Decorative background glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-bold text-brand-text">Reconciliation</h3>
          <p className="text-sm text-brand-text/50">Today's Settlement</p>
        </div>
        <button className="p-2 border border-brand-border rounded-lg text-brand-text/60 hover:text-brand-accent hover:border-brand-accent/50 transition-colors">
          <ArrowUpRight size={16} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center relative min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              stroke="none"
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                borderRadius: '8px',
                color: theme === 'dark' ? '#ffffff' : '#111827'
              }}
              itemStyle={{ color: theme === 'dark' ? '#ffffff' : '#111827' }}
              formatter={(value: number) => [`KES ${value.toLocaleString()}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm text-brand-text/50">Mismatch</span>
          <span className="text-2xl font-bold text-brand-accent">{mismatchPercent}%</span>
        </div>
      </div>

      <div className="space-y-3 mt-2">
        {data.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx] }}></div>
              <span className="text-brand-text/70">{item.name}</span>
            </div>
            <span className={`font-semibold ${item.name === 'Unreconciled' ? 'text-status-warning' : 'text-brand-text'}`}>
              KES {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
