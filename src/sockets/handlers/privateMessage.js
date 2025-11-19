import { log } from "../logger.js";
import User from "../../models/User.js";
import Message from "../../models/Message.js";
import cloudinary from "../../lib/cloudinary.js";
import { userSocketMap } from "../state.js";
import sendPushNotification from "../../utils/pushNotificationHelpers.js";

export const registerPrivateMessageHandler = (io, socket, userName, userId) => {

  if (socket._events && socket._events["sendMessage"]) {
    console.log('🔕 [SOCKET] sendMessage handler already registered, skipping');
    return;
  }
  
  socket.on(
    "sendMessage",
    async ({ receiverId, text, image, replyTo }) => {
      console.log('🛣️ [DEBUG] Socket sendMessage called for user:', userName);
      console.log('🛣️ [DEBUG] Message text:', text?.substring(0, 50));
      log(`${userName} is sending a private message`, { receiverId, text });
      try {
        if (!receiverId || (!text && !image)) {
          return socket.emit("error", {
            message: "Receiver ID and message content are required",
          });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
          return socket.emit("error", { message: "Receiver not found" });
        }

        // ---------- IMAGE ----------
        let imageUrl = image;
        if (image && !image.startsWith("http")) {
          const up = await cloudinary.uploader.upload(image, {
            folder: "chat/messages",
          });
          imageUrl = up.secure_url;
          log("cloud", "Image uploaded", { url: imageUrl });
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

        // ---------- CREATE ----------
        const newMsg = await Message.create({
          senderId: userId,
          receiverId,
          text,
          image: imageUrl,
          status: "sent",
          replyTo: replyMessage?._id ?? null,
        });

        const populated = await Message.findById(newMsg._id)
          .populate("senderId", "fullName profilePic")
          .populate("receiverId", "fullName profilePic")
          .populate({
            path: "replyTo",
            select: "text image senderId",
            populate: { path: "senderId", select: "fullName profilePic" },
          })
          .lean();

        const receiverSocketId = userSocketMap[receiverId];
        console.log('🔌 [SOCKET] Socket Status for', receiverId, ':', receiverSocketId ? 'ONLINE' : 'OFFLINE');
        
        // Determine initial status
        let finalStatus = "sent"; 
        
        // ✅ INCREMENT UNREAD COUNT (Backend)
        if (!receiverSocketId) {
          // Receiver is offline - increment unread
          await receiver.incrementUnread(userId, false);
        }
        
        // ----- PUSH NOTIFICATION -----
        if (!receiverSocketId) {
          console.log('📤 [SOCKET] User is OFFLINE - attempting push notification');
          try {
            const receiverUser = await User.findById(receiverId).select('deviceTokens fullName');
            const activeTokens = receiverUser.deviceTokens.map(device => device.token);
            
            if (activeTokens.length > 0) {
              const messagePreview = text ? (text.length > 50 ? text.substring(0, 50) + '...' : text) : '📷 Photo';
              
              await sendPushNotification({
                title: userName,
                body: messagePreview,
                tokens: activeTokens,
                data: {
                  type: 'new_message',
                  senderId: userId.toString(),
                  chatId: receiverId.toString(),
                  messageId: newMsg._id.toString(),
                  click_action: 'FLUTTER_NOTIFICATION_CLICK'
                }
              });
              log("push", `Push notification sent to ${receiverUser.fullName}`);
            }
          } catch (pushError) {
            console.error('💥 [SOCKET] Push notification error:', pushError);
            log("error", "Push notification failed", pushError);
          }
        }
        
        // If receiver is online, send them the message and update status
        if (receiverSocketId) {
          // Update status to delivered in DB
          await Message.findByIdAndUpdate(newMsg._id, { status: "delivered" });
          finalStatus = "delivered";
          
          // ✅ GET CURRENT UNREAD COUNT
          const unreadCount = receiver.getUnread(userId, false);
          
          // Send message to receiver
          io.to(receiverSocketId).emit("newMessage", {
            ...populated,
            status: "delivered",
          });
          
          // Update receiver's recent chat
          io.to(receiverSocketId).emit("recentChatUpdated", {
            partnerId: userId,
            lastMessage: { ...populated, status: "delivered" },
          });
          
          // ✅ SEND UNREAD COUNT TO RECEIVER
          io.to(receiverSocketId).emit("unreadCountUpdated", {
            chatId: userId,
            unreadCount: unreadCount
          });
        }
        
        // Send status update to sender
        io.to(socket.id).emit("messageStatusUpdate", {
          messageId: newMsg._id,
          status: finalStatus,
        });
        
        // Update sender's recent chat
        io.to(socket.id).emit("recentChatUpdated", {
          partnerId: receiverId,
          lastMessage: { ...populated, status: finalStatus },
        });

        log("success", `Message sent with status: ${finalStatus}`);
      } catch (err) {
        log("error", "sendMessage error", err);
        socket.emit("error", { message: "Server error sending message" });
      }
    }
  );

  // ✅ MARK MESSAGES AS SEEN - Now updates backend
  socket.on("markMessagesAsSeen", async ({ senderId }) => {
    try {
      // Update message status in DB
      await Message.updateMany(
        {
          senderId: senderId,
          receiverId: userId,
          status: { $ne: 'seen' }
        },
        { status: 'seen' }
      );

      // ✅ CLEAR UNREAD COUNT IN BACKEND
      const user = await User.findById(userId);
      if (user) {
        await user.clearUnread(senderId, false);
      }

      // Emit unread count update to current user
      io.to(socket.id).emit("unreadCountUpdated", {
        chatId: senderId,
        unreadCount: 0
      });

      // Notify the sender that their messages were seen
      const senderSocketId = userSocketMap[senderId];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", {
          seenBy: userId,
          senderId: senderId
        });
      }

      log("success", `${userName} marked messages as seen from ${senderId}`);
    } catch (err) {
      log("error", "markMessagesAsSeen error", err);
      socket.emit("error", { message: "Server error marking messages as seen" });
    }
  });

  // ✅ REQUEST UNREAD COUNTS - New handler
  socket.on("requestUnreadCounts", async () => {
    try {
      const user = await User.findById(userId);
      if (user) {
        // Convert Map to object for transmission
        const unreadCounts = {};
        user.unreadCounts.forEach((count, chatId) => {
          // Remove "group_" prefix for consistent frontend handling
          const cleanId = chatId.startsWith('group_') ? chatId.substring(6) : chatId;
          const isGroup = chatId.startsWith('group_');
          unreadCounts[cleanId] = { count, isGroup };
        });
        
        socket.emit("allUnreadCounts", unreadCounts);
        log("success", `Sent unread counts to ${userName}`);
      }
    } catch (err) {
      log("error", "requestUnreadCounts error", err);
    }
  });

  // Device token handlers (unchanged)
  socket.on("registerDeviceToken", async ({ token, deviceType = "web" }) => {
    try {
      const user = await User.findById(userId);
      if (user) {
        await user.addDeviceToken(token, deviceType);
        log("success", `Device token registered for ${userName}`);
        socket.emit("deviceTokenRegistered", { success: true });
      }
    } catch (err) {
      log("error", "Device token registration failed", err);
      socket.emit("error", { message: "Failed to register device token" });
    }
  });

  socket.on("removeDeviceToken", async ({ token }) => {
    try {
      await User.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: { token: token } }
      });
      log("success", `Device token removed for ${userName}`);
      socket.emit("deviceTokenRemoved", { success: true });
    } catch (err) {
      log("error", "Device token removal failed", err);
      socket.emit("error", { message: "Failed to remove device token" });
    }
  });
};