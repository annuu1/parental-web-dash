'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Smartphone,
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
  AlertTriangle,
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
    syncIntervalMinutes: number;
    locationTrackingEnabled: boolean;
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

interface TelemetryItem {
  _id: string;
  batteryLevel: number;
  isCharging: boolean;
  latitude?: number;
  longitude?: number;
  recordedAt: string;
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
  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [deviceName, setDeviceName] = useState('');
  const [syncInterval, setSyncInterval] = useState(15);
  const [locationEnabled, setLocationEnabled] = useState(true);
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
      setTelemetry(data.telemetryHistory || []);

      if (data.device) {
        setDeviceName(data.device.deviceName);
        setSyncInterval(data.device.settings?.syncIntervalMinutes || 15);
        setLocationEnabled(data.device.settings?.locationTrackingEnabled ?? true);
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
    const interval = setInterval(fetchDeviceData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/devices/${id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName,
          syncIntervalMinutes: Number(syncInterval),
          locationTrackingEnabled: locationEnabled,
          lockMessage,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save settings');
      }

      alert('Settings saved and queued for sync!');
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">State</span>
              <span className={`text-2xl font-bold ${device.isLocked ? 'text-amber-400' : 'text-emerald-400'}`}>
                {device.isLocked ? 'Locked' : 'Unlocked'}
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
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Sync Interval</span>
              <span className="text-2xl font-bold text-indigo-400">
                {device.settings?.syncIntervalMinutes || 15}m
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">WorkManager Sleep</span>
            </div>
            <Clock className="w-8 h-8 text-indigo-400" />
          </div>

          {/* GPS Location */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Location</span>
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

        {/* Action Controls & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Quick Actions Panel */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Remote Actions (REST Queue)
            </h2>
            <p className="text-xs text-slate-400">
              Commands are executed on the device during its next sync heartbeat (~{device.settings?.syncIntervalMinutes || 15}m).
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Screen Lock</h3>
                  <p className="text-xs text-slate-400">
                    {device.isLocked ? 'Screen is locked. Click to release.' : 'Lock screen on child phone.'}
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleQueueCommand(device.isLocked ? 'UNLOCK_DEVICE' : 'LOCK_DEVICE', {
                      message: lockMessage,
                    })
                  }
                  disabled={actionLoading}
                  className={`py-2 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                    device.isLocked
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {device.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  <span>{device.isLocked ? 'Send Unlock' : 'Send Lock'}</span>
                </button>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Request Fresh Location</h3>
                  <p className="text-xs text-slate-400">Forces GPS fix on next sync heartbeat.</p>
                </div>
                <button
                  onClick={() => handleQueueCommand('PING_LOCATION')}
                  disabled={actionLoading}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
                >
                  <MapPin className="w-4 h-4 text-indigo-400" />
                  <span>Request GPS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Remote Settings Panel */}
          <form onSubmit={handleSaveSettings} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Device Configuration
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
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Sync Frequency (Minutes): {syncInterval}m
              </label>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>5m (More frequent)</span>
                <span>15m (Balanced)</span>
                <span>120m (Max Battery)</span>
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
                placeholder="Message displayed when locked"
                className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-300 font-medium">Enable Location Tracking</span>
              <input
                type="checkbox"
                checked={locationEnabled}
                onChange={(e) => setLocationEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </form>
        </div>

        {/* Command Queue & Logs */}
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
