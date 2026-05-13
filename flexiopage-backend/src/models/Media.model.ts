import mongoose, { Document, Schema } from 'mongoose';

export interface IMedia extends Document {
  storeId: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: Date;
}

const MediaSchema = new Schema<IMedia>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
  },
  { timestamps: true }
);

MediaSchema.index({ storeId: 1 });
MediaSchema.index({ key: 1 }, { unique: true });
export const Media = mongoose.model<IMedia>('Media', MediaSchema);
