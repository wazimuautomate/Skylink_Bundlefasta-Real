import { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useTheme } from './ThemeProvider';

const INITIAL_DATA = [
  { name: 'Mon', c2b: 4000, stk: 2400 },
  { name: 'Tue', c2b: 3000, stk: 1398 },
  { name: 'Wed', c2b: 2000, stk: 9800 },
  { name: 'Thu', c2b: 2780, stk: 3908 },
  { name: 'Fri', c2b: 1890, stk: 4800 },
  { name: 'Sat', c2b: 2390, stk: 3800 },
  { name: 'Sun', c2b: 3490, stk: 4300 },
];

export function TransactionChart() {
  const [data, setData] = useState(INITIAL_DATA);
  const [filter, setFilter] = useState('Week');
  const { theme } = useTheme();

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setData(currentData => {
        return currentData.map(item => ({
          ...item,
          c2b: item.c2b + Math.floor(Math.random() * 200) - 100,
          stk: item.stk + Math.floor(Math.random() * 200) - 100,
        }));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-brand-panel border border-brand-border shadow-sm rounded-2xl p-6 h-full flex flex-col transition-colors duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-brand-text">Transaction Flow</h3>
          <p className="text-sm text-brand-text/50 mt-1">C2B vs STK Push Payments</p>
        </div>
        <div className="flex gap-2">
          {['Day', 'Week', 'Month'].map(item => (
            <button 
              key={item}
              onClick={() => setFilter(item)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === item 
                  ? 'bg-brand-accent text-white' 
                  : 'text-brand-text/60 hover:bg-brand-bg hover:text-brand-text'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3A3A3A' : '#E5E7EB'} vertical={false} />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', opacity: 0.8, fontSize: 13 }} 
              dy={10} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', opacity: 0.8, fontSize: 13 }} 
            />
            <Tooltip 
              cursor={{ fill: theme === 'dark' ? '#2A2A2A' : '#F3F4F6', opacity: 0.8 }}
              contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                borderRadius: '12px',
                color: theme === 'dark' ? '#ffffff' : '#111827'
              }}
              itemStyle={{ color: theme === 'dark' ? '#ffffff' : '#111827' }}
            />
            <Legend 
              iconType="circle" 
              wrapperStyle={{ paddingTop: '20px' }}
            />
            <Bar dataKey="c2b" name="C2B Paybill" fill="#00BFFF" radius={[4, 4, 0, 0]} barSize={12} />
            <Bar dataKey="stk" name="STK Push" fill="#FF4500" radius={[4, 4, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
