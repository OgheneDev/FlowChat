import Message from "../../models/Message.js";
import { userSocketMap } from "../state.js";

export const updatePendingMessagesOnConnect = async (io, userId) => {
  try {
    // Find all messages sent to this user that are still in "sent" status
    const pendingMessages = await Message.find({
      receiverId: userId,
      status: "sent",
    }).select("_id senderId");

    if (pendingMessages.length === 0) return;

    // Update all pending messages to "delivered"
    await Message.updateMany(
      {
        receiverId: userId,
        status: "sent",
      },
      {
        $set: { status: "delivered" },
      }
    );

    // Group messages by sender for efficient bulk updates
    const messagesBySender = new Map();
    
    pendingMessages.forEach((msg) => {
      const senderId = msg.senderId.toString();
      if (!messagesBySender.has(senderId)) {
        messagesBySender.set(senderId, []);
      }
      messagesBySender.get(senderId).push(msg._id.toString());
    });

    // Notify each sender with bulk update
    messagesBySender.forEach((messageIds, senderId) => {
      const senderSocketId = userSocketMap[senderId];
      if (senderSocketId) {
        // Send bulk update instead of individual updates
        io.to(senderSocketId).emit("bulkMessageStatusUpdate", {
          messageIds,
          status: "delivered",
        });
        
        console.log(`Notified sender ${senderId} about ${messageIds.length} messages delivered`);
      }
    });

    console.log(`Updated ${pendingMessages.length} messages to delivered for user ${userId}`);
  } catch (error) {
    console.error("Error updating pending messages:", error);
  }
};