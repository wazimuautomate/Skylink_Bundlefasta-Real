import { useState, useEffect, useMemo } from 'react';
import { BarChart3, TrendingUp, Calendar, Filter, ArrowUpRight, ArrowDownRight, Download, Activity, Clock, CreditCard, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { TransactionChart } from '../components/TransactionChart';
import { useTheme } from '../components/ThemeProvider';
import { supabase } from '../utils/supabaseClient';

const COLORS = ['#00BFFF', '#FF4500'];

interface VolumeTrendPoint {
  name: string;
  volume: number;
  count: number;
}

interface ChannelDistPoint {
  name: string;
  value: number;
}

interface PeakHourPoint {
  time: string;
  volume: number;
}

export function AnalyticsPage() {
  const { theme } = useTheme();
  const [dateRange, setDateRange] = useState('Last 7 Days');
  const [channelFilter, setChannelFilter] = useState('All Channels');

  // Live aggregated analytics states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const start = new Date();

      if (dateRange === 'Today') {
        start.setHours(0, 0, 0, 0);
      } else if (dateRange === 'Last 30 Days') {
        start.setDate(start.getDate() - 30);
      } else if (dateRange === 'This Quarter') {
        start.setMonth(start.getMonth() - 3);
      } else {
        // Last 7 Days (Default)
        start.setDate(start.getDate() - 7);
      }

      const { data, error: err } = await supabase
        .from('transactions')
        .select('amount, status, transaction_type, occurred_at')
        .gte('occurred_at', start.toISOString());

      if (err) throw err;
      setTransactions(data || []);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();

    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchAnalyticsData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange]);

  // Apply filters and calculate stats
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (channelFilter === 'STK Push') {
        return tx.transaction_type === 'STK_PUSH';
      }
      if (channelFilter === 'C2B Paybill') {
        return tx.transaction_type !== 'STK_PUSH';
      }
      return true;
    });
  }, [transactions, channelFilter]);

  const kpis = useMemo(() => {
    const completed = filteredTxs.filter(t => t.status === 'completed');
    const failed = filteredTxs.filter(t => t.status === 'failed');

    const totalVolume = completed.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalCount = completed.length;
    const avgValue = totalCount > 0 ? Math.round(totalVolume / totalCount) : 0;
    
    const successTotal = completed.length + failed.length;
    const successRate = successTotal > 0 ? Number(((completed.length / successTotal) * 100).toFixed(1)) : 100;

    return {
      totalVolume,
      totalCount,
      avgValue,
      successRate
    };
  }, [filteredTxs]);

  // Group by Date for Volume Trends
  const volumeTrends = useMemo((): VolumeTrendPoint[] => {
    const completed = filteredTxs.filter(t => t.status === 'completed');
    const dayMap: Record<string, { volume: number; count: number }> = {};

    // Determine grouping granularity
    const rangeDays = dateRange === 'Today' ? 1 : dateRange === 'Last 30 Days' ? 30 : dateRange === 'This Quarter' ? 90 : 7;
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = dateRange === 'Today' 
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
      dayMap[label] = { volume: 0, count: 0 };
    }

    completed.forEach(tx => {
      const tDate = new Date(tx.occurred_at);
      const label = dateRange === 'Today'
        ? tDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : tDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
      if (dayMap[label] !== undefined) {
        dayMap[label].volume += Number(tx.amount);
        dayMap[label].count += 1;
      }
    });

    return Object.keys(dayMap).map(key => ({
      name: key,
      volume: dayMap[key].volume,
      count: dayMap[key].count
    })).reverse();
  }, [filteredTxs, dateRange]);

  // Pie chart channel distribution
  const channelDistribution = useMemo((): ChannelDistPoint[] => {
    const completed = transactions.filter(t => t.status === 'completed');
    const stkCount = completed.filter(t => t.transaction_type === 'STK_PUSH').length;
    const c2bCount = completed.length - stkCount;
    const total = completed.length || 1;

    return [
      { name: 'STK Push', value: Math.round((stkCount / total) * 100) },
      { name: 'C2B Paybill', value: Math.round((c2bCount / total) * 100) }
    ];
  }, [transactions]);

  // Hourly Peak Heatmap
  const peakHours = useMemo((): PeakHourPoint[] => {
    const completed = filteredTxs.filter(t => t.status === 'completed');
    const hourlyCounts = Array(24).fill(0);

    completed.forEach(tx => {
      const hour = new Date(tx.occurred_at).getHours();
      hourlyCounts[hour] += 1;
    });

    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
    return hours.map(h => {
      const hourIdx = parseInt(h.split(':')[0]);
      // Average the 4 hours interval
      let count = 0;
      for (let j = 0; j < 4; j++) {
        count += hourlyCounts[(hourIdx + j) % 24];
      }
      return {
        time: h,
        volume: count
      };
    });
  }, [filteredTxs]);

  const formatCurrency = (amount: number) => {
    if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `KES ${(amount / 1_000).toFixed(0)}k`;
    return `KES ${amount}`;
  };

  const handleExport = () => {
    const headers = ['Date', 'Type', 'Amount (KES)', 'Status'];
    const rows = filteredTxs.map(t => [
      t.occurred_at,
      t.transaction_type,
      t.amount,
      t.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `skylink_analytics_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8 font-sans">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <BarChart3 className="text-brand-accent" size={24} />
            Analytics & Trends
          </h2>
          <p className="text-sm text-brand-text/50 mt-1">Explore real-time transaction curves and operational patterns.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none bg-brand-bg border border-brand-border text-brand-text rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all cursor-pointer shadow-sm text-xs font-semibold"
            >
              <option>Today</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Quarter</option>
            </select>
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/50 pointer-events-none" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-text/40 text-[10px]">▼</div>
          </div>
          
          <div className="relative">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="appearance-none bg-brand-bg border border-brand-border text-brand-text rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all cursor-pointer shadow-sm text-xs font-semibold"
            >
              <option>All Channels</option>
              <option>C2B Paybill</option>
              <option>STK Push</option>
            </select>
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/50 pointer-events-none" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-text/40 text-[10px]">▼</div>
          </div>

          <button 
            onClick={handleExport}
            className="p-2 border border-brand-border hover:bg-brand-bg text-brand-text/70 hover:text-brand-text rounded-lg transition-colors flex items-center justify-center shadow-sm"
            title="Download CSV"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <RefreshCw size={32} className="text-brand-accent animate-spin" />
            <span className="text-sm text-brand-text/60">Fetching analytical metrics...</span>
          </div>
        </div>
      ) : error ? (
        <div className="py-24 text-center text-status-danger">
          Error: {error}
        </div>
      ) : (
        <>
          {/* KPIs Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
                  <Activity size={20} />
                </div>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-status-success bg-status-success/10 px-2 py-0.5 rounded">
                  <ArrowUpRight size={10} /> LIVE
                </span>
              </div>
              <p className="text-xs font-semibold text-brand-text/50 mb-1 uppercase tracking-wider">Total Volume</p>
              <p className="text-2xl font-bold text-brand-text mt-1">{formatCurrency(kpis.totalVolume)}</p>
            </div>

            <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <CreditCard size={20} />
                </div>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-status-success bg-status-success/10 px-2 py-0.5 rounded">
                  <ArrowUpRight size={10} /> Sync
                </span>
              </div>
              <p className="text-xs font-semibold text-brand-text/50 mb-1 uppercase tracking-wider">Successful Txs</p>
              <p className="text-2xl font-bold text-brand-text mt-1">{kpis.totalCount.toLocaleString()}</p>
            </div>

            <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <TrendingUp size={20} />
                </div>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-status-success bg-status-success/10 px-2 py-0.5 rounded">
                  <ArrowUpRight size={10} /> AVG
                </span>
              </div>
              <p className="text-xs font-semibold text-brand-text/50 mb-1 uppercase tracking-wider">Average Tx Value</p>
              <p className="text-2xl font-bold text-brand-text mt-1">KES {kpis.avgValue.toLocaleString()}</p>
            </div>

            <div className="bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Clock size={20} />
                </div>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-status-success bg-status-success/10 px-2 py-0.5 rounded">
                  <ArrowUpRight size={10} /> OK
                </span>
              </div>
              <p className="text-xs font-semibold text-brand-text/50 mb-1 uppercase tracking-wider">Success Rate</p>
              <p className="text-2xl font-bold text-brand-text mt-1">{kpis.successRate}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Volume Trend Chart */}
            <div className="lg:col-span-2 bg-brand-panel border border-brand-border rounded-xl p-6 shadow-sm flex flex-col h-[400px]">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-brand-text font-sans">Volume Curves</h3>
                <p className="text-sm text-brand-text/50 mt-1">Total transaction value aggregated over time</p>
              </div>
              <div className="flex-1 min-h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volumeTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                      tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 11 }} 
                      dy={10} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 11 }} 
                      tickFormatter={(val) => `KES ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <RechartsTooltip 
                      cursor={{ stroke: theme === 'dark' ? '#3A3A3A' : '#E5E7EB', strokeWidth: 2 }}
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                        border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                        borderRadius: '12px',
                        color: theme === 'dark' ? '#ffffff' : '#111827',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        fontSize: '12px'
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
                <h3 className="text-lg font-bold text-brand-text font-sans">Channel Distribution</h3>
                <p className="text-sm text-brand-text/50 mt-1">Relative transaction volume share</p>
              </div>
              <div className="flex-1 min-h-[250px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={4}
                      dataKey="value"
                      stroke={theme === 'dark' ? '#222222' : '#ffffff'}
                      strokeWidth={2}
                    >
                      {channelDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                        border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#ffffff' : '#111827',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => [`${value}%`, 'Volume Share']}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      formatter={(value) => <span className="text-brand-text/80 text-xs font-semibold">{value}</span>}
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
                <h3 className="text-lg font-bold text-brand-text font-sans">Peak Hours Distribution</h3>
                <p className="text-sm text-brand-text/50 mt-1">Average transaction volume density by time of day</p>
              </div>
              <div className="flex-1 min-h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3A3A3A' : '#E5E7EB'} vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 11 }} 
                      dy={10} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: theme === 'dark' ? '#B0BEC5' : '#6B7280', fontSize: 11 }} 
                    />
                    <RechartsTooltip 
                      cursor={{ fill: theme === 'dark' ? '#2A2A2A' : '#F3F4F6', opacity: 0.8 }}
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#222222' : '#ffffff', 
                        border: `1px solid ${theme === 'dark' ? '#3A3A3A' : '#E5E7EB'}`,
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#ffffff' : '#111827',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => [`${value} txs`, 'Frequency']}
                    />
                    <Bar 
                      dataKey="volume" 
                      fill="#00BFFF" 
                      radius={[4, 4, 0, 0]} 
                      barSize={30}
                    >
                      {peakHours.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.volume > 0 ? (theme === 'dark' ? '#00BFFF' : '#00A0D2') : (theme === 'dark' ? '#4A4A4A' : '#E5E7EB')} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
