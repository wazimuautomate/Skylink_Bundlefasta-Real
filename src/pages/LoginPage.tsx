import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, Key, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  
  const [resetEmail, setResetEmail] = useState('');
  const [isResetSent, setIsResetSent] = useState(false);
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 1. Authenticate with Supabase Auth (email + password)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || 'Invalid credentials. Please try again.');
        setIsLoading(false);
        return;
      }

      if (!authData.session) {
        setError('Failed to establish session.');
        setIsLoading(false);
        return;
      }

      // 2. Verify Keyword via the RPC database function
      const { data: keywordValid, error: rpcError } = await supabase.rpc('verify_admin_keyword', {
        input_keyword: keyword,
      });

      if (rpcError) {
        await supabase.auth.signOut();
        setError('Keyword verification failed. Please try again.');
        setIsLoading(false);
        return;
      }

      if (!keywordValid) {
        await supabase.auth.signOut();
        setError('Access Denied: Invalid security keyword.');
        setIsLoading(false);
        return;
      }

      // 3. Keyword is valid, save flag in sessionStorage for persistence
      sessionStorage.setItem('keyword_verified', 'true');
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
      setIsLoading(false);
    }
  };
  
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      });

      if (resetError) {
        setError(resetError.message || 'Error sending reset instructions.');
        setIsLoading(false);
        return;
      }

      setIsResetSent(true);
      setIsLoading(false);
    } catch (err: any) {
      setError(err?.message || 'An error occurred sending reset link.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-accent/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-brand-accent/5 rounded-full blur-[150px] pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-brand-panel border border-brand-border flex items-center justify-center mb-4 overflow-hidden relative shadow-lg">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.nextElementSibling) {
                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                }
              }}
            />
            <div className="absolute inset-0 bg-brand-panel items-center justify-center text-brand-accent font-bold text-3xl hidden">
              S
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center tracking-tight">
            {view === 'login' ? 'Welcome Back' : 'Reset Password'}
          </h1>
          <p className="text-brand-text/60 text-sm mt-1">
            {view === 'login' ? 'Sign in to manage your Paybill operations' : 'Enter your email to receive reset instructions'}
          </p>
        </div>

        <div className="p-8 rounded-3xl bg-brand-panel/50 backdrop-blur-xl border border-brand-border shadow-xl overflow-hidden relative">
          <AnimatePresence mode="wait">
            {view === 'login' ? (
              <motion.form 
                key="login-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleLoginSubmit} 
                className="space-y-5"
              >
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/20 text-status-danger text-sm font-medium text-center"
                  >
                    {error}
                  </motion.div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-brand-text/70 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all sm:text-sm"
                      placeholder="admin@gmail.com"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-brand-text/70 ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" size={18} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all sm:text-sm"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-brand-text/70 ml-1">Admin Keyword</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" size={18} />
                    <input
                      type="password"
                      required
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all sm:text-sm"
                      placeholder="Enter keyword"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button 
                    type="button" 
                    onClick={() => {
                      setView('forgot');
                      setError('');
                    }}
                    className="text-xs font-medium text-brand-accent hover:text-brand-accent/80 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-brand-accent hover:opacity-90 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-bg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="forgot-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleResetSubmit} 
                className="space-y-5"
              >
                {isResetSent ? (
                  <div className="flex flex-col items-center justify-center text-center py-4 space-y-4">
                    <div className="w-12 h-12 rounded-full bg-status-success/10 text-status-success flex items-center justify-center">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 className="font-medium text-brand-text mb-1">Check your inbox</h3>
                      <p className="text-sm text-brand-text/60">
                        We've sent password reset instructions to <br/>
                        <span className="font-medium text-brand-text">{resetEmail}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setIsResetSent(false);
                        setResetEmail('');
                      }}
                      className="w-full mt-4 py-2.5 px-4 bg-brand-panel hover:bg-brand-bg border border-brand-border text-brand-text rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
                    >
                      Back to Login
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      type="button" 
                      onClick={() => {
                        setView('login');
                        setError('');
                      }}
                      className="absolute top-4 left-4 p-2 text-brand-text/50 hover:text-brand-text bg-brand-panel hover:bg-brand-bg border border-brand-border rounded-xl transition-colors"
                      title="Back to login"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    
                    <div className="pt-2">
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-medium text-brand-text/70 ml-1">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text/40" size={18} />
                          <input
                            type="email"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full bg-brand-bg border border-brand-border rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all sm:text-sm"
                            placeholder="Enter your email"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !resetEmail}
                      className="w-full py-2.5 px-4 bg-brand-accent hover:opacity-90 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-bg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Send Reset Link</span>
                      )}
                    </button>
                  </>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
