import mongoose from "mongoose";
import { type } from "os";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isForwarded: { 
      type: Boolean, default: false 
    },
    groupId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Group" 
    },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    image: {
      type: String,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },

    // ✅ NEW FIELD
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message", // Reference to another message
      default: null,
    },

    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deletedForEveryone: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ text: "text" });

const Message = mongoose.model("Message", messageSchema);
export default Message;
