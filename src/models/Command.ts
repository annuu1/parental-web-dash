import mongoose, { Schema, Document, Model } from 'mongoose';

export type CommandType = 'LOCK_DEVICE' | 'UNLOCK_DEVICE' | 'UPDATE_CONFIG' | 'PING_LOCATION' | 'CUSTOM';
export type CommandStatus = 'PENDING' | 'EXECUTED' | 'FAILED' | 'CANCELLED';

export interface ICommand extends Document {
  deviceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: CommandType;
  params: Record<string, any>;
  status: CommandStatus;
  executedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CommandSchema = new Schema<ICommand>(
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
    type: {
      type: String,
      required: true,
      enum: ['LOCK_DEVICE', 'UNLOCK_DEVICE', 'UPDATE_CONFIG', 'PING_LOCATION', 'CUSTOM'],
    },
    params: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'EXECUTED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    executedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Command: Model<ICommand> =
  mongoose.models.Command || mongoose.model<ICommand>('Command', CommandSchema);
