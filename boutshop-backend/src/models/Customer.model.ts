import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomer extends Document {
  storeId: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

CustomerSchema.index({ storeId: 1 });
CustomerSchema.index({ storeId: 1, email: 1 }, { unique: true });
export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);
