import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeviceSettings {
  syncIntervalSeconds: number; // in seconds, minimum 5s
  syncIntervalMinutes?: number; // legacy alias
  // Telegram Integration
  telegramBotToken: string;
  telegramChatId: string;
  // Monitoring Master Switch
  isMonitoringActive: boolean;
  // Features
  sendScreenshot: boolean;
  screenshotInterval: number; // in seconds
  sendLocation: boolean;
  locationInterval: number; // in minutes
  sendAudio: boolean;
  audioDuration: number; // in seconds
  audioScreenOff: boolean;
  sendCamera: boolean;
  cameraInterval: number; // in seconds
  cameraScreenOff: boolean;
  // Legacy alias
  locationTrackingEnabled?: boolean;
  lockMessage?: string;
}

export interface IDeviceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: Date;
}

export interface IDevice extends Document {
  userId: mongoose.Types.ObjectId;
  deviceName: string;
  deviceModel: string;
  deviceToken: string;
  batteryLevel?: number;
  isCharging?: boolean;
  isLocked: boolean;
  lockMessage?: string;
  lastLocation?: IDeviceLocation;
  settings: IDeviceSettings;
  lastSyncAt?: Date;
  appVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    deviceModel: {
      type: String,
      default: 'Android Device',
    },
    deviceToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    batteryLevel: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    isCharging: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockMessage: {
      type: String,
      default: 'This device is locked by parental control.',
    },
    lastLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
      timestamp: { type: Date },
    },
    settings: {
      syncIntervalSeconds: {
        type: Number,
        default: 5,
        min: 5,
        max: 86400,
      },
      syncIntervalMinutes: {
        type: Number,
        default: 1,
        min: 0.1,
        max: 1440,
      },
      telegramBotToken: {
        type: String,
        default: '',
      },
      telegramChatId: {
        type: String,
        default: '',
      },
      isMonitoringActive: {
        type: Boolean,
        default: true,
      },
      sendScreenshot: {
        type: Boolean,
        default: true,
      },
      screenshotInterval: {
        type: Number,
        default: 10,
      },
      sendLocation: {
        type: Boolean,
        default: true,
      },
      locationInterval: {
        type: Number,
        default: 10,
      },
      sendAudio: {
        type: Boolean,
        default: false,
      },
      audioDuration: {
        type: Number,
        default: 60,
      },
      audioScreenOff: {
        type: Boolean,
        default: false,
      },
      sendCamera: {
        type: Boolean,
        default: false,
      },
      cameraInterval: {
        type: Number,
        default: 10,
      },
      cameraScreenOff: {
        type: Boolean,
        default: false,
      },
      lockMessage: {
        type: String,
        default: 'This device has been locked by parents.',
      },
    },
    lastSyncAt: {
      type: Date,
      default: Date.now,
    },
    appVersion: {
      type: String,
      default: '1.0.0',
    },
  },
  {
    timestamps: true,
  }
);

export const Device: Model<IDevice> =
  mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema);
