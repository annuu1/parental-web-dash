'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell,
  Volume2,
  VolumeX,
  ShieldAlert,
  ShieldCheck,
  MapPin,
  ExternalLink,
  X,
  Play,
  CheckCircle,
  Navigation,
  Clock,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import {
  playGeofenceAlertSound,
  ActiveAlertSound,
  unlockAudio,
  setupAudioUnlockListeners,
  isAlertSoundEnabled,
  setAlertSoundEnabled,
  sendDesktopNotification,
} from '@/lib/alertSound';

export interface GeofenceAlertItem {
  _id: string;
  geofenceId: string;
  geofenceName: string;
  deviceId: string;
  deviceName?: string;
  deviceModel?: string;
  eventType: 'ENTER' | 'EXIT';
  latitude: number;
  longitude: number;
  accuracy?: number;
  distanceFromCenter: number;
  timestamp: string;
  telegramSent: boolean;
}

export default function GeofenceAlertManager() {
  const router = useRouter();
  const pathname = usePathname();

  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(null);
  const [alertQueue, setAlertQueue] = useState<GeofenceAlertItem[]>([]);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [isSoundPlaying, setIsSoundPlaying] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [testSoundPlaying, setTestSoundPlaying] = useState(false);
  const [showSettingsTooltip, setShowSettingsTooltip] = useState(false);

  const activeSoundRef = useRef<ActiveAlertSound | null>(null);
  const isPollingRef = useRef(false);

  // Initialize audio unlock listeners and sound preferences on mount
  useEffect(() => {
    setupAudioUnlockListeners();
    setSoundEnabledState(isAlertSoundEnabled());

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // 1. Initial baseline fetch to get current latest timestamp without triggering historical alarms
  useEffect(() => {
    let isMounted = true;
    const fetchBaseline = async () => {
      try {
        const res = await fetch('/api/dashboard/geofences/events/latest');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          const baselineTime = data.latestEvent?.timestamp || data.serverTime || new Date().toISOString();
          setLastSeenTimestamp(baselineTime);
        }
      } catch (err) {
        console.error('Failed to fetch initial geofence baseline:', err);
      }
    };

    fetchBaseline();
    return () => {
      isMounted = false;
    };
  }, []);

  // Helper: Trigger alert sound & browser notification for new alerts
  const handleTriggerAlert = useCallback(
    (newEvents: GeofenceAlertItem[]) => {
      if (newEvents.length === 0) return;

      const latestEvent = newEvents[0];

      // Broadcast event so any open map or telemetry view updates immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('geofence-alert-received', { detail: latestEvent })
        );
      }

      // Send desktop OS notifications
      newEvents.forEach((evt) => {
        sendDesktopNotification(evt);
      });

      // Play loud audible chime / siren if enabled
      if (isAlertSoundEnabled()) {
        if (activeSoundRef.current) {
          activeSoundRef.current.stop();
        }
        setIsSoundPlaying(true);
        activeSoundRef.current = playGeofenceAlertSound({ loops: 5, volume: 0.95 });

        // Auto reset sound playing state after ~4.5s
        setTimeout(() => {
          setIsSoundPlaying(false);
        }, 4600);
      }

      // Add to queue
      setAlertQueue((prev) => [...prev, ...newEvents]);
    },
    []
  );

  // 2. Poll for new events every 3 seconds
  useEffect(() => {
    if (!lastSeenTimestamp) return;

    const pollInterval = setInterval(async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch(
          `/api/dashboard/geofences/events/latest?since=${encodeURIComponent(lastSeenTimestamp)}`
        );
        if (!res.ok) return;

        const data = await res.json();
        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
          // Update baseline to newest event timestamp
          setLastSeenTimestamp(data.events[0].timestamp);
          handleTriggerAlert(data.events);
        }
      } catch (err) {
        console.error('Error polling for geofence alerts:', err);
      } finally {
        isPollingRef.current = false;
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [lastSeenTimestamp, handleTriggerAlert]);

  // Actions
  const handleStopSound = () => {
    if (activeSoundRef.current) {
      activeSoundRef.current.stop();
      activeSoundRef.current = null;
    }
    setIsSoundPlaying(false);
  };

  const handleDismissCurrentAlert = () => {
    handleStopSound();
    setAlertQueue((prev) => {
      const next = [...prev];
      next.splice(activeAlertIndex, 1);
      return next;
    });
    if (activeAlertIndex >= alertQueue.length - 1) {
      setActiveAlertIndex(Math.max(0, alertQueue.length - 2));
    }
  };

  const handleDismissAllAlerts = () => {
    handleStopSound();
    setAlertQueue([]);
    setActiveAlertIndex(0);
  };

  const handleViewOnMap = (alert: GeofenceAlertItem) => {
    handleStopSound();

    const targetUrl = `/dashboard/devices/${alert.deviceId}#location-timeline`;

    if (pathname === `/dashboard/devices/${alert.deviceId}`) {
      // Already on the device page: smoothly scroll to map and dispatch focus event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('geofence-alert-view-map', { detail: alert })
        );
      }
      const mapElem = document.getElementById('location-timeline');
      if (mapElem) {
        mapElem.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Navigate to the device page with map anchor
      router.push(targetUrl);
    }

    // Dismiss this alert from the popup queue
    handleDismissCurrentAlert();
  };

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabledState(nextVal);
    setAlertSoundEnabled(nextVal);
    if (!nextVal) {
      handleStopSound();
    } else {
      unlockAudio();
    }
  };

  const handleTestSound = async () => {
    await unlockAudio();
    setTestSoundPlaying(true);
    const testAudio = playGeofenceAlertSound({ loops: 1, volume: 0.9 });
    setTimeout(() => {
      testAudio.stop();
      setTestSoundPlaying(false);
    }, 1100);
  };

  const handleRequestDesktopPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const currentAlert = alertQueue[activeAlertIndex];

  return (
    <>
      {/* 1. Global Floating Audio & Alert Quick Status Pill */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-2xl p-1.5 px-3 flex items-center gap-2.5 shadow-2xl text-xs text-slate-300">
          <button
            onClick={handleToggleSound}
            title={soundEnabled ? 'Alert Sound is Enabled (Click to Mute)' : 'Alert Sound is Muted (Click to Enable)'}
            className={`flex items-center gap-1.5 font-medium px-2 py-1 rounded-xl transition ${
              soundEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Sound: ON</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Sound: MUTED</span>
              </>
            )}
          </button>

          <button
            onClick={handleTestSound}
            disabled={testSoundPlaying}
            title="Test speaker volume with geofence chime"
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition disabled:opacity-50"
          >
            <Play className={`w-3 h-3 ${testSoundPlaying ? 'animate-pulse text-indigo-400' : ''}`} />
            <span>{testSoundPlaying ? 'Playing...' : 'Test Sound'}</span>
          </button>

          {notificationPermission !== 'granted' && (
            <button
              onClick={handleRequestDesktopPermission}
              title="Enable native browser desktop notifications"
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition"
            >
              <Bell className="w-3 h-3" />
              <span className="hidden sm:inline">Desktop Alerts</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Eye-Catching Real-Time Geofence Alert Modal Popup */}
      {currentAlert && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            className={`relative max-w-lg w-full rounded-3xl bg-slate-900 border-2 shadow-2xl overflow-hidden transition-all duration-300 ${
              currentAlert.eventType === 'ENTER'
                ? 'border-emerald-500 shadow-emerald-500/25'
                : 'border-rose-500 shadow-rose-500/30'
            }`}
          >
            {/* Top Accent Glowing Bar */}
            <div
              className={`h-2.5 w-full ${
                currentAlert.eventType === 'ENTER'
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse'
                  : 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 animate-pulse'
              }`}
            />

            <div className="p-6 sm:p-7 space-y-6">
              {/* Header with Badges & Sound Controller */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border relative ${
                      currentAlert.eventType === 'ENTER'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    }`}
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl animate-ping opacity-30 ${
                        currentAlert.eventType === 'ENTER' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    {currentAlert.eventType === 'ENTER' ? (
                      <ShieldCheck className="w-6 h-6 relative z-10" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 relative z-10 animate-bounce" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full border ${
                          currentAlert.eventType === 'ENTER'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {currentAlert.eventType === 'ENTER' ? '🟢 ZONE ENTERED' : '🚨 ZONE EXITED'}
                      </span>

                      {alertQueue.length > 1 && (
                        <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                          {activeAlertIndex + 1} of {alertQueue.length}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl font-extrabold text-white mt-1">
                      {currentAlert.eventType === 'ENTER' ? 'Entered Safe Zone' : 'Breached Safe Zone!'}
                    </h2>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={handleDismissCurrentAlert}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="Dismiss this alert"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sound Status Pill during Alert */}
              {isSoundPlaying && (
                <div className="flex items-center justify-between p-2.5 px-4 bg-amber-500/15 border border-amber-500/30 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                    <span className="text-xs font-bold text-amber-300">Playing loud alarm sound</span>
                  </div>
                  <button
                    onClick={handleStopSound}
                    className="text-xs font-bold px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl transition shadow"
                  >
                    Stop Sound
                  </button>
                </div>
              )}

              {/* Alert Details Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs text-slate-400 font-semibold uppercase">Device</span>
                  </div>
                  <span className="text-sm font-bold text-white">
                    {currentAlert.deviceName || 'Child Device'}
                    {currentAlert.deviceModel ? ` (${currentAlert.deviceModel})` : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <MapPin
                      className={`w-4 h-4 ${
                        currentAlert.eventType === 'ENTER' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    />
                    <span className="text-xs text-slate-400 font-semibold uppercase">Geofence Zone</span>
                  </div>
                  <span
                    className={`text-sm font-extrabold ${
                      currentAlert.eventType === 'ENTER' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {currentAlert.geofenceName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">Distance from Center</span>
                    <span className="text-sm font-bold text-slate-200">
                      {currentAlert.distanceFromCenter} meters
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block mb-0.5">GPS Accuracy</span>
                    <span className="text-sm font-bold text-slate-200">
                      ±{Math.round(currentAlert.accuracy || 5)}m
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {new Date(currentAlert.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}{' '}
                      •{' '}
                      {new Date(currentAlert.timestamp).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <a
                    href={`https://www.google.com/maps?q=${currentAlert.latitude},${currentAlert.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={() => handleViewOnMap(currentAlert)}
                  className={`w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] ${
                    currentAlert.eventType === 'ENTER'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                  <span>View on Interactive Map</span>
                </button>

                <button
                  onClick={handleDismissCurrentAlert}
                  className="w-full sm:w-auto py-3 px-5 rounded-2xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  Dismiss
                </button>

                {alertQueue.length > 1 && (
                  <button
                    onClick={handleDismissAllAlerts}
                    className="w-full sm:w-auto py-3 px-4 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition"
                  >
                    Dismiss All ({alertQueue.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
