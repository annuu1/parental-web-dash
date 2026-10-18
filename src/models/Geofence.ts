import mongoose, { Schema, Document, Model } from 'mongoose';

export type GeofenceNotificationType = 'ENTER' | 'EXIT' | 'BOTH';
export type GeofenceStatus = 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';

export interface IGeofence extends Document {
  deviceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters (e.g. 50 to 50000)
  color: string; // hex color for map display
  notifyOn: GeofenceNotificationType;
  notifyTelegram: boolean;
  isActive: boolean;
  currentStatus: GeofenceStatus;
  lastTransitionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GeofenceSchema = new Schema<IGeofence>(
  {
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    radius: {
      type: Number,
      required: true,
      min: 25,
      max: 50000,
      default: 150, // 150 meters
    },
    color: {
      type: String,
      default: '#3b82f6', // default blue
    },
    notifyOn: {
      type: String,
      enum: ['ENTER', 'EXIT', 'BOTH'],
      default: 'BOTH',
    },
    notifyTelegram: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    currentStatus: {
      type: String,
      enum: ['INSIDE', 'OUTSIDE', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    lastTransitionAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

GeofenceSchema.index({ deviceId: 1, isActive: 1 });

export const Geofence: Model<IGeofence> =
  mongoose.models.Geofence || mongoose.model<IGeofence>('Geofence', GeofenceSchema);
