'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {}
    setShowBanner(false);
    setDeferredPrompt(null);
    setInstalling(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
  }, []);

  if (installed) return null;

  return (
    <>
      {/* Popup banner — positioned above the SOS button area */}
      {showBanner && (
        <div className="fixed left-4 right-4 bottom-28 z-[9990] mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/95 backdrop-blur-xl p-4 shadow-2xl shadow-green-500/10">
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <div className="flex-shrink-0 p-2 rounded-xl bg-green-500/20">
                <Smartphone className="h-6 w-6 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">Add HerWay to Home Screen</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Get quick one-tap access to safety features, just like an app
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDismiss}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-300 rounded-xl border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                Not now
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex-1 px-3 py-2 text-xs font-medium text-white rounded-xl bg-green-600 hover:bg-green-500 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? 'Adding...' : 'Add Shortcut'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
