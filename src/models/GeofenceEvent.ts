import mongoose, { Schema, Document, Model } from 'mongoose';

export type GeofenceEventType = 'ENTER' | 'EXIT';

export interface IGeofenceEvent extends Document {
  geofenceId: mongoose.Types.ObjectId;
  geofenceName: string;
  deviceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  accuracy?: number;
  distanceFromCenter: number; // in meters
  timestamp: Date;
  telegramSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GeofenceEventSchema = new Schema<IGeofenceEvent>(
  {
    geofenceId: {
      type: Schema.Types.ObjectId,
      ref: 'Geofence',
      required: true,
      index: true,
    },
    geofenceName: {
      type: String,
      required: true,
    },
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
    eventType: {
      type: String,
      enum: ['ENTER', 'EXIT'],
      required: true,
      index: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number,
    },
    distanceFromCenter: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    telegramSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

GeofenceEventSchema.index({ deviceId: 1, timestamp: -1 });
GeofenceEventSchema.index({ geofenceId: 1, timestamp: -1 });

export const GeofenceEvent: Model<IGeofenceEvent> =
  mongoose.models.GeofenceEvent ||
  mongoose.model<IGeofenceEvent>('GeofenceEvent', GeofenceEventSchema);
