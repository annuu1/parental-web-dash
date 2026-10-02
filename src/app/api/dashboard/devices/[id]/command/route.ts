import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { Command, CommandType } from '@/models/Command';
import { getAuthUser } from '@/lib/auth';

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
    const body = await req.json();
    const { type, params: cmdParams } = body as { type: CommandType; params?: Record<string, any> };

    if (!type) {
      return NextResponse.json({ error: 'Command type is required' }, { status: 400 });
    }

    await connectToDatabase();
    const device = await Device.findOne({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // If lock/unlock command, update device state flag
    if (type === 'LOCK_DEVICE') {
      device.isLocked = true;
      if (cmdParams?.message) {
        device.lockMessage = cmdParams.message;
      }
      await device.save();
    } else if (type === 'UNLOCK_DEVICE') {
      device.isLocked = false;
      await device.save();
    }

    // Queue command for delivery during next device sync
    const command = await Command.create({
      deviceId: device._id,
      userId: auth.userId,
      type,
      params: cmdParams || {},
      status: 'PENDING',
    });

    return NextResponse.json({
      message: `Command ${type} queued successfully`,
      command: {
        id: command._id,
        type: command.type,
        status: command.status,
        createdAt: command.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Queue command error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
