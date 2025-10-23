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
    const { chatPartnerId, groupId } = req.body;
    if (!chatPartnerId && !groupId)
      return res.status(400).json({ message: "chatPartnerId or groupId required" });

    const user = await User.findById(req.user._id);
    const idToToggle = chatPartnerId ?? groupId;

    const idx = user.starredChats.indexOf(idToToggle);
    if (idx > -1) {
      user.starredChats.splice(idx, 1);
      await res.status(200).json({ message: "Chat unstarred" });
    } else {
      user.starredChats.push(idToToggle);
      await user.save();
      res.status(200).json({ message: "Chat starred" });
    }
  } catch (err) {
    console.error("toggleStarChat error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
