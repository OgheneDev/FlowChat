import { log } from "./logger.js";
import User from "../models/User.js";
import { userSocketMap, activeSearches } from "./state.js";
import { registerSearchHandlers } from "./handlers/search.js";
import { registerTypingHandlers } from "./handlers/typing.js";
import { registerPrivateMessageHandler } from "./handlers/privateMessage.js";
import { registerGroupMessageHandler } from "./handlers/groupMessage.js";
import { registerMessageActionHandlers } from "./handlers/messageActions.js";
import { registerGroupRoomHandlers } from "./handlers/groupRooms.js";
import { updatePendingMessagesOnConnect } from "./handlers/messageStatus.js";
import { updatePendingGroupMessagesOnConnect } from "./handlers/groupMessageStatus.js";

export const setupConnection = (io) => {
  io.on("connection", async (socket) => {
    const userId = socket.userId;
    if (!userId) {
      log("error", "Connection rejected: Missing userId");
      socket.disconnect(true);
      return;
    }

    const user = await User.findById(userId).select("fullName profilePic");
    if (!user) {
      log(`error`, `Connection rejected: User not found ${userId}`);
      socket.disconnect(true);
      return;
    }

    const userName = user.fullName || "Unknown User";
    log("success", `User connected: ${userName} (${userId})`, { socketId: socket.id });

    // ----- STATE -----
    userSocketMap[userId] = socket.id;
    await User.findByIdAndUpdate(userId, { online: true, lastSeen: null });
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // UPDATE PENDING MESSAGES TO DELIVERED
    await updatePendingMessagesOnConnect(io, userId);
    await updatePendingGroupMessagesOnConnect(io, userId)

    // ----- HANDLERS -----
    registerSearchHandlers(socket, userName, userId);
    registerTypingHandlers(socket, userName, userId);
    registerPrivateMessageHandler(io, socket, userName, userId);
    registerGroupMessageHandler(io, socket, userName, userId);
    registerMessageActionHandlers(io, socket, userName, userId);
    registerGroupRoomHandlers(socket, userName, userId);

    // ----- DISCONNECT -----
    socket.on("disconnect", async () => {
      log(`User disconnected: ${userName} (${userId})`);
      delete userSocketMap[userId];
      delete activeSearches[userId];
      await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
  });
};