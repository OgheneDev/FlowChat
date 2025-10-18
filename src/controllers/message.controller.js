import cloudinary from '../lib/cloudinary.js';
import Message from '../models/Message.js'
import Group from '../models/Group.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

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
      return res.status(400).json({ message: "Message text or image is required" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // ✅ Optional: verify the replied-to message exists
    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo).select("text image senderId");
      if (!replyMessage) {
        return res.status(400).json({ message: "Invalid reply message ID" });
      }
    }

    // ✅ Create new message (with replyTo if present)
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      replyTo: replyMessage ? replyMessage._id : null,
    });

    await newMessage.save();

    // ✅ FIX: Use findById to get a query that supports populate
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "fullName profileImage")
      .populate("receiverId", "fullName profileImage")
      .populate({
        path: "replyTo",
        select: "text image senderId",
        populate: { 
          path: "senderId", 
          select: "fullName profileImage" 
        },
      });

    if (!populatedMessage) {
      return res.status(404).json({ message: "Message not found after population" });
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.log("Error in sendMessage:", error);
    res.status(500).json({ message: "Server error" });
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
            // Ensure senderId exists and is valid
            if (!msg.senderId || !mongoose.Types.ObjectId.isValid(msg.senderId)) {
              console.warn("getChatPartners: Invalid or missing senderId in message", msg._id, msg.senderId);
              return false;
            }
            // Check receiverId only if it exists (optional for group messages)
            if (msg.receiverId && !mongoose.Types.ObjectId.isValid(msg.receiverId)) {
              console.warn("getChatPartners: Invalid receiverId in message", msg._id, msg.receiverId);
              return false;
            }
            return true;
          })
          .map((msg) =>
            msg.senderId.toString() === loggedInUserId.toString()
              ? msg.receiverId?.toString() // Handle optional receiverId
              : msg.senderId.toString()
          )
          .filter((id) => id) // Remove undefined/null IDs (e.g., from group messages without receiverId)
      ),
    ];

    console.log("getChatPartners: Chat partner IDs", chatPartnerIds);
    if (chatPartnerIds.length === 0) {
      console.log("getChatPartners: No chat partners found");
      return res.status(200).json([]);
    }

    const chatPartners = await User.find(
      { _id: { $in: chatPartnerIds } },
      "fullName email online lastSeen profilePicture"
    ).lean();

    console.log("getChatPartners: Chat partners found", chatPartners.length);
    res.status(200).json(chatPartners);
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

