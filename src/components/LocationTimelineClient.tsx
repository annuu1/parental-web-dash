'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Bell,
  Sliders,
  Layers,
  Crosshair,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Send,
  Navigation,
  CheckCircle,
  Eye,
  RefreshCw,
  X,
  Battery,
  BatteryCharging,
  Zap,
  Footprints,
  Bike,
  Car,
  Gauge,
  Radio,
  LocateFixed,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  MapPinned,
} from 'lucide-react';

export type TransitMode = 'STATIONARY' | 'WALKING' | 'CYCLING' | 'VEHICLE';

export interface LocationPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  batteryLevel: number;
  isCharging: boolean;
  recordedAt: string;
  distanceFromPrevMeters?: number;
  speedKmh?: number;
  mode?: TransitMode;
  dwellMinutes?: number;
}

export interface ActivityChapter {
  id: string;
  type: 'STAY' | 'TRIP';
  mode: TransitMode;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  label: string;
}

export interface GeofenceItem {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  color: string;
  notifyOn: 'ENTER' | 'EXIT' | 'BOTH';
  notifyTelegram: boolean;
  isActive: boolean;
  currentStatus: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
  lastTransitionAt?: string;
  createdAt: string;
}

export interface GeofenceEventItem {
  _id: string;
  geofenceId: string;
  geofenceName: string;
  eventType: 'ENTER' | 'EXIT';
  latitude: number;
  longitude: number;
  accuracy?: number;
  distanceFromCenter: number;
  timestamp: string;
  telegramSent: boolean;
}

interface LocationTimelineClientProps {
  deviceId: string;
  deviceName: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
  };
  onRefreshParent?: () => void;
}

const PRESET_COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Cyan', hex: '#06b6d4' },
];

const CARTO_API_KEY =
  process.env.NEXT_PUBLIC_CARTO_API_KEY || 'cb1_4noy_1_dc64d715096491d93cecfa94';

