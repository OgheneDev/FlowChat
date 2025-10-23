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
    console.log("🚀 === toggleStarChat START ===");
    console.log("📦 Request body:", req.body);
    console.log("👤 User ID from auth:", req.user._id);
    console.log("👤 User ID type:", typeof req.user._id);

    const { chatPartnerId, groupId } = req.body;
    console.log("🎯 chatPartnerId:", chatPartnerId, "groupId:", groupId);
    
    if (!chatPartnerId && !groupId) {
      console.log("❌ Missing both chatPartnerId and groupId");
      return res.status(400).json({ message: "chatPartnerId or groupId required" });
    }

    const idToToggle = chatPartnerId ?? groupId;
    console.log("🎯 ID to toggle:", idToToggle);
    console.log("🎯 ID type:", typeof idToToggle);

    console.log("🔍 Searching for user in database...");
    const user = await User.findById(req.user._id);
    console.log("✅ User found in DB:", user ? `Yes (${user._id})` : "No");
    
    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    console.log("📋 User starredChats before:", user.starredChats);
    console.log("📋 starredChats array length:", user.starredChats.length);
    console.log("📋 starredChats type:", typeof user.starredChats);
    console.log("📋 Is array?", Array.isArray(user.starredChats));

    // Log each starred chat ID for debugging
    user.starredChats.forEach((chatId, index) => {
      console.log(`   [${index}] chatId: ${chatId}, type: ${typeof chatId}, string: ${chatId.toString()}`);
    });

    // Check if already starred - use toString() for proper comparison
    const isStarred = user.starredChats.some(chatId => chatId.toString() === idToToggle.toString());
    console.log("⭐ Is already starred?", isStarred);

    if (isStarred) {
      console.log("➖ Unstarring chat...");
      const beforeLength = user.starredChats.length;
      user.starredChats = user.starredChats.filter(id => id.toString() !== idToToggle.toString());
      const afterLength = user.starredChats.length;
      console.log(`➖ Removed chat. Before: ${beforeLength}, After: ${afterLength}`);
      console.log("➖ starredChats after unstar:", user.starredChats);
    } else {
      console.log("➕ Starring chat...");
      const beforeLength = user.starredChats.length;
      user.starredChats.push(idToToggle);
      const afterLength = user.starredChats.length;
      console.log(`➕ Added chat. Before: ${beforeLength}, After: ${afterLength}`);
      console.log("➕ starredChats after star:", user.starredChats);
    }

    console.log("💾 Saving user to database...");
    await user.save();
    console.log("✅ User saved successfully");

    // Verify the save worked by fetching the user again
    console.log("🔍 Verifying save by fetching user again...");
    const updatedUser = await User.findById(req.user._id);
    console.log("✅ Verified starredChats after save:", updatedUser.starredChats);

    console.log("🚀 === toggleStarChat END ===");
    
    return res.status(200).json({ 
      message: isStarred ? "Chat unstarred" : "Chat starred",
      starredChats: user.starredChats 
    });
  } catch (err) {
    console.error("❌ toggleStarChat error:", err);
    console.error("❌ Error stack:", err.stack);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getStarredData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('starredMessages starredChats');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Extract just the IDs for the frontend
    const starredChatIds = user.starredChats.map(chat => 
      chat.chatPartnerId || chat.groupId
    ).filter(Boolean);

    res.status(200).json({
      starredMessages: user.starredMessages || [],
      starredChats: starredChatIds // Send simple array of IDs to frontend
    });
  } catch (err) {
    console.error("getStarredData error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
