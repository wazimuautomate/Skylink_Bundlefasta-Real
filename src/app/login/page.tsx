'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, Key, ArrowLeft, CheckCircle2, Zap } from 'lucide-react';
import { loginAction, demoLoginAction, resetPasswordAction } from './actions';

export default function LoginPage() {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');

  const [resetEmail, setResetEmail] = useState('');
  const [isResetSent, setIsResetSent] = useState(false);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setSuccess(false);

    if (keyword !== 'bnk' && email !== 'demo@skylink.com') {
      setError('Invalid Admin Keyword. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await loginAction({ email, authPin: password });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 800);
      } else {
        setError(res.error || 'Invalid credentials. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await resetPasswordAction(resetEmail);
      if (res.success) {
        setIsResetSent(true);
      } else {
        setError(res.error || 'Failed to send reset link.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await demoLoginAction();
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 800);
      } else {
        setError(res.error || 'Demo initialization failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during seeding.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-main flex items-center justify-center p-4 relative overflow-hidden font-outfit antialiased">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-panel border border-border-main flex items-center justify-center mb-4 overflow-hidden relative shadow-lg">
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
            <div className="absolute inset-0 bg-panel flex items-center justify-center text-accent font-bold text-3xl hidden">
              S
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center tracking-tight">
            {view === 'login' ? 'Welcome Back' : 'Reset Password'}
          </h1>
          <p className="text-muted-main text-sm mt-1">
            {view === 'login' ? 'Sign in to manage your Paybill operations' : 'Enter your email to receive reset instructions'}
          </p>
        </div>

        <div className="p-8 rounded-3xl bg-panel/50 backdrop-blur-xl border border-border-main shadow-xl overflow-hidden relative">
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
                    className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center"
                  >
                    {error}
                  </motion.div>
                )}

                {success && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 rounded-xl bg-success-main/10 border border-success-main/20 text-success-main text-sm font-medium text-center flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>Signing in successfully...</span>
                  </motion.div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-main/70 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-main/40" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-background border border-border-main rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all sm:text-sm text-text-main"
                      placeholder="admin@gmail.com"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-main/70 ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-main/40" size={18} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-background border border-border-main rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all sm:text-sm text-text-main"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-main/70 ml-1">Admin Keyword</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-text-main/40" size={18} />
                    <input
                      type="password"
                      required
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      className="w-full bg-background border border-border-main rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all sm:text-sm text-text-main"
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
                    className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || demoLoading}
                  className="w-full py-2.5 px-4 bg-accent hover:opacity-90 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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

                <div className="relative flex items-center justify-center my-4">
                  <div className="w-full border-t border-border-main"></div>
                  <span className="relative bg-panel px-3 text-[10px] font-semibold text-muted-main uppercase tracking-wider">
                    Development Shortcut
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={isLoading || demoLoading}
                  className="w-full py-2.5 px-4 bg-panel hover:bg-background border border-border-main text-accent rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Zap size={12} className={demoLoading ? 'animate-bounce' : ''} />
                  {demoLoading ? 'Auto-Seeding...' : 'Quick Demo Seed & Login'}
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
                    <div className="w-12 h-12 rounded-full bg-success-main/10 text-success-main flex items-center justify-center">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 className="font-medium text-text-main mb-1">Check your inbox</h3>
                      <p className="text-sm text-muted-main text-center">
                        We've sent password reset instructions to <br/>
                        <span className="font-medium text-text-main">{resetEmail}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setIsResetSent(false);
                        setResetEmail('');
                      }}
                      className="w-full mt-4 py-2.5 px-4 bg-panel hover:bg-background border border-border-main text-text-main rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
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
                      className="absolute top-4 left-4 p-2 text-text-main/50 hover:text-text-main bg-panel hover:bg-background border border-border-main rounded-xl transition-colors cursor-pointer"
                      title="Back to login"
                    >
                      <ArrowLeft size={16} />
                    </button>

                    {error && (
                      <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center">
                        {error}
                      </div>
                    )}
                    
                    <div className="pt-2">
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-medium text-text-main/70 ml-1">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-main/40" size={18} />
                          <input
                            type="email"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full bg-background border border-border-main rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all sm:text-sm text-text-main"
                            placeholder="Enter your email"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !resetEmail}
                      className="w-full py-2.5 px-4 bg-accent hover:opacity-90 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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
