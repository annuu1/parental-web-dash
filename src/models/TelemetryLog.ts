import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITelemetryLog extends Document {
  deviceId: mongoose.Types.ObjectId;
  batteryLevel: number;
  isCharging: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  recordedAt: Date;
}

const TelemetryLogSchema = new Schema<ITelemetryLog>(
  {
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },
    batteryLevel: {
      type: Number,
      required: true,
    },
    isCharging: {
      type: Boolean,
      default: false,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    accuracy: {
      type: Number,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const TelemetryLog: Model<ITelemetryLog> =
  mongoose.models.TelemetryLog ||
  mongoose.model<ITelemetryLog>('TelemetryLog', TelemetryLogSchema);
