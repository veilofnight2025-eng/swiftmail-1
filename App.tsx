
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { mailApi } from './services/mailApi';
import { Account, Message, MessageDetail, Domain, AutoPurgeSettings } from './types';
import { MailIcon, RefreshIcon, CopyIcon, TrashIcon, ArrowLeftIcon, CheckIcon, SunIcon, MoonIcon, CogIcon, GlobeIcon } from './components/Icons';

const REFRESH_INTERVAL = 15000;

const PURGE_OPTIONS = [
  { label: '1 Hour', value: 3600000 },
  { label: '12 Hours', value: 43200000 },
  { label: '24 Hours', value: 86400000 },
  { label: '7 Days', value: 604800000 },
  { label: '30 Days', value: 2592000000 },
];

const App: React.FC = () => {
  // Navigation & View State
  const [view, setView] = useState<'landing' | 'app'>('landing');

  // Mail & Account State
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('swiftmail_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Auto Purge State
  const [autoPurge, setAutoPurge] = useState<AutoPurgeSettings>(() => {
    const saved = localStorage.getItem('swiftmail_auto_purge');
    return saved ? JSON.parse(saved) : { enabled: false, durationMs: 86400000 };
  });

  // UI States
  const [showRestorer, setShowRestorer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restoreAddress, setRestoreAddress] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  // Confirmation State
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Theme Sync
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('swiftmail_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('swiftmail_theme', 'light');
    }
  }, [isDarkMode]);

  // Settings Persist
  useEffect(() => {
    localStorage.setItem('swiftmail_auto_purge', JSON.stringify(autoPurge));
  }, [autoPurge]);

  const createFreshAccount = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const domains = await mailApi.getDomains();
      const activeDomains = domains.filter(d => d.isActive);
      if (activeDomains.length === 0) throw new Error('No available mail domains found.');
      
      const prefix = Math.random().toString(36).substring(2, 12);
      const domain = activeDomains[0].domain;
      const address = `${prefix}@${domain}`;
      const pass = Math.random().toString(36).substring(2, 12);

      const newAccount = await mailApi.createAccount(address, pass);
      const auth = await mailApi.getToken(address, pass);
      
      setAccount(newAccount);
      setToken(auth.token);
      setPassword(pass);
      setMessages([]);
      setSelectedMessage(null);

      localStorage.setItem('swiftmail_account', JSON.stringify(newAccount));
      localStorage.setItem('swiftmail_token', auth.token);
      localStorage.setItem('swiftmail_password', pass);
    } catch (err: any) {
      setError(err.message || 'Identity deployment failed.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    const storedAccount = localStorage.getItem('swiftmail_account');
    const storedToken = localStorage.getItem('swiftmail_token');
    const storedPassword = localStorage.getItem('swiftmail_password');

    if (storedAccount && storedToken && storedPassword) {
      setAccount(JSON.parse(storedAccount));
      setToken(storedToken);
      setPassword(storedPassword);
      setIsLoading(false);
    } else {
      await createFreshAccount();
      setIsLoading(false);
    }
  }, [createFreshAccount]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Purge Logic
  const performPurge = useCallback(async (msgs: Message[], currentToken: string) => {
    if (!autoPurge.enabled) return msgs;
    const now = Date.now();
    const threshold = now - autoPurge.durationMs;
    
    const messagesToPurge = msgs.filter(m => new Date(m.createdAt).getTime() < threshold);
    if (messagesToPurge.length === 0) return msgs;

    const results = await Promise.allSettled(
      messagesToPurge.map(m => mailApi.deleteMessage(m.id, currentToken))
    );

    const purgedIds = messagesToPurge
      .filter((_, idx) => results[idx].status === 'fulfilled')
      .map(m => m.id);

    return msgs.filter(m => !purgedIds.includes(m.id));
  }, [autoPurge]);

  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsRefreshing(true);
    try {
      let msgs = await mailApi.getMessages(token);
      if (autoPurge.enabled) {
        msgs = await performPurge(msgs, token);
      }
      setMessages(msgs);
    } catch (err) {
      console.error('Feed sync failed');
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [token, autoPurge, performPurge]);

  useEffect(() => {
    if (token) {
      fetchMessages(true);
      const interval = setInterval(() => fetchMessages(), REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [token, fetchMessages]);

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreAddress || !restorePassword) return;
    setIsGenerating(true);
    setError(null);
    try {
      const auth = await mailApi.getToken(restoreAddress, restorePassword);
      const acc = await mailApi.getAccount(auth.id, auth.token);
      
      setAccount(acc);
      setToken(auth.token);
      setPassword(restorePassword);
      setMessages([]);
      setSelectedMessage(null);
      setShowRestorer(false);
      setView('app');
      
      localStorage.setItem('swiftmail_account', JSON.stringify(acc));
      localStorage.setItem('swiftmail_token', auth.token);
      localStorage.setItem('swiftmail_password', restorePassword);
      
      fetchMessages(true);
    } catch (err: any) {
      setError(err.message || 'Identity sync failed. Please check your credentials.');
    } finally {
      setIsGenerating(false);
    }
  };

  const executeNewIdentity = async () => {
    if (account?.id && token) {
      mailApi.deleteAccount(account.id, token).catch(() => {});
    }

    setAccount(null);
    setToken(null);
    setPassword(null);
    setMessages([]);
    setSelectedMessage(null);
    localStorage.removeItem('swiftmail_account');
    localStorage.removeItem('swiftmail_token');
    localStorage.removeItem('swiftmail_password');

    await createFreshAccount();
    setConfirmation(prev => ({ ...prev, isOpen: false }));
  };

  const handleNewIdentity = () => {
    setConfirmation({
      isOpen: true,
      title: 'Switch Identity?',
      message: 'Current address and all messages will be permanently cleared from this node and deleted from the grid.',
      confirmText: 'Establish New Link',
      onConfirm: executeNewIdentity,
    });
  };

  const executeDeleteMessage = async (id: string) => {
    if (!token) return;
    try {
      await mailApi.deleteMessage(id, token);
      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) {
        setSelectedMessage(null);
      }
      setConfirmation(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      setError("Purge failed.");
    }
  };

  const handleDeleteMessage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmation({
      isOpen: true,
      title: 'Purge Message?',
      message: 'This packet will be permanently removed from the relay matrix and cannot be recovered.',
      confirmText: 'Purge Packet',
      onConfirm: () => executeDeleteMessage(id),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading && !error && !account) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4 shadow-xl"></div>
          <p className="text-slate-600 dark:text-slate-400 font-bold uppercase text-xs tracking-[0.3em]">Accessing Grid...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Inter'] transition-colors duration-300 overflow-x-hidden">
      
      {/* Global Confirmation Modal */}
      {confirmation.isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-12 text-center">
              <div className="w-24 h-24 bg-red-50 dark:bg-red-950/30 rounded-[2rem] flex items-center justify-center mx-auto mb-10 text-red-600">
                <TrashIcon className="w-12 h-12" />
              </div>
              <h3 className="text-4xl font-black tracking-tighter dark:text-white mb-6 uppercase tracking-widest">{confirmation.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 font-bold leading-relaxed mb-12 px-6">
                {confirmation.message}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button 
                  onClick={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                  className="w-full py-6 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmation.onConfirm}
                  className="w-full py-6 bg-red-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-red-700 shadow-2xl shadow-red-200 dark:shadow-none transition-all active:scale-95"
                >
                  {confirmation.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[100] h-20 flex items-center px-6 transition-all">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setView('landing')}>
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-transform group-hover:scale-110">
              <MailIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter dark:text-white">SwiftMail<span className="text-indigo-600">.</span></span>
          </div>
          
          <div className="hidden md:flex items-center gap-10">
            <button onClick={() => setView('landing')} className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${view === 'landing' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>Protocol</button>
            <button onClick={() => setView('app')} className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${view === 'app' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>Inbox Relay</button>
          </div>

          <div className="flex items-center gap-4">
            {view === 'app' && (
              <button onClick={() => setShowSettings(true)} className="p-3 text-slate-500 hover:text-indigo-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <CogIcon className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 text-slate-500 hover:text-indigo-600 dark:text-slate-400 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            {view === 'landing' && (
              <button onClick={() => setView('app')} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-lg transition-all active:scale-95">
                Launch Dashboard
              </button>
            )}
          </div>
        </div>
      </nav>

      {view === 'landing' ? (
        <div className="animate-in fade-in duration-1000">
          <section className="relative pt-32 pb-48 px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto relative z-10 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-800 mb-10">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Stateless Node Active</span>
              </div>
              <h1 className="text-6xl md:text-8xl font-black leading-none tracking-tighter dark:text-white mb-8">
                Disposable Email. <br/> <span className="text-indigo-600">Reimagined.</span>
              </h1>
              <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed mb-12">
                Deploy instant temporary identities on a secure global relay network. High speed, zero logs, complete privacy.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
                <button onClick={() => setView('app')} className="w-full sm:w-auto px-16 py-7 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.3em] rounded-2xl shadow-[0_25px_60px_-15px_rgba(79,70,229,0.4)] transition-all hover:-translate-y-1 text-lg">
                  Start Generating
                </button>
                <button onClick={() => setShowRestorer(true)} className="w-full sm:w-auto px-12 py-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all text-sm">
                  Restore Access
                </button>
              </div>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-indigo-600/5 blur-[200px] rounded-full -z-10"></div>
          </section>
        </div>
      ) : (
        <div className="animate-in slide-in-from-bottom-8 duration-700">
          <main className="max-w-6xl w-full mx-auto px-6 py-12 flex flex-col gap-10">
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-8 py-6 rounded-[2rem] flex items-center gap-5 shadow-2xl animate-in zoom-in-95">
                <span className="flex-shrink-0 w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center font-black text-xl">!</span>
                <div className="flex-1 text-sm font-bold">{error}</div>
                <button onClick={() => setError(null)} className="px-4 py-2 text-[10px] uppercase font-black opacity-60">Dismiss</button>
              </div>
            )}

            {/* Settings Overlay */}
            {showSettings && (
              <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md">
                <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-[3.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 shadow-2xl">
                  <div className="bg-slate-950 p-12 text-white flex justify-between items-center">
                    <h3 className="text-3xl font-black uppercase tracking-widest">Preferences</h3>
                    <button onClick={() => setShowSettings(false)} className="bg-white/20 w-12 h-12 rounded-full hover:bg-white/30 transition-all">✕</button>
                  </div>
                  <div className="p-12 space-y-12">
                    <div className="flex items-center justify-between p-8 bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border border-slate-100 dark:border-slate-800">
                      <div className="space-y-1">
                        <h4 className="text-xl font-black dark:text-white">Auto-Purge Node</h4>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest opacity-60">Wipe messages based on age</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={autoPurge.enabled} onChange={(e) => setAutoPurge({ ...autoPurge, enabled: e.target.checked })} className="sr-only peer" />
                        <div className="w-16 h-8 bg-slate-200 dark:bg-slate-700 peer-checked:bg-indigo-600 rounded-full transition-all after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-7 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>
                    {autoPurge.enabled && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {PURGE_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => setAutoPurge({ ...autoPurge, durationMs: opt.value })} className={`px-5 py-4 rounded-2xl border text-[11px] font-black transition-all ${autoPurge.durationMs === opt.value ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 dark:border-slate-800 text-slate-500'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setShowSettings(false)} className="w-full py-6 bg-slate-900 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95">Save Changes</button>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Control */}
            <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] shadow-sm border border-slate-200 dark:border-slate-800 p-12 relative overflow-hidden group">
              <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-16">
                <div className="flex-1 w-full text-center xl:text-left">
                  <div className="flex items-center justify-center xl:justify-start gap-4 mb-8">
                    <span className="w-3.5 h-3.5 rounded-full bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)] animate-pulse"></span>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.6em]">Node Grid Active</label>
                  </div>
                  <div className="flex flex-wrap items-center justify-center xl:justify-start gap-8 mb-10">
                    <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter dark:text-white break-all leading-none">
                      {isGenerating ? <span className="animate-pulse opacity-20">Provisioning...</span> : (account?.address || "No Signal")}
                    </h2>
                    {account && !isGenerating && (
                      <button onClick={() => copyToClipboard(account.address)} className="p-6 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-[2.5rem] border border-slate-100 dark:border-slate-800 transition-all active:scale-90 relative shadow-inner">
                        {copied ? <CheckIcon className="w-8 h-8 text-green-500" /> : <CopyIcon className="w-8 h-8" />}
                      </button>
                    )}
                  </div>
                  {account && password && (
                    <div className="inline-flex flex-col sm:flex-row items-center gap-10 p-8 bg-slate-50/50 dark:bg-slate-800/30 backdrop-blur-md rounded-[2.5rem] border border-slate-100 dark:border-slate-800 border-dashed">
                      <div className="text-left">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Relay Secret Key</p>
                        <div className="flex items-center gap-6">
                          <span className="text-sm font-mono font-black">{showPassword ? password : '••••••••••••'}</span>
                          <button onClick={() => setShowPassword(!showPassword)} className="text-[11px] font-black text-indigo-600 uppercase">{showPassword ? 'Hide' : 'View'}</button>
                        </div>
                      </div>
                      <button onClick={() => copyToClipboard(password)} className="px-8 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-all active:scale-95 shadow-sm">Copy Secret</button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-5 w-full sm:w-auto min-w-[340px]">
                  <button onClick={() => fetchMessages(true)} disabled={isRefreshing || !token} className="flex items-center justify-center gap-5 px-14 py-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2.5rem] font-black uppercase text-sm tracking-[0.4em] shadow-xl disabled:opacity-50 transition-all active:scale-95 group/btn">
                    <RefreshIcon className={`w-8 h-8 ${isRefreshing ? 'animate-spin' : 'group-hover/btn:rotate-180 transition-all duration-1000'}`} />
                    Sync Node
                  </button>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={handleNewIdentity} disabled={isGenerating} className="flex items-center justify-center gap-2 px-8 py-5 bg-slate-50 dark:bg-slate-800 hover:bg-red-600 hover:text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                      <RefreshIcon className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} /> Change
                    </button>
                    <button onClick={() => setShowRestorer(true)} disabled={isGenerating} className="flex items-center justify-center gap-2 px-8 py-5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                      <GlobeIcon className="w-5 h-5" /> Restore
                    </button>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-[150px] -mr-80 -mt-80 opacity-30 group-hover:opacity-70 transition-all duration-1000"></div>
            </div>

            {/* Inbox */}
            <div className="flex flex-col min-h-[700px]">
              {selectedMessage ? (
                <div className="bg-white dark:bg-slate-900 rounded-[4rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col flex-1 animate-in slide-in-from-bottom-12 duration-700">
                  <div className="px-12 py-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-20">
                    <button onClick={() => setSelectedMessage(null)} className="flex items-center gap-4 text-[12px] font-black text-slate-500 hover:text-indigo-600 transition-all uppercase tracking-[0.2em]">
                      <ArrowLeftIcon className="w-6 h-6" /> Back to Node
                    </button>
                    <button onClick={(e) => handleDeleteMessage(e, selectedMessage.id)} className="w-16 h-16 flex items-center justify-center bg-red-50 dark:bg-red-950/20 text-red-600 rounded-3xl hover:bg-red-100 transition-all">
                      <TrashIcon className="w-8 h-8" />
                    </button>
                  </div>
                  <div className="p-12 md:p-24 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-4xl mx-auto space-y-16">
                      <h3 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight dark:text-white">{selectedMessage.subject || '(Relay Fragment)'}</h3>
                      <div className="flex flex-col sm:flex-row items-center gap-8 p-10 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                        <div className="w-20 h-20 rounded-[1.75rem] bg-indigo-600 text-white flex items-center justify-center font-black text-4xl shadow-2xl">
                          {selectedMessage.from.name ? selectedMessage.from.name[0].toUpperCase() : 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xl font-black mb-1 dark:text-white">{selectedMessage.from.name || 'Origin Relay'}</p>
                          <p className="text-sm font-mono text-slate-400 italic truncate tracking-tighter">{selectedMessage.from.address}</p>
                        </div>
                        <div className="sm:text-right w-full sm:w-auto">
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">{new Date(selectedMessage.createdAt).toLocaleDateString()}</p>
                          <p className="text-3xl font-black dark:text-white">{new Date(selectedMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <article className="bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-100 dark:border-slate-800 p-12 md:p-20 shadow-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        {selectedMessage.html && selectedMessage.html.length > 0 ? (
                          <div className="prose dark:prose-invert prose-indigo max-w-none text-lg" dangerouslySetInnerHTML={{ __html: selectedMessage.html[0] }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-xl font-medium">{selectedMessage.text}</pre>
                        )}
                      </article>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all">
                  <div className="px-12 py-10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <div className="flex items-center gap-4">
                      <h3 className="font-black uppercase tracking-[0.4em] text-[13px] text-slate-400">Identity Relay Feed</h3>
                      {autoPurge.enabled && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/20 rounded-full border border-amber-100 dark:border-amber-900/30">
                          <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Wipe Active</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 px-6 py-3 bg-green-50 dark:bg-green-950/20 rounded-full border border-green-100 dark:border-green-900/30">
                      <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                      <p className="text-[12px] font-black text-green-700 dark:text-green-500 uppercase tracking-widest">Synced</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-56 text-center opacity-40 animate-in fade-in">
                        <div className="p-16 bg-slate-50 dark:bg-slate-800 rounded-[4rem] mb-12">
                          <MailIcon className="w-32 h-32 text-indigo-200" />
                        </div>
                        <h4 className="text-4xl font-black uppercase mb-6 dark:text-white tracking-tighter">Awaiting Signal</h4>
                        <p className="text-sm font-black uppercase tracking-[0.4em] max-w-lg mx-auto">Listening at <span className="text-indigo-600 block mt-4 font-mono lowercase tracking-normal text-xl">{account?.address || "provisioning..."}</span></p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {messages.map(msg => (
                          <div key={msg.id} onClick={() => { mailApi.getMessage(msg.id, token!).then(setSelectedMessage); }} className={`px-12 py-12 flex items-center gap-12 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all border-l-[12px] group relative ${!msg.seen ? 'border-indigo-600 bg-indigo-50/20' : 'border-transparent'}`}>
                            <div className={`w-20 h-20 rounded-[2rem] flex-shrink-0 flex items-center justify-center font-black text-3xl shadow-sm group-hover:scale-110 transition-transform ${!msg.seen ? 'bg-indigo-600 text-white shadow-2xl' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                              {msg.from.name ? msg.from.name[0].toUpperCase() : 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-3">
                                <p className={`text-xl truncate tracking-tight ${!msg.seen ? 'font-black text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 font-bold'}`}>{msg.from.name || msg.from.address}</p>
                                <span className="text-[12px] text-slate-400 font-black uppercase tracking-widest ml-12 whitespace-nowrap">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className={`text-lg truncate mb-2 ${!msg.seen ? 'font-black text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 font-bold'}`}>{msg.subject || '(Relay Fragment)'}</p>
                              <p className="text-sm text-slate-400 dark:text-slate-500 truncate font-black uppercase tracking-[0.1em] opacity-40 leading-relaxed max-w-3xl">{msg.intro}</p>
                            </div>
                            <button onClick={(e) => handleDeleteMessage(e, msg.id)} className="opacity-0 group-hover:opacity-100 w-16 h-16 flex items-center justify-center text-slate-300 hover:text-red-600 transition-all rounded-3xl hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0">
                              <TrashIcon className="w-8 h-8" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* Restore Overlay */}
      {showRestorer && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-xl rounded-[3rem] p-12 text-white border border-slate-800 animate-in zoom-in-95 shadow-2xl">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-3xl font-black tracking-tighter uppercase tracking-widest">Re-Sync Node</h3>
              <button onClick={() => setShowRestorer(false)} className="bg-slate-800 w-10 h-10 rounded-full hover:bg-slate-700 transition-all">✕</button>
            </div>
            <form onSubmit={handleRestore} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Node Address</label>
                <input type="email" value={restoreAddress} onChange={(e) => setRestoreAddress(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-8 py-5 outline-none focus:ring-2 focus:ring-indigo-500 font-bold placeholder:text-slate-600" placeholder="user@domain.com" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Secret Relay Key</label>
                <input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-8 py-5 outline-none focus:ring-2 focus:ring-indigo-500 font-bold placeholder:text-slate-600" placeholder="••••••••••••" required />
              </div>
              <button type="submit" disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-500 py-6 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl disabled:opacity-50 transition-all active:scale-95">Establish Link</button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-24 transition-all">
        <div className="max-w-7xl mx-auto px-6 text-center">
           <div className="flex items-center justify-center gap-4 mb-6">
              <div className="bg-slate-950 dark:bg-white p-3 rounded-2xl">
                <MailIcon className="w-6 h-6 text-white dark:text-slate-950" />
              </div>
              <span className="text-2xl font-black tracking-tighter uppercase dark:text-white">SwiftMail Grid</span>
           </div>
           <p className="text-slate-400 dark:text-slate-600 text-[11px] font-black uppercase tracking-[0.4em] leading-loose max-w-sm mx-auto opacity-60 mb-8">
             Global Disposable Mail Relay • Stateless Nodes • Instant Signal Lock
           </p>
           <p className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">© 2025 SwiftMail Matrix Technologies.</p>
        </div>
      </footer>

      {/* Floating Action Button */}
      {view === 'landing' && (
        <button onClick={() => setView('app')} className="fixed bottom-10 right-10 w-20 h-20 bg-indigo-600 text-white rounded-[2.5rem] shadow-2xl flex items-center justify-center active:scale-95 transition-all z-[90]">
          <MailIcon className="w-10 h-10" />
        </button>
      )}
    </div>
  );
};

export default App;
