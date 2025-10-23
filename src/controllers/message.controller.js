import cloudinary from '../lib/cloudinary.js';
import Message from '../models/Message.js'
import Group from '../models/Group.js';
import User from '../models/User.js';
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
    const { id: partnerId } = req.params; // <-- chatPartnerId

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: partnerId },
        { senderId: partnerId, receiverId: myId },
      ],
    })
      .populate("deletedBy", "fullName")
      .populate({
        path: "replyTo",
        select: "text image senderId createdAt",
        populate: { path: "senderId", select: "fullName profileImage" },
      })
      .sort({ createdAt: 1 });

    const formatted = messages
      .map((msg) => {
        const obj = msg.toObject();

        if (msg.deletedForEveryone) {
          return { ...obj, text: "This message was deleted", image: null };
        }
        if (msg.deletedFor?.some((id) => id.toString() === myId.toString())) {
          return null; // hide for me
        }
        return obj;
      })
      .filter(Boolean);

    res.status(200).json(formatted);
  } catch (err) {
    console.error("getMessagesByUserId error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, replyTo } = req.body;
    const { id: receiverId } = req.params; // <-- chatPartnerId
    const senderId = req.user._id;

    if (!text && !image)
      return res.status(400).json({ message: "Message text or image required" });

    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: "Receiver not found" });

    // ----- IMAGE UPLOAD -----
    let imageUrl;
    if (image) {
      const up = await cloudinary.uploader.upload(image, {
        folder: "chat/messages",
      });
      imageUrl = up.secure_url;
    }

    // ----- REPLY -----
    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select("text image senderId")
        .populate("senderId", "fullName profileImage");
      if (!replyMessage)
        return res.status(400).json({ message: "Invalid reply message ID" });
    }

    const newMsg = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      status: "sent",
      replyTo: replyMessage?._id ?? null,
    });
    await newMsg.save();

    const populated = await populateMessage(Message.findById(newMsg._id)).lean();

    // ----- SOCKET -----
    const receiverSocket = userSocketMap[receiverId];
    const senderSocket = userSocketMap[senderId];

    const finalStatus = receiverSocket ? "delivered" : "sent";

    if (receiverSocket) {
      await Message.findByIdAndUpdate(newMsg._id, { status: "delivered" });
      io.to(receiverSocket).emit("newMessage", { ...populated, status: "delivered" });
      io.to(senderSocket).emit("messageStatusUpdate", {
        messageId: newMsg._id,
        status: "delivered",
      });
    } else {
      io.to(senderSocket).emit("messageStatusUpdate", {
        messageId: newMsg._id,
        status: "sent",
      });
    }

    // recent-chat updates
    io.to(senderSocket).emit("recentChatUpdated", {
      partnerId: receiverId,
      lastMessage: { ...populated, status: finalStatus },
    });
    if (receiverSocket) {
      io.to(receiverSocket).emit("recentChatUpdated", {
        partnerId: senderId,
        lastMessage: { ...populated, status: "delivered" },
      });
    }

    io.to(senderSocket).emit("newMessage", populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    }).lean();

    const partnerIds = [
      ...new Set(
        messages
          .map((m) =>
            m.senderId.toString() === loggedInUserId.toString()
              ? m.receiverId?.toString()
              : m.senderId.toString()
          )
          .filter(Boolean)
      ),
    ];

    if (!partnerIds.length) return res.status(200).json([]);

    const partners = await User.find(
      { _id: { $in: partnerIds } },
      "fullName email online lastSeen profilePicture"
    ).lean();

    const withLast = await Promise.all(
      partners.map(async (p) => {
        const last = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: p._id },
            { senderId: p._id, receiverId: loggedInUserId },
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

        return { ...p, lastMessage: last || null };
      })
    );

    res.status(200).json(withLast);
  } catch (err) {
    console.error("getChatPartners error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId, deleteType } = req.body;
    const userId = req.user._id;

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // ---- DELETE FOR ME ----
    if (deleteType === "me") {
      if (!msg.deletedFor.includes(userId)) {
        msg.deletedFor.push(userId);
        await msg.save();
      }
      return res.status(200).json({ message: "Deleted for you" });
    }

    // ---- DELETE FOR EVERYONE ----
    if (deleteType === "everyone") {
      const isSender = msg.senderId.toString() === userId.toString();

      if (isSender) {
        msg.deletedForEveryone = true;
        msg.deletedBy = userId;
        await msg.save();
        return res.status(200).json({ message: "Deleted for everyone" });
      }

      // Group admin check
      if (msg.groupId) {
        const group = await Group.findById(msg.groupId);
        if (group && group.admins.some((a) => a.toString() === userId.toString())) {
          msg.deletedForEveryone = true;
          msg.deletedBy = userId;
          await msg.save();
          return res.status(200).json({ message: "Deleted for everyone (admin)" });
        }
      }
      return res.status(403).json({ message: "Not allowed" });
    }

    res.status(400).json({ message: "Invalid deleteType" });
  } catch (err) {
    console.error("deleteMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { messageId } = req.params;
    const userId = req.user._id;

    if (!text?.trim())
      return res.status(400).json({ message: "Text cannot be empty" });

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (msg.senderId.toString() !== userId.toString())
      return res.status(403).json({ message: "You can only edit your own messages" });

    msg.text = text.trim();
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    const populated = await populateMessage(Message.findById(msg._id));
    res.status(200).json({ message: "Edited", updatedMessage: populated });
  } catch (err) {
    console.error("editMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