export function computeActivityChapters(points: LocationPoint[]): ActivityChapter[] {
  if (!points || points.length === 0) return [];

  const chapters: ActivityChapter[] = [];
  let currentStartIndex = 0;
  let currentType: 'STAY' | 'TRIP' = points[0].mode === 'STATIONARY' ? 'STAY' : 'TRIP';

  for (let i = 1; i <= points.length; i++) {
    const isEnd = i === points.length;
    const ptType = !isEnd ? (points[i].mode === 'STATIONARY' ? 'STAY' : 'TRIP') : null;

    if (isEnd || ptType !== currentType) {
      const segment = points.slice(currentStartIndex, i);
      const startPt = segment[0];
      const endPt = segment[segment.length - 1];

      const startTime = startPt.recordedAt;
      const endTime = endPt.recordedAt;
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

      let totalDist = 0;
      let maxSpeed = 0;
      let movingSeconds = 0;
      const modeCounts: Record<string, number> = {};

      for (let j = 1; j < segment.length; j++) {
        const p = segment[j];
        totalDist += p.distanceFromPrevMeters || 0;
        if ((p.speedKmh || 0) > maxSpeed) maxSpeed = p.speedKmh || 0;
        const prev = segment[j - 1];
        const dt =
          (new Date(p.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000;
        if (dt > 0) movingSeconds += dt;
        if (p.mode) {
          modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
        }
      }

      let dominantMode: TransitMode = currentType === 'STAY' ? 'STATIONARY' : 'WALKING';
      if (currentType === 'TRIP') {
        let maxCount = 0;
        for (const [m, count] of Object.entries(modeCounts)) {
          if (m !== 'STATIONARY' && count > maxCount) {
            maxCount = count;
            dominantMode = m as TransitMode;
          }
        }
        if (maxSpeed >= 25 && dominantMode === 'WALKING') {
          dominantMode = 'VEHICLE';
        }
      }

      const avgSpeed =
        movingSeconds > 0 ? Number(((totalDist / movingSeconds) * 3.6).toFixed(1)) : 0;

      let label = '';
      if (currentType === 'STAY') {
        label = `Stay (${
          durationMinutes >= 60
            ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
            : `${durationMinutes}m`
        })`;
      } else {
        const modeLabel =
          dominantMode === 'VEHICLE'
            ? 'Drive'
            : dominantMode === 'CYCLING'
            ? 'Cycling'
            : 'Walk';
        label = `${modeLabel} • ${(totalDist / 1000).toFixed(1)} km (${durationMinutes}m)`;
      }

      chapters.push({
        id: `chapter-${chapters.length}-${currentStartIndex}`,
        type: currentType,
        mode: dominantMode,
        startIndex: currentStartIndex,
        endIndex: i - 1,
        startTime,
        endTime,
        durationMinutes,
        distanceMeters: Math.round(totalDist),
        maxSpeedKmh: Number(maxSpeed.toFixed(1)),
        avgSpeedKmh: avgSpeed,
        label,
      });

      if (!isEnd) {
        currentStartIndex = i;
        currentType = ptType!;
      }
    }
  }

  return chapters;
}

export default function LocationTimelineClient({
  deviceId,
  deviceName,
  currentLocation,
  onRefreshParent,
}: LocationTimelineClientProps) {
  // Data states
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | '30d' | 'all'>('24h');
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [summary, setSummary] = useState<{
    totalPoints: number;
    totalDistanceKm: number;
    avgSpeedKmh?: number;
    maxSpeedKmh?: number;
    startTime: string | null;
    endTime: string | null;
  }>({
    totalPoints: 0,
    totalDistanceKm: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    startTime: null,
    endTime: null,
  });
  const [loadingPoints, setLoadingPoints] = useState(false);

  // Live Auto-Refresh states
  const [isLiveAutoRefresh, setIsLiveAutoRefresh] = useState(false);
  const [liveCountdown, setLiveCountdown] = useState(15);

  // Geofence states
  const [geofences, setGeofences] = useState<GeofenceItem[]>([]);
  const [loadingGeofences, setLoadingGeofences] = useState(false);
  const [events, setEvents] = useState<GeofenceEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'geofences' | 'events'>('timeline');

  // Playback & Tracking states
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x, 10x
  const [isLooping, setIsLooping] = useState(false);
  const [followDevice, setFollowDevice] = useState(true);
  const followDeviceRef = useRef(true);
  followDeviceRef.current = followDevice;

  // Slider Hover Preview states
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState<number>(0);

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Map & Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const traveledPolylineRef = useRef<L.Polyline | null>(null);
  const remainingPolylineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const currentMarkerRef = useRef<L.Marker | null>(null);
  const scrubberMarkerRef = useRef<L.Marker | null>(null);
  const geofenceLayersRef = useRef<Map<string, L.Circle>>(new Map());
  const draftGeofenceLayerRef = useRef<L.Circle | null>(null);
  const draftMarkerRef = useRef<L.Marker | null>(null);
  const alertMarkerRef = useRef<L.Marker | null>(null);

  // Geofence Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPinningMode, setIsPinningMode] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [formRadius, setFormRadius] = useState(150);
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formNotifyOn, setFormNotifyOn] = useState<'ENTER' | 'EXIT' | 'BOTH'>('BOTH');
  const [formNotifyTelegram, setFormNotifyTelegram] = useState(true);
  const [submittingGeofence, setSubmittingGeofence] = useState(false);

  // Chapters & Activity Breakdown
  const chapters = useMemo(() => computeActivityChapters(points), [points]);
  const activeChapter = useMemo(() => {
    return chapters.find((ch) => playbackIndex >= ch.startIndex && playbackIndex <= ch.endIndex);
  }, [chapters, playbackIndex]);

  const activityStats = useMemo(() => {
    let vehicleDist = 0;
    let walkDist = 0;
    let cycleDist = 0;
    let stayMins = 0;

    chapters.forEach((ch) => {
      if (ch.type === 'STAY') {
        stayMins += ch.durationMinutes;
      } else if (ch.mode === 'VEHICLE') {
        vehicleDist += ch.distanceMeters;
      } else if (ch.mode === 'CYCLING') {
        cycleDist += ch.distanceMeters;
      } else {
        walkDist += ch.distanceMeters;
      }
    });

    return {
      vehicleKm: Number((vehicleDist / 1000).toFixed(1)),
      walkKm: Number((walkDist / 1000).toFixed(1)),
      cycleKm: Number((cycleDist / 1000).toFixed(1)),
      stayHours: Number((stayMins / 60).toFixed(1)),
    };
  }, [chapters]);

  // 1. Fetch Timeline Points (supports silent refresh for live mode)
  const fetchLocationPoints = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingPoints(true);
      try {
        const res = await fetch(
          `/api/dashboard/devices/${deviceId}/locations?range=${timeRange}&limit=1000`
        );
        if (res.ok) {
          const data = await res.json();
          const newPoints: LocationPoint[] = data.points || [];
          setPoints(newPoints);
          setSummary(
            data.summary || {
              totalPoints: newPoints.length,
              totalDistanceKm: 0,
              avgSpeedKmh: 0,
              maxSpeedKmh: 0,
              startTime: null,
              endTime: null,
            }
          );
          // If at the end or on initial load, advance index to latest point
          setPlaybackIndex((prevIdx) => {
            if (newPoints.length === 0) return 0;
            if (prevIdx === 0 && newPoints.length > 0) return newPoints.length - 1;
            if (prevIdx >= newPoints.length - 2) return newPoints.length - 1;
            return Math.min(prevIdx, newPoints.length - 1);
          });
        }
      } catch (err) {
        console.error('Failed to fetch location timeline:', err);
      } finally {
        if (!silent) setLoadingPoints(false);
      }
    },
    [deviceId, timeRange]
  );

  // Live Auto-Refresh Interval
  useEffect(() => {
    if (!isLiveAutoRefresh) return;
    setLiveCountdown(15);

    const timer = setInterval(() => {
      setLiveCountdown((prev) => {
        if (prev <= 1) {
          fetchLocationPoints(true);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLiveAutoRefresh, fetchLocationPoints]);

  // 2. Fetch Geofences
  const fetchGeofences = useCallback(async () => {
    setLoadingGeofences(true);
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/geofences`);
      if (res.ok) {
        const data = await res.json();
        setGeofences(data.geofences || []);
      }
    } catch (err) {
      console.error('Failed to fetch geofences:', err);
    } finally {
      setLoadingGeofences(false);
    }
  }, [deviceId]);

  // 3. Fetch Geofence Events
  const fetchGeofenceEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/geofences/events?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch geofence events:', err);
    } finally {
      setLoadingEvents(false);
    }
  }, [deviceId]);

  // Initial loads
  useEffect(() => {
    fetchLocationPoints();
    fetchGeofences();
    fetchGeofenceEvents();
  }, [fetchLocationPoints, fetchGeofences, fetchGeofenceEvents]);

  // Helper: create custom SVG div icons
  const createPulseDivIcon = (color: string = '#10b981') => {
    return L.divIcon({
      className: 'custom-pulse-marker',
      html: `
        <div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${color}; opacity: 0.35; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 15px; height: 15px; border-radius: 50%; background-color: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 0 12px ${color};"></div>
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  };

  const createScrubberDivIcon = (color: string = '#6366f1') => {
    return L.divIcon({
      className: 'custom-scrubber-marker',
      html: `
        <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${color}; opacity: 0.35; animation: ping 2s infinite;"></div>
          <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; border: 3px solid #ffffff; box-shadow: 0 3px 12px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  };

  const createStartDivIcon = () => {
    return L.divIcon({
      className: 'custom-start-marker',
      html: `
        <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; border: 1.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); text-align: center; white-space: nowrap; letter-spacing: 0.5px;">
          START
        </div>
      `,
      iconSize: [50, 22],
      iconAnchor: [25, 11],
    });
  };

  const createAlertDivIcon = (color: string = '#f43f5e') => {
    return L.divIcon({
      className: 'custom-alert-ping-marker',
      html: `
        <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${color}; opacity: 0.45; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 24px; height: 24px; border-radius: 50%; background-color: ${color}; border: 3px solid #ffffff; box-shadow: 0 0 15px ${color}; display: flex; align-items: center; justify-content: center; color: white; font-size: 13px; font-weight: 900;">
            !
          </div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
  };

  // Interactive polyline click handler: snaps scrubber to closest recorded point
  const handlePolylineClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (points.length === 0) return;
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      let closestIdx = 0;
      let minDistance = Infinity;

      points.forEach((pt, idx) => {
        const d = Math.hypot(pt.latitude - clickLat, pt.longitude - clickLng);
        if (d < minDistance) {
          minDistance = d;
          closestIdx = idx;
        }
      });

      setPlaybackIndex(closestIdx);
      setIsPlaying(false);
    },
    [points]
  );

  // Listen for real-time geofence alerts broadcasted by GeofenceAlertManager
  useEffect(() => {
    const handleAlertReceived = (e: Event) => {
      const customEvent = e as CustomEvent<GeofenceEventItem & { deviceId?: string }>;
      const alert = customEvent.detail;
      if (!alert || (alert.deviceId && alert.deviceId !== deviceId)) return;

      fetchGeofenceEvents();
      fetchGeofences();
      fetchLocationPoints(true);
    };

    const handleViewOnMap = (e: Event) => {
      const customEvent = e as CustomEvent<GeofenceEventItem & { deviceId?: string }>;
      const alert = customEvent.detail;
      if (!alert || (alert.deviceId && alert.deviceId !== deviceId)) return;

      setActiveTab('events');

      if (mapInstanceRef.current && alert.latitude && alert.longitude) {
        mapInstanceRef.current.flyTo([alert.latitude, alert.longitude], 16, {
          animate: true,
          duration: 1.2,
        });

        if (alertMarkerRef.current) {
          mapInstanceRef.current.removeLayer(alertMarkerRef.current);
          alertMarkerRef.current = null;
        }

        const color = alert.eventType === 'ENTER' ? '#10b981' : '#f43f5e';
        const marker = L.marker([alert.latitude, alert.longitude], {
          icon: createAlertDivIcon(color),
          zIndexOffset: 1000,
        }).addTo(mapInstanceRef.current);

        marker
          .bindPopup(
            `
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; min-width: 170px; padding: 2px;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 3px; color: ${
              alert.eventType === 'ENTER' ? '#059669' : '#e11d48'
            };">
              ${alert.eventType === 'ENTER' ? '🟢 ZONE ENTERED' : '🚨 ZONE EXITED'}
            </div>
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 2px;">${alert.geofenceName}</div>
            <div style="color: #64748b; font-size: 11px;">Distance: ${alert.distanceFromCenter}m from center</div>
            <div style="color: #94a3b8; font-size: 10px; margin-top: 4px;">${new Date(
              alert.timestamp
            ).toLocaleTimeString()}</div>
          </div>
        `
          )
          .openPopup();

        alertMarkerRef.current = marker;

        setTimeout(() => {
          if (alertMarkerRef.current && mapInstanceRef.current) {
            mapInstanceRef.current.removeLayer(alertMarkerRef.current);
            alertMarkerRef.current = null;
          }
        }, 30000);
      }
    };

    window.addEventListener('geofence-alert-received', handleAlertReceived);
    window.addEventListener('geofence-alert-view-map', handleViewOnMap);

    return () => {
      window.removeEventListener('geofence-alert-received', handleAlertReceived);
      window.removeEventListener('geofence-alert-view-map', handleViewOnMap);
    };
  }, [deviceId, fetchGeofenceEvents, fetchGeofences, fetchLocationPoints]);

  // 4. Initialize Map once with Multi-Layer Support (including Satellite Aerial)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = currentLocation?.latitude || 28.6139;
    const initialLng = currentLocation?.longitude || 77.209;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    // Basemap tile layers
    const voyagerLayer = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution:
          '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
      }
    );

    // High-Resolution Satellite Aerial Layer (Esri World Imagery)
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
      }
    );

    const darkLayer = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution:
          '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
      }
    );

    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    });

    voyagerLayer.addTo(map);

    L.control
      .layers(
        {
          'Street (Voyager)': voyagerLayer,
          'Satellite (Aerial)': satelliteLayer,
          'Dark Matter': darkLayer,
          'OpenStreetMap': osmLayer,
        },
        undefined,
        { position: 'topright' }
      )
      .addTo(map);

    L.control
      .attribution({
        position: 'bottomright',
        prefix:
          '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
      })
      .addTo(map);

    // User manual drag listener: pause camera auto-lock so user can freely pan
    map.on('dragstart', () => {
      setFollowDevice(false);
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle map click for placing new geofence
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (isPinningMode) {
        setFormLat(Number(e.latlng.lat.toFixed(6)));
        setFormLng(Number(e.latlng.lng.toFixed(6)));
        setIsPinningMode(false);
        setIsModalOpen(true);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isPinningMode]);

  // 5. Update Geofences Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    geofenceLayersRef.current.forEach((circle) => map.removeLayer(circle));
    geofenceLayersRef.current.clear();

    geofences.forEach((fence) => {
      if (!fence.isActive) return;

      const circle = L.circle([fence.latitude, fence.longitude], {
        color: fence.color || '#3b82f6',
        fillColor: fence.color || '#3b82f6',
        fillOpacity: 0.16,
        weight: 2,
        dashArray: fence.currentStatus === 'INSIDE' ? undefined : '5, 5',
      }).addTo(map);

      const statusBadge =
        fence.currentStatus === 'INSIDE'
          ? '<span style="color:#10b981;font-weight:bold;">🟢 INSIDE ZONE</span>'
          : fence.currentStatus === 'OUTSIDE'
          ? '<span style="color:#ef4444;font-weight:bold;">🚨 OUTSIDE ZONE</span>'
          : '<span style="color:#94a3b8;">UNKNOWN</span>';

      circle.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;min-width:180px;line-height:1.4;">
          <strong style="font-size:14px;color:#1e293b;">${fence.name}</strong><br/>
          <div style="margin:4px 0;">${statusBadge}</div>
          <span style="color:#64748b;">Radius: <strong>${fence.radius}m</strong></span><br/>
          <span style="color:#64748b;">Notify on: <strong>${fence.notifyOn}</strong></span><br/>
          <span style="color:#64748b;">Telegram Alerts: <strong>${
            fence.notifyTelegram ? 'Enabled' : 'Disabled'
          }</strong></span>
        </div>
      `);

      geofenceLayersRef.current.set(fence._id, circle);
    });
  }, [geofences]);

  // 6. Two-Tone Route Polyline & Markers (Traveled vs Upcoming Trail)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (points.length === 0) {
      if (traveledPolylineRef.current) {
        map.removeLayer(traveledPolylineRef.current);
        traveledPolylineRef.current = null;
      }
      if (remainingPolylineRef.current) {
        map.removeLayer(remainingPolylineRef.current);
        remainingPolylineRef.current = null;
      }
      if (startMarkerRef.current) {
        map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }

      if (currentLocation?.latitude && currentLocation?.longitude) {
        if (!currentMarkerRef.current) {
          currentMarkerRef.current = L.marker(
            [currentLocation.latitude, currentLocation.longitude],
            { icon: createPulseDivIcon('#10b981') }
          ).addTo(map);
        } else {
          currentMarkerRef.current.setLatLng([
            currentLocation.latitude,
            currentLocation.longitude,
          ]);
        }
        map.setView([currentLocation.latitude, currentLocation.longitude], 15);
      }
      return;
    }

    const latLngs = points.map((p) => [p.latitude, p.longitude] as [number, number]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }

    // Traveled segment (start to current scrubber index)
    const safeIndex = Math.min(playbackIndex, points.length - 1);
    const traveledLatLngs = points
      .slice(0, safeIndex + 1)
      .map((p) => [p.latitude, p.longitude] as [number, number]);

    // Remaining segment (current scrubber index to end)
    const remainingLatLngs = points
      .slice(safeIndex)
      .map((p) => [p.latitude, p.longitude] as [number, number]);

    // Traveled Polyline (Glow Indigo)
    if (!traveledPolylineRef.current) {
      traveledPolylineRef.current = L.polyline(traveledLatLngs, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.95,
        smoothFactor: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      traveledPolylineRef.current.on('click', handlePolylineClick);
    } else {
      traveledPolylineRef.current.setLatLngs(traveledLatLngs);
    }

    // Remaining Polyline (Dashed Slate)
    if (!remainingPolylineRef.current) {
      remainingPolylineRef.current = L.polyline(remainingLatLngs, {
        color: '#64748b',
        weight: 3.5,
        opacity: 0.5,
        dashArray: '6, 8',
        smoothFactor: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      remainingPolylineRef.current.on('click', handlePolylineClick);
    } else {
      remainingPolylineRef.current.setLatLngs(remainingLatLngs);
    }

    // Start marker on earliest checkpoint
    if (points.length > 1) {
      const startPt = points[0];
      if (!startMarkerRef.current) {
        startMarkerRef.current = L.marker([startPt.latitude, startPt.longitude], {
          icon: createStartDivIcon(),
          zIndexOffset: 500,
        }).addTo(map);
      } else {
        startMarkerRef.current.setLatLng([startPt.latitude, startPt.longitude]);
      }
      startMarkerRef.current.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;padding:3px;min-width:140px;">
          <strong style="color:#059669;font-size:13px;">🚩 TRIP START</strong>
          <div style="color:#475569;margin-top:2px;">${new Date(
            startPt.recordedAt
          ).toLocaleTimeString()} (${new Date(startPt.recordedAt).toLocaleDateString()})</div>
          <div style="color:#94a3b8;font-size:11px;margin-top:2px;">Battery: ${
            startPt.batteryLevel
          }%</div>
        </div>
      `);
    } else if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    // Latest location marker (pulsing green radar)
    const latestPoint = points[points.length - 1];
    if (!currentMarkerRef.current) {
      currentMarkerRef.current = L.marker([latestPoint.latitude, latestPoint.longitude], {
        icon: createPulseDivIcon('#10b981'),
        zIndexOffset: 800,
        title: 'Latest Fix',
      }).addTo(map);
    } else {
      currentMarkerRef.current.setLatLng([latestPoint.latitude, latestPoint.longitude]);
    }

    currentMarkerRef.current.bindPopup(`
      <div style="font-family:sans-serif;font-size:12px;padding:3px;min-width:160px;">
        <strong style="color:#059669;font-size:13px;">🟢 LATEST POSITION</strong>
        <div style="color:#475569;margin-top:2px;">${new Date(
          latestPoint.recordedAt
        ).toLocaleTimeString()}</div>
        <div style="color:#64748b;font-size:11px;margin-top:2px;">
          Speed: <strong>${latestPoint.speedKmh || 0} km/h</strong> • Battery: <strong>${
      latestPoint.batteryLevel
    }%</strong>
        </div>
      </div>
    `);
  }, [points, currentLocation, handlePolylineClick]);

  // 7. Update Scrubber Marker & Trail when playbackIndex changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || points.length === 0) return;

    const safeIndex = Math.min(playbackIndex, points.length - 1);
    const currentPoint = points[safeIndex];
    if (!currentPoint) return;

    // Update scrubber marker
    if (!scrubberMarkerRef.current) {
      scrubberMarkerRef.current = L.marker([currentPoint.latitude, currentPoint.longitude], {
        icon: createScrubberDivIcon('#6366f1'),
        zIndexOffset: 1200,
      }).addTo(map);
    } else {
      scrubberMarkerRef.current.setLatLng([currentPoint.latitude, currentPoint.longitude]);
    }

    // Dynamically update two-tone polylines
    if (traveledPolylineRef.current) {
      const traveled = points
        .slice(0, safeIndex + 1)
        .map((p) => [p.latitude, p.longitude] as [number, number]);
      traveledPolylineRef.current.setLatLngs(traveled);
    }
    if (remainingPolylineRef.current) {
      const remaining = points
        .slice(safeIndex)
        .map((p) => [p.latitude, p.longitude] as [number, number]);
      remainingPolylineRef.current.setLatLngs(remaining);
    }

    // Auto-pan camera if followDevice is active
    if (followDeviceRef.current && map) {
      map.panTo([currentPoint.latitude, currentPoint.longitude], { animate: true, duration: 0.25 });
    }
  }, [playbackIndex, points]);

  // 8. Playback loop (with loop mode support)
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const intervalTime = Math.max(100, Math.floor(1000 / playbackSpeed));

    playbackTimerRef.current = setInterval(() => {
      setPlaybackIndex((prev) => {
        if (prev >= points.length - 1) {
          if (isLooping) {
            return 0;
          }
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, points.length, isLooping]);

  // 9. Draft Geofence Circle on Map while adjusting modal
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isModalOpen && formLat !== null && formLng !== null) {
      if (!draftGeofenceLayerRef.current) {
        draftGeofenceLayerRef.current = L.circle([formLat, formLng], {
          color: formColor,
          fillColor: formColor,
          fillOpacity: 0.25,
          weight: 2,
          dashArray: '4, 4',
        }).addTo(map);
      } else {
        draftGeofenceLayerRef.current.setLatLng([formLat, formLng]);
        draftGeofenceLayerRef.current.setRadius(formRadius);
        draftGeofenceLayerRef.current.setStyle({
          color: formColor,
          fillColor: formColor,
        });
      }

      if (!draftMarkerRef.current) {
        draftMarkerRef.current = L.marker([formLat, formLng], {
          icon: createScrubberDivIcon(formColor),
        }).addTo(map);
      } else {
        draftMarkerRef.current.setLatLng([formLat, formLng]);
      }
    } else {
      if (draftGeofenceLayerRef.current) {
        map.removeLayer(draftGeofenceLayerRef.current);
        draftGeofenceLayerRef.current = null;
      }
      if (draftMarkerRef.current) {
        map.removeLayer(draftMarkerRef.current);
        draftMarkerRef.current = null;
      }
    }
  }, [isModalOpen, formLat, formLng, formRadius, formColor]);

  // Handlers
  const handleOpenAddGeofence = () => {
    const map = mapInstanceRef.current;
    let initialLat = currentLocation?.latitude;
    let initialLng = currentLocation?.longitude;

    if ((!initialLat || !initialLng) && points.length > 0) {
      initialLat = points[points.length - 1].latitude;
      initialLng = points[points.length - 1].longitude;
    }

    if ((!initialLat || !initialLng) && map) {
      const center = map.getCenter();
      initialLat = center.lat;
      initialLng = center.lng;
    }

    setFormName('');
    setFormLat(initialLat ? Number(initialLat.toFixed(6)) : 28.6139);
    setFormLng(initialLng ? Number(initialLng.toFixed(6)) : 77.209);
    setFormRadius(150);
    setFormColor('#3b82f6');
    setFormNotifyOn('BOTH');
    setFormNotifyTelegram(true);
    setIsModalOpen(true);
  };

  const handleStartPinning = () => {
    setIsPinningMode(true);
    setIsModalOpen(false);
  };

  const handleCreateGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formLat === null || formLng === null) {
      alert('Please provide a name and coordinates.');
      return;
    }

    setSubmittingGeofence(true);
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          latitude: formLat,
          longitude: formLng,
          radius: formRadius,
          color: formColor,
          notifyOn: formNotifyOn,
          notifyTelegram: formNotifyTelegram,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create geofence');
      }

      setIsModalOpen(false);
      await fetchGeofences();
      setActiveTab('geofences');
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingGeofence(false);
    }
  };

  const handleToggleGeofence = async (fence: GeofenceItem) => {
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/geofences/${fence._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !fence.isActive }),
      });
      if (res.ok) {
        await fetchGeofences();
      }
    } catch (err) {
      console.error('Failed to toggle geofence:', err);
    }
  };

  const handleDeleteGeofence = async (fenceId: string) => {
    if (!confirm('Are you sure you want to delete this geofence zone?')) return;
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/geofences/${fenceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchGeofences();
        await fetchGeofenceEvents();
      }
    } catch (err) {
      console.error('Failed to delete geofence:', err);
    }
  };

  const handleCenterOnPoint = (lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([lat, lng], 16, { animate: true });
    }
  };

  // Playback Navigation Helpers
  const handleJumpPrevChapter = () => {
    setIsPlaying(false);
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i].startIndex < playbackIndex) {
        setPlaybackIndex(chapters[i].startIndex);
        handleCenterOnPoint(
          points[chapters[i].startIndex].latitude,
          points[chapters[i].startIndex].longitude
        );
        return;
      }
    }
    setPlaybackIndex(0);
  };

  const handleJumpNextChapter = () => {
    setIsPlaying(false);
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].startIndex > playbackIndex) {
        setPlaybackIndex(chapters[i].startIndex);
        handleCenterOnPoint(
          points[chapters[i].startIndex].latitude,
          points[chapters[i].startIndex].longitude
        );
        return;
      }
    }
    if (points.length > 0) {
      setPlaybackIndex(points.length - 1);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setPlaybackIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setPlaybackIndex((prev) => Math.min(points.length - 1, prev + 1));
  };

  // Slider Mouse Move / Hover Preview
  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = (x / rect.width) * 100;
    const idx = Math.min(
      points.length - 1,
      Math.max(0, Math.round((pct / 100) * (points.length - 1)))
    );
    setHoverPercent(pct);
    setHoverIndex(idx);
  };

  const handleSliderMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = points[playbackIndex] || null;
  const hoverPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col space-y-0">
      {/* 1. Header Toolbar */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Live Location, Timeline & Geofencing</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive GPS path tracking, historical timeline playback, and automated boundary alerts.
            </p>
          </div>
        </div>

        {/* Action Controls & Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Auto-Refresh Toggle Button */}
          <button
            type="button"
            onClick={() => setIsLiveAutoRefresh(!isLiveAutoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              isLiveAutoRefresh
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
            title="Automatically poll for fresh GPS pings every 15s"
          >
            <Radio
              className={`w-3.5 h-3.5 ${
                isLiveAutoRefresh ? 'animate-pulse text-emerald-400' : 'text-slate-400'
              }`}
            />
            <span>{isLiveAutoRefresh ? `LIVE (${liveCountdown}s)` : 'Live Tracking'}</span>
          </button>

          {/* Action Tabs */}
          <div className="bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'timeline'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Route Timeline
            </button>
            <button
              onClick={() => setActiveTab('geofences')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                activeTab === 'geofences'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Geofences</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {geofences.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                activeTab === 'events'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Alerts Log</span>
              {events.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300">
                  {events.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={handleOpenAddGeofence}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Geofence</span>
          </button>
        </div>
      </div>

      {/* Pinning Mode Banner */}
      {isPinningMode && (
        <div className="p-3 bg-amber-500/20 border-b border-amber-500/40 text-amber-300 text-xs flex items-center justify-between px-6 animate-pulse">
          <div className="flex items-center gap-2 font-medium">
            <Crosshair className="w-4 h-4" />
            <span>Click anywhere on the map to set the center point for the new geofence zone.</span>
          </div>
          <button
            onClick={() => setIsPinningMode(false)}
            className="px-2 py-1 bg-slate-900 rounded-lg text-slate-300 hover:text-white text-[11px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* 2. Main Map Container */}
      <div className="relative w-full h-[480px] bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Metrics Badge on top left of map */}
        <div className="absolute top-3 left-3 z-[400] bg-slate-950/90 backdrop-blur-md border border-slate-800 p-2.5 rounded-2xl shadow-xl flex items-center gap-3 text-xs">
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-bold block">
              Distance Travelled
            </span>
            <span className="text-sm font-bold text-white">{summary.totalDistanceKm} km</span>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-bold block">
              Recorded Fixes
            </span>
            <span className="text-sm font-bold text-indigo-400">{summary.totalPoints} points</span>
          </div>
          {summary.maxSpeedKmh !== undefined && summary.maxSpeedKmh > 0 && (
            <>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">
                  Max Speed
                </span>
                <span className="text-sm font-bold text-amber-400">{summary.maxSpeedKmh} km/h</span>
              </div>
            </>
          )}
          <div className="h-6 w-px bg-slate-800" />
          <button
            onClick={() => fetchLocationPoints(false)}
            title="Refresh route data"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPoints ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Floating Playback HUD Overlay on top right of map */}
        {activePoint && (
          <div className="absolute top-3 right-14 z-[400] bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-2xl shadow-2xl hidden sm:flex items-center gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase text-slate-400 font-bold block">
                Replay Time
              </span>
              <span className="text-xs font-bold text-white font-mono">
                {new Date(activePoint.recordedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              {activePoint.mode === 'VEHICLE' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Car className="w-3 h-3" /> {activePoint.speedKmh} km/h
                </span>
              )}
              {activePoint.mode === 'CYCLING' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                  <Bike className="w-3 h-3" /> {activePoint.speedKmh} km/h
                </span>
              )}
              {activePoint.mode === 'WALKING' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Footprints className="w-3 h-3" /> {activePoint.speedKmh} km/h
                </span>
              )}
              {activePoint.mode === 'STATIONARY' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  {activePoint.dwellMinutes ? `Stay ${activePoint.dwellMinutes}m` : 'Stationary'}
                </span>
              )}
            </div>
            {isPlaying && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 animate-pulse">
                {playbackSpeed}x
              </span>
            )}
          </div>
        )}

        {/* Floating Quick Map Re-center button */}
        <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-2">
          {currentLocation?.latitude && currentLocation?.longitude && (
            <button
              onClick={() => handleCenterOnPoint(currentLocation.latitude, currentLocation.longitude)}
              title="Center on latest location"
              className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 rounded-xl shadow-xl transition flex items-center gap-1.5 text-xs font-medium"
            >
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <span>Current</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Timeline Playback & Range Controls (Active on 'timeline' tab) */}
      {activeTab === 'timeline' && (
        <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-4">
          {/* Top row: Time range filters, camera lock, and playback speed */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Time range buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Range:
              </span>
              {(['1h', '6h', '24h', '7d', '30d', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1 rounded-xl text-xs font-medium transition ${
                    timeRange === r
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {r === '1h'
                    ? '1 Hour'
                    : r === '6h'
                    ? '6 Hours'
                    : r === '24h'
                    ? 'Today (24h)'
                    : r === '7d'
                    ? '7 Days'
                    : r === '30d'
                    ? '30 Days'
                    : 'All Time'}
                </button>
              ))}
            </div>

            {/* Right toolbar: Follow camera lock, loop & speed selector */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {/* Follow Camera Lock Toggle */}
              <button
                type="button"
                onClick={() => setFollowDevice(!followDevice)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                  followDevice
                    ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title={followDevice ? 'Auto-centering camera is ON' : 'Free map pan is ON'}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{followDevice ? 'Follow: ON' : 'Follow: OFF'}</span>
              </button>

              {/* Loop Toggle */}
              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition border ${
                  isLooping
                    ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title={isLooping ? 'Looping is ON' : 'Looping is OFF'}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Loop</span>
              </button>

              {/* Playback speed selector */}
              <div className="flex items-center gap-1 text-slate-400 pl-1">
                <span>Speed:</span>
                {[1, 2, 5, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                      playbackSpeed === s
                        ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Breakdown Overview Bar */}
          {points.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap p-2.5 bg-slate-950/40 border border-slate-800/80 rounded-2xl">
              <span className="text-[11px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <MapPinned className="w-3.5 h-3.5 text-indigo-400" /> Summary:
              </span>
              {activityStats.vehicleKm > 0 && (
                <div className="flex items-center gap-1 text-slate-300">
                  <Car className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Driving: <strong className="text-white">{activityStats.vehicleKm} km</strong>
                  </span>
                </div>
              )}
              {activityStats.walkKm > 0 && (
                <div className="flex items-center gap-1 text-slate-300">
                  <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Walking: <strong className="text-white">{activityStats.walkKm} km</strong>
                  </span>
                </div>
              )}
              {activityStats.cycleKm > 0 && (
                <div className="flex items-center gap-1 text-slate-300">
                  <Bike className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    Cycling: <strong className="text-white">{activityStats.cycleKm} km</strong>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Stationary: <strong className="text-white">{activityStats.stayHours} hrs</strong>
                </span>
              </div>
            </div>
          )}

          {/* Activity Chapters / Quick Jump Chips */}
          {chapters.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
              <span className="text-[11px] text-slate-400 uppercase font-bold shrink-0 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Activity Chapters:
              </span>
              {chapters.map((ch) => {
                const isSelected =
                  playbackIndex >= ch.startIndex && playbackIndex <= ch.endIndex;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackIndex(ch.startIndex);
                      handleCenterOnPoint(
                        points[ch.startIndex].latitude,
                        points[ch.startIndex].longitude
                      );
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1.5 transition border ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {ch.type === 'STAY' ? (
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                    ) : ch.mode === 'VEHICLE' ? (
                      <Car className="w-3 h-3 text-amber-400" />
                    ) : ch.mode === 'CYCLING' ? (
                      <Bike className="w-3 h-3 text-cyan-400" />
                    ) : (
                      <Footprints className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>{ch.label}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(ch.startTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Scrubber slider and playback controls */}
          {points.length > 0 ? (
            <div className="space-y-4">
              {/* Visual Activity Heatmap Slider Track with Hover Tooltip */}
              <div
                className="relative w-full pt-6 pb-2 cursor-pointer select-none group"
                onMouseMove={handleSliderMouseMove}
                onMouseLeave={handleSliderMouseLeave}
              >
                {/* Floating Hover Preview Card */}
                {hoverPoint && (
                  <div
                    style={{ left: `${hoverPercent}%` }}
                    className="absolute top-0 -translate-x-1/2 pointer-events-none z-30 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-xl shadow-2xl flex items-center gap-2 text-[11px] whitespace-nowrap"
                  >
                    <span className="font-bold text-white font-mono">
                      {new Date(hoverPoint.recordedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <div className="w-px h-3 bg-slate-700" />
                    {hoverPoint.mode === 'VEHICLE' && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <Car className="w-3 h-3" /> {hoverPoint.speedKmh} km/h
                      </span>
                    )}
                    {hoverPoint.mode === 'CYCLING' && (
                      <span className="text-cyan-400 font-semibold flex items-center gap-1">
                        <Bike className="w-3 h-3" /> {hoverPoint.speedKmh} km/h
                      </span>
                    )}
                    {hoverPoint.mode === 'WALKING' && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Footprints className="w-3 h-3" /> {hoverPoint.speedKmh} km/h
                      </span>
                    )}
                    {hoverPoint.mode === 'STATIONARY' && (
                      <span className="text-slate-400 font-semibold flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        {hoverPoint.dwellMinutes ? `Stay ${hoverPoint.dwellMinutes}m` : 'Stay'}
                      </span>
                    )}
                    <div className="w-px h-3 bg-slate-700" />
                    <span className="text-slate-400 font-mono">🔋{hoverPoint.batteryLevel}%</span>
                  </div>
                )}

                {/* Activity Spectrum Bar */}
                <div className="relative w-full h-3.5 rounded-full overflow-hidden bg-slate-950 border border-slate-800 flex shadow-inner">
                  {chapters.map((ch) => {
                    const segWidth =
                      ((ch.endIndex - ch.startIndex + 1) / Math.max(1, points.length)) * 100;
                    let bg = 'bg-slate-800';
                    if (ch.type === 'STAY') bg = 'bg-slate-700/60';
                    else if (ch.mode === 'VEHICLE') bg = 'bg-amber-500/80';
                    else if (ch.mode === 'CYCLING') bg = 'bg-cyan-500/80';
                    else if (ch.mode === 'WALKING') bg = 'bg-emerald-500/80';

                    return (
                      <div
                        key={ch.id}
                        style={{ width: `${segWidth}%` }}
                        className={`h-full transition-opacity ${bg} hover:opacity-90`}
                        title={`${ch.label} (${new Date(ch.startTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })})`}
                      />
                    );
                  })}

                  {/* Traveled progress fill overlay */}
                  <div
                    style={{
                      width: `${(playbackIndex / Math.max(1, points.length - 1)) * 100}%`,
                    }}
                    className="absolute top-0 bottom-0 left-0 bg-indigo-500/35 border-r-2 border-indigo-400 pointer-events-none"
                  />
                </div>

                {/* Invisible input range on top for scrubbing */}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, points.length - 1)}
                  value={playbackIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setPlaybackIndex(Number(e.target.value));
                  }}
                  className="absolute inset-x-0 bottom-1.5 w-full h-4 opacity-0 cursor-pointer z-20"
                />

                {/* Custom glowing scrubber thumb */}
                <div
                  style={{
                    left: `${(playbackIndex / Math.max(1, points.length - 1)) * 100}%`,
                  }}
                  className="absolute bottom-3.5 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 shadow-xl pointer-events-none z-10 ring-4 ring-indigo-500/40"
                />
              </div>

              {/* Playback Control Bar with Step & Jump Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                {/* Playback Buttons Group */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackIndex(0);
                    }}
                    title="Rewind to start"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleJumpPrevChapter}
                    title="Jump to previous activity chapter"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleStepBack}
                    title="Step backward 1 checkpoint"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Main Play / Pause Button */}
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center font-bold text-xs gap-1.5"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 ml-0.5" /> Play Replay
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleStepForward}
                    title="Step forward 1 checkpoint"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleJumpNextChapter}
                    title="Jump to next activity chapter"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Center / Right Timestamp & Checkpoint Info */}
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>
                    {summary.startTime
                      ? new Date(summary.startTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Start'}
                  </span>
                  <div className="h-4 w-px bg-slate-800" />
                  <span className="text-white font-semibold">
                    Checkpoint {playbackIndex + 1} of {points.length}
                  </span>
                  <div className="h-4 w-px bg-slate-800" />
                  <span>
                    {summary.endTime
                      ? new Date(summary.endTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Latest'}
                  </span>
                </div>
              </div>

              {/* Point Inspector Card with Transit Mode, Speed & Battery */}
              {activePoint && (
                <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {new Date(activePoint.recordedAt).toLocaleString()}
                        </span>
                        {/* Transit Mode Pill */}
                        {activePoint.mode === 'WALKING' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Footprints className="w-3 h-3" /> Walking
                          </span>
                        )}
                        {activePoint.mode === 'CYCLING' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                            <Bike className="w-3 h-3" /> Cycling
                          </span>
                        )}
                        {activePoint.mode === 'VEHICLE' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Car className="w-3 h-3" /> In Vehicle
                          </span>
                        )}
                        {activePoint.mode === 'STATIONARY' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {activePoint.dwellMinutes
                              ? `Stay (${activePoint.dwellMinutes}m)`
                              : 'Stationary'}
                          </span>
                        )}

                        {activeChapter && (
                          <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                            • Part of: {activeChapter.label}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                        {activePoint.latitude.toFixed(6)}, {activePoint.longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-slate-300">
                    {/* Speed Indicator */}
                    {activePoint.speedKmh !== undefined && activePoint.speedKmh > 0 && (
                      <div className="flex items-center gap-1 text-slate-300 font-mono">
                        <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{activePoint.speedKmh} km/h</span>
                      </div>
                    )}

                    {/* Battery Indicator */}
                    <div className="flex items-center gap-1.5">
                      {activePoint.isCharging ? (
                        <BatteryCharging className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Battery className="w-4 h-4 text-slate-400" />
                      )}
                      <span>{activePoint.batteryLevel}%</span>
                    </div>

                    {/* Accuracy Indicator */}
                    {activePoint.accuracy !== undefined && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>±{Math.round(activePoint.accuracy)}m</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleCenterOnPoint(activePoint.latitude, activePoint.longitude)
                      }
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-slate-800 rounded-lg text-[11px] font-medium transition"
                    >
                      Focus
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500 space-y-1">
              <p>No location points recorded within this time window.</p>
              <p className="text-[11px] text-slate-600">
                Points are synced automatically when the device sends location updates. Try
                selecting &quot;All Time&quot;.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. Geofences List Panel (Active on 'geofences' tab) */}
      {activeTab === 'geofences' && (
        <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Configured Safe & Danger Zones ({geofences.length})
            </h3>
            <button
              onClick={handleOpenAddGeofence}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Zone</span>
            </button>
          </div>

          {geofences.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 space-y-2">
              <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
              <p className="font-semibold text-slate-200">No Geofences Configured</p>
              <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                Set boundaries around Home, School, or other important areas to receive instant
                Telegram notifications when the child enters or leaves.
              </p>
              <button
                onClick={handleOpenAddGeofence}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Geofence</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {geofences.map((fence) => (
                <div
                  key={fence._id}
                  className={`p-4 rounded-2xl border transition ${
                    fence.isActive
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-slate-950/40 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: fence.color }}
                      />
                      <h4 className="font-bold text-white text-sm truncate">{fence.name}</h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleGeofence(fence)}
                        title={fence.isActive ? 'Deactivate zone' : 'Activate zone'}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                          fence.isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {fence.isActive ? 'Active' : 'Off'}
                      </button>
                      <button
                        onClick={() => handleDeleteGeofence(fence._id)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded-lg transition"
                        title="Delete Geofence"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Geofence info */}
                  <div className="space-y-1 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span
                        className={`font-semibold ${
                          fence.currentStatus === 'INSIDE'
                            ? 'text-emerald-400'
                            : fence.currentStatus === 'OUTSIDE'
                            ? 'text-slate-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {fence.currentStatus === 'INSIDE'
                          ? '🟢 Inside Zone'
                          : fence.currentStatus === 'OUTSIDE'
                          ? 'Outside Zone'
                          : 'Unknown'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Radius:</span>
                      <span className="text-slate-200 font-mono font-medium">
                        {fence.radius} meters
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Alert on:</span>
                      <span className="text-slate-200 font-medium">
                        {fence.notifyOn === 'BOTH' ? 'Enter & Exit' : fence.notifyOn}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Telegram Alert:</span>
                      <span
                        className={
                          fence.notifyTelegram ? 'text-sky-400 font-medium' : 'text-slate-500'
                        }
                      >
                        {fence.notifyTelegram ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => handleCenterOnPoint(fence.latitude, fence.longitude)}
                      className="text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>View on Map</span>
                    </button>
                    <span className="text-slate-500">
                      {fence.lastTransitionAt
                        ? `Transitioned: ${new Date(fence.lastTransitionAt).toLocaleTimeString()}`
                        : 'No transitions yet'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Geofence Events Feed (Active on 'events' tab) */}
      {activeTab === 'events' && (
        <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Recent Boundary Crossing Events ({events.length})
            </h3>
            <button
              onClick={fetchGeofenceEvents}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh events"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {events.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <p>No geofence breach or entry events recorded yet.</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                When the child device moves across any active boundary, ENTER and EXIT logs will
                show here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">Zone Name</th>
                    <th className="py-2.5 px-3">Distance From Center</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Telegram Alert</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {events.map((evt) => (
                    <tr key={evt._id} className="hover:bg-slate-950/40">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            evt.eventType === 'ENTER'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {evt.eventType === 'ENTER' ? '🟢 Entered' : '🚨 Exited'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">{evt.geofenceName}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {evt.distanceFromCenter}m
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {new Date(evt.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        {evt.telegramSent ? (
                          <span className="text-sky-400 flex items-center gap-1">
                            <Send className="w-3 h-3" /> Sent
                          </span>
                        ) : (
                          <span className="text-slate-500">Not sent</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => handleCenterOnPoint(evt.latitude, evt.longitude)}
                          className="text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. Add Geofence Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Create Geofence Zone</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGeofence} className="space-y-4 text-xs">
              {/* Zone Name */}
              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Home, School, Grandparents"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Coordinates & Map Pinning */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 uppercase font-semibold">
                    Center Coordinates
                  </label>
                  <button
                    type="button"
                    onClick={handleStartPinning}
                    className="text-indigo-400 hover:underline flex items-center gap-1 text-[11px] font-medium"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Pick on Map</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.000001"
                    required
                    placeholder="Latitude"
                    value={formLat ?? ''}
                    onChange={(e) => setFormLat(parseFloat(e.target.value))}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono"
                  />
                  <input
                    type="number"
                    step="0.000001"
                    required
                    placeholder="Longitude"
                    value={formLng ?? ''}
                    onChange={(e) => setFormLng(parseFloat(e.target.value))}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Radius */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 uppercase font-semibold">
                    Radius: <strong className="text-indigo-400 font-mono">{formRadius}m</strong>
                  </label>
                  <div className="flex gap-1 text-[10px]">
                    {[50, 100, 250, 500, 1000].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormRadius(r)}
                        className={`px-2 py-0.5 rounded transition ${
                          formRadius === r
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="range"
                  min={25}
                  max={5000}
                  step={25}
                  value={formRadius}
                  onChange={(e) => setFormRadius(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Color selection */}
              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">
                  Zone Color
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setFormColor(col.hex)}
                      style={{ backgroundColor: col.hex }}
                      className={`w-7 h-7 rounded-xl transition ${
                        formColor === col.hex
                          ? 'ring-2 ring-white scale-110'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      title={col.name}
                    />
                  ))}
                </div>
              </div>

              {/* Trigger Notification */}
              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">
                  Notification Triggers
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ENTER', 'EXIT', 'BOTH'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormNotifyOn(mode)}
                      className={`py-2 px-2 rounded-xl text-center font-semibold transition border ${
                        formNotifyOn === mode
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'ENTER' ? '🟢 On Enter' : mode === 'EXIT' ? '🚨 On Exit' : '🔄 Both'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telegram Alert checkbox */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-white font-medium block">Telegram Alerts</span>
                  <span className="text-slate-400 text-[11px]">
                    Send instant push alert to parent Telegram bot
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formNotifyTelegram}
                  onChange={(e) => setFormNotifyTelegram(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingGeofence}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {submittingGeofence ? 'Saving...' : 'Save Geofence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
