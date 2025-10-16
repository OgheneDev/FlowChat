import Group from "../models/Group.js";
import cloudinary from "../lib/cloudinary.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

// Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, members, groupImage } = req.body;
    const creatorId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    // Handle members conversion and validation
    let memberIds = [];
    
    if (members) {
      if (Array.isArray(members)) {
        // If already an array
        memberIds = members;
      } else if (typeof members === 'string') {
        // If string (comma-separated), split and clean
        memberIds = members
          .split(',')
          .map(id => id.trim())
          .filter(id => id.length > 0);
      } else {
        return res.status(400).json({ 
          message: "Members must be an array of user IDs or comma-separated string" 
        });
      }
    }

    // Validate member IDs (optional but recommended)
    const validMemberIds = memberIds.filter(id => 
      typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)
    );

    if (validMemberIds.length !== memberIds.length) {
      return res.status(400).json({ 
        message: "Invalid user IDs in members array" 
      });
    }

    let uploadedImageUrl = "";

    // Upload image to Cloudinary if provided
    if (groupImage) {
      const uploadResult = await cloudinary.uploader.upload(groupImage, {
        folder: "chat/groups",
      });
      uploadedImageUrl = uploadResult.secure_url;
    }

    // Create group with validated members + creator
    const allMembers = [...new Set([...validMemberIds, creatorId.toString()])];
    
    const group = await Group.create({
      name,
      members: allMembers,
      admins: [creatorId],
      groupImage: uploadedImageUrl,
    });

    res.status(201).json(group);
  } catch (error) {
    console.error("Error in createGroup:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all groups the logged-in user is part of
export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all groups where user is a member or admin
    const groups = await Group.find({
      members: userId, // because admins are also in members
    })
      .populate("admins", "fullName profileImage email")
      .populate("members", "fullName profileImage email")
      .sort({ createdAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    console.error("Error in getMyGroups:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get Group Details by ID
export const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Find group and populate members + admins for full info
    const group = await Group.findById(groupId)
      .populate("members", "fullName email profileImage online")
      .populate("admins", "fullName email profileImage online");

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in getGroupById:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Send messages to group
export const sendGroupMessage = async (req, res) => {
  try {
    const { text, image, replyTo } = req.body;
    const { groupId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ message: "Text or image is required" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if sender is a group member
    if (!group.members.includes(senderId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat/messages"
      });
      imageUrl = uploadResponse.secure_url;
    }

    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select("text image senderId createdAt")
        .populate("senderId", "fullName profileImage");
        
      if (!replyMessage) {
        return res.status(400).json({ message: "Invalid reply message ID" });
      }
    }

    const newMessage = new Message({
      senderId,
      groupId,
      text,
      image: imageUrl,
      replyTo: replyMessage?._id || null,
    });

    await newMessage.save();

    // ✅ Query the saved message and populate in one go
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "fullName profileImage")
      .populate({
        path: "replyTo",
        select: "text image senderId createdAt",
        populate: { 
          path: "senderId", 
          select: "fullName profileImage" 
        }
      });

    if (!populatedMessage) {
      return res.status(404).json({ message: "Message not found after creation" });
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error in sendGroupMessage:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all messages in a group
export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // ✅ Ensure the group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // ✅ Ensure the user is a member
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    // ✅ Fetch messages in the group
    const messages = await Message.find({ groupId })
  .populate("senderId", "fullName profileImage email")
  .populate({
    path: "replyTo",
    select: "text image senderId",
    populate: { path: "senderId", select: "fullName profileImage" },
  })
  .sort({ createdAt: 1 });

    // ✅ Handle deleted messages (soft delete)
    const formattedMessages = messages.map((msg) => {
      const obj = msg.toObject();

      // 🔹 If deleted for everyone
      if (msg.deletedForEveryone) {
        return {
          ...obj,
          text: "This message was deleted",
          image: null,
          deleted: true,
        };
      }

      // 🔹 If deleted only for the current user → keep message visible (optional)
      // You could hide it completely by returning null instead
      if (msg.deletedFor?.some((id) => id.toString() === userId.toString())) {
        return {
          ...obj,
          text: "You deleted this message",
          image: null,
          deleted: true,
        };
      }

      // 🔹 Normal visible message
      return obj;
    });

    res.status(200).json(formattedMessages);
  } catch (error) {
    console.error("Error in getGroupMessages:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update group details (only admins)
export const updateGroup = async (req, res) => {
  try {
    const { id } = req.params; // group ID
    const { name, newImage, members } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Check if requester is an admin
    const isAdmin = group.admins.some(
      (adminId) => adminId.toString() === requesterId.toString()
    );
    if (!isAdmin) {
      return res.status(403).json({ message: "Only admins can edit this group" });
    }

    // Handle image update
    if (newImage) {
      const uploadResult = await cloudinary.uploader.upload(newImage, {
        folder: "chat/groups",
      });
      group.groupImage = uploadResult.secure_url;
    }

    if (name) group.name = name;
    if (members) group.members = [...new Set(members)];

    await group.save();
    res.status(200).json(group);
  } catch (error) {
    console.error("Error in updateGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Promote another member to admin (admin only)
export const makeGroupAdmin = async (req, res) => {
  try {
    const { groupId, userIdToPromote } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Only current admins can promote
    const isAdmin = group.admins.some(
      (id) => id.toString() === requesterId.toString()
    );
    if (!isAdmin) {
      return res.status(403).json({ message: "Only admins can promote others" });
    }

    // Ensure promoted user is a member
    const isMember = group.members.some(
      (id) => id.toString() === userIdToPromote.toString()
    );
    if (!isMember) {
      return res.status(400).json({ message: "User must be a member to become admin" });
    }

    // Promote new admin if not already
    if (!group.admins.includes(userIdToPromote)) {
      group.admins.push(userIdToPromote);
      await group.save();
    }

    res.status(200).json({ message: "User promoted to admin", group });
  } catch (error) {
    console.error("Error in makeGroupAdmin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add members to group (Admin only)
export const addMembersToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body; // expects array of userIds
    const userId = req.user._id;

    // 1️⃣ Find group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // 2️⃣ Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({ message: "Only admins can add members" });
    }

    // 3️⃣ Validate users being added
    const validUsers = await User.find({ _id: { $in: members } });
    if (validUsers.length !== members.length) {
      return res.status(400).json({ message: "Some users not found" });
    }

    // 4️⃣ Avoid duplicates
    const newMembers = members.filter(
      (id) => !group.members.map(String).includes(id)
    );

    if (newMembers.length === 0) {
      return res.status(400).json({ message: "All users are already in group" });
    }

    // 5️⃣ Add new members
    group.members.push(...newMembers);
    await group.save();

    res.status(200).json({ message: "Members added successfully", group });
  } catch (error) {
    console.error("Error in addMembersToGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Remove a member from the group (Admin only)
export const removeMemberFromGroup = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;

    // 1️⃣ Find group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // 2️⃣ Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({ message: "Only admins can remove members" });
    }

    // 3️⃣ Ensure the member exists in group
    if (!group.members.includes(memberId)) {
      return res.status(400).json({ message: "User is not in this group" });
    }

    // 4️⃣ Prevent removing another admin (optional)
    if (group.admins.includes(memberId)) {
      return res.status(403).json({ message: "Cannot remove another admin" });
    }

    // 5️⃣ Remove member
    group.members = group.members.filter(
      (id) => id.toString() !== memberId.toString()
    );

    await group.save();
    res.status(200).json({ message: "Member removed successfully", group });
  } catch (error) {
    console.error("Error in removeMemberFromGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Leave group (for non-admins)
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // 1️⃣ Find group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // 2️⃣ Check if user is part of this group
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    // 3️⃣ If user is an admin, handle carefully
    if (group.admins.includes(userId)) {
      // If this is the only admin, prevent leaving
      if (group.admins.length === 1) {
        return res
          .status(400)
          .json({ message: "You cannot leave as the only admin. Please assign another admin first." });
      }

      // Otherwise, remove admin privileges
      group.admins = group.admins.filter(
        (id) => id.toString() !== userId.toString()
      );
    }

    // 4️⃣ Remove user from members list
    group.members = group.members.filter(
      (id) => id.toString() !== userId.toString()
    );

    await group.save();

    res.status(200).json({ message: "You have left the group successfully" });
  } catch (error) {
    console.error("Error in leaveGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

