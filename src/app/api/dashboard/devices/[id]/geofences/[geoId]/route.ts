import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { Geofence } from '@/models/Geofence';
import { GeofenceEvent } from '@/models/GeofenceEvent';
import { getAuthUser } from '@/lib/auth';
import { calculateDistanceMeters } from '@/lib/geofenceService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; geoId: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, geoId } = await params;
    await connectToDatabase();

    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const geofence = await Geofence.findOne({ _id: geoId, deviceId: device._id });
    if (!geofence) {
      return NextResponse.json({ error: 'Geofence not found' }, { status: 404 });
    }

    return NextResponse.json({ geofence });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; geoId: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, geoId } = await params;
    await connectToDatabase();

    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const geofence = await Geofence.findOne({ _id: geoId, deviceId: device._id });
    if (!geofence) {
      return NextResponse.json({ error: 'Geofence not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, latitude, longitude, radius, color, notifyOn, notifyTelegram, isActive } = body;

    let locationOrRadiusChanged = false;

    if (name !== undefined) geofence.name = String(name).trim();
    if (typeof latitude === 'number' && latitude >= -90 && latitude <= 90) {
      if (geofence.latitude !== latitude) {
        geofence.latitude = latitude;
        locationOrRadiusChanged = true;
      }
    }
    if (typeof longitude === 'number' && longitude >= -180 && longitude <= 180) {
      if (geofence.longitude !== longitude) {
        geofence.longitude = longitude;
        locationOrRadiusChanged = true;
      }
    }
    if (radius !== undefined) {
      const parsedRadius = Math.max(25, Math.min(50000, Number(radius) || 150));
      if (geofence.radius !== parsedRadius) {
        geofence.radius = parsedRadius;
        locationOrRadiusChanged = true;
      }
    }
    if (color !== undefined) geofence.color = color;
    if (notifyOn && ['ENTER', 'EXIT', 'BOTH'].includes(notifyOn)) {
      geofence.notifyOn = notifyOn;
    }
    if (notifyTelegram !== undefined) geofence.notifyTelegram = Boolean(notifyTelegram);
    if (isActive !== undefined) geofence.isActive = Boolean(isActive);

    // If coordinates or radius changed, re-evaluate current status with latest location
    if (locationOrRadiusChanged && device.lastLocation?.latitude && device.lastLocation?.longitude) {
      const dist = calculateDistanceMeters(
        device.lastLocation.latitude,
        device.lastLocation.longitude,
        geofence.latitude,
        geofence.longitude
      );
      geofence.currentStatus = dist <= geofence.radius ? 'INSIDE' : 'OUTSIDE';
      geofence.lastTransitionAt = new Date();
    }

    await geofence.save();

    return NextResponse.json({ geofence });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; geoId: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, geoId } = await params;
    await connectToDatabase();

    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const geofence = await Geofence.findOneAndDelete({ _id: geoId, deviceId: device._id });
    if (!geofence) {
      return NextResponse.json({ error: 'Geofence not found' }, { status: 404 });
    }

    // Clean up related geofence events
    await GeofenceEvent.deleteMany({ geofenceId: geofence._id });

    return NextResponse.json({ message: 'Geofence deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
