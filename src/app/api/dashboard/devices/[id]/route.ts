import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Device } from '@/models/Device';
import { Command } from '@/models/Command';
import { TelemetryLog } from '@/models/TelemetryLog';
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

    // Get recent commands
    const recentCommands = await Command.find({ deviceId: device._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get recent telemetry
    const telemetryHistory = await TelemetryLog.find({ deviceId: device._id })
      .sort({ recordedAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({
      device,
      recentCommands,
      telemetryHistory,
    });
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

    const device = await Device.findOneAndDelete({ _id: id, userId: auth.userId });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await Command.deleteMany({ deviceId: device._id });
    await TelemetryLog.deleteMany({ deviceId: device._id });

    return NextResponse.json({ message: 'Device deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
