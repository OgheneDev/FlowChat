import Chat from "../models/Chat.js";
import Group from "../models/Group.js";
import User from "../models/User.js";

/** 📌 PIN MESSAGE **/
export const pinMessage = async (req, res) => {
  try {
    const { messageId, chatId, groupId } = req.body;
    const userId = req.user._id;

    let target = null;

    if (chatId) {
      target = await Chat.findById(chatId);
      if (!target.participants.includes(userId)) {
        return res.status(403).json({ message: "Not part of this chat" });
      }
    } else if (groupId) {
      target = await Group.findById(groupId);
      if (!target.members.includes(userId)) {
        return res.status(403).json({ message: "Not a group member" });
      }
    } else {
      return res.status(400).json({ message: "chatId or groupId required" });
    }

    if (!target.pinnedMessages.includes(messageId)) {
      target.pinnedMessages.push(messageId);
      await target.save();
    }

    res.status(200).json({ message: "Message pinned", pinnedMessages: target.pinnedMessages });
  } catch (error) {
    console.error("Error pinning message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/** 📍 UNPIN MESSAGE **/
export const unpinMessage = async (req, res) => {
  try {
    const { messageId, chatId, groupId } = req.body;

    const target = chatId
      ? await Chat.findById(chatId)
      : await Group.findById(groupId);

    target.pinnedMessages = target.pinnedMessages.filter(
      id => id.toString() !== messageId
    );

    await target.save();
    res.status(200).json({ message: "Message unpinned" });
  } catch (error) {
    console.error("Error unpinning message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/** ⭐ TOGGLE STAR MESSAGE **/
export const toggleStarMessage = async (req, res) => {
  try {
    const { messageId } = req.body;
    const user = await User.findById(req.user._id);

    const index = user.starredMessages.indexOf(messageId);
    if (index > -1) {
      user.starredMessages.splice(index, 1);
      await user.save();
      return res.status(200).json({ message: "Message unstarred" });
    }

    user.starredMessages.push(messageId);
    await user.save();
    res.status(200).json({ message: "Message starred" });
  } catch (error) {
    console.error("Error starring message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/** 💬 TOGGLE STAR CHAT **/
export const toggleStarChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const user = await User.findById(req.user._id);

    const index = user.starredChats.indexOf(chatId);
    if (index > -1) {
      user.starredChats.splice(index, 1);
      await user.save();
      return res.status(200).json({ message: "Chat unstarred" });
    }

    user.starredChats.push(chatId);
    await user.save();
    res.status(200).json({ message: "Chat starred" });
  } catch (error) {
    console.error("Error starring chat:", error);
    res.status(500).json({ message: "Server error" });
  }
};
