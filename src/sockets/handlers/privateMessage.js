import { log } from "../logger.js";
import User from "../../models/User.js";
import Message from "../../models/Message.js";
import cloudinary from "../../lib/cloudinary.js";
import { userSocketMap } from "../state.js";
import sendPushNotification from "../../utils/pushNotificationHelpers.js";

export const registerPrivateMessageHandler = (io, socket, userName, userId) => {
  socket.on(
    "sendMessage",
    async ({ receiverId, text, image, replyTo }) => {
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
        console.log('👥 [SOCKET] All connected users:', Object.keys(userSocketMap));
        
        // ----- PUSH NOTIFICATION -----
        // Only send if receiver is offline
        if (!receiverSocketId) {
          console.log('📤 [SOCKET] User is OFFLINE - attempting push notification');
          try {
            const receiverUser = await User.findById(receiverId).select('deviceTokens fullName');
            console.log('👤 [SOCKET] Receiver user:', receiverUser?.fullName);
            console.log('🔑 [SOCKET] Device tokens found:', receiverUser?.deviceTokens?.length || 0);
            const activeTokens = receiverUser.deviceTokens.map(device => device.token);
            console.log('🎯 [SOCKET] Active tokens:', activeTokens);
            
            if (activeTokens.length > 0) {
              console.log('🚀 [SOCKET] Calling sendPushNotification with', activeTokens.length, 'tokens');
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
              console.log('✅ [SOCKET] Push notification function completed');
              log("push", `Push notification sent to ${receiverUser.fullName}`);
            } else {
              console.log('❌ [SOCKET] No active tokens found for user');
            }
          } catch (pushError) {
            console.error('💥 [SOCKET] Push notification error:', pushError);
            log("error", "Push notification failed", pushError);
          }
        } else {
          console.log('💬 [SOCKET] User is ONLINE - skipping push notification');
        }
        
        // Determine initial status
        let finalStatus = "sent";
        
        // If receiver is online, send them the message and update status
        if (receiverSocketId) {
          // Update status to delivered in DB
          await Message.findByIdAndUpdate(newMsg._id, { status: "delivered" });
          finalStatus = "delivered";
          
          // Calculate unread count for receiver
          const unreadCount = await Message.countDocuments({
            receiverId,
            senderId: userId,
            status: { $ne: 'seen' }
          });
          
          // Send message to receiver (NOT to sender)
          io.to(receiverSocketId).emit("newMessage", {
            ...populated,
            status: "delivered",
          });
          
          // Update receiver's recent chat
          io.to(receiverSocketId).emit("recentChatUpdated", {
            partnerId: userId,
            lastMessage: { ...populated, status: "delivered" },
          });
          
          // Emit unread count update to receiver
          io.to(receiverSocketId).emit("unreadCountUpdated", {
            chatId: userId, // The sender's ID is the chat ID for the receiver
            unreadCount: unreadCount
          });
        }
        
        // Send status update to sender (so they see delivered checkmarks)
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

  // Mark messages as seen handler
  socket.on("markMessagesAsSeen", async ({ senderId }) => {
    try {
      // Update all messages from this sender to seen
      await Message.updateMany(
        {
          senderId: senderId,
          receiverId: userId,
          status: { $ne: 'seen' }
        },
        { status: 'seen' }
      );

      // Calculate new unread count (should be 0)
      const unreadCount = await Message.countDocuments({
        senderId: senderId,
        receiverId: userId,
        status: { $ne: 'seen' }
      });

      // Emit unread count update to current user
      io.to(socket.id).emit("unreadCountUpdated", {
        chatId: senderId,
        unreadCount: unreadCount
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

  // Add device token handler for push notifications
  socket.on("registerDeviceToken", async ({ token, deviceType = "web" }) => {
  try {
    console.log('🔑 [TOKEN REGISTRATION] Starting for user:', userId);
    console.log('📱 [TOKEN REGISTRATION] Token received:', token);
    console.log('💻 [TOKEN REGISTRATION] Device type:', deviceType);
    
    const user = await User.findById(userId);
    if (user) {
      console.log('👤 [TOKEN REGISTRATION] User found:', user.fullName);
      console.log('📊 [TOKEN REGISTRATION] Current tokens before:', user.deviceTokens);
      
      // REPLACE THIS: await user.addDeviceToken(token, deviceType);
      // WITH THIS DIRECT UPDATE:
      await User.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: { token: token } }, // Remove if exists
        $push: { 
          deviceTokens: {
            token: token,
            deviceType: deviceType,
            createdAt: new Date()
          }
        }
      });
      
      // Refresh user to see updated tokens
      const updatedUser = await User.findById(userId).select('deviceTokens');
      console.log('✅ [TOKEN REGISTRATION] Tokens after save:', updatedUser.deviceTokens);
      
      log("success", `Device token registered for ${userName}`);
      socket.emit("deviceTokenRegistered", { success: true });
    } else {
      console.log('❌ [TOKEN REGISTRATION] User not found');
    }
  } catch (err) {
    console.error('💥 [TOKEN REGISTRATION] Error:', err);
    log("error", "Device token registration failed", err);
    socket.emit("error", { message: "Failed to register device token" });
  }
});

  // Remove device token handler
  socket.on("removeDeviceToken", async ({ token }) => {
  try {
    const user = await User.findById(userId);
    if (user) {
      // REPLACE THIS: await user.removeDeviceToken(token);
      // WITH THIS DIRECT UPDATE:
      await User.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: { token: token } }
      });
      
      log("success", `Device token removed for ${userName}`);
      socket.emit("deviceTokenRemoved", { success: true });
    }
  } catch (err) {
    log("error", "Device token removal failed", err);
    socket.emit("error", { message: "Failed to remove device token" });
  }
});
};