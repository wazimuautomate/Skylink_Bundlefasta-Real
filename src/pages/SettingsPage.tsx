import { useState } from 'react';
import { Save, Key, Link2, Shield, Eye, EyeOff, Globe, Bell } from 'lucide-react';

export function SettingsPage() {
  const [showSecret, setShowSecret] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-brand-text mb-1">System Settings</h2>
        <p className="text-brand-text/60 text-sm">Manage your M-Pesa Daraja API configurations and platform preferences.</p>
      </div>

      <div className="bg-brand-panel border border-brand-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Globe className="text-brand-accent" size={20} />
            <div>
              <h3 className="font-semibold text-brand-text">Environment</h3>
              <p className="text-xs text-brand-text/50">Select your active Daraja environment</p>
            </div>
          </div>
          <div className="flex bg-brand-bg border border-brand-border rounded-lg p-1">
            <button 
              onClick={() => setEnvironment('sandbox')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                environment === 'sandbox' 
                  ? 'bg-status-warning/20 text-status-warning pointer-events-none' 
                  : 'text-brand-text/60 hover:text-brand-text'
              }`}
            >
              Sandbox
            </button>
            <button 
              onClick={() => setEnvironment('production')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
            <h3 className="font-semibold text-brand-text">API Credentials</h3>
            <p className="text-xs text-brand-text/50">Used to authenticate requests to Daraja</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Shortcode / Paybill</label>
              <input 
                type="text" 
                defaultValue="174379"
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Consumer Key</label>
              <input 
                type="text" 
                defaultValue="Dujgfjfg124b87GgfHdfkgjkdg89"
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-sm" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Consumer Secret</label>
              <div className="relative">
                <input 
                  type={showSecret ? "text" : "password"} 
                  defaultValue="Kdhfjg7849HFJDFGKjgdfg8934"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-sm pr-10" 
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
              <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Passkey</label>
              <div className="relative">
                <input 
                  type={showPasskey ? "text" : "password"} 
                  defaultValue="bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all font-mono text-sm pr-10" 
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
            <h3 className="font-semibold text-brand-text">Webhook Endpoints (C2B)</h3>
            <p className="text-xs text-brand-text/50">URLs where Safaricom will send transaction data</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Validation URL</label>
            <div className="flex gap-3">
              <input 
                type="url" 
                defaultValue="https://api.yourdomain.com/mpesa/validate"
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" 
              />
              <button className="px-4 py-2 bg-brand-bg border border-brand-border hover:bg-brand-panel rounded-lg text-brand-text text-sm font-medium transition-colors whitespace-nowrap hidden sm:block">
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1.5">Confirmation URL</label>
            <div className="flex gap-3">
              <input 
                type="url" 
                defaultValue="https://api.yourdomain.com/mpesa/confirm"
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" 
              />
              <button className="px-4 py-2 bg-brand-bg border border-brand-border hover:bg-brand-panel rounded-lg text-brand-text text-sm font-medium transition-colors whitespace-nowrap hidden sm:block">
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
            <h3 className="font-semibold text-brand-text">Notifications</h3>
            <p className="text-xs text-brand-text/50">Configure platform alerts for transaction events</p>
          </div>
        </div>
        <div className="p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative flex items-start pt-0.5">
              <input type="checkbox" className="peer sr-only" defaultChecked />
              <div className="w-5 h-5 rounded border border-brand-border bg-brand-bg peer-checked:bg-brand-accent peer-checked:border-brand-accent transition-all flex items-center justify-center">
                <Shield size={12} className="text-white opacity-0 peer-checked:opacity-100" />
              </div>
            </div>
            <div>
              <p className="font-medium text-brand-text text-sm">Send daily reconciliation reports</p>
              <p className="text-sm text-brand-text/50">Receive an email at EOD containing summary metrics and un-reconciled items.</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-4 mt-6">
        <button className="px-6 py-2.5 border border-brand-border text-brand-text/80 hover:text-brand-text hover:bg-brand-panel rounded-lg font-medium transition-colors">
          Discard Changes
        </button>
        <button className="px-6 py-2.5 bg-brand-accent hover:opacity-90 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
          <Save size={18} />
          Save Configurations
        </button>
      </div>
    </div>
  );
}
