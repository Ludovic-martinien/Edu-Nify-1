import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function InternetConnectionGuard() {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Test actual connectivity with a lightweight fetch probe to server health endpoint
  const verifyRealConnection = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`/api/health?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return true;
      }
    } catch {
      // Fallback check on logo or navigator
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`/logo.png?_probe=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok || res.status === 304 || res.status === 200;
    } catch {
      return typeof navigator !== 'undefined' ? navigator.onLine : true;
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const online = await verifyRealConnection();
      setIsOnline(online);
      if (!online) {
        setCheckError("Vérification en cours : si vous êtes connecté, cliquez sur 'Continuer vers l'application'.");
      } else {
        setShowRestoredBanner(true);
        setTimeout(() => setShowRestoredBanner(false), 4500);
      }
    } catch {
      setIsOnline(true);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    const handleOnlineEvent = async () => {
      const online = await verifyRealConnection();
      setIsOnline(online);
      if (online) {
        setShowRestoredBanner(true);
        setTimeout(() => setShowRestoredBanner(false), 4500);
      }
    };

    const handleOfflineEvent = () => {
      // Only prompt if offline event actually fired
      setIsOnline(false);
      setCheckError(null);
    };

    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);

    return () => {
      window.removeEventListener('online', handleOnlineEvent);
      window.removeEventListener('offline', handleOfflineEvent);
    };
  }, []);

  return (
    <>
      {/* Restored Connection Toast */}
      {showRestoredBanner && isOnline && (
        <div 
          id="network-restored-toast"
          className="fixed top-5 right-5 z-[999999] flex items-center gap-3 px-5 py-3.5 bg-emerald-600 text-white rounded-2xl shadow-2xl border border-emerald-400/40 animate-bounce transition-all duration-300 font-sans"
        >
          <div className="p-1.5 bg-white/20 rounded-xl">
            <Wifi size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider">Connexion Rétablie</p>
            <p className="text-[11px] text-emerald-100 font-medium">L'application Edu-Nify est connectée et synchronisée en temps réel.</p>
          </div>
        </div>
      )}

      {/* Offline Alert Modal / Blocker */}
      {!isOnline && !isDismissed && (
        <div 
          id="offline-guard-overlay"
          className="fixed inset-0 z-[999998] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans"
        >
          <div 
            id="offline-guard-card"
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-rose-500/40 dark:border-rose-500/30 text-center relative overflow-hidden"
          >
            {/* Top decorative glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Pulsing Icon */}
            <div className="relative inline-flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-rose-100 dark:bg-rose-950/60 rounded-3xl flex items-center justify-center border-2 border-rose-200 dark:border-rose-800/80 shadow-lg shadow-rose-500/10">
                <WifiOff className="w-10 h-10 text-rose-600 dark:text-rose-400 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
              </span>
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 rounded-full text-[11px] font-black tracking-wider uppercase border border-rose-200 dark:border-rose-900/60 mb-3">
              <ShieldAlert size={13} />
              Avertissement Réseau
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
              Vérification de la Connexion
            </h2>

            {/* Description */}
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-medium leading-relaxed max-w-md mx-auto mb-6">
              L'application <strong className="text-indigo-600 dark:text-indigo-400">Edu-Nify</strong> nécessite une connexion active pour synchroniser les données en temps réel.
            </p>

            {/* Error notice if manual check fails */}
            {checkError && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-300 font-bold animate-shake">
                {checkError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
              <button
                id="btn-retry-connection"
                onClick={handleManualCheck}
                disabled={isChecking}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={isChecking ? 'animate-spin' : ''} size={15} />
                {isChecking ? 'Vérification...' : 'Vérifier la connexion'}
              </button>
              <button
                id="btn-continue-anyway"
                onClick={() => setIsDismissed(true)}
                className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 size={15} className="text-emerald-500" />
                Continuer vers l'application
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
