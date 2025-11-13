import { log } from "../logger.js";
import Group from "../../models/Group.js";
import Message from "../../models/Message.js";
import cloudinary from "../../lib/cloudinary.js";
import { userSocketMap } from "../state.js";
import sendPushNotification from "../../utils/pushNotificationHelpers.js";

export const registerGroupMessageHandler = (io, socket, userName, userId) => {
  socket.on(
    "sendGroupMessage", 
    async ({ groupId, text, image, replyTo }) => {
      log(`${userName} sending group message`, { groupId, text });
      try {
        if (!groupId || (!text && !image)) {
          return socket.emit("error", {
            message: "Group ID and message content are required",
          });
        }

        const group = await Group.findById(groupId).populate("members", "_id fullName deviceTokens");
        if (!group || !group.members.some((m) => m._id.toString() === userId)) {
          return socket.emit("error", { message: "Not authorized for this group" });
        }

        // ---------- IMAGE ----------
        let imageUrl = image;
        if (image && !image.startsWith("http")) {
          const up = await cloudinary.uploader.upload(image, {
            folder: "chat/messages",
          });
          imageUrl = up.secure_url;
          log("cloud", "Group image uploaded", { url: imageUrl });
        }

        // ---------- REPLY ----------
        let replyMessage = null;
        if (replyTo) {
          replyMessage = await Message.findById(replyTo)
            .select("text image senderId")
            .populate("senderId", "fullName profilePic");
          if (!replyMessage) {
            return socket.emit("error", { message: "Invalid reply message ID" });
          }
        }

        const newMsg = await Message.create({
          senderId: userId,
          groupId,
          text,
          image: imageUrl,
          status: "sent",
          replyTo: replyMessage?._id ?? null,
        });

        const populated = await Message.findById(newMsg._id)
          .populate("senderId", "fullName profilePic")
          .populate({
            path: "replyTo",
            select: "text image senderId",
            populate: { path: "senderId", select: "fullName profilePic" },
          })
          .lean();

        // Get all group members (excluding sender)
        const otherMembers = group.members.filter(m => m._id.toString() !== userId);

        // ----- PUSH NOTIFICATIONS -----
        // Get offline members for push notifications
        const offlineMembers = otherMembers.filter(member => 
          !userSocketMap[member._id.toString()]
        );

        // Send push notifications to offline members
        if (offlineMembers.length > 0) {
          try {
            const messagePreview = text ? (text.length > 50 ? text.substring(0, 50) + '...' : text) : '📷 Photo';
            
            for (const member of offlineMembers) {
              const activeTokens = member.deviceTokens?.map(device => device.token) || [];
              
              if (activeTokens.length > 0) {
                await sendPushNotification({
                  title: `${userName} in ${group.name}`,
                  body: messagePreview,
                  tokens: activeTokens,
                  data: {
                    type: 'new_group_message',
                    senderId: userId.toString(),
                    groupId: groupId.toString(),
                    groupName: group.name,
                    messageId: newMsg._id.toString(),
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                  }
                });
                
                log("push", `Group push notification sent to ${member.fullName}`);
              }
            }
          } catch (pushError) {
            log("error", "Group push notification failed", pushError);
          }
        }

        // Get online member socket IDs (excluding sender)
        const onlineSockets = otherMembers
          .filter((m) => userSocketMap[m._id.toString()])
          .map((m) => userSocketMap[m._id.toString()]);

        // Determine final status
        const finalStatus = onlineSockets.length > 0 ? "delivered" : "sent";

        // Update status in DB if delivered
        if (finalStatus === "delivered") {
          await Message.findByIdAndUpdate(newMsg._id, { status: "delivered" });
        }

        // Calculate unread counts for each member and send updates
        for (const member of otherMembers) {
          const memberId = member._id.toString();
          const memberSocketId = userSocketMap[memberId];
          
          if (memberSocketId) {
            // Calculate unread count for this specific group member
            const unreadCount = await Message.countDocuments({
              groupId,
              senderId: { $ne: memberId }, // Messages not from this member
              status: { $ne: 'seen' }
            });

            // Send message to member
            io.to(memberSocketId).emit("newGroupMessage", {
              ...populated,
              groupId,
              status: "delivered",
            });

            // Emit unread count update
            io.to(memberSocketId).emit("groupUnreadCountUpdated", {
              groupId: groupId,
              unreadCount: unreadCount
            });
          }
        }

        // Send status update to sender only
        io.to(socket.id).emit("groupMessageStatusUpdate", {
          messageId: newMsg._id,
          status: finalStatus,
        });

        // Update recent group for all members (including sender)
        const groupRoom = `group:${groupId}`;
        io.to(groupRoom).emit("recentGroupUpdated", {
          groupId,
          lastMessage: { ...populated, groupId, status: finalStatus },
        });

        log("success", `${userName} sent group message – ${finalStatus}`);
      } catch (err) {
        log("error", "sendGroupMessage error", err);
        socket.emit("error", { message: "Server error sending group message" });
      }
    }
  );

  // Mark group messages as seen handler
  socket.on("markGroupMessagesAsSeen", async ({ groupId }) => {
    try {
      // Update all group messages that aren't from this user to seen
      await Message.updateMany(
        {
          groupId: groupId,
          senderId: { $ne: userId }, // Not the user's own messages
          status: { $ne: 'seen' }
        },
        { status: 'seen' }
      );

      // Calculate new unread count (should be 0)
      const unreadCount = await Message.countDocuments({
        groupId: groupId,
        senderId: { $ne: userId },
        status: { $ne: 'seen' }
      });

      // Emit unread count update to current user
      io.to(socket.id).emit("groupUnreadCountUpdated", {
        groupId: groupId,
        unreadCount: unreadCount
      });

      // Notify other group members that messages were seen (optional)
      const group = await Group.findById(groupId);
      if (group) {
        const otherMembers = group.members.filter(m => m._id.toString() !== userId);
        
        for (const member of otherMembers) {
          const memberSocketId = userSocketMap[member._id.toString()];
          if (memberSocketId) {
            io.to(memberSocketId).emit("groupMessagesSeen", {
              groupId: groupId,
              seenBy: userId
            });
          }
        }
      }

      log("success", `${userName} marked group messages as seen in ${groupId}`);
    } catch (err) {
      log("error", "markGroupMessagesAsSeen error", err);
      socket.emit("error", { message: "Server error marking group messages as seen" });
    }
  });
};