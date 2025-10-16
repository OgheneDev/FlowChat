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
    origin: [process.env.CLIENT_URL],
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

const userSocketMap = {}; // { userId: socketId }
const activeSearches = {}; // { userId: query }

io.on("connection", async (socket) => {
  const userId = socket.userId;
  console.log("✅ User connected:", socket.user.fullName);

  userSocketMap[userId] = socket.id;
  await User.findByIdAndUpdate(userId, { online: true });
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // 🔍 Handle Search Queries
  socket.on("searchMessages", async (query) => {
    try {
      if (!query || !query.trim()) return;
      activeSearches[userId] = query;

      const results = await Message.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(30)
        .populate("senderId", "fullName profileImage")
        .populate("receiverId", "fullName profileImage")
        .populate("groupId", "name");

      socket.emit("searchResults", results);
    } catch (error) {
      console.error("Error in searchMessages:", error);
    }
  });

  socket.on("clearSearch", () => {
    delete activeSearches[userId];
  });

  // 🟢 Typing Indicator (Private)
  socket.on("typing", ({ receiverId }) => {
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId)
      io.to(receiverSocketId).emit("typing", { senderId: userId });
  });

  socket.on("stopTyping", ({ receiverId }) => {
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId)
      io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
  });

  // 💬 Send Private Message
  socket.on("sendMessage", async ({ receiverId, text, image, replyTo }) => {
  try {
    if (!text && !image) {
      return socket.emit("error", { message: "Message text or image is required" });
    }

    let imageUrl = image;
    if (image && !image.startsWith("http")) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // ✅ If replying, validate the message exists
    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select("text image senderId")
        .populate("senderId", "fullName profileImage");
      if (!replyMessage) {
        return socket.emit("error", { message: "Invalid reply message ID" });
      }
    }

    // ✅ Create new message
    const newMessage = await Message.create({
      senderId: userId,
      receiverId,
      text,
      image: imageUrl,
      status: "sent",
      replyTo: replyMessage ? replyMessage._id : null,
    });

    // ✅ Populate full data for immediate frontend display
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "fullName profileImage")
      .populate("receiverId", "fullName profileImage")
      .populate({
        path: "replyTo",
        select: "text image senderId",
        populate: { path: "senderId", select: "fullName profileImage" },
      });

    const receiverSocketId = userSocketMap[receiverId];

    if (receiverSocketId) {
      await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });

      // ✅ Emit to receiver
      io.to(receiverSocketId).emit("newMessage", {
        ...populatedMessage.toObject(),
        status: "delivered",
      });

      // ✅ Emit status back to sender
      io.to(socket.id).emit("messageStatusUpdate", {
        messageId: newMessage._id,
        status: "delivered",
      });
    } else {
      io.to(socket.id).emit("messageStatusUpdate", {
        messageId: newMessage._id,
        status: "sent",
      });
    }

    // ✅ Emit the message to sender as well (with reply preview)
    io.to(socket.id).emit("newMessage", populatedMessage);

  } catch (error) {
    console.error("Error sending private message with reply:", error);
    socket.emit("error", { message: "Server error sending message" });
  }
});


  // 👁️ Mark Messages as Seen
  socket.on("markMessagesAsSeen", async ({ senderId }) => {
    try {
      await Message.updateMany(
        { senderId, receiverId: userId, status: { $ne: "seen" } },
        { status: "seen" }
      );

      const senderSocketId = userSocketMap[senderId];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", { seenBy: userId, senderId });
      }
    } catch (error) {
      console.error("Error marking messages as seen:", error);
    }
  });

  socket.on("pinMessage", async ({ chatId, groupId, messageId }) => {
  const target = chatId
    ? await Chat.findById(chatId)
    : await Group.findById(groupId);

  if (!target.pinnedMessages.includes(messageId)) {
    target.pinnedMessages.push(messageId);
    await target.save();
  }

  io.to(chatId || groupId).emit("messagePinned", { chatId, groupId, messageId });
});

socket.on("unpinMessage", async ({ chatId, groupId, messageId }) => {
  const target = chatId
    ? await Chat.findById(chatId)
    : await Group.findById(groupId);

  target.pinnedMessages = target.pinnedMessages.filter(
    id => id.toString() !== messageId
  );

  await target.save();
  io.to(chatId || groupId).emit("messageUnpinned", { chatId, groupId, messageId });
});

