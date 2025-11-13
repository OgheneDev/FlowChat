import { log } from "../logger.js";
import Message from "../../models/Message.js";
import Chat from "../../models/Chat.js";
import Group from "../../models/Group.js";
import { userSocketMap } from "../state.js";

export const registerMessageActionHandlers = (io, socket, userName, userId) => {
  // ----- MARK AS SEEN -----
  socket.on("markMessagesAsSeen", async ({ senderId }) => {
    log(`${userName} marking messages as seen from ${senderId}`);
    try {
      if (!senderId) {
        return socket.emit("error", { message: "Sender ID required" });
      }
      await Message.updateMany(
        { senderId, receiverId: userId, status: { $ne: "seen" } },
        { status: "seen" }
      );
      const senderSocket = userSocketMap[senderId];
      if (senderSocket) {
        io.to(senderSocket).emit("messagesSeen", { seenBy: userId, senderId });
      }
    } catch (err) {
      log("error", "markMessagesAsSeen", err);
      socket.emit("error", { message: "Failed to mark messages as seen" });
    }
  });

  // ----- PIN / UNPIN -----
  const pinUnpin = async (type, { chatId, groupId, messageId }) => {
    log(`${userName} ${type === "pin" ? "pinning" : "unpinning"} message`, {
      chatId,
      groupId,
      messageId,
    });
    try {
      const target = chatId ? await Chat.findById(chatId) : await Group.findById(groupId);
      if (!target) {
        return socket.emit("error", { message: "Chat or group not found" });
      }

      if (type === "pin") {
        if (!target.pinnedMessages.includes(messageId)) {
          target.pinnedMessages.push(messageId);
        }
      } else {
        target.pinnedMessages = target.pinnedMessages.filter(
          (id) => id.toString() !== messageId
        );
      }
      await target.save();

      io.to(chatId || groupId).emit(
        type === "pin" ? "messagePinned" : "messageUnpinned",
        { chatId, groupId, messageId }
      );
    } catch (err) {
      log("error", `${type}Message`, err);
      socket.emit("error", { message: `Failed to ${type} message` });
    }
  };

  socket.on("pinMessage", (data) => pinUnpin("pin", data));
  socket.on("unpinMessage", (data) => pinUnpin("unpin", data));

  // ----- DELETE -----
  socket.on("deleteMessage", async ({ messageId, deleteType }) => {
    log(`${userName} delete ${deleteType}`, { messageId });
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return socket.emit("error", { message: "Message not found" });

      if (deleteType === "me") {
        if (!msg.deletedFor.includes(userId)) {
          msg.deletedFor.push(userId);
          await msg.save();
        }
        socket.emit("messageDeleted", { messageId });
        return;
      }

      if (deleteType === "everyone") {
        const isGroupAdmin = msg.groupId
          ? await Group.exists({ _id: msg.groupId, admins: userId })
          : false;

        if (msg.senderId.toString() !== userId && !isGroupAdmin) {
          return socket.emit("error", { message: "Not authorized" });
        }

        msg.deletedForEveryone = true;
        msg.text = "This message was deleted";
        msg.image = null;
        await msg.save();

        const payload = {
          messageId,
          text: "This message was deleted",
          deletedForEveryone: true,
        };

        if (msg.groupId) {
          io.to(`group:${msg.groupId}`).emit("messageDeleted", payload);
        } else if (msg.receiverId) {
          const rcv = userSocketMap[msg.receiverId.toString()];
          if (rcv) io.to(rcv).emit("messageDeleted", payload);
        }
        io.to(socket.id).emit("messageDeleted", payload);
      }
    } catch (err) {
      log("error", "deleteMessage", err);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // ----- EDIT -----
  socket.on("editMessage", async ({ messageId, newText }) => {
    log(`${userName} editing`, { messageId });
    try {
      if (!newText?.trim()) {
        return socket.emit("error", { message: "New text cannot be empty" });
      }
      const msg = await Message.findById(messageId);
      if (!msg) return socket.emit("error", { message: "Message not found" });
      if (msg.senderId.toString() !== userId) {
        return socket.emit("error", { message: "Not authorized" });
      }

      msg.text = newText;
      msg.edited = true;
      msg.editedAt = new Date();
      await msg.save();

      const event = "messageEdited";
      const data = { messageId, newText };

      if (msg.receiverId) {
        io.to(msg.receiverId.toString()).emit(event, data);
      } else if (msg.groupId) {
        io.to(`group:${msg.groupId}`).emit(event, data);
      }
    } catch (err) {
      log("error", "editMessage", err);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });
};