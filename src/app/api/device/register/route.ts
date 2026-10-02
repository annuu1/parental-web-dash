import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Device } from '@/models/Device';
import { comparePassword, signToken, getAuthUser } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { email, password, deviceName, deviceModel, appVersion } = body;

    let userId: string | null = null;

    // Option A: Parent provides email + password on setup screen
    if (email && password) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return NextResponse.json({ error: 'Invalid user credentials' }, { status: 401 });
      }
      const isMatch = await comparePassword(password, user.passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: 'Invalid user credentials' }, { status: 401 });
      }
      userId = user._id.toString();
    } else {
      // Option B: Parent provides Bearer token
      const auth = getAuthUser(req);
      if (auth && auth.type === 'user') {
        userId = auth.userId;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required to register device (email/password or user token)' },
        { status: 401 }
      );
    }

    // Generate unique device token
    const rawToken = `dev_${crypto.randomBytes(24).toString('hex')}`;
    const finalDeviceName = deviceName || 'Child Device';
    const finalDeviceModel = deviceModel || 'Android Phone';

    const device = await Device.create({
      userId,
      deviceName: finalDeviceName,
      deviceModel: finalDeviceModel,
      deviceToken: rawToken,
      appVersion: appVersion || '1.0.0',
      isLocked: false,
      settings: {
        syncIntervalMinutes: 15,
        locationTrackingEnabled: true,
        cameraEnabled: false,
        audioEnabled: false,
        lockMessage: 'This device has been locked by parental control.',
      },
    });

    // Create JWT for device
    const deviceJwt = signToken({
      userId,
      deviceId: device._id.toString(),
      email: '',
      type: 'device',
    }, '365d'); // 1 year expiry

    return NextResponse.json({
      message: 'Device registered successfully',
      deviceId: device._id,
      deviceName: device.deviceName,
      deviceToken: rawToken,
      deviceJwt,
      config: device.settings,
    });
  } catch (error: any) {
    console.error('Device registration error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
