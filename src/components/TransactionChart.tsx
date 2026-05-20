import { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  RefreshCw
} from 'recharts';
import { useTheme } from './ThemeProvider';
import { supabase } from '../utils/supabaseClient';

interface ChartDay {
  name: string;
  c2b: number;
  stk: number;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TransactionChart() {
  const [data, setData] = useState<ChartDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Week');
  const { theme } = useTheme();

  const fetchChartData = async () => {
    try {
      setLoading(true);
      const start = new Date();
      if (filter === 'Day') {
        start.setHours(0, 0, 0, 0);
      } else if (filter === 'Month') {
        start.setDate(start.getDate() - 30);
      } else {
        // Week
        start.setDate(start.getDate() - 7);
      }

      const { data: txData, error } = await supabase
        .from('transactions')
        .select('amount, transaction_type, occurred_at, status')
        .eq('status', 'completed')
        .gte('occurred_at', start.toISOString());

      if (error) throw error;

      // Group by day of week or period
      const daysMap: Record<string, { c2b: number; stk: number }> = {};
      
      // Initialize days list
      const numDays = filter === 'Day' ? 1 : filter === 'Month' ? 30 : 7;
      for (let i = 0; i < numDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayLabel = filter === 'Day' 
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : filter === 'Month' 
            ? d.toLocaleDateString([], { day: 'numeric', month: 'short' })
            : DAYS_SHORT[d.getDay()];
        
        daysMap[dayLabel] = { c2b: 0, stk: 0 };
      }

      (txData || []).forEach(tx => {
        const txDate = new Date(tx.occurred_at);
        const dayLabel = filter === 'Day' 
          ? txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : filter === 'Month' 
            ? txDate.toLocaleDateString([], { day: 'numeric', month: 'short' })
            : DAYS_SHORT[txDate.getDay()];

        if (daysMap[dayLabel] !== undefined) {
          const amt = Number(tx.amount);
          if (tx.transaction_type === 'STK_PUSH') {
            daysMap[dayLabel].stk += amt;
          } else {
            daysMap[dayLabel].c2b += amt;
          }
        }
      });

      // Convert to array and reverse so dates go chronological (past to present)
      const list = Object.keys(daysMap).map(key => ({
        name: key,
        c2b: daysMap[key].c2b,
        stk: daysMap[key].stk
      })).reverse();

      setData(list);
    } catch (err) {
      console.error('Error loading transaction chart data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();

    const channel = supabase
      .channel('tx-chart-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchChartData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  return (
    <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col transition-colors duration-300 font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-brand-text font-sans">Transaction Flow</h3>
          <p className="text-sm text-brand-text/50 mt-1">C2B vs STK Push Payments</p>
        </div>
        <div className="flex gap-2">
          {['Day', 'Week', 'Month'].map(item => (
            <button 
              key={item}
              onClick={() => setFilter(item)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filter === item 
                  ? 'bg-brand-accent text-white font-bold shadow-md shadow-brand-accent/20' 
                  : 'text-brand-text/60 hover:bg-brand-bg hover:text-brand-text'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[250px] flex items-center justify-center">
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw size={20} className="text-brand-accent animate-spin" />
            <span className="text-xs text-brand-text/40">Aggregating transaction logs...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3A3A3A' : '#E5E7EB'} vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', opacity: 0.8, fontSize: 11 }} 
                dy={10} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', opacity: 0.8, fontSize: 11 }} 
                tickFormatter={(val) => val >= 1000 ? `${val / 1000}k` : val}
              />
              <Tooltip 
                cursor={{ fill: theme === 'dark' ? '#2A2A2A' : '#F3F4F6', opacity: 0.8 }}
                contentStyle={{ 
                  backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                  border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                  borderRadius: '12px',
                  color: theme === 'dark' ? '#ffffff' : '#111827',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  fontSize: '12px'
                }}
                itemStyle={{ color: theme === 'dark' ? '#ffffff' : '#111827' }}
                formatter={(val: number) => [`KES ${val.toLocaleString()}`, '']}
              />
              <Legend 
                iconType="circle" 
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
              />
              <Bar dataKey="c2b" name="C2B Paybill" fill="#00BFFF" radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="stk" name="STK Push" fill="#FF4500" radius={[4, 4, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
