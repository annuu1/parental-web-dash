import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { Command } from '@/models/Command';
import { getAuthUser } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth || auth.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { deviceName, syncIntervalMinutes, locationTrackingEnabled, lockMessage } = body;

    await connectToDatabase();
    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (deviceName) device.deviceName = deviceName;
    if (typeof syncIntervalMinutes === 'number') {
      device.settings.syncIntervalMinutes = Math.max(5, syncIntervalMinutes);
    }
    if (typeof locationTrackingEnabled === 'boolean') {
      device.settings.locationTrackingEnabled = locationTrackingEnabled;
    }
    if (lockMessage) {
      device.lockMessage = lockMessage;
      device.settings.lockMessage = lockMessage;
    }

    await device.save();

    // Also queue an UPDATE_CONFIG command so device is notified of config change
    await Command.create({
      deviceId: device._id,
      userId: auth.userId,
      type: 'UPDATE_CONFIG',
      params: {
        syncIntervalMinutes: device.settings.syncIntervalMinutes,
        locationTrackingEnabled: device.settings.locationTrackingEnabled,
        lockMessage: device.lockMessage,
      },
      status: 'PENDING',
    });

    return NextResponse.json({
      message: 'Settings updated successfully',
      device,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
