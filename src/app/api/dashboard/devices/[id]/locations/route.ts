import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { TelemetryLog } from '@/models/TelemetryLog';
import { getAuthUser } from '@/lib/auth';
import { calculateDistanceMeters } from '@/lib/geofenceService';

export type TransitMode = 'STATIONARY' | 'WALKING' | 'CYCLING' | 'VEHICLE';

export interface LocationPointResponse {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  batteryLevel: number;
  isCharging: boolean;
  recordedAt: string;
  distanceFromPrevMeters: number;
  speedKmh: number;
  mode: TransitMode;
  dwellMinutes?: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const range = url.searchParams.get('range') || '24h';
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const limit = Math.min(2000, Math.max(10, parseInt(url.searchParams.get('limit') || '500', 10)));
    const filterAccuracy = url.searchParams.get('filterAccuracy') !== 'false';

    // Calculate Date Bounds
    let startDate: Date;
    const now = new Date();
    const endDate = toParam ? new Date(toParam) : now;

    if (fromParam) {
      startDate = new Date(fromParam);
    } else {
      switch (range) {
        case '1h':
          startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
          break;
        case '6h':
          startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date(0);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    // Query telemetry points that have valid GPS coordinates within range
    const rawLogs = await TelemetryLog.find({
      deviceId: device._id,
      latitude: { $exists: true, $ne: null, $gte: -90, $lte: 90 },
      longitude: { $exists: true, $ne: null, $gte: -180, $lte: 180 },
      recordedAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ recordedAt: 1 })
      .lean();

    // Accuracy filtering: if enabled and we have enough points, ignore points with extreme uncertainty (> 250m)
    const validLogs = rawLogs.filter((log) => {
      if (!filterAccuracy) return true;
      if (typeof log.accuracy === 'number' && log.accuracy > 250 && rawLogs.length > 5) {
        return false;
      }
      return true;
    });

    const points: LocationPointResponse[] = [];
    let totalDistanceMeters = 0;
    let totalMovingSeconds = 0;
    let maxSpeedKmh = 0;

    let prevLat: number | null = null;
    let prevLon: number | null = null;
    let prevTime: Date | null = null;
    let dwellStartTime: Date | null = null;

    const JITTER_THRESHOLD_METERS = 5; // GPS drift threshold below which movement is considered stationary

    for (let i = 0; i < validLogs.length; i++) {
      const log = validLogs[i];
      if (typeof log.latitude !== 'number' || typeof log.longitude !== 'number') continue;

      const logTime = log.recordedAt ? new Date(log.recordedAt) : new Date();
      const isLastLog = i === validLogs.length - 1;

      if (prevLat === null || prevLon === null || prevTime === null) {
        // First initial point
        prevLat = log.latitude;
        prevLon = log.longitude;
        prevTime = logTime;
        dwellStartTime = logTime;

        points.push({
          id: String(log._id),
          latitude: log.latitude,
          longitude: log.longitude,
          accuracy: log.accuracy,
          batteryLevel: log.batteryLevel,
          isCharging: log.isCharging,
          recordedAt: logTime.toISOString(),
          distanceFromPrevMeters: 0,
          speedKmh: 0,
          mode: 'STATIONARY',
        });
        continue;
      }

      const dist = calculateDistanceMeters(prevLat, prevLon, log.latitude, log.longitude);
      const timeDeltaSeconds = Math.max(1, (logTime.getTime() - prevTime.getTime()) / 1000);

      // Check stationary jitter:
      // If movement is under 5 meters, it is stationary GPS drift.
      if (dist < JITTER_THRESHOLD_METERS) {
        const dwellMinutes = dwellStartTime
          ? Math.round((logTime.getTime() - dwellStartTime.getTime()) / (60 * 1000))
          : 0;

        // Skip pushing excessive duplicate pings if within 5 mins unless it is the very last point
        const timeSinceLastPushed = (logTime.getTime() - prevTime.getTime()) / 1000;
        if (timeSinceLastPushed < 300 && !isLastLog) {
          continue;
        }

        prevTime = logTime;
        points.push({
          id: String(log._id),
          latitude: log.latitude,
          longitude: log.longitude,
          accuracy: log.accuracy,
          batteryLevel: log.batteryLevel,
          isCharging: log.isCharging,
          recordedAt: logTime.toISOString(),
          distanceFromPrevMeters: 0,
          speedKmh: 0,
          mode: 'STATIONARY',
          dwellMinutes: dwellMinutes > 5 ? dwellMinutes : undefined,
        });
        continue;
      }

      // Valid real movement (dist >= 5 meters)
      // Reset dwell timer
      dwellStartTime = logTime;

      // Calculate instantaneous speed in km/h
      let speedKmh = Number(((dist / timeDeltaSeconds) * 3.6).toFixed(1));

      // Sanity check against impossible GPS teleportation jumps (e.g. > 180 km/h with sudden jump)
      if (speedKmh > 180 && dist > 1000 && timeDeltaSeconds < 30) {
        // Skip erratic single-ping jump
        continue;
      }

      if (speedKmh > 160) speedKmh = 160;
      if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;

      totalDistanceMeters += dist;
      totalMovingSeconds += timeDeltaSeconds;

      // Determine transit mode
      let mode: TransitMode = 'STATIONARY';
      if (speedKmh >= 1 && speedKmh < 7) {
        mode = 'WALKING';
      } else if (speedKmh >= 7 && speedKmh < 25) {
        mode = 'CYCLING';
      } else if (speedKmh >= 25) {
        mode = 'VEHICLE';
      }

      prevLat = log.latitude;
      prevLon = log.longitude;
      prevTime = logTime;

      points.push({
        id: String(log._id),
        latitude: log.latitude,
        longitude: log.longitude,
        accuracy: log.accuracy,
        batteryLevel: log.batteryLevel,
        isCharging: log.isCharging,
        recordedAt: logTime.toISOString(),
        distanceFromPrevMeters: dist,
        speedKmh,
        mode,
      });
    }

    // If points exceed requested limit, sample evenly while strictly preserving start and end
    let sampledPoints = points;
    if (points.length > limit) {
      const step = Math.ceil(points.length / limit);
      sampledPoints = points.filter(
        (_, idx) => idx === 0 || idx === points.length - 1 || idx % step === 0
      );
    }

    const avgSpeedKmh =
      totalMovingSeconds > 0
        ? Number(((totalDistanceMeters / totalMovingSeconds) * 3.6).toFixed(1))
        : 0;

    const summary = {
      totalPoints: points.length,
      sampledPoints: sampledPoints.length,
      totalDistanceKm: Number((totalDistanceMeters / 1000).toFixed(2)),
      avgSpeedKmh,
      maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)),
      startTime: points.length > 0 ? points[0].recordedAt : null,
      endTime: points.length > 0 ? points[points.length - 1].recordedAt : null,
      latestLocation: device.lastLocation,
    };

    return NextResponse.json({
      points: sampledPoints,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
