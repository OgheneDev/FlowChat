import mongoose from "mongoose";

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
    online: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    // Messages the user has starred
    starredMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    // Chats (1-on-1 or group) the user has starred
    // We use Mixed to allow both User _id and Group _id
    // In your User model, change starredChats to:
starredChats: [
  {
    type: mongoose.Schema.Types.ObjectId,
    // No ref since it can be either User or Group
    // We'll handle the type logic in the application
  },
],
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },
  },
  { timestamps: true }
);

// Text search index
userSchema.index({ fullName: "text", email: "text" });

// Ensure only one of chatPartnerId or groupId is set
userSchema.pre("save", function (next) {
  this.starredChats = this.starredChats.filter((chat) => {
    const hasPartner = !!chat.chatPartnerId;
    const hasGroup = !!chat.groupId;
    return (hasPartner && !hasGroup) || (!hasPartner && hasGroup);
  });
  next();
});

// Virtual: get starred chat type (helper for frontend)
userSchema.virtual("starredChatDetails").get(function () {
  return this.starredChats.map((chat) => ({
    isGroup: !!chat.groupId,
    id: chat.groupId || chat.chatPartnerId,
  }));
});

const User = mongoose.model("User", userSchema);

export default User;