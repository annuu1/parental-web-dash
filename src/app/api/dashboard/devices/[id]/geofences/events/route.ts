import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { GeofenceEvent } from '@/models/GeofenceEvent';
import { getAuthUser } from '@/lib/auth';

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
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const geofenceId = url.searchParams.get('geofenceId');
    const eventType = url.searchParams.get('eventType');

    const filter: Record<string, any> = { deviceId: device._id };
    if (geofenceId) {
      filter.geofenceId = geofenceId;
    }
    if (eventType && ['ENTER', 'EXIT'].includes(eventType)) {
      filter.eventType = eventType;
    }

    const events = await GeofenceEvent.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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

    await GeofenceEvent.deleteMany({ deviceId: device._id });

    return NextResponse.json({ message: 'Geofence events cleared' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
