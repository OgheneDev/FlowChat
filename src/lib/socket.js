import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Group from "../models/Group.js";
import cloudinary from "../lib/cloudinary.js";
import Chat from "../models/Chat.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL,
      "http://localhost:3000", // Allow local development
      ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"]), // Add other dev origins if needed
    ].filter(Boolean), // Remove undefined values
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000, // Increase timeout for Render.com
  pingInterval: 25000,
});

// Validate environment variables
if (!process.env.CLIENT_URL) {
  console.error("❌ Missing CLIENT_URL environment variable");
  process.exit(1);
}

io.use((socket, next) => {
  try {
    socketAuthMiddleware(socket, next);
  } catch (error) {
    console.error("⚠️ Socket authentication error:", error.message);
    next(new Error("Authentication failed"));
  }
});

const userSocketMap = {}; // { userId: socketId }
const activeSearches = {}; // { userId: query }

const log = (emoji, message, data = null) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${emoji} ${message}`);
  if (data) console.log(data);
};

io.on("connection", async (socket) => {
  const userId = socket.userId;
  if (!userId) {
    log("❌", "Connection rejected: Missing userId");
    socket.disconnect(true);
    return;
  }

  const user = await User.findById(userId).select("fullName profileImage");
  if (!user) {
    log("❌", `Connection rejected: User not found for ID ${userId}`);
    socket.disconnect(true);
    return;
  }

  const userName = user.fullName || "Unknown User";
  log("✅", `User connected: ${userName} (${userId})`, { socketId: socket.id });

  userSocketMap[userId] = socket.id;
  try {
    await User.findByIdAndUpdate(userId, { online: true, lastSeen: null });
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  } catch (error) {
    log("❌", `Error updating user online status for ${userName}`, error);
  }

  // 🔍 Handle Search Queries
  socket.on("searchMessages", async (query) => {
    log("🔍", `${userName} is searching messages for "${query}"`);
    try {
      if (!query || !query.trim()) {
        socket.emit("error", { message: "Search query cannot be empty" });
        return;
      }
      activeSearches[userId] = query;

      const results = await Message.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(30)
        .populate("senderId", "fullName profileImage")
        .populate("receiverId", "fullName profileImage")
        .populate("groupId", "name")
        .lean();

      socket.emit("searchResults", results);
      log("✅", `Search results sent to ${userName}`, { count: results.length });
    } catch (error) {
      log("❌", "Error in searchMessages", error);
      socket.emit("error", { message: "Failed to search messages" });
    }
  });

  socket.on("clearSearch", () => {
    log("🧹", `${userName} cleared search`);
    delete activeSearches[userId];
  });

  // 🟢 Typing Indicator
  socket.on("typing", ({ receiverId }) => {
    if (!receiverId) return;
    log("⌨️", `${userName} is typing to ${receiverId}`);
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId: userId });
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    if (!receiverId) return;
    log("✋", `${userName} stopped typing to ${receiverId}`);
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
    }
  });

  // 💬 Send Private Message
  socket.on("sendMessage", async ({ receiverId, text, image, replyTo }) => {
    log("💬", `${userName} is sending a private message`, { receiverId, text });
    try {
      if (!receiverId || (!text && !image)) {
        log("⚠️", "Invalid message data", { receiverId, text, image });
        return socket.emit("error", { message: "Receiver ID and message content are required" });
      }

      const receiver = await User.findById(receiverId);
      if (!receiver) {
        log("⚠️", `Receiver not found: ${receiverId}`);
        return socket.emit("error", { message: "Receiver not found" });
      }

      let imageUrl = image;
      if (image && !image.startsWith("http")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "chat/messages",
        });
        imageUrl = uploadResponse.secure_url;
        log("☁️", "Image uploaded to Cloudinary", { url: imageUrl });
      }

      let replyMessage = null;
      if (replyTo) {
        replyMessage = await Message.findById(replyTo)
          .select("text image senderId")
          .populate("senderId", "fullName profileImage");
        if (!replyMessage) {
          log("⚠️", "Invalid reply message ID", { replyTo });
          return socket.emit("error", { message: "Invalid reply message ID" });
        }
      }

      const newMessage = await Message.create({
        senderId: userId,
        receiverId,
        text,
        image: imageUrl,
        status: "sent",
        replyTo: replyMessage ? replyMessage._id : null,
      });

      const populatedMessage = await Message.findById(newMessage._id)
        .populate("senderId", "fullName profileImage")
        .populate("receiverId", "fullName profileImage")
        .populate({
          path: "replyTo",
          select: "text image senderId",
          populate: { path: "senderId", select: "fullName profileImage" },
        })
        .lean();

      const receiverSocketId = userSocketMap[receiverId];
      if (receiverSocketId) {
        await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
        io.to(receiverSocketId).emit("newMessage", {
          ...populatedMessage,
          status: "delivered",
        });
        io.to(socket.id).emit("messageStatusUpdate", {
          messageId: newMessage._id,
          status: "delivered",
        });
        log("📩", `${userName} sent a message (delivered)`);
      } else {
        io.to(socket.id).emit("messageStatusUpdate", {
          messageId: newMessage._id,
          status: "sent",
        });
        log("📤", `${userName} sent a message (user offline)`);
      }

      io.to(socket.id).emit("newMessage", populatedMessage);
    } catch (error) {
      log("❌", "Error sending private message", error);
      socket.emit("error", { message: "Server error sending message" });
    }
  });

  // 👁️ Mark Messages as Seen
  socket.on("markMessagesAsSeen", async ({ senderId }) => {
    log("👁️", `${userName} is marking messages as seen from ${senderId}`);
    try {
      if (!senderId) {
        log("⚠️", "Invalid senderId for markMessagesAsSeen");
        return socket.emit("error", { message: "Sender ID is required" });
      }
      await Message.updateMany(
        { senderId, receiverId: userId, status: { $ne: "seen" } },
        { status: "seen" }
      );

      const senderSocketId = userSocketMap[senderId];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", { seenBy: userId, senderId });
      }
    } catch (error) {
      log("❌", "Error marking messages as seen", error);
      socket.emit("error", { message: "Failed to mark messages as seen" });
    }
  });

  // 📌 Pin / Unpin Message
  socket.on("pinMessage", async ({ chatId, groupId, messageId }) => {
    log("📌", `${userName} pinned a message`, { chatId, groupId, messageId });
    try {
      const target = chatId ? await Chat.findById(chatId) : await Group.findById(groupId);
      if (!target) {
        log("⚠️", "Chat or group not found", { chatId, groupId });
        return socket.emit("error", { message: "Chat or group not found" });
      }
      if (!target.pinnedMessages.includes(messageId)) {
        target.pinnedMessages.push(messageId);
        await target.save();
      }
      io.to(chatId || groupId).emit("messagePinned", { chatId, groupId, messageId });
    } catch (error) {
      log("❌", "Error pinning message", error);
      socket.emit("error", { message: "Failed to pin message" });
    }
  });

  socket.on("unpinMessage", async ({ chatId, groupId, messageId }) => {
    log("📍", `${userName} unpinned a message`, { chatId, groupId, messageId });
    try {
      const target = chatId ? await Chat.findById(chatId) : await Group.findById(groupId);
      if (!target) {
        log("⚠️", "Chat or group not found", { chatId, groupId });
        return socket.emit("error", { message: "Chat or group not found" });
      }
      target.pinnedMessages = target.pinnedMessages.filter(
        (id) => id.toString() !== messageId
      );
      await target.save();
      io.to(chatId || groupId).emit("messageUnpinned", { chatId, groupId, messageId });
    } catch (error) {
      log("❌", "Error unpinning message", error);
      socket.emit("error", { message: "Failed to unpin message" });
    }
  });

  // 🗑️ Delete Message
  socket.on("deleteMessage", async ({ messageId, deleteType }) => {
    log("🗑️", `${userName} requested delete message`, { messageId, deleteType });
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        log("⚠️", "Message not found", { messageId });
        return socket.emit("error", { message: "Message not found" });
      }

      if (deleteType === "me") {
        if (!message.deletedFor.includes(userId)) {
          message.deletedFor.push(userId);
          await message.save();
        }
        socket.emit("messageDeleted", { messageId });
        log("🟢", `${userName} deleted message for self`);
        return;
      }

      if (deleteType === "everyone") {
        const isGroupAdmin = message.groupId
          ? await Group.exists({ _id: message.groupId, admins: userId })
          : false;

        if (message.senderId.toString() === userId.toString() || isGroupAdmin) {
          message.deletedForEveryone = true;
          message.text = "This message was deleted";
          message.image = null;
          await message.save();

          const payload = {
            messageId,
            text: "This message was deleted",
            deletedForEveryone: true,
          };

          if (message.groupId) {
            io.to(`group:${message.groupId}`).emit("messageDeleted", payload);
          } else if (message.receiverId) {
            const receiverSocketId = userSocketMap[message.receiverId.toString()];
            if (receiverSocketId) {
              io.to(receiverSocketId).emit("messageDeleted", payload);
            }
          }

          io.to(socket.id).emit("messageDeleted", payload);
          log("🧨", `${userName} deleted message for everyone`);
        } else {
          log("🚫", `${userName} not authorized to delete message`);
          socket.emit("error", { message: "Not authorized to delete this message" });
        }
      }
    } catch (error) {
      log("❌", "Error deleting message", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // ✏️ Edit Message
  socket.on("editMessage", async ({ messageId, newText }) => {
    log("✏️", `${userName} editing message`, { messageId, newText });
    try {
      if (!newText || !newText.trim()) {
        log("⚠️", "New text cannot be empty", { messageId });
        return socket.emit("error", { message: "New text cannot be empty" });
      }
      const message = await Message.findById(messageId);
      if (!message) {
        log("⚠️", "Message not found", { messageId });
        return socket.emit("error", { message: "Message not found" });
      }
      if (message.senderId.toString() === userId) {
        message.text = newText;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();
        if (message.receiverId) {
          io.to(message.receiverId.toString()).emit("messageEdited", { messageId, newText });
        } else if (message.groupId) {
          io.to(`group:${message.groupId}`).emit("messageEdited", { messageId, newText });
        }
        log("✅", `${userName} edited message successfully`);
      } else {
        log("🚫", `${userName} not authorized to edit message`);
        socket.emit("error", { message: "Not authorized to edit this message" });
      }
    } catch (error) {
      log("❌", "Error editing message", error);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });

  // 💬 Send Group Message
  socket.on("sendGroupMessage", async ({ groupId, text, image, replyTo }) => {
    log("👥", `${userName} sending group message`, { groupId, text });
    try {
      if (!groupId || (!text && !image)) {
        log("⚠️", "Invalid group message data", { groupId, text, image });
        return socket.emit("error", { message: "Group ID and message content are required" });
      }

      const group = await Group.findById(groupId).populate("members", "_id");
      if (!group || !group.members.some((m) => m._id.toString() === userId)) {
        log("🚫", `${userName} not authorized for group ${groupId}`);
        return socket.emit("error", { message: "Not authorized for this group" });
      }

      let imageUrl = image;
      if (image && !image.startsWith("http")) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "chat/messages",
        });
        imageUrl = uploadResponse.secure_url;
        log("☁️", "Group image uploaded", { url: imageUrl });
      }

      let replyMessage = null;
      if (replyTo) {
        replyMessage = await Message.findById(replyTo)
          .select("text image senderId")
          .populate("senderId", "fullName profileImage");
        if (!replyMessage) {
          log("⚠️", "Invalid reply message ID (group)", { replyTo });
          return socket.emit("error", { message: "Invalid reply message ID" });
        }
      }

      const newMessage = await Message.create({
        senderId: userId,
        groupId,
        text,
        image: imageUrl,
        status: "sent",
        replyTo: replyMessage ? replyMessage._id : null,
      });

      const populatedMessage = await Message.findById(newMessage._id)
        .populate("senderId", "fullName profileImage")
        .populate({
          path: "replyTo",
          select: "text image senderId",
          populate: { path: "senderId", select: "fullName profileImage" },
        })
        .lean();

      const groupMemberSockets = group.members
        .filter((m) => m._id.toString() !== userId && userSocketMap[m._id.toString()])
        .map((m) => userSocketMap[m._id.toString()]);

      if (groupMemberSockets.length > 0) {
        io.to(groupMemberSockets).emit("newGroupMessage", {
          ...populatedMessage,
          groupId,
          status: "delivered",
        });
        await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
        log("📨", `Group message delivered to ${groupMemberSockets.length} members`);
      }

      io.to(socket.id).emit("newGroupMessage", {
        ...populatedMessage,
        groupId,
        status: "sent",
      });
    } catch (error) {
      log("❌", "Error sending group message", error);
      socket.emit("error", { message: "Server error sending group message" });
    }
  });

  // 👥 Join / Leave Group
  socket.on("joinGroup", async ({ groupId }) => {
    log("👋", `${userName} attempting to join group ${groupId}`);
    try {
      const group = await Group.findById(groupId).populate("members", "_id");
      if (!group) {
        log("⚠️", `Group not found: ${groupId}`);
        return socket.emit("error", { message: "Group not found" });
      }
      if (group.members.some((m) => m._id.toString() === userId)) {
        socket.join(`group:${groupId}`);
        socket.emit("joinedGroupRoom", { groupId });
        log("✅", `${userName} joined group ${groupId}`);
      } else {
        socket.emit("error", { message: "Not authorized to join this group" });
        log("🚫", `${userName} failed to join group ${groupId}`);
      }
    } catch (error) {
      log("❌", "Error joining group", error);
      socket.emit("error", { message: "Failed to join group" });
    }
  });

  socket.on("leaveGroup", ({ groupId }) => {
    log("👋", `${userName} left group ${groupId}`);
    socket.leave(`group:${groupId}`);
    socket.emit("leftGroupRoom", { groupId });
  });

  // 🔴 Disconnect
  socket.on("disconnect", async () => {
    log("❌", `User disconnected: ${userName} (${userId})`);
    try {
      delete userSocketMap[userId];
      delete activeSearches[userId];
      await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    } catch (error) {
      log("❌", "Error handling disconnect", error);
    }
  });
});

export { io, app, server };