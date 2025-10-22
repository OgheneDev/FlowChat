import cloudinary from '../lib/cloudinary.js';
import Message from '../models/Message.js'
import Group from '../models/Group.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { io, userSocketMap } from '../lib/socket.js';

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Fetch all users except the logged-in one
    const filteredUsers = await User.find(
      { _id: { $ne: loggedInUserId } },
      "fullName email online lastSeen profilePicture" // pick needed fields
    );

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    // Fetch messages between both users
    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    })
      .populate("deletedBy", "fullName")
      // 🧩 Populate replyTo with key fields for context
      .populate({
        path: "replyTo",
        select: "text image senderId createdAt",
        populate: {
          path: "senderId",
          select: "fullName profileImage",
        },
      })
      .sort({ createdAt: 1 });

    // Format messages (handle deleted logic + keep reply context)
    const formattedMessages = messages.map((msg) => {
      const obj = msg.toObject();

      // 🟡 If deleted for everyone → show placeholder
      if (msg.deletedForEveryone) {
        return {
          ...obj,
          text: "This message was deleted",
          image: null,
          replyTo: msg.replyTo || null, // keep reply info if needed
        };
      }

      // 🟢 If deleted only for current user → hide it completely
      if (msg.deletedFor?.some((id) => id.toString() === myId.toString())) {
        return null; // hide message
      }

      return obj;
    });

    // Remove hidden messages
    res.status(200).json(formattedMessages.filter(Boolean));
  } catch (error) {
    console.log("Error in getMessagesByUserId:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, replyTo } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ message: 'Message text or image is required' });
    }

    // Verify receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver not found' });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: 'chat/messages',
      });
      imageUrl = uploadResponse.secure_url;
      console.log(`[${new Date().toLocaleTimeString()}] ☁️ Image uploaded to Cloudinary`, { url: imageUrl });
    }

    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select('text image senderId')
        .populate('senderId', 'fullName profileImage');
      if (!replyMessage) {
        return res.status(400).json({ message: 'Invalid reply message ID' });
      }
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      status: 'sent',
      replyTo: replyMessage ? replyMessage._id : null,
    });

    await newMessage.save();

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('senderId', 'fullName profileImage')
      .populate('receiverId', 'fullName profileImage')
      .populate({
        path: 'replyTo',
        select: 'text image senderId',
        populate: { path: 'senderId', select: 'fullName profileImage' },
      })
      .lean(); // Use .lean() to match socket.js behavior

    if (!populatedMessage) {
      return res.status(404).json({ message: 'Message not found after population' });
    }

    // Emit WebSocket events
    const receiverSocketId = userSocketMap[receiverId];
    const senderSocketId = userSocketMap[senderId];

    if (receiverSocketId) {
      await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
      io.to(receiverSocketId).emit('newMessage', {
        ...populatedMessage,
        status: 'delivered',
      });
      io.to(senderSocketId).emit('messageStatusUpdate', {
        messageId: newMessage._id,
        status: 'delivered',
      });
      console.log(`[${new Date().toLocaleTimeString()}] 📩 Message sent (delivered)`);

      // Emit recentChatUpdated to receiver
      io.to(receiverSocketId).emit('recentChatUpdated', {
        partnerId: senderId,
        lastMessage: { ...populatedMessage, status: 'delivered' },
      });
    } else {
      io.to(senderSocketId).emit('messageStatusUpdate', {
        messageId: newMessage._id,
        status: 'sent',
      });
      console.log(`[${new Date().toLocaleTimeString()}] 📤 Message sent (user offline)`);
    }

    // Emit recentChatUpdated to sender
    io.to(senderSocketId).emit('recentChatUpdated', {
      partnerId: receiverId,
      lastMessage: {
        ...populatedMessage,
        status: receiverSocketId ? 'delivered' : 'sent',
      },
    });

    io.to(senderSocketId).emit('newMessage', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Error in sendMessage:`, error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    console.log("getChatPartners: Request received for user", req.user?._id);
    if (!req.user || !req.user._id) {
      console.log("getChatPartners: Unauthorized, no user in request");
      return res.status(401).json({ error: "Unauthorized" });
    }
    const loggedInUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(loggedInUserId)) {
      console.log("getChatPartners: Invalid user ID", loggedInUserId);
      return res.status(400).json({ error: "Invalid user ID" });
    }

    console.log("getChatPartners: Querying messages for", loggedInUserId);
    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    }).lean();

    console.log("getChatPartners: Messages fetched", messages.length);
    const chatPartnerIds = [
      ...new Set(
        messages
          .filter((msg) => {
            if (!msg.senderId || !mongoose.Types.ObjectId.isValid(msg.senderId)) {
              console.warn("getChatPartners: Invalid or missing senderId in message", msg._id, msg.senderId);
              return false;
            }
            if (msg.receiverId && !mongoose.Types.ObjectId.isValid(msg.receiverId)) {
              console.warn("getChatPartners: Invalid receiverId in message", msg._id, msg.receiverId);
              return false;
            }
            return true;
          })
          .map((msg) =>
            msg.senderId.toString() === loggedInUserId.toString()
              ? msg.receiverId?.toString()
              : msg.senderId.toString()
          )
          .filter((id) => id)
      ),
    ];

    console.log("getChatPartners: Chat partner IDs", chatPartnerIds);
    if (chatPartnerIds.length === 0) {
      console.log("getChatPartners: No chat partners found");
      return res.status(200).json([]);
    }

    const chatPartners = await User.find(
      { _id: { $in: chatPartnerIds } },
      "fullName email online lastSeen profilePic"
    ).lean();

    // Attach last message between loggedInUserId and each partner
    const chatPartnersWithLast = await Promise.all(
      chatPartners.map(async (partner) => {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: partner._id },
            { senderId: partner._id, receiverId: loggedInUserId },
          ],
        })
          .populate("senderId", "fullName profileImage")
          .populate("receiverId", "fullName profileImage")
          .populate({
            path: "replyTo",
            select: "text image senderId",
            populate: { path: "senderId", select: "fullName profileImage" },
          })
          .sort({ createdAt: -1 })
          .lean();

        return {
          ...partner,
          lastMessage: lastMessage || null,
        };
      })
    );

    console.log("getChatPartners: Chat partners with last messages", chatPartnersWithLast.length);
    res.status(200).json(chatPartnersWithLast);
  } catch (error) {
    console.error("Error in getChatPartners:", error.stack);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId, deleteType } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({message: "Message not found"})
    }

    // Delete for me
    if (deleteType === "me") {
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
        await message.save();
      }
      return res.status(200).json({ message: "Message deleted for you" });
    }

    // Delete for everyone
    if (deleteType === "everyone") {
      //Sender can always delete their own messages
      if (message.senderId.toString() === userId.toString()) {
        message.deletedForEveryone = true;
        message.deletedBy = userId;
        await message.save();
        return res.status(200).json({ message: "Message deleted for everyone" });
      }

      // If group message only admins can delete members message
      if (message.groupId) {
        const group = Group.findById(message.groupId)
        if (group && group.admins.includes(userId)) {
          message.deletedForEveryone = true;
          message.deletedBy = userId;
          await message.save();
          return res.status(200).json({ message: "Message deleted for everyone" });
        }
      }
      return res.status(403).json({ message: "You are not allowed to delete this message for everyone" });
    }

    res.status(400).json({ message: "Invalid delete type" });

  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "Server error" });
  }
}

export const editMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { messageId } = req.params;
    const userId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: "Message text cannot be empty" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // 🛡️ Only sender can edit (or group admin)
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }

    // Update message
    message.text = text;
    message.edited = true;
    message.editedAt = new Date();

    const updatedMessage = await message.save();

    res.status(200).json({ message: "Message updated successfully", updatedMessage });

  } catch (error) {
    console.error("Error updating message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

