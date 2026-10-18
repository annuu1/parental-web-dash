import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { Geofence } from '@/models/Geofence';
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

    const geofences = await Geofence.find({ deviceId: device._id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ geofences });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
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

    const body = await req.json();
    const { name, latitude, longitude, radius, color, notifyOn, notifyTelegram, isActive } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Geofence name is required' }, { status: 400 });
    }

    if (
      typeof latitude !== 'number' ||
      latitude < -90 ||
      latitude > 90 ||
      typeof longitude !== 'number' ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json({ error: 'Valid latitude and longitude are required' }, { status: 400 });
    }

    const parsedRadius = Math.max(25, Math.min(50000, Number(radius) || 150));

    // Determine initial status based on last known device location
    let initialStatus: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' = 'UNKNOWN';
    if (device.lastLocation?.latitude && device.lastLocation?.longitude) {
      const dist = calculateDistanceMeters(
        device.lastLocation.latitude,
        device.lastLocation.longitude,
        latitude,
        longitude
      );
      initialStatus = dist <= parsedRadius ? 'INSIDE' : 'OUTSIDE';
    }

    const geofence = await Geofence.create({
      deviceId: device._id,
      userId: auth.userId,
      name: name.trim(),
      latitude,
      longitude,
      radius: parsedRadius,
      color: color || '#3b82f6',
      notifyOn: ['ENTER', 'EXIT', 'BOTH'].includes(notifyOn) ? notifyOn : 'BOTH',
      notifyTelegram: notifyTelegram !== undefined ? Boolean(notifyTelegram) : true,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      currentStatus: initialStatus,
      lastTransitionAt: initialStatus !== 'UNKNOWN' ? new Date() : undefined,
    });

    return NextResponse.json({ geofence }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
