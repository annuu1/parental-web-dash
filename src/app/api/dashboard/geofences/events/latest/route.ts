import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { GeofenceEvent } from '@/models/GeofenceEvent';
import { getAuthUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const url = new URL(req.url);
    const since = url.searchParams.get('since');
    const deviceId = url.searchParams.get('deviceId');

    // Fetch user's registered devices to populate metadata and ensure ownership
    const userDevices = await Device.find({ userId: auth.userId })
      .select('_id deviceName deviceModel')
      .lean();

    const deviceMap = new Map<string, { deviceName: string; deviceModel: string }>();
    userDevices.forEach((d: any) => {
      deviceMap.set(d._id.toString(), {
        deviceName: d.deviceName || 'Child Device',
        deviceModel: d.deviceModel || 'Android',
      });
    });

    const deviceIds = userDevices.map((d: any) => d._id);

    // Build filter matching the authenticated user's geofence events
    const filter: Record<string, any> = {
      $or: [
        { userId: auth.userId },
        { deviceId: { $in: deviceIds } },
      ],
    };

    if (deviceId) {
      filter.deviceId = deviceId;
    }

    // 1. Initial baseline check on page load: return the latest single event without triggering alerts
    if (!since) {
      const latest = await GeofenceEvent.findOne(filter)
        .sort({ timestamp: -1 })
        .lean();

      return NextResponse.json({
        latestEvent: latest
          ? {
              ...latest,
              _id: (latest as any)._id.toString(),
              geofenceId: (latest as any).geofenceId?.toString(),
              deviceId: (latest as any).deviceId?.toString(),
              deviceName:
                deviceMap.get((latest as any).deviceId?.toString())?.deviceName || 'Child Device',
              deviceModel:
                deviceMap.get((latest as any).deviceId?.toString())?.deviceModel || 'Android',
              timestamp: (latest as any).timestamp?.toISOString
                ? (latest as any).timestamp.toISOString()
                : (latest as any).timestamp,
            }
          : null,
        serverTime: new Date().toISOString(),
      });
    }

    // 2. Incremental check: query events newer than `since`
    const sinceDate = new Date(since);
    filter.timestamp = { $gt: sinceDate };

    const events = await GeofenceEvent.find(filter)
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    const formattedEvents = events.map((evt: any) => ({
      ...evt,
      _id: evt._id.toString(),
      geofenceId: evt.geofenceId?.toString(),
      deviceId: evt.deviceId?.toString(),
      deviceName:
        deviceMap.get(evt.deviceId?.toString())?.deviceName || 'Child Device',
      deviceModel:
        deviceMap.get(evt.deviceId?.toString())?.deviceModel || 'Android',
      timestamp: evt.timestamp?.toISOString ? evt.timestamp.toISOString() : evt.timestamp,
    }));

    return NextResponse.json({
      events: formattedEvents,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching latest geofence alerts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