socket.on("deleteMessage", async ({ messageId, deleteType }) => {
  try {
    const userId = socket.userId;
    const message = await Message.findById(messageId);

    if (!message) return socket.emit("error", { message: "Message not found" });

    // 🟡 Delete for Me (Soft delete — only hides message for the current user)
    if (deleteType === "me") {
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
        await message.save();
      }
      return socket.emit("messageDeletedForUser", { messageId });
    }

    // 🔴 Delete for Everyone
    if (deleteType === "everyone") {
      // Check if sender or group admin
      const isGroupAdmin = message.groupId
        ? await Group.exists({ _id: message.groupId, admins: userId })
        : false;

      if (
        message.senderId.toString() === userId.toString() ||
        isGroupAdmin
      ) {
        message.deletedForEveryone = true;
        message.text = "This message was deleted";
        message.image = null;
        await message.save();

        // ✅ Notify other participants
        const payload = {
          messageId,
          text: "This message was deleted",
          deletedForEveryone: true,
        };

        if (message.groupId) {
          // Group message → broadcast to group room
          io.to(`group:${message.groupId}`).emit("messageDeleted", payload);
        } else if (message.receiverId) {
          // Private chat → notify receiver if online
          const receiverSocketId = userSocketMap[message.receiverId];
          if (receiverSocketId) io.to(receiverSocketId).emit("messageDeleted", payload);
        }

        // ✅ Also notify the sender to update their own view
        io.to(socket.id).emit("messageDeleted", payload);
      } else {
        socket.emit("error", { message: "Not authorized to delete this message" });
      }
    }
  } catch (error) {
    console.error("Error deleting message:", error);
    socket.emit("error", { message: "Failed to delete message" });
  }
});


socket.on("editMessage", async ({ messageId, newText }) => {
  const message = await Message.findById(messageId);
  if (message.senderId.toString() === socket.userId) {
    message.text = newText;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    io.to(message.receiverId.toString()).emit("messageEdited", { messageId, newText });
  }
});


  // 💬 Send Group Message
  socket.on("sendGroupMessage", async ({ groupId, text, image, replyTo }) => {
  try {
    const group = await Group.findById(groupId).populate("members", "_id");
    if (!group || !group.members.some((m) => m._id.toString() === userId)) {
      return socket.emit("error", { message: "Not authorized for this group" });
    }

    // ✅ Handle image upload if needed
    let imageUrl = image;
    if (image && !image.startsWith("http")) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat/messages",
      });
      imageUrl = uploadResponse.secure_url;
    }

    // ✅ Handle reply context
    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select("text image senderId")
        .populate("senderId", "fullName profileImage");
      if (!replyMessage) {
        return socket.emit("error", { message: "Invalid reply message ID" });
      }
    }

    // ✅ Create new message
    const newMessage = await Message.create({
      senderId: userId,
      groupId,
      text,
      image: imageUrl,
      status: "sent",
      replyTo: replyMessage ? replyMessage._id : null,
    });

    // ✅ Populate related data for broadcasting
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "fullName profileImage")
      .populate({
        path: "replyTo",
        select: "text image senderId",
        populate: { path: "senderId", select: "fullName profileImage" },
      });

    // ✅ Get all online group members (except sender)
    const groupMemberSockets = group.members
      .filter((m) => m._id.toString() !== userId && userSocketMap[m._id.toString()])
      .map((m) => userSocketMap[m._id.toString()]);

    // ✅ Deliver message
    if (groupMemberSockets.length > 0) {
      io.to(groupMemberSockets).emit("newGroupMessage", {
        ...populatedMessage.toObject(),
        groupId,
        status: "delivered",
      });

      await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
    }

    // ✅ Emit confirmation back to sender
    io.to(socket.id).emit("groupMessageSent", {
      ...populatedMessage.toObject(),
      groupId,
      status: "sent",
    });

  } catch (error) {
    console.error("❌ Error sending group message with reply:", error);
    socket.emit("error", { message: "Server error sending group message" });
  }
});


  // 👥 Join / Leave Group
  socket.on("joinGroup", async ({ groupId }) => {
    const group = await Group.findById(groupId).populate("members", "_id");
    if (group && group.members.some((m) => m._id.toString() === userId)) {
      socket.join(`group:${groupId}`);
      socket.emit("joinedGroupRoom", { groupId });
    } else {
      socket.emit("error", { message: "Not authorized to join this group" });
    }
  });

  socket.on("leaveGroup", ({ groupId }) => {
    socket.leave(`group:${groupId}`);
    socket.emit("leftGroupRoom", { groupId });
  });

  // 🔴 Disconnect
  socket.on("disconnect", async () => {
    console.log("❌ User disconnected:", socket.user.fullName);
    delete userSocketMap[userId];
    delete activeSearches[userId];

    await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
