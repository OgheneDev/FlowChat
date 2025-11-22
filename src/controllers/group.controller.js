import Group from "../models/Group.js";
import cloudinary from "../lib/cloudinary.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { io } from "../sockets/config.js";
import { userSocketMap } from "../sockets/state.js";
import GroupEventMessage from "../models/GroupEventMessage.js";
import sendPushNotification from "../utils/pushNotificationHelpers.js";

// Helper to broadcast to a group room
const broadcastToGroup = (groupId, event, payload) => {
  io.to(`group:${groupId}`).emit(event, payload);
};

// Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, members, groupImage, description } = req.body;
    const creatorId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    // Handle members conversion and validation
    let memberIds = [];
    
    if (members) {
      if (Array.isArray(members)) {
        memberIds = members;
      } else if (typeof members === 'string') {
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

    // Validate member IDs
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
      description: description || "",
    });

    // ----- CREATE GROUP CREATION EVENT -----
    const creatorUser = await User.findById(creatorId).select("fullName profilePic");
    const eventMessage = new GroupEventMessage({
      type: 'group_created',
      groupId: group._id,
      userId: creatorId,
      userName: creatorUser?.fullName || 'User',
      isEvent: true
    });
    await eventMessage.save();

    // Emit socket event for the group creation
    broadcastToGroup(group._id, 'groupEventCreated', eventMessage);

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
    
    // ✅ Fetch the current user to access their unreadCounts
    const currentUser = await User.findById(userId);

    const groups = await Group.find({
      members: userId,
    })
      .populate("admins", "fullName profilePic email")
      .populate("members", "fullName profilePic email")
      .sort({ createdAt: -1 })
      .lean();

    const groupsWithLast = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await Message.findOne({ 
          groupId: group._id,
          deletedFor: { $ne: userId }
        })
          .populate("senderId", "fullName profilePic email")
          .populate({
            path: "replyTo",
            select: "text image senderId createdAt",
            populate: { path: "senderId", select: "fullName profilePic" },
          })
          .sort({ createdAt: -1 })
          .lean();

        if (lastMessage && lastMessage.deletedForEveryone) {
          lastMessage.text = "This message was deleted";
          lastMessage.image = null;
        }

        // ✅ Get unread count for this group
        const unreadCount = currentUser.getUnread(group._id.toString(), true);

        return {
          ...group,
          lastMessage: lastMessage || null,
          unreadCount  // ✅ Include unread count in response
        };
      })
    );

    res.status(200).json(groupsWithLast);
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
      .populate("members", "_id fullName email profilePic online")
      .populate("admins", "_id fullName email profilePic online");

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
    const { text, image, replyTo, isForwarded } = req.body;
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

    // ----- IMAGE UPLOAD -----
    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat/messages"
      });
      imageUrl = uploadResponse.secure_url;
    }

    // ----- REPLY -----
    let replyMessage = null;
    if (replyTo) {
      replyMessage = await Message.findById(replyTo)
        .select("text image senderId createdAt")
        .populate("senderId", "fullName profilePic");
        
      if (!replyMessage) {
        return res.status(400).json({ message: "Invalid reply message ID" });
      }
    }

    const newMessage = new Message({
      senderId,
      groupId,
      text,
      image: imageUrl,
      isForwarded: isForwarded || false,
      status: "sent",
      replyTo: replyMessage?._id || null,
    });

    await newMessage.save();

    // ----- POPULATE MESSAGE -----
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "fullName profilePic")
      .populate({
        path: "replyTo",
        select: "text image senderId createdAt",
        populate: { 
          path: "senderId", 
          select: "fullName profilePic" 
        }
      })
      .lean();

    if (!populatedMessage) {
      return res.status(404).json({ message: "Message not found after creation" });
    }

    // ----- GET GROUP MEMBERS -----
    const groupWithMembers = await Group.findById(groupId).populate("members", "_id fullName deviceTokens");
    const groupMembers = groupWithMembers.members;

    // ----- PUSH NOTIFICATIONS -----
    // Get offline members for push notifications
    const offlineMembers = groupMembers.filter(member => 
      member._id.toString() !== senderId.toString() && 
      !userSocketMap[member._id.toString()]
    );

    // Send push notifications to offline members
    if (offlineMembers.length > 0) {
      try {
        const senderUser = await User.findById(senderId).select('fullName');
        const messagePreview = text ? (text.length > 50 ? text.substring(0, 50) + '...' : text) : '📷 Photo';
        
        // Send to each offline member individually
        for (const member of offlineMembers) {
          const activeTokens = member.deviceTokens?.map(device => device.token) || [];
          
          if (activeTokens.length > 0) {
            await sendPushNotification({
              title: `${senderUser.fullName} in ${group.name}`,
              body: messagePreview,
              tokens: activeTokens,
              data: {
                type: 'new_group_message',
                senderId: senderId.toString(),
                groupId: groupId.toString(),
                groupName: group.name,
                messageId: newMessage._id.toString(),
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
              }
            });
            
            console.log(`Group push notification sent to ${member.fullName}`);
          }
        }
      } catch (pushError) {
        console.error('Group push notification error:', pushError);
      }
    }

    // ----- SOCKET LOGIC -----
    const senderSocket = userSocketMap[senderId];
    
    // Get sockets of all online group members (excluding sender)
    const onlineMemberSockets = groupMembers
      .filter(member => member._id.toString() !== senderId.toString() && userSocketMap[member._id.toString()])
      .map(member => userSocketMap[member._id.toString()]);

    // Update message status to "delivered" for online members
    if (onlineMemberSockets.length > 0) {
      await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
      
      // Send to all online group members
      io.to(onlineMemberSockets).emit("newGroupMessage", { 
        ...populatedMessage, 
        status: "delivered" 
      });

      // Send status update to sender for online members
      if (senderSocket) {
        io.to(senderSocket).emit("messageStatusUpdate", {
          messageId: newMessage._id,
          status: "delivered",
        });
      }
    } else {
      // If no one is online, send "sent" status to sender
      if (senderSocket) {
        io.to(senderSocket).emit("messageStatusUpdate", {
          messageId: newMessage._id,
          status: "sent",
        });
      }
    }

    // Send the message to sender (with appropriate status)
    const finalStatus = onlineMemberSockets.length > 0 ? "delivered" : "sent";
    if (senderSocket) {
      io.to(senderSocket).emit("newGroupMessage", { 
        ...populatedMessage, 
        status: finalStatus 
      });
    }

    // ----- RECENT GROUP CHAT UPDATES -----
    // Update recent group chats for all group members
    groupMembers.forEach(member => {
      const memberSocket = userSocketMap[member._id.toString()];
      if (memberSocket) {
        io.to(memberSocket).emit("recentGroupUpdated", {
          groupId,
          lastMessage: { 
            ...populatedMessage, 
            status: member._id.toString() === senderId.toString() ? finalStatus : "delivered"
          },
        });
      }
    });

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

    // ✅ Fetch regular messages
    const messages = await Message.find({ groupId })
      .populate("senderId", "fullName profilePic email")
      .populate({
        path: "replyTo",
        select: "text image senderId",
        populate: { path: "senderId", select: "fullName profilePic" },
      })
      .sort({ createdAt: 1 });

    // ✅ Fetch event messages
    const events = await GroupEventMessage.find({ groupId })
      .populate('userId', 'fullName profilePic')
      .populate('targetUserId', 'fullName profilePic')
      .sort({ createdAt: 1 });

    // ✅ Handle deleted messages (soft delete) for regular messages only
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

      // 🔹 If deleted only for the current user
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

    // ✅ Combine regular messages and events, then sort by creation date
    const allMessages = [...formattedMessages, ...events].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    res.status(200).json(allMessages);
  } catch (error) {
    console.error("Error in getGroupMessages:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update group details (only admins)
export const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, newImage, members, description } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isAdmin = group.admins.some(
      (a) => a.toString() === requesterId.toString()
    );
    if (!isAdmin)
      return res.status(403).json({ message: "Only admins can edit this group" });

    // ----- IMAGE -----
    if (newImage) {
      const uploadResult = await cloudinary.uploader.upload(newImage, {
        folder: "chat/groups",
      });
      group.groupImage = uploadResult.secure_url;
    }

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (members) group.members = [...new Set(members)];

    await group.save();

    // ----- POPULATE FOR CLIENT -----
    const populated = await Group.findById(id)
      .populate("members", "_id fullName email profilePic online")
      .populate("admins", "_id fullName email profilePic online");

    // ----- SOCKET BROADCAST -----
    broadcastToGroup(id, "groupUpdated", { group: populated });

    res.status(200).json(populated);
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

    const isAdmin = group.admins.some(
      (id) => id.toString() === requesterId.toString()
    );
    if (!isAdmin)
      return res.status(403).json({ message: "Only admins can promote others" });

    const isMember = group.members.some(
      (id) => id.toString() === userIdToPromote.toString()
    );
    if (!isMember)
      return res.status(400).json({ message: "User must be a member to become admin" });

    // Get user info for the event message
    const promotedUser = await User.findById(userIdToPromote).select("fullName profilePic");

    let promotionMessage = "User is already an admin";
    
    if (!group.admins.includes(userIdToPromote)) {
      group.admins.push(userIdToPromote);
      await group.save();
      promotionMessage = "User promoted to admin";

      // ----- CREATE EVENT MESSAGE -----
      const eventMessage = new GroupEventMessage({
        type: 'admin_promoted',
        groupId,
        targetUserId: userIdToPromote,
        targetUserName: promotedUser?.fullName || 'User',
        userId: requesterId, // The admin who did the promotion
        isEvent: true
      });
      await eventMessage.save();
      
      // Emit socket event for the promotion event
      broadcastToGroup(groupId, 'groupEventCreated', eventMessage);
    }

    // ----- SOCKET BROADCAST -----
    broadcastToGroup(groupId, "memberPromoted", {
      groupId,
      newAdminId: userIdToPromote,
      admins: group.admins
    });

    res.status(200).json({ message: promotionMessage, group });
  } catch (error) {
    console.error("Error in makeGroupAdmin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add members to group (Admin only)
export const addMembersToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.admins.includes(userId))
      return res.status(403).json({ message: "Only admins can add members" });

    const validUsers = await User.find({ _id: { $in: members } });
    if (validUsers.length !== members.length)
      return res.status(400).json({ message: "Some users not found" });

    const newMembers = members.filter(
      (id) => !group.members.map(String).includes(id)
    );
    if (newMembers.length === 0)
      return res.status(400).json({ message: "All users are already in group" });

    group.members.push(...newMembers);
    await group.save();

    // ----- CREATE EVENT MESSAGES FOR EACH NEW MEMBER -----
    for (const memberId of newMembers) {
      const user = validUsers.find(u => u._id.toString() === memberId);
      const eventMessage = new GroupEventMessage({
        type: 'member_joined',
        groupId,
        userId: memberId,
        userName: user?.fullName || 'User',
        isEvent: true
      });
      await eventMessage.save();
      
      // Emit socket event for the new event
      broadcastToGroup(groupId, 'groupEventCreated', eventMessage);
    }

    // ----- POPULATE FOR RESPONSE -----
    const populated = await Group.findById(groupId)
      .populate("members", "_id fullName email profilePic online")
      .populate("admins", "_id fullName email profilePic online");

    // ----- TELL EVERY NEW MEMBER TO JOIN THE ROOM -----
    newMembers.forEach((newId) => {
      const socketId = userSocketMap[newId];
      if (socketId) {
        io.to(socketId).emit("groupAdded", { groupId });
      }
    });

    // ----- UPDATE EVERYONE ELSE -----
    broadcastToGroup(groupId, "groupUpdated", { group: populated });

    res.status(200).json({ message: "Members added successfully", group: populated });
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

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.admins.includes(userId))
      return res.status(403).json({ message: "Only admins can remove members" });

    if (!group.members.map(String).includes(memberId))
      return res.status(400).json({ message: "User is not in this group" });

    // Get user info before removing for the event message
    const removedUser = await User.findById(memberId).select("fullName profilePic");

    // Remove from members array
    group.members = group.members.filter((id) => id.toString() !== memberId);
    
    // Also remove from admins if they were an admin
    group.admins = group.admins.filter((id) => id.toString() !== memberId);
    
    await group.save();

    // ----- CREATE EVENT MESSAGE -----
    const eventMessage = new GroupEventMessage({
      type: 'member_removed',
      groupId,
      targetUserId: memberId,
      targetUserName: removedUser?.fullName || 'User',
      userId: userId, // The admin who removed the member
      isEvent: true
    });
    await eventMessage.save();
    
    // Emit socket event for the removal event
    broadcastToGroup(groupId, 'groupEventCreated', eventMessage);

    // ----- POPULATE FOR RESPONSE -----
    const populated = await Group.findById(groupId)
      .populate("members", "_id fullName email profilePic online")
      .populate("admins", "_id fullName email profilePic online");

    // ----- SOCKET: tell the removed user + everyone else -----
    broadcastToGroup(groupId, "memberRemoved", {
      groupId,
      removedMemberId: memberId,
    });

    // Notify the removed user specifically
    const removedUserSocket = userSocketMap[memberId];
    if (removedUserSocket) {
      io.to(removedUserSocket).emit("youWereRemoved", { groupId });
    }

    res.status(200).json({ message: "Member removed successfully", group: populated });
  } catch (error) {
    console.error("Error in removeMemberFromGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Leave group (for non-admins)
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.includes(userId))
      return res.status(403).json({ message: "You are not a member of this group" });

    // Get user info for the event message
    const leavingUser = await User.findById(userId).select("fullName profilePic");

    if (group.admins.includes(userId)) {
      if (group.admins.length === 1)
        return res
          .status(400)
          .json({ message: "You cannot leave as the only admin. Assign another admin first." });

      group.admins = group.admins.filter((id) => id.toString() !== userId.toString());
    }

    group.members = group.members.filter((id) => id.toString() !== userId.toString());
    await group.save();

    // ----- CREATE EVENT MESSAGE -----
    const eventMessage = new GroupEventMessage({
      type: 'member_left',
      groupId,
      userId: userId,
      userName: leavingUser?.fullName || 'User',
      isEvent: true
    });
    await eventMessage.save();
    
    // Emit socket event for the leave event
    broadcastToGroup(groupId, 'groupEventCreated', eventMessage);

    // ----- SOCKET: tell the leaving user + everyone else -----
    const socketId = userSocketMap[userId];
    if (socketId) {
      io.to(socketId).emit("youLeftGroup", { groupId });
    }
    
    broadcastToGroup(groupId, "memberRemoved", { 
      groupId, 
      removedMemberId: userId 
    });

    res.status(200).json({ message: "You have left the group successfully" });
  } catch (error) {
    console.error("Error in leaveGroup:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete group (Admin only)
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params
    const userId = req.user._id

    // Find group
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    //  Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({ message: "Only admins can remove members" });
    }

    // Delete the Group
    await Group.findByIdAndDelete(groupId);

    // Delete associated data
    await Message.deleteMany({ groupId });

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Server error" });
  }
}

