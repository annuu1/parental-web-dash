import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeviceSettings {
  syncIntervalMinutes: number;
  locationTrackingEnabled: boolean;
  cameraEnabled: boolean;
  audioEnabled: boolean;
  lockMessage: string;
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
      syncIntervalMinutes: {
        type: Number,
        default: 15,
        min: 5,
        max: 1440,
      },
      locationTrackingEnabled: {
        type: Boolean,
        default: true,
      },
      cameraEnabled: {
        type: Boolean,
        default: false,
      },
      audioEnabled: {
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
