import Group from "../models/Group.js";
import User from "../models/User.js";
import { ensureMember } from "../utils/chatHelpers.js";

/** 📌 PIN MESSAGE **/
export const pinMessage = async (req, res) => {
  try {
    const { messageId, chatPartnerId, groupId } = req.body;
    const userId = req.user._id;

    if (!chatPartnerId && !groupId)
      return res.status(400).json({ message: "chatPartnerId or groupId required" });

    let target;
    if (groupId) {
      target = await Group.findById(groupId);
      await ensureMember(userId, target);
    } else {
      // 1-to-1: we store pinned messages on the *sender’s* user doc
      target = await User.findById(userId);
    }

    if (!target.pinnedMessages.includes(messageId)) {
      target.pinnedMessages.push(messageId);
      await target.save();
    }

    res
      .status(200)
      .json({ message: "Message pinned", pinnedMessages: target.pinnedMessages });
  } catch (err) {
    console.error("pinMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const unpinMessage = async (req, res) => {
  try {
    const { messageId, chatPartnerId, groupId } = req.body;

    let target;
    if (groupId) {
      target = await Group.findById(groupId);
    } else if (chatPartnerId) {
      target = await User.findById(req.user._id);
    } else {
      return res.status(400).json({ message: "chatPartnerId or groupId required" });
    }

    target.pinnedMessages = target.pinnedMessages.filter(
      (id) => id.toString() !== messageId
    );
    await target.save();

    res.status(200).json({ message: "Message unpinned" });
  } catch (err) {
    console.error("unpinMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* -------------------------------------------------
   2. STAR MESSAGE / CHAT (unchanged, just cleaned)
   ------------------------------------------------- */
export const toggleStarMessage = async (req, res) => {
  try {
    const { messageId } = req.body;
    const user = await User.findById(req.user._id);

    const idx = user.starredMessages.indexOf(messageId);
    if (idx > -1) {
      user.starredMessages.splice(idx, 1);
      await user.save();
      return res.status(200).json({ message: "Message unstarred" });
    }

    user.starredMessages.push(messageId);
    await user.save();
    res.status(200).json({ message: "Message starred" });
  } catch (err) {
    console.error("toggleStarMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const toggleStarChat = async (req, res) => {
  try {
    console.log("toggleStarChat called with:", req.body);
    console.log("User ID:", req.user._id);

    const { chatPartnerId, groupId } = req.body;
    if (!chatPartnerId && !groupId) {
      return res.status(400).json({ message: "chatPartnerId or groupId required" });
    }

    const user = await User.findById(req.user._id);
    console.log("Found user:", user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const idToToggle = chatPartnerId ?? groupId;
    console.log("ID to toggle:", idToToggle);
    console.log("Current starredChats:", user.starredChats);

    // Check if already starred
    const isStarred = user.starredChats.includes(idToToggle);
    
    if (isStarred) {
      // Unstar: remove from array
      user.starredChats = user.starredChats.filter(id => id.toString() !== idToToggle);
    } else {
      // Star: add to array
      user.starredChats.push(idToToggle);
    }

    await user.save();
    
    return res.status(200).json({ 
      message: isStarred ? "Chat unstarred" : "Chat starred",
      starredChats: user.starredChats 
    });
  } catch (err) {
    console.error("toggleStarChat error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getStarredData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('starredMessages starredChats');
    
    res.status(200).json({
      starredMessages: user.starredMessages || [],
      starredChats: user.starredChats || []
    });
  } catch (err) {
    console.error("getStarredData error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
