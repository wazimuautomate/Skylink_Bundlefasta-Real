import { useState, useEffect } from 'react';
import { Save, Key, Link2, Shield, Eye, EyeOff, Globe, Bell, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);

  // Form State
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [paybill, setPaybill] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [passkey, setPasskey] = useState('');
  const [validationUrl, setValidationUrl] = useState('');
  const [confirmationUrl, setConfirmationUrl] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);

  // Store original config for comparison in audit logs
  const [originalConfig, setOriginalConfig] = useState<any>(null);



  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mpesa_credentials')
        .select('*')
        .eq('id', 'c1111111-1111-1111-1111-111111111111')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setOriginalConfig(data);
        setEnvironment(data.environment || 'sandbox');
        setPaybill(data.paybill_number || '');
        setConsumerKey(data.consumer_key || '');
        setConsumerSecret(data.consumer_secret || '');
        setPasskey(data.passkey || '');
        setValidationUrl(data.validation_url || '');
        setConfirmationUrl(data.confirmation_url || '');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to load settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Unauthorized');

      // 1. Update DB values
      const { error: upError } = await supabase
        .from('mpesa_credentials')
        .update({
          environment,
          paybill_number: paybill,
          shortcode: paybill,
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          passkey,
          validation_url: validationUrl,
          confirmation_url: confirmationUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', 'c1111111-1111-1111-1111-111111111111');

      if (upError) throw upError;

      // 2. Compute differences for audit logs
      const changes: Record<string, any> = {};
      if (originalConfig.environment !== environment) changes.environment = environment;
      if (originalConfig.paybill_number !== paybill) changes.paybill_number = paybill;
      if (originalConfig.consumer_key !== consumerKey) changes.consumer_key = '[modified]';
      if (originalConfig.consumer_secret !== consumerSecret) changes.consumer_secret = '[modified]';
      if (originalConfig.passkey !== passkey) changes.passkey = '[modified]';
      if (originalConfig.validation_url !== validationUrl) changes.validation_url = validationUrl;
      if (originalConfig.confirmation_url !== confirmationUrl) changes.confirmation_url = confirmationUrl;

      // 3. Write Audit Log
      await supabase.from('audit_logs').insert({
        user_id: userData.user.id,
        action: 'UPDATE_MPESA_SETTINGS',
        entity_type: 'mpesa_credentials',
        entity_id: 'c1111111-1111-1111-1111-111111111111',
        old_values: { environment: originalConfig.environment, paybill: originalConfig.paybill_number },
        new_values: changes,
        ip_address: 'settings_page'
      });

      alert('M-Pesa configurations updated and audit logs recorded.');
      fetchSettings();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };



  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-24 text-center">
        <div className="flex flex-col items-center justify-center gap-3">
          <RefreshCw size={32} className="text-brand-accent animate-spin" />
          <span className="text-sm text-brand-text/60">Fetching secure API configurations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 font-sans">
      <div>
        <h2 className="text-xl font-bold text-brand-text mb-1 font-sans">System Settings</h2>
        <p className="text-brand-text/50 text-sm">Manage secure API environments and callback webhooks.</p>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Globe className="text-brand-accent" size={20} />
            <div>
              <h3 className="font-semibold text-brand-text text-sm">Environment</h3>
              <p className="text-xs text-brand-text/50">Select your active Daraja API gateway</p>
            </div>
          </div>
          <div className="flex bg-brand-bg border border-brand-border rounded-lg p-1">
            <button 
              onClick={() => setEnvironment('sandbox')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                environment === 'sandbox' 
                  ? 'bg-status-warning/20 text-status-warning pointer-events-none' 
                  : 'text-brand-text/60 hover:text-brand-text'
              }`}
            >
              Sandbox
            </button>
            <button 
              onClick={() => setEnvironment('production')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                environment === 'production' 
                  ? 'bg-brand-accent/20 text-brand-accent pointer-events-none' 
                  : 'text-brand-text/60 hover:text-brand-text'
              }`}
            >
              Production
            </button>
          </div>
        </div>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex items-center gap-3">
          <Key className="text-brand-accent" size={20} />
          <div>
            <h3 className="font-semibold text-brand-text text-sm">API Credentials</h3>
            <p className="text-xs text-brand-text/50">Used to authenticate requests to Daraja</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Shortcode / Paybill</label>
              <input 
                type="text" 
                value={paybill}
                onChange={(e) => setPaybill(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-sm font-semibold" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Consumer Key</label>
              <input 
                type="text" 
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-xs" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Consumer Secret</label>
              <div className="relative">
                <input 
                  type={showSecret ? "text" : "password"} 
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-xs pr-10" 
                />
                <button 
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-text"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Passkey</label>
              <div className="relative">
                <input 
                  type={showPasskey ? "text" : "password"} 
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-xs pr-10" 
                />
                <button 
                  type="button"
                  onClick={() => setShowPasskey(!showPasskey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-text"
                >
                  {showPasskey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex items-center gap-3">
          <Link2 className="text-brand-accent" size={20} />
          <div>
            <h3 className="font-semibold text-brand-text text-sm">Webhook Endpoints (C2B)</h3>
            <p className="text-xs text-brand-text/50">URLs where Safaricom will route incoming transaction confirmations</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Validation URL</label>
            <div className="flex gap-3">
              <input 
                type="url" 
                value={validationUrl}
                onChange={(e) => setValidationUrl(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-xs" 
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(validationUrl);
                  alert('Validation URL copied!');
                }}
                className="px-4 py-2 bg-brand-bg border border-brand-border hover:bg-brand-panel rounded-lg text-brand-text text-xs font-semibold transition-colors whitespace-nowrap hidden sm:block"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-text/80 mb-1.5 uppercase tracking-wider">Confirmation URL</label>
            <div className="flex gap-3">
              <input 
                type="url" 
                value={confirmationUrl}
                onChange={(e) => setConfirmationUrl(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all text-xs" 
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(confirmationUrl);
                  alert('Confirmation URL copied!');
                }}
                className="px-4 py-2 bg-brand-bg border border-brand-border hover:bg-brand-panel rounded-lg text-brand-text text-xs font-semibold transition-colors whitespace-nowrap hidden sm:block"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex items-center gap-3">
          <Bell className="text-brand-accent" size={20} />
          <div>
            <h3 className="font-semibold text-brand-text text-sm">Notifications</h3>
            <p className="text-xs text-brand-text/50">Configure platform alerts for transaction events</p>
          </div>
        </div>
        <div className="p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative flex items-start pt-0.5">
              <input 
                type="checkbox" 
                className="peer sr-only" 
                checked={emailAlerts} 
                onChange={(e) => setEmailAlerts(e.target.checked)} 
              />
              <div className="w-5 h-5 rounded border border-brand-border bg-brand-bg peer-checked:bg-brand-accent peer-checked:border-brand-accent transition-all flex items-center justify-center">
                <Shield size={12} className="text-white opacity-0 peer-checked:opacity-100" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-brand-text text-sm">Send daily reconciliation reports</p>
              <p className="text-xs text-brand-text/50 mt-0.5">Receive an email summary at EOD containing summary metrics and un-reconciled items.</p>
            </div>
          </label>
        </div>
      </div>



      <div className="flex justify-end gap-4 mt-6">
        <button 
          onClick={fetchSettings}
          className="px-6 py-2.5 border border-brand-border text-brand-text/80 hover:text-brand-text hover:bg-brand-panel rounded-lg text-sm font-semibold transition-colors"
        >
          Discard Changes
        </button>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={18} />
          )}
          Save Configurations
        </button>
      </div>
    </div>
  );
}
