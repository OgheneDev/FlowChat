import Message from "../../models/Message.js";
import Group from "../../models/Group.js";
import { userSocketMap } from "../state.js";

export const updatePendingGroupMessagesOnConnect = async (io, userId) => {
  try {
    // Find all groups the user is a member of
    const userGroups = await Group.find({
      members: userId
    }).select("_id");

    if (userGroups.length === 0) return;

    const groupIds = userGroups.map(g => g._id);

    // Find all messages in these groups sent by OTHER users that are still in "sent" status
    const pendingMessages = await Message.find({
      groupId: { $in: groupIds },
      senderId: { $ne: userId }, // Not sent by this user
      status: "sent",
    }).select("_id senderId groupId");

    if (pendingMessages.length === 0) return;

    // Update all pending messages to "delivered"
    await Message.updateMany(
      {
        groupId: { $in: groupIds },
        senderId: { $ne: userId },
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
        io.to(senderSocketId).emit("bulkGroupMessageStatusUpdate", {
          messageIds,
          status: "delivered",
        });
        
        console.log(`Notified sender ${senderId} about ${messageIds.length} group messages delivered`);
      }
    });

    console.log(`Updated ${pendingMessages.length} group messages to delivered for user ${userId}`);
  } catch (error) {
    console.error("Error updating pending group messages:", error);
  }
};