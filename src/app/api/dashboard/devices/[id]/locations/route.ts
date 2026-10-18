import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { TelemetryLog } from '@/models/TelemetryLog';
import { getAuthUser } from '@/lib/auth';
import { calculateDistanceMeters } from '@/lib/geofenceService';

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

    // Query telemetry points that have valid GPS coordinates
    const rawLogs = await TelemetryLog.find({
      deviceId: device._id,
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
      recordedAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ recordedAt: 1 })
      .lean();

    // Map and filter points (downsample if very large, but preserve start & end)
    let totalDistanceMeters = 0;
    const points: Array<{
      id: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      batteryLevel: number;
      isCharging: boolean;
      recordedAt: string;
      distanceFromPrevMeters?: number;
    }> = [];

    let prevLat: number | null = null;
    let prevLon: number | null = null;

    // Filter consecutive duplicate coordinates within 3 meters to clean up stationary GPS jitter
    for (const log of rawLogs) {
      if (typeof log.latitude !== 'number' || typeof log.longitude !== 'number') continue;

      let dist = 0;
      if (prevLat !== null && prevLon !== null) {
        dist = calculateDistanceMeters(prevLat, prevLon, log.latitude, log.longitude);
      }

      totalDistanceMeters += dist;
      prevLat = log.latitude;
      prevLon = log.longitude;

      points.push({
        id: String(log._id),
        latitude: log.latitude,
        longitude: log.longitude,
        accuracy: log.accuracy,
        batteryLevel: log.batteryLevel,
        isCharging: log.isCharging,
        recordedAt: (log.recordedAt ? new Date(log.recordedAt) : new Date()).toISOString(),
        distanceFromPrevMeters: dist,
      });
    }

    // If points exceed limit, sample evenly but keep first and last
    let sampledPoints = points;
    if (points.length > limit) {
      const step = Math.ceil(points.length / limit);
      sampledPoints = points.filter((_, idx) => idx === 0 || idx === points.length - 1 || idx % step === 0);
    }

    const summary = {
      totalPoints: points.length,
      sampledPoints: sampledPoints.length,
      totalDistanceKm: Number((totalDistanceMeters / 1000).toFixed(2)),
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
