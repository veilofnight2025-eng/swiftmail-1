
import React, { useState, useEffect, useCallback } from 'react';
import { mailApi } from './services/mailApi';
import { Account, Message, MessageDetail, AutoPurgeSettings } from './types';
import { 
  MailIcon, RefreshIcon, CopyIcon, TrashIcon, ArrowLeftIcon, 
  CheckIcon, SunIcon, MoonIcon, CogIcon, GlobeIcon 
} from './components/Icons';

const REFRESH_INTERVAL = 15000;

const BLOG_POSTS = [
  {
    id: 'why-temp-email',
    title: 'Why use temporary email?',
    excerpt: 'In an era of relentless tracking, disposable identities are your first line of defense.',
    date: 'Oct 24, 2025',
    content: `
      Digital footprints are permanent. Every time you register for a "free" service with your primary email, you are trading your privacy for convenience. 
      Temporary email services like SwiftMail provide a stateless buffer between you and the data harvesters.
      
      Key benefits include:
      - Avoiding permanent tracking by third-party marketing firms.
      - Protecting your primary inbox from potential data breaches.
      - Testing services without committing to a long-term relationship.
      - Keeping your personal identity separate from your digital activities.
    `
  },
  {
    id: 'avoid-spam',
    title: 'How to avoid spam emails',
    excerpt: 'Master the art of inbox hygiene and reclaim your digital peace of mind.',
    date: 'Oct 22, 2025',
    content: `
      Spam isn't just annoying; it's a vector for phishing and malware. The most effective way to avoid spam is to never give out your real address in the first place.
      
      Pro-tips for a clean inbox:
      1. Use SwiftMail for one-time registrations and downloads.
      2. Never click "Unsubscribe" in suspicious emails; it confirms your address is active.
      3. Use alias systems for services you actually trust.
      4. Deploy a temporary identity when accessing public Wi-Fi portals.
    `
  }
];

const PURGE_OPTIONS = [
  { label: '1 Hour', value: 3600000 },
  { label: '12 Hours', value: 43200000 },
  { label: '24 Hours', value: 86400000 },
  { label: '7 Days', value: 604800000 },
  { label: '30 Days', value: 2592000000 },
];

type View = 'landing' | 'app' | 'about' | 'privacy' | 'terms' | 'contact' | 'blog' | 'blog-post';

