import mongoose from "mongoose";

const groupEventMessageSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['member_joined', 'member_left', 'member_removed', 'admin_promoted', 'group_created', 'group_updated']
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: String,
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetUserName: String,
  additionalData: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now
  },
  isEvent: {
    type: Boolean,
    default: true
  }
});

// Index for efficient querying
groupEventMessageSchema.index({ groupId: 1, createdAt: 1 });

export default mongoose.model('GroupEventMessage', groupEventMessageSchema);