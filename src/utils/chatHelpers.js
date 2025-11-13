// utils/chatHelpers.js
import Group from "../models/Group.js";
import User from "../models/User.js";

export const ensureMember = async (userId, target) => {
  const idStr = userId.toString();
  if (target instanceof Group) {
    if (!target.members.some(m => m.toString() === idStr))
      throw new Error("Not a group member");
  } else {
    // For 1-to-1 we just verify the partner exists
    const partner = await User.findById(target);
    if (!partner) throw new Error("Chat partner not found");
  }
};

export const ensureAdmin = (userId, group) => {
  if (!group.admins.some(a => a.toString() === userId.toString()))
    throw new Error("Only admins can perform this action");
};

export const populateMessage = (msg) =>
  msg
    .populate("senderId", "fullName profilePic")
    .populate("receiverId", "fullName profilePic")
    .populate({
      path: "replyTo",
      select: "text image senderId createdAt",
      populate: { path: "senderId", select: "fullName profilePic" },
    });