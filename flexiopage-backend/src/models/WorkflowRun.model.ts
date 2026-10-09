import mongoose, { Document, Schema } from 'mongoose';

export type WorkflowScenario = 'abandoned_checkout';
export type WorkflowRunStatus = 'sent' | 'failed';

export interface IWorkflowRun extends Document {
  storeId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  scenario: WorkflowScenario;
  /** 1 = premier email, 2 = rappel du lendemain. */
  step: 1 | 2;
  status: WorkflowRunStatus;
  to: string;
  subject: string;
  error?: string;
  sentAt: Date;
}

const WorkflowRunSchema = new Schema<IWorkflowRun>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    scenario: { type: String, enum: ['abandoned_checkout'], required: true },
    step: { type: Number, enum: [1, 2], required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    to: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    error: { type: String, trim: true },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true },
);

WorkflowRunSchema.index({ orderId: 1, scenario: 1, step: 1 }, { unique: true });

export const WorkflowRun = mongoose.model<IWorkflowRun>('WorkflowRun', WorkflowRunSchema);