const App: React.FC = () => {
  const [view, setView] = useState<View>('landing');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

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

  const [autoPurge, setAutoPurge] = useState<AutoPurgeSettings>(() => {
    const saved = localStorage.getItem('swiftmail_auto_purge');
    return saved ? JSON.parse(saved) : { enabled: false, durationMs: 86400000 };
  });

  const [showRestorer, setShowRestorer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restoreAddress, setRestoreAddress] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Theme & Settings Sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('swiftmail_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

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
      const address = `${prefix}@${activeDomains[0].domain}`;
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

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const storedAccount = localStorage.getItem('swiftmail_account');
      const storedToken = localStorage.getItem('swiftmail_token');
      const storedPassword = localStorage.getItem('swiftmail_password');
      if (storedAccount && storedToken && storedPassword) {
        setAccount(JSON.parse(storedAccount));
        setToken(storedToken);
        setPassword(storedPassword);
      } else {
        await createFreshAccount();
      }
      setIsLoading(false);
    };
    init();
  }, [createFreshAccount]);

  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsRefreshing(true);
    try {
      let msgs = await mailApi.getMessages(token);
      setMessages(msgs);
    } catch (err) { console.error('Feed sync failed'); } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && view === 'app') {
      fetchMessages(true);
      const interval = setInterval(() => fetchMessages(), REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [token, fetchMessages, view]);

  const navigateToPost = (id: string) => {
    setSelectedPostId(id);
    setView('blog-post');
    window.scrollTo(0, 0);
  };

  const PageHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="max-w-4xl mx-auto text-center py-24 px-6 animate-in fade-in duration-700">
      <h1 className="text-6xl md:text-8xl font-black tracking-tighter dark:text-white mb-8 leading-none">
        {title}
      </h1>
      {subtitle && <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{subtitle}</p>}
    </div>
  );

  const ContentSection = ({ children }: { children: React.ReactNode }) => (
    <section className="max-w-4xl mx-auto px-6 pb-32 animate-in slide-in-from-bottom-8 duration-700">
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 p-12 md:p-20 shadow-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateNew = () => {
    setView('app');
    createFreshAccount();
    window.scrollTo(0, 0);
  };

  if (isLoading && !account) {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-700">
      
      {/* Shared Navbar */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[100] h-20 flex items-center px-6">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setView('landing')}>
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-transform group-hover:scale-110">
              <MailIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter dark:text-white">SwiftMail<span className="text-indigo-600">.</span></span>
          </div>
          <div className="hidden lg:flex items-center gap-10">
            {(['landing', 'app', 'blog', 'about', 'contact'] as View[]).map((v) => (
              <button 
                key={v}
                onClick={() => setView(v)} 
                className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${view === v ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}
              >
                {v === 'landing' ? 'Protocol' : v === 'app' ? 'Dashboard' : v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 text-slate-500 hover:text-indigo-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <button onClick={handleGenerateNew} disabled={isGenerating} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
              {isGenerating ? 'Deploying...' : 'Generate New'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Switcher */}
      {view === 'landing' && (
        <section className="relative pt-32 pb-48 px-6 overflow-hidden">
          <div className="max-w-7xl mx-auto text-center relative z-10">
            <h1 className="text-6xl md:text-9xl font-black leading-none tracking-tighter dark:text-white mb-8">
              Digital Privacy <br/> <span className="text-indigo-600">Unlocked.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed mb-12">
              SwiftMail provides high-speed, disposable identities for a cleaner, safer internet experience. Zero logs, maximum speed.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
              <button onClick={() => setView('app')} className="w-full sm:w-auto px-16 py-7 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.3em] rounded-2xl shadow-2xl transition-all hover:-translate-y-1">
                Access Dashboard
              </button>
              <button onClick={() => setView('blog')} className="w-full sm:w-auto px-12 py-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all">
                Read Journal
              </button>
            </div>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-indigo-600/5 blur-[200px] rounded-full -z-10"></div>
        </section>
      )}

      {view === 'app' && (
        <main className="max-w-6xl w-full mx-auto px-6 py-12 flex flex-col gap-10 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] shadow-sm border border-slate-200 dark:border-slate-800 p-12">
            <div className="flex flex-col xl:flex-row items-center justify-between gap-16">
              <div className="flex-1 w-full text-center xl:text-left">
                <div className="flex items-center justify-center xl:justify-start gap-4 mb-8">
                  <span className={`w-3.5 h-3.5 rounded-full ${isGenerating ? 'bg-amber-500 animate-pulse' : 'bg-green-500 shadow-xl animate-pulse'}`}></span>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.6em]">{isGenerating ? 'Provisioning Identity' : 'Node Active'}</label>
                </div>
                <h2 className="text-4xl sm:text-6xl font-black tracking-tighter dark:text-white break-all mb-10 leading-none min-h-[1.2em]">
                  {isGenerating ? 'Relaying Signal...' : (account?.address || 'Searching Grid...')}
                </h2>
                {!isGenerating && account && (
                  <button onClick={() => copyToClipboard(account.address)} className="flex items-center gap-3 px-8 py-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all mx-auto xl:mx-0">
                    {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    {copied ? 'Copied Identity' : 'Copy Address'}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <button onClick={() => fetchMessages(true)} disabled={isRefreshing || isGenerating} className="px-14 py-8 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50">
                  {isRefreshing ? 'Syncing...' : 'Sync Inbox'}
                </button>
                <button onClick={handleGenerateNew} disabled={isGenerating} className="px-14 py-4 bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest hover:bg-red-50 hover:text-red-600 transition-colors">
                  Generate Fresh
                </button>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] border border-slate-200 dark:border-slate-800 min-h-[500px] overflow-hidden">
            {messages.length === 0 ? (
              <div className="p-24 text-center opacity-40">
                <MailIcon className="w-24 h-24 mx-auto mb-6 text-indigo-200" />
                <p className="font-black uppercase tracking-widest text-xs">Waiting for incoming signal...</p>
                <p className="text-[10px] mt-2 tracking-[0.3em]">Listening on {account?.address}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {messages.map(msg => (
                  <div key={msg.id} onClick={() => { mailApi.getMessage(msg.id, token!).then(setSelectedMessage); }} className="px-12 py-10 flex items-center gap-8 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xl text-slate-400">
                      {msg.from.name ? msg.from.name[0].toUpperCase() : 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate dark:text-white">{msg.from.name || msg.from.address}</p>
                      <p className="text-sm font-black uppercase tracking-widest text-indigo-600 truncate">{msg.subject || '(Relay Fragment)'}</p>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {view === 'about' && (
        <>
          <PageHeader title="Our Manifesto" subtitle="Privacy is not a privilege; it is a fundamental human right in the digital age." />
          <ContentSection>
            <div className="space-y-10 text-xl leading-relaxed">
              <p className="font-bold text-slate-900 dark:text-white">SwiftMail was born out of frustration with the modern web. The internet has become a network of checkpoints where your identity is the currency of admission.</p>
              <p>Our mission is to restore the "Disposable" nature of early web interactions. By leveraging the Mail.tm relay matrix, we provide instant, stateless email nodes that vanish once their purpose is served.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-12">
                <div className="p-10 bg-slate-50 dark:bg-slate-800 rounded-[2rem]">
                  <h4 className="font-black text-indigo-600 mb-4 uppercase tracking-widest">Zero Retention</h4>
                  <p className="text-sm font-medium">We do not store logs. Once a node is deleted, its connection to the grid is permanently severed.</p>
                </div>
                <div className="p-10 bg-slate-50 dark:bg-slate-800 rounded-[2rem]">
                  <h4 className="font-black text-indigo-600 mb-4 uppercase tracking-widest">Global Relay</h4>
                  <p className="text-sm font-medium">Built on a distributed infrastructure ensuring your data never rests in one jurisdiction for long.</p>
                </div>
              </div>
            </div>
          </ContentSection>
        </>
      )}

      {view === 'blog' && (
        <>
          <PageHeader title="Journal" subtitle="Insights into digital hygiene and the future of privacy." />
          <div className="max-w-6xl mx-auto px-6 pb-32 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-8">
            {BLOG_POSTS.map(post => (
              <div 
                key={post.id} 
                onClick={() => navigateToPost(post.id)}
                className="group cursor-pointer bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 p-12 hover:border-indigo-600 transition-all hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10"
              >
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-4">{post.date}</span>
                <h3 className="text-3xl font-black tracking-tighter dark:text-white mb-6 group-hover:text-indigo-600 transition-colors">{post.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed mb-10">{post.excerpt}</p>
                <span className="text-xs font-black uppercase tracking-widest border-b-2 border-indigo-600 pb-1">Read Protocol</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'blog-post' && selectedPostId && (
        <>
          {(() => {
            const post = BLOG_POSTS.find(p => p.id === selectedPostId);
            if (!post) return null;
            return (
              <>
                <div className="max-w-4xl mx-auto pt-24 pb-12 px-6">
                  <button onClick={() => setView('blog')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 mb-8"><ArrowLeftIcon className="w-4 h-4" /> Back to Journal</button>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-4">{post.date}</span>
                  <h1 className="text-5xl md:text-7xl font-black tracking-tighter dark:text-white leading-none mb-12">{post.title}</h1>
                </div>
                <ContentSection>
                  <div className="whitespace-pre-wrap text-lg md:text-xl font-medium leading-relaxed opacity-90">
                    {post.content}
                  </div>
                </ContentSection>
              </>
            );
          })()}
        </>
      )}

      {view === 'privacy' && (
        <>
          <PageHeader title="Privacy Protocol" subtitle="How we handle data (or rather, how we don't)." />
          <ContentSection>
            <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">1. Data Minimization</h3>
              <p>SwiftMail is designed as a stateless application. We do not require names, personal emails, or phone numbers to establish a node.</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">2. Storage</h3>
              <p>All emails are stored temporarily on the Mail.tm infrastructure. When you use the "Wipe & Reset" feature, we send a permanent deletion signal to the relay matrix.</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">3. Third Parties</h3>
              <p>We do not sell data. We do not have data to sell. Our only external dependency is the Mail.tm API which facilitates the email relay.</p>
            </div>
          </ContentSection>
        </>
      )}

      {view === 'terms' && (
        <>
          <PageHeader title="Service Terms" subtitle="The rules of the grid." />
          <ContentSection>
            <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">1. Use of Service</h3>
              <p>SwiftMail is provided "as is". It is intended for testing, development, and personal privacy. Use for illegal activities is strictly prohibited.</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">2. No Guarantee</h3>
              <p>As a temporary service, we do not guarantee the long-term persistence of any data. Nodes are subject to automatic purge cycles.</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">3. Limitation of Liability</h3>
              <p>SwiftMail shall not be liable for any loss of data or security breaches resulting from third-party relay providers.</p>
            </div>
          </ContentSection>
        </>
      )}

      {view === 'contact' && (
        <>
          <PageHeader title="Signal Us" subtitle="Drop a packet in our relay. We usually respond within 24 hours." />
          <ContentSection>
            <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); alert("Signal transmitted."); setView('landing'); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your Identity</label>
                  <input type="text" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-8 py-5 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="Name/Alias" required />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reply Channel</label>
                  <input type="email" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-8 py-5 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="your@email.com" required />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transmission Body</label>
                <textarea rows={6} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] px-8 py-6 outline-none focus:ring-2 focus:ring-indigo-500 font-bold resize-none" placeholder="What's on your mind?" required></textarea>
              </div>
              <button type="submit" className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl transition-all active:scale-95">Send Signal</button>
            </form>
          </ContentSection>
        </>
      )}

      {/* Shared Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-24 transition-all">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-16">
           <div className="md:col-span-2 space-y-8">
              <div className="flex items-center gap-4">
                <div className="bg-slate-950 dark:bg-white p-3 rounded-2xl">
                  <MailIcon className="w-6 h-6 text-white dark:text-slate-950" />
                </div>
                <span className="text-2xl font-black tracking-tighter uppercase dark:text-white">SwiftMail Grid</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-loose max-w-sm">
                Global disposable mail relay network ensuring stateless digital interactions across the open web.
              </p>
           </div>
           <div className="space-y-6">
              <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Protocol</h4>
              <ul className="space-y-4">
                <li><button onClick={() => setView('about')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">About Us</button></li>
                <li><button onClick={() => setView('blog')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Journal</button></li>
                <li><button onClick={() => setView('contact')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Contact</button></li>
                <li><button onClick={() => setView('app')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Dashboard</button></li>
              </ul>
           </div>
           <div className="space-y-6">
              <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Legal</h4>
              <ul className="space-y-4">
                <li><button onClick={() => setView('privacy')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => setView('terms')} className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Terms of Use</button></li>
              </ul>
           </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-24 pt-12 border-t border-slate-100 dark:border-slate-800 text-center">
           <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em]">© 2025 SwiftMail Matrix Technologies. Licensed under MIT.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
