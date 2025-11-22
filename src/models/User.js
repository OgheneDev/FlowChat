import mongoose from "mongoose";
import bcrypt from "bcryptjs/dist/bcrypt.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
    },
    profilePic: {
      type: String,
      default: "",
    },
    about: {
      type: String,
      default: ""
    },
    online: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    // Device tokens for push notifications
    deviceTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        deviceType: {
          type: String,
          enum: ["web", "android", "ios"],
          default: "web"
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    starredMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    starredChats: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    pinnedMessages: [{
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      context: {
        type: { type: String, enum: ['direct', 'group'] },
        chatPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }
      },
      pinnedAt: { type: Date, default: Date.now }
    }],
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },
    
    // ✅ NEW: Store unread counts per chat/group
    unreadCounts: {
      type: Map,
      of: Number,
      default: () => new Map()
    },
    // Map structure: { "chatPartnerId": count, "group_groupId": count }
  },
  { timestamps: true }
);

userSchema.index({ fullName: "text", email: "text" });

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Device token methods
userSchema.methods.addDeviceToken = function(token, deviceType = "web") {
  // Remove if exists to avoid duplicates
  this.deviceTokens = this.deviceTokens.filter(
    device => device.token !== token
  );
  
  // Add new token
  this.deviceTokens.push({
    token,
    deviceType
  });
  
  return this.save();
};

userSchema.methods.removeDeviceToken = function(token) {
  this.deviceTokens = this.deviceTokens.filter(
    device => device.token !== token
  );
  
  return this.save();
};

userSchema.methods.incrementUnread = async function(chatId, isGroup = false) {
  const key = isGroup ? `group_${chatId}` : String(chatId);
  
  // Ensure unreadCounts is initialized
  if (!this.unreadCounts) {
    this.unreadCounts = new Map();
  }
  
  const current = this.unreadCounts.get(key) || 0;
  this.unreadCounts.set(key, current + 1);
  await this.save();
  
  console.log(`📬 Incremented unread for ${key}: ${current + 1}`);
  return this.unreadCounts.get(key);
};

userSchema.methods.clearUnread = async function(chatId, isGroup = false) {
  const key = isGroup ? `group_${chatId}` : String(chatId);
  
  if (!this.unreadCounts) {
    this.unreadCounts = new Map();
  }
  
  this.unreadCounts.set(key, 0);
  await this.save();
  
  console.log(`📬 Cleared unread for ${key}`);
};

userSchema.methods.getUnread = function(chatId, isGroup = false) {
  const key = isGroup ? `group_${chatId}` : String(chatId);
  
  if (!this.unreadCounts) {
    return 0;
  }
  
  return this.unreadCounts.get(key) || 0;
};

const User = mongoose.model("User", userSchema);

export default User;