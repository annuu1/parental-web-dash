'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Smartphone,
  Battery,
  BatteryCharging,
  MapPin,
  Lock,
  Unlock,
  Settings,
  RefreshCw,
  LogOut,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

interface DeviceItem {
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
  };
  lastSyncAt?: string;
  appVersion?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [userRes, devRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/dashboard/devices'),
      ]);

      if (userRes.status === 401) {
        router.push('/login');
        return;
      }

      const userData = await userRes.json();
      const devData = await devRes.json();

      setUser(userData.user);
      setDevices(devData.devices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll dashboard every 5s for near real-time updates
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleToggleLock = async (device: DeviceItem) => {
    setActionLoading(device._id);
    try {
      const commandType = device.isLocked ? 'UNLOCK_DEVICE' : 'LOCK_DEVICE';
      const res = await fetch(`/api/dashboard/devices/${device._id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: commandType,
          params: { message: 'Device locked by parent from dashboard' },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to queue command');
      }

      // Optimistic update
      setDevices((prev) =>
        prev.map((d) => (d._id === device._id ? { ...d, isLocked: !d.isLocked } : d))
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const [pingSuccessId, setPingSuccessId] = useState<string | null>(null);

  const getSyncStatus = (lastSyncAt?: string, intervalSeconds: number = 5) => {
    if (!lastSyncAt) return { state: 'offline', label: 'Never Synced', color: 'text-slate-500', bg: 'bg-slate-700', pillBg: 'bg-slate-800 text-slate-400 border-slate-700' };
    const diffSec = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 1000);
    if (diffSec <= Math.max(30, intervalSeconds * 2.5)) {
      return { state: 'synced', label: 'In Sync', color: 'text-emerald-400', bg: 'bg-emerald-400 shadow-sm shadow-emerald-400/50', pillBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    }
    if (diffSec <= 300) {
      return { state: 'delayed', label: 'Sync Delayed', color: 'text-amber-400', bg: 'bg-amber-400', pillBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
    }
    return { state: 'offline', label: 'Offline / Desynced', color: 'text-red-400', bg: 'bg-red-500', pillBg: 'bg-red-500/10 text-red-400 border-red-500/30' };
  };

  const isDeviceOnline = (lastSyncAt?: string) => {
    if (!lastSyncAt) return false;
    const diffMs = Date.now() - new Date(lastSyncAt).getTime();
    return diffMs < 30 * 60 * 1000; // Active if synced within 30 min
  };

  const handlePingSync = async (device: DeviceItem) => {
    setActionLoading(`ping_${device._id}`);
    try {
      const res = await fetch(`/api/dashboard/devices/${device._id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PING_DEVICE',
          params: { requestedAt: new Date().toISOString() },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to ping device');
      }

      setPingSuccessId(device._id);
      setTimeout(() => setPingSuccessId(null), 4000);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never synced';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">Parental Shield</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                REST Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              title="Refresh Data"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {user && (
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-200">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Paired Devices</span>
              <Smartphone className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-3xl font-bold text-white">{devices.length}</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Devices</span>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {devices.filter((d) => isDeviceOnline(d.lastSyncAt)).length}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Locked Devices</span>
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-bold text-amber-400">
              {devices.filter((d) => d.isLocked).length}
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Devices Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Monitored Devices</h2>
            <span className="text-xs text-slate-400">Syncs every ~15m to conserve battery</span>
          </div>

          {loading && devices.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
              <RefreshCw className="w-8 h-8 mx-auto text-indigo-400 animate-spin mb-3" />
              <p className="text-sm text-slate-400">Loading your paired devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <Smartphone className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-300 mb-1">No Devices Paired Yet</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
                Install the Android application on your child&apos;s phone and log in with your email to automatically link it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {devices.map((device) => {
                const syncStatus = getSyncStatus(device.lastSyncAt, (device.settings?.syncIntervalMinutes || 1) * 60);
                const hasLocation = device.lastLocation?.latitude && device.lastLocation?.longitude;
                const isPinging = actionLoading === `ping_${device._id}`;
                const wasPinged = pingSuccessId === device._id;

                return (
                  <div
                    key={device._id}
                    className={`bg-slate-900/90 border rounded-2xl p-5 shadow-xl transition-all duration-200 hover:border-slate-700 flex flex-col justify-between ${
                      device.isLocked ? 'border-amber-500/40 bg-amber-950/10' : 'border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Top status */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${syncStatus.bg}`} />
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${syncStatus.pillBg}`}>
                            {syncStatus.label}
                          </span>
                        </div>

                        {/* Battery Level */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/50">
                          {device.isCharging ? (
                            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Battery className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{device.batteryLevel ?? 100}%</span>
                        </div>
                      </div>

                      {/* Device Title */}
                      <h3 className="text-lg font-bold text-white mb-0.5">{device.deviceName}</h3>
                      <p className="text-xs text-slate-400 mb-4">{device.deviceModel}</p>

                      {/* Info grid */}
                      <div className="space-y-2.5 text-xs text-slate-300 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/60 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Last Heartbeat
                          </span>
                          <span className={`font-medium ${syncStatus.color}`}>
                            {formatTimeAgo(device.lastSyncAt)}
                          </span>
                        </div>

                        {device.lastSyncAt && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-900">
                            <span>Exact Time</span>
                            <span className="font-mono text-slate-400">
                              {new Date(device.lastSyncAt).toLocaleTimeString()}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> GPS Location
                          </span>
                          {hasLocation ? (
                            <a
                              href={`https://www.google.com/maps?q=${device.lastLocation?.latitude},${device.lastLocation?.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                            >
                              <span>View Map</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500">Not available</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Lock Status</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              device.isLocked
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {device.isLocked ? 'LOCKED' : 'NORMAL'}
                          </span>
                        </div>

                        {wasPinged && (
                          <div className="p-2 rounded bg-indigo-500/20 border border-indigo-500/30 text-[11px] text-indigo-300 text-center font-medium animate-pulse">
                            ⚡ Sync command queued! Waiting for response...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => handlePingSync(device)}
                        disabled={isPinging}
                        title="Ping device to check live synchronization"
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700/60 disabled:opacity-50"
                      >
                        {isPinging ? (
                          <span className="w-3 h-3 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{isPinging ? 'Checking...' : 'Check Sync'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleLock(device)}
                        disabled={actionLoading === device._id}
                        className={`flex-1 py-2 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition ${
                          device.isLocked
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                        } shadow-md disabled:opacity-50`}
                      >
                        {actionLoading === device._id ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : device.isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" /> Unlock
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Lock
                          </>
                        )}
                      </button>

                      <Link
                        href={`/dashboard/devices/${device._id}`}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pairing Instructions Guide */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-400" />
            How to Connect a Child Device
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 mt-4">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold inline-flex items-center justify-center mb-2">
                1
              </span>
              <p className="font-semibold text-slate-200 mb-1">Install App</p>
              <p>Install the APK on your child&apos;s phone and open the setup wizard.</p>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold inline-flex items-center justify-center mb-2">
                2
              </span>
              <p className="font-semibold text-slate-200 mb-1">Sign In</p>
              <p>Enter the parent email (<code className="text-indigo-300">{user?.email || 'your email'}</code>) and password.</p>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold inline-flex items-center justify-center mb-2">
                3
              </span>
              <p className="font-semibold text-slate-200 mb-1">Grant Permissions</p>
              <p>Grant Location / Notification permissions. The device will appear here instantly!</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
