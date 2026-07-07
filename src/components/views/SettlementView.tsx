'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Plus,
  Trash2,
  History,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertOctagon,
  Settings,
  HelpCircle,
  AlertCircle,
  ChevronRight,
  Activity,
  Layers,
  Pencil,
  Power,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  initiateB2bAction,
  getB2bStatsAction,
  getB2bRequestsAction,
  getSettlementRulesAction,
  createSettlementRuleAction,
  updateSettlementRuleAction,
  deleteSettlementRuleAction,
  getSettlementQueueAction
} from '@/app/actions';
import PinConfirmModal from '../shared/PinConfirmModal';

interface Stats {
  totalSettledToday: number;
  totalSettledMonth: number;
  pendingCount: number;
  pendingAmount: number;
  successCount: number;
  successAmount: number;
  failedCount: number;
  failedAmount: number;
  successRate: number;
  failureRate: number;
}

export default function SettlementView() {
  // 1. Stats and Lists
  const [stats, setStats] = useState<Stats>({
    totalSettledToday: 0,
    totalSettledMonth: 0,
    pendingCount: 0,
    pendingAmount: 0,
    successCount: 0,
    successAmount: 0,
    failedCount: 0,
    failedAmount: 0,
    successRate: 0,
    failureRate: 0
  });
  const [requests, setRequests] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'request' | 'rules' | 'queue'>('request');

  // 2. Form States
  const [destinationType, setDestinationType] = useState<'Till' | 'PayBill'>('Till');
  const [destinationShortcode, setDestinationShortcode] = useState('');
  const [amount, setAmount] = useState('');
  const [accountReference, setAccountReference] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // 3. Rule Form States
  const [ruleSource, setRuleSource] = useState('');
  const [ruleType, setRuleType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [rulePercent, setRulePercent] = useState('');
  const [ruleFixedAmount, setRuleFixedAmount] = useState('');
  const [ruleDestType, setRuleDestType] = useState<'Till' | 'PayBill'>('Till');
  const [ruleDestShortcode, setRuleDestShortcode] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // 4. UI Indicators
  const [loading, setLoading] = useState(false);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ruleSuccessMsg, setRuleSuccessMsg] = useState<string | null>(null);
  const [ruleErrorMsg, setRuleErrorMsg] = useState<string | null>(null);
  
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const supabase = createClient();

  // Load stats, requests, rules, queue
  const loadAllData = async () => {
    try {
      const [sData, rData, rulesData, qData] = await Promise.all([
        getB2bStatsAction(),
        getB2bRequestsAction({ limit: 15 }),
        getSettlementRulesAction(),
        getSettlementQueueAction()
      ]);
      setStats(sData);
      setRequests(rData);
      setRules(rulesData);
      setQueue(qData);
    } catch (err) {
      console.error('Failed to load settlement data:', err);
    }
  };

  useEffect(() => {
    loadAllData();

    // Subscribe to realtime database updates
    const b2bChannel = supabase
      .channel('b2b_realtime_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'b2b_requests' }, () => {
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlement_rules' }, () => {
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlement_queue' }, () => {
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(b2bChannel);
    };
  }, [supabase]);

  // Initiate Settlement PIN step
  const handleInitiateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationShortcode || !amount || !accountReference) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsPinModalOpen(true);
  };

  // Confirm PIN & execute B2B API call
  const handleConfirmPin = async (pin: string) => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await initiateB2bAction({
        destinationType,
        destinationShortcode,
        amount: Number(amount),
        accountReference,
        remarks: remarks || 'B2B Settlement Transfer',
        pin
      });

      if (res.success && res.data) {
        setSuccessMsg(`B2B Settlement initiated successfully! Conversation ID: ${res.data.conversation_id}`);
        // Reset form
        setDestinationShortcode('');
        setAmount('');
        setAccountReference('');
        setRemarks('');
        loadAllData();
      } else {
        setErrorMsg(res.error || 'Failed to dispatch B2B settlement.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error dispatching B2B settlement.');
    } finally {
      setLoading(false);
    }
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleSource('');
    setRuleType('PERCENTAGE');
    setRulePercent('');
    setRuleFixedAmount('');
    setRuleDestType('Till');
    setRuleDestShortcode('');
  };

  // Create or Update Settlement Rule
  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleSource || !ruleDestShortcode) {
      setRuleErrorMsg('Please fill in all required rule fields.');
      return;
    }
    if (ruleType === 'PERCENTAGE' && (!rulePercent || Number(rulePercent) <= 0)) {
      setRuleErrorMsg('Please enter a valid percentage.');
      return;
    }
    if (ruleType === 'FIXED' && (!ruleFixedAmount || Number(ruleFixedAmount) <= 0)) {
      setRuleErrorMsg('Please enter a valid fixed amount.');
      return;
    }

    setRuleLoading(true);
    setRuleSuccessMsg(null);
    setRuleErrorMsg(null);

    try {
      const ruleData = {
        source_reference: ruleSource,
        rule_type: ruleType,
        percentage: ruleType === 'PERCENTAGE' ? Number(rulePercent) : null,
        fixed_amount: ruleType === 'FIXED' ? Number(ruleFixedAmount) : null,
        destination_shortcode: ruleDestShortcode,
        destination_type: ruleDestType
      };

      if (editingRuleId) {
        await updateSettlementRuleAction(editingRuleId, ruleData);
        setRuleSuccessMsg(`Settlement rule for ${ruleSource.toUpperCase()} updated successfully.`);
      } else {
        await createSettlementRuleAction(ruleData);
        setRuleSuccessMsg(`Settlement rule for ${ruleSource.toUpperCase()} created successfully.`);
      }

      resetRuleForm();
      loadAllData();
    } catch (err: any) {
      setRuleErrorMsg(err.message || 'Failed to save settlement rule.');
    } finally {
      setRuleLoading(false);
    }
  };

  // Load an existing rule into the form for editing
  const handleEditRule = (rule: any) => {
    setEditingRuleId(rule.id);
    setRuleSource(rule.source_reference || '');
    setRuleType(rule.rule_type === 'FIXED' ? 'FIXED' : 'PERCENTAGE');
    setRulePercent(rule.percentage != null ? String(rule.percentage) : '');
    setRuleFixedAmount(rule.fixed_amount != null ? String(rule.fixed_amount) : '');
    setRuleDestType(rule.destination_type === 'PayBill' ? 'PayBill' : 'Till');
    setRuleDestShortcode(rule.destination_shortcode || '');
    setRuleSuccessMsg(null);
    setRuleErrorMsg(null);
  };

  // Enable / disable a rule without deleting it
  const handleToggleActive = async (rule: any) => {
    try {
      await updateSettlementRuleAction(rule.id, { active: !rule.active });
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to update rule status.');
    }
  };

  // Delete Settlement Rule
  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this settlement rule?')) return;
    try {
      if (editingRuleId === id) resetRuleForm();
      await deleteSettlementRuleAction(id);
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete rule.');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Settlements Card */}
        <div className="bg-panel border border-border-main rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-main uppercase font-semibold tracking-wider">Today's Settlements</span>
            <TrendingUp size={16} className="text-success-main" />
          </div>
          <div>
            <h4 className="text-lg font-bold font-mono">KES {stats.totalSettledToday.toLocaleString()}</h4>
            <p className="text-[9px] text-muted-main mt-1">SUCCESS transactions</p>
          </div>
        </div>

        {/* Pending Settlements Card */}
        <div className="bg-panel border border-border-main rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-main uppercase font-semibold tracking-wider">Pending Settlements</span>
            <Clock size={16} className="text-warning-main animate-pulse" />
          </div>
          <div>
            <h4 className="text-lg font-bold font-mono">KES {stats.pendingAmount.toLocaleString()}</h4>
            <p className="text-[9px] text-warning-main mt-1">{stats.pendingCount} in queue</p>
          </div>
        </div>

        {/* Successful Settlements Card */}
        <div className="bg-panel border border-border-main rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-main uppercase font-semibold tracking-wider">Total Successful</span>
            <CheckCircle size={16} className="text-success-main" />
          </div>
          <div>
            <h4 className="text-lg font-bold font-mono">KES {stats.successAmount.toLocaleString()}</h4>
            <p className="text-[9px] text-success-main mt-1">{stats.successCount} complete ({stats.successRate.toFixed(0)}%)</p>
          </div>
        </div>

        {/* Failed Settlements Card */}
        <div className="bg-panel border border-border-main rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-main uppercase font-semibold tracking-wider">Total Failed</span>
            <AlertOctagon size={16} className="text-danger" />
          </div>
          <div>
            <h4 className="text-lg font-bold font-mono">KES {stats.failedAmount.toLocaleString()}</h4>
            <p className="text-[9px] text-danger mt-1">{stats.failedCount} failed ({stats.failureRate.toFixed(0)}%)</p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border-main gap-2">
        <button
          onClick={() => setActiveTab('request')}
          className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'request'
              ? 'border-text-main text-text-main font-bold'
              : 'border-transparent text-muted-main hover:text-text-main'
          }`}
        >
          Initiate Transfer
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-text-main text-text-main font-bold'
              : 'border-transparent text-muted-main hover:text-text-main'
          }`}
        >
          Settlement Rules Manager
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-text-main text-text-main font-bold'
              : 'border-transparent text-muted-main hover:text-text-main'
          }`}
        >
          Calculated Queue
        </button>
      </div>

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tab 1: Form & History */}
        {activeTab === 'request' && (
          <>
            {/* Form Column */}
            <div className="bg-panel border border-border-main rounded-xl p-5 shadow-sm lg:col-span-1 h-fit">
              <div className="flex items-center gap-2 mb-2">
                <Settings size={18} className="text-warning-main" />
                <h3 className="font-bold text-sm">B2B Settlement Engine</h3>
                <span title="Disburse funds from Paybill to Till or other Paybill destinations.">
                  <HelpCircle size={14} className="text-muted-main cursor-help" />
                </span>
              </div>
              <p className="text-[10px] text-muted-main mb-4">
                Checks your last known balance where available; M-Pesa performs the final funds verification. Requires operator security PIN authorization.
              </p>

              <form onSubmit={handleInitiateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Destination Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDestinationType('Till')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        destinationType === 'Till'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      Till Number
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationType('PayBill')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        destinationType === 'PayBill'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      PayBill
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Destination Shortcode
                  </label>
                  <input
                    type="text"
                    required
                    value={destinationShortcode}
                    onChange={(e) => setDestinationShortcode(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                    placeholder={destinationType === 'Till' ? 'e.g. 522522' : 'e.g. 247247'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                    placeholder="1000"
                    min="10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Account Reference
                  </label>
                  <input
                    type="text"
                    required
                    value={accountReference}
                    onChange={(e) => setAccountReference(e.target.value.toUpperCase())}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                    placeholder="e.g. PESATRIX, BINGWAONE"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Remarks
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background"
                    placeholder="Transfer Remarks"
                  />
                </div>

                {successMsg && (
                  <div className="flex items-start gap-2 p-3 bg-success-main/10 text-success-main border border-success-main/20 rounded-lg text-xs font-medium">
                    <CheckCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {errorMsg && (
                  <div className="flex items-start gap-2 p-3 bg-danger/10 text-danger border border-danger/20 rounded-lg text-xs font-medium">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span className="break-all">{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-text-main text-panel hover:opacity-90 disabled:opacity-50 font-semibold text-xs rounded-lg shadow-sm transition-all active:scale-[0.98]"
                >
                  <Send size={14} />
                  {loading ? 'Processing Transfer...' : 'Initiate B2B Settlement'}
                </button>
              </form>
            </div>

            {/* History Column */}
            <div className="bg-panel border border-border-main rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col h-[500px]">
              <div className="mb-4">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <History size={16} /> Recent B2B Settlements
                </h3>
                <p className="text-xs text-muted-main">Real-time status tracking of outbound settlements</p>
              </div>

              <div className="flex-grow overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-main bg-background text-[10px] font-semibold text-muted-main uppercase tracking-wider sticky top-0">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Destination</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-main font-medium">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-main">
                          No B2B settlements logged yet. Use the form to trigger one.
                        </td>
                      </tr>
                    ) : (
                      requests.map((req) => (
                        <tr key={req.id} className="hover:bg-background/30 transition-colors">
                          <td className="py-3 px-3 text-muted-main font-mono whitespace-nowrap">
                            {new Date(req.created_at).toLocaleDateString()} {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold">{req.destination_shortcode}</div>
                            <div className="text-[10px] text-muted-main font-normal">{req.destination_type}</div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-danger">
                            KES {Number(req.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold">{req.account_reference}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              req.status === 'SUCCESS'
                                ? 'text-success-main bg-success-main/10'
                                : req.status === 'PENDING'
                                  ? 'text-warning-main bg-warning-main/10'
                                  : req.status === 'TIMEOUT'
                                    ? 'text-warning-main/70 bg-warning-main/5'
                                    : 'text-danger bg-danger/10'
                            }`}>
                              {req.status}
                            </span>
                            {req.result_description && req.status !== 'SUCCESS' && (
                              <div className="text-[9px] text-danger/80 mt-1 max-w-[150px] leading-tight font-medium" title={req.result_description}>
                                {req.result_description}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Settlement Rules Manager */}
        {activeTab === 'rules' && (
          <>
            {/* Create Rule Form */}
            <div className="bg-panel border border-border-main rounded-xl p-5 shadow-sm lg:col-span-1 h-fit">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {editingRuleId ? <Pencil size={18} className="text-warning-main" /> : <Plus size={18} className="text-warning-main" />}
                  <h3 className="font-bold text-sm">{editingRuleId ? 'Edit Settlement Rule' : 'Add Settlement Rule'}</h3>
                </div>
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={resetRuleForm}
                    className="text-[10px] font-semibold text-muted-main hover:text-text-main inline-flex items-center gap-1"
                  >
                    <X size={12} /> Cancel
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-main mb-4">
                Define automatic B2B split rules for successful incoming payments (STK, C2B, and Pesatrix/BingwaOne webhooks). When an incoming payment matches the source reference, the calculated amount is automatically sent to the destination via B2B.
              </p>

              <form onSubmit={handleCreateRuleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Source Reference (Account Reference)
                  </label>
                  <input
                    type="text"
                    required
                    value={ruleSource}
                    onChange={(e) => setRuleSource(e.target.value.toUpperCase())}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                    placeholder="e.g. PESATRIX"
                  />
                  <p className="text-[9px] text-muted-main mt-0.5">Rule fires when incoming payments match this reference.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Rule Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRuleType('PERCENTAGE')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        ruleType === 'PERCENTAGE'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      Percentage (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuleType('FIXED')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        ruleType === 'FIXED'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      Fixed Amount
                    </button>
                  </div>
                </div>

                {ruleType === 'PERCENTAGE' ? (
                  <div>
                    <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                      Percentage (%)
                    </label>
                    <input
                      type="number"
                      required
                      value={rulePercent}
                      onChange={(e) => setRulePercent(e.target.value)}
                      className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                      placeholder="60"
                      min="1"
                      max="100"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                      Fixed Amount (KES)
                    </label>
                    <input
                      type="number"
                      required
                      value={ruleFixedAmount}
                      onChange={(e) => setRuleFixedAmount(e.target.value)}
                      className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                      placeholder="100"
                      min="1"
                    />
                  </div>
                )}

                <div className="border-t border-border-main pt-3">
                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Destination Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setRuleDestType('Till')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        ruleDestType === 'Till'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      Till Number
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuleDestType('PayBill')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                        ruleDestType === 'PayBill'
                          ? 'border-text-main bg-text-main/10 text-text-main'
                          : 'border-border-main bg-background text-muted-main'
                      }`}
                    >
                      PayBill
                    </button>
                  </div>

                  <label className="block text-xs font-semibold text-muted-main uppercase tracking-wider mb-1">
                    Destination Shortcode
                  </label>
                  <input
                    type="text"
                    required
                    value={ruleDestShortcode}
                    onChange={(e) => setRuleDestShortcode(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-border-main rounded-lg bg-background font-mono font-bold"
                    placeholder="e.g. 123456"
                  />
                </div>

                {ruleSuccessMsg && (
                  <div className="flex items-start gap-2 p-3 bg-success-main/10 text-success-main border border-success-main/20 rounded-lg text-xs font-medium">
                    <CheckCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{ruleSuccessMsg}</span>
                  </div>
                )}

                {ruleErrorMsg && (
                  <div className="flex items-start gap-2 p-3 bg-danger/10 text-danger border border-danger/20 rounded-lg text-xs font-medium">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{ruleErrorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ruleLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-text-main text-panel hover:opacity-90 disabled:opacity-50 font-semibold text-xs rounded-lg shadow-sm transition-all active:scale-[0.98]"
                >
                  {editingRuleId ? <Pencil size={14} /> : <Plus size={14} />}
                  {ruleLoading
                    ? (editingRuleId ? 'Updating Rule...' : 'Adding Rule...')
                    : (editingRuleId ? 'Update Settlement Rule' : 'Save Settlement Rule')}
                </button>
              </form>
            </div>

            {/* Active Rules List */}
            <div className="bg-panel border border-border-main rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col h-[500px]">
              <div className="mb-4">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Activity size={16} /> Active Rules
                </h3>
                <p className="text-xs text-muted-main">Configured automatic splitting settlement rules</p>
              </div>

              <div className="flex-grow overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-main bg-background text-[10px] font-semibold text-muted-main uppercase tracking-wider sticky top-0">
                      <th className="py-2.5 px-3">Source Ref</th>
                      <th className="py-2.5 px-3">Rule Definition</th>
                      <th className="py-2.5 px-3">Destination</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-main font-medium">
                    {rules.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-main">
                          No settlement rules configured yet.
                        </td>
                      </tr>
                    ) : (
                      rules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-background/30 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-success-main uppercase">
                            {rule.source_reference}
                          </td>
                          <td className="py-3 px-3">
                            {rule.rule_type === 'PERCENTAGE' ? (
                              <span className="font-semibold text-text-main">{rule.percentage}% of transaction</span>
                            ) : (
                              <span className="font-semibold text-text-main">Fixed KES {Number(rule.fixed_amount).toLocaleString()}</span>
                            )}
                            <div className="text-[10px] text-muted-main font-normal">{rule.rule_type} type</div>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            <span className="font-semibold">{rule.destination_shortcode}</span>
                            <span className="text-[10px] text-muted-main ml-1.5">({rule.destination_type})</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              rule.active ? 'text-success-main bg-success-main/10' : 'text-muted-main bg-muted-main/10'
                            }`}>
                              {rule.active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                onClick={() => handleToggleActive(rule)}
                                className={`p-1.5 rounded-lg transition-colors inline-flex items-center ${
                                  rule.active
                                    ? 'text-success-main hover:bg-success-main/10'
                                    : 'text-muted-main hover:bg-muted-main/10'
                                }`}
                                title={rule.active ? 'Disable Rule' : 'Enable Rule'}
                              >
                                <Power size={14} />
                              </button>
                              <button
                                onClick={() => handleEditRule(rule)}
                                className="text-warning-main hover:text-warning-main/80 p-1.5 rounded-lg hover:bg-warning-main/10 transition-colors inline-flex items-center"
                                title="Edit Rule"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-danger hover:text-danger/80 p-1.5 rounded-lg hover:bg-danger/10 transition-colors inline-flex items-center"
                                title="Delete Rule"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Tab 3: Calculated Settlement Queue */}
        {activeTab === 'queue' && (
          <div className="bg-panel border border-border-main rounded-xl p-5 shadow-sm lg:col-span-3 flex flex-col h-[550px]">
            <div className="mb-4">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Layers size={16} /> Settlement Queue
              </h3>
              <p className="text-xs text-muted-main">Auto-dispatched B2B splits generated by active settlement rules</p>
            </div>

            <div className="flex-grow overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border-main bg-background text-[10px] font-semibold text-muted-main uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3">Source Ref</th>
                    <th className="py-2.5 px-3">Settlement Amount</th>
                    <th className="py-2.5 px-3">Destination Details</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-main font-medium">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-muted-main">
                        Queue is currently empty. Successful incoming payments matching active rules will populate this.
                      </td>
                    </tr>
                  ) : (
                    queue.map((item) => {
                      const ruleInfo = item.settlement_rules;
                      return (
                        <tr key={item.id} className="hover:bg-background/30 transition-colors">
                          <td className="py-3 px-3 text-muted-main font-mono">
                            {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-3 uppercase font-mono font-semibold text-success-main">
                            {ruleInfo?.source_reference || '-'}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-text-main">
                            KES {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 font-mono">
                            {ruleInfo ? (
                              <>
                                <span className="font-semibold">{ruleInfo.destination_shortcode}</span>
                                <span className="text-[10px] text-muted-main ml-1.5">({ruleInfo.destination_type})</span>
                              </>
                            ) : (
                              <span className="text-muted-main italic">Rule deleted</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              item.status === 'PROCESSED'
                                ? 'text-success-main bg-success-main/10'
                                : item.status === 'PENDING'
                                  ? 'text-warning-main bg-warning-main/10'
                                  : 'text-danger bg-danger/10'
                            }`}>
                              {item.status}
                            </span>
                            <p className="text-[8px] text-muted-main mt-0.5 leading-tight">
                              {item.status === 'PROCESSED'
                                ? 'Dispatched via B2B settlement'
                                : item.status === 'FAILED'
                                  ? 'B2B dispatch failed — check settlement history'
                                  : 'Awaiting B2B dispatch'}
                            </p>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Security PIN Authorization Modal */}
      <PinConfirmModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onConfirm={handleConfirmPin}
        title="Authorize B2B Settlement"
        description={`Please enter your dashboard PIN to authorize the outbound settlement of KES ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} to ${destinationType} ${destinationShortcode}.`}
      />
    </div>
  );
}
