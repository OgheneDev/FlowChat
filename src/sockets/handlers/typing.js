import { log } from "../logger.js";
import { userSocketMap } from "../state.js";

export const registerTypingHandlers = (socket, userName, userId) => {
  socket.on("typing", ({ receiverId }) => {
    if (!receiverId) return;
    log("type", `${userName} is typing to ${receiverId}`);
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      socket.to(receiverSocketId).emit("typing", { senderId: userId });
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    if (!receiverId) return;
    log("stop", `${userName} stopped typing to ${receiverId}`);
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      socket.to(receiverSocketId).emit("stopTyping", { senderId: userId });
    }
  });
};