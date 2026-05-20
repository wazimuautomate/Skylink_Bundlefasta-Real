import { useState } from 'react';
import { BarChart3, TrendingUp, Calendar, Filter, ArrowUpRight, ArrowDownRight, Download, Activity, Clock, CreditCard } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { TransactionChart } from '../components/TransactionChart';
import { useTheme } from '../components/ThemeProvider';

const VOLUME_TREND_DATA = [
  { name: '1 Jul', volume: 150000, count: 420 },
  { name: '5 Jul', volume: 210000, count: 530 },
  { name: '10 Jul', volume: 180000, count: 480 },
  { name: '15 Jul', volume: 320000, count: 710 },
  { name: '20 Jul', volume: 290000, count: 680 },
  { name: '25 Jul', volume: 450000, count: 950 },
];

const CHANNEL_DIST_DATA = [
  { name: 'STK Push', value: 65 },
  { name: 'C2B Paybill', value: 35 },
];

const COLORS = ['#00BFFF', '#FF4500'];

const PEAK_HOURS_DATA = [
  { time: '08:00', volume: 25 },
  { time: '10:00', volume: 45 },
  { time: '12:00', volume: 80 },
  { time: '14:00', volume: 65 },
  { time: '16:00', volume: 75 },
  { time: '18:00', volume: 95 },
  { time: '20:00', volume: 30 },
];

export function AnalyticsPage() {
  const { theme } = useTheme();
  const [dateRange, setDateRange] = useState('Last 7 Days');
  const [channel, setChannel] = useState('All Channels');

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Header and filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <BarChart3 className="text-brand-accent" size={24} />
            Analytics & Trends
          </h2>
          <p className="text-sm text-brand-text/60 mt-1">Explore volume trends, patterns, and insights across all your Paybill channels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none bg-brand-bg border border-brand-border text-brand-text rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all cursor-pointer shadow-sm"
            >
              <option>Today</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Quarter</option>
              <option>Custom Range</option>
            </select>
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/50 pointer-events-none" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-text/50 text-xs">▼</div>
          </div>
          
          <div className="relative">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="appearance-none bg-brand-bg border border-brand-border text-brand-text rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all cursor-pointer shadow-sm"
            >
              <option>All Channels</option>
              <option>C2B Paybill</option>
              <option>STK Push</option>
            </select>
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/50 pointer-events-none" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-text/50 text-xs">▼</div>
          </div>

          <button className="p-2 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center shadow-sm">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <Activity size={20} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-status-success bg-status-success/10 px-2 py-0.5 rounded">
              <ArrowUpRight size={12} /> 12.5%
            </span>
          </div>
          <p className="text-sm font-medium text-brand-text/60 mb-1">Total Transaction Volume</p>
          <p className="text-2xl font-bold text-brand-text">KES 1.6M</p>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#4CAF50]/10 flex items-center justify-center text-[#4CAF50]">
              <CreditCard size={20} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-status-success bg-status-success/10 px-2 py-0.5 rounded">
              <ArrowUpRight size={12} /> 8.2%
            </span>
          </div>
          <p className="text-sm font-medium text-brand-text/60 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-brand-text">3,770</p>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#FF9800]/10 flex items-center justify-center text-[#FF9800]">
              <TrendingUp size={20} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-status-error bg-status-error/10 px-2 py-0.5 rounded">
              <ArrowDownRight size={12} /> 2.1%
            </span>
          </div>
          <p className="text-sm font-medium text-brand-text/60 mb-1">Average Tx Value</p>
          <p className="text-2xl font-bold text-brand-text">KES 424</p>
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#9C27B0]/10 flex items-center justify-center text-[#9C27B0]">
              <Clock size={20} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-status-success bg-status-success/10 px-2 py-0.5 rounded">
              <ArrowUpRight size={12} /> 4.3%
            </span>
          </div>
          <p className="text-sm font-medium text-brand-text/60 mb-1">Success Rate</p>
          <p className="text-2xl font-bold text-brand-text">98.5%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Volume Trend Chart */}
        <div className="lg:col-span-2 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col h-[400px]">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-brand-text">Volume Trends</h3>
            <p className="text-sm text-brand-text/50 mt-1">Transaction value over time</p>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={VOLUME_TREND_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme === 'dark' ? '#00BFFF' : '#00A0D2'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={theme === 'dark' ? '#00BFFF' : '#00A0D2'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3A3A3A' : '#E5E7EB'} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 12 }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 12 }} 
                  tickFormatter={(val) => `KES ${val / 1000}k`}
                />
                <RechartsTooltip 
                  cursor={{ stroke: theme === 'dark' ? '#3A3A3A' : '#E5E7EB', strokeWidth: 2 }}
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                    border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                    borderRadius: '12px',
                    color: theme === 'dark' ? '#ffffff' : '#111827',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                  formatter={(value: number) => [`KES ${value.toLocaleString()}`, 'Volume']}
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke={theme === 'dark' ? '#00BFFF' : '#00A0D2'} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channel Distribution Pie Chart */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col h-[400px]">
          <div className="mb-2">
            <h3 className="text-lg font-bold text-brand-text">Channel Distribution</h3>
            <p className="text-sm text-brand-text/50 mt-1">By transaction count</p>
          </div>
          <div className="flex-1 min-h-[250px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={CHANNEL_DIST_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke={theme === 'dark' ? '#222222' : '#ffffff'}
                  strokeWidth={2}
                >
                  {CHANNEL_DIST_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                    border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                    borderRadius: '8px',
                    color: theme === 'dark' ? '#ffffff' : '#111827'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Share']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  iconType="circle"
                  formatter={(value) => <span className="text-brand-text/80 text-sm">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly transaction comparison */}
        <div className="h-[400px]">
           <TransactionChart />
        </div>

        {/* Peak Hours Heatmap / Bar Chart */}
        <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col h-[400px]">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-brand-text">Peak Transaction Hours</h3>
            <p className="text-sm text-brand-text/50 mt-1">Average volume by time of day</p>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PEAK_HOURS_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3A3A3A' : '#E5E7EB'} vertical={false} />
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 12 }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 12 }} 
                />
                <RechartsTooltip 
                  cursor={{ fill: theme === 'dark' ? '#2A2A2A' : '#F3F4F6', opacity: 0.8 }}
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                    border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                    borderRadius: '8px',
                    color: theme === 'dark' ? '#ffffff' : '#111827'
                  }}
                  formatter={(value: number) => [`${value} idx`, 'Activity Level']}
                />
                <Bar 
                  dataKey="volume" 
                  fill="#00BFFF" 
                  radius={[4, 4, 0, 0]} 
                  barSize={30}
                >
                  {PEAK_HOURS_DATA.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.volume > 70 ? (theme === 'dark' ? '#00BFFF' : '#00A0D2') : (theme === 'dark' ? '#4A4A4A' : '#E5E7EB')} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

