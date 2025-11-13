import Group from "../models/Group.js";
import User from "../models/User.js";
import Message from "../models/Message.js"
import { ensureMember } from "../utils/chatHelpers.js";

export const pinMessage = async (req, res) => {
  try {
    console.log("📌 === pinMessage START ===");
    const { messageId, chatPartnerId, groupId } = req.body;
    const userId = req.user._id;

    console.log("Request data:", { messageId, chatPartnerId, groupId, userId });

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    if (!chatPartnerId && !groupId) {
      return res.status(400).json({ message: "Either chatPartnerId or groupId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify the message exists and user has access to it
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // SAFE: Check if already pinned in this context
    const alreadyPinned = user.pinnedMessages.find(pinned => {
      // Skip if messageId is missing or invalid
      if (!pinned.messageId) {
        console.log("⚠️ Found pinned message without messageId:", pinned);
        return false;
      }
      
      const pinnedMessageId = pinned.messageId.toString ? pinned.messageId.toString() : String(pinned.messageId);
      const currentMessageId = messageId.toString ? messageId.toString() : String(messageId);
      
      return pinnedMessageId === currentMessageId && 
        (
          (chatPartnerId && pinned.context?.chatPartnerId?.toString() === chatPartnerId) ||
          (groupId && pinned.context?.groupId?.toString() === groupId)
        );
    });

    if (alreadyPinned) {
      console.log("📌 Message already pinned in this context");
      return res.status(200).json({ 
        message: "Message already pinned", 
        pinnedMessages: user.pinnedMessages 
      });
    }

    // Create context object
    const context = {
      type: groupId ? 'group' : 'direct',
      chatPartnerId: chatPartnerId || null,
      groupId: groupId || null
    };

    // Add to pinned messages with context
    user.pinnedMessages.push({
      messageId,
      context,
      pinnedAt: new Date()
    });

    await user.save();
    
    console.log("📌 After pinning - pinned messages count:", user.pinnedMessages.length);
    console.log("📌 === pinMessage END ===");

    res.status(200).json({ 
      message: "Message pinned successfully", 
      pinnedMessages: user.pinnedMessages 
    });
  } catch (err) {
    console.error("❌ pinMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const unpinMessage = async (req, res) => {
  try {
    console.log("📌 === unpinMessage START ===");
    const { messageId, chatPartnerId, groupId } = req.body;
    const userId = req.user._id;

    console.log("Request data:", { messageId, chatPartnerId, groupId, userId });

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const initialLength = user.pinnedMessages.length;
    
    // SAFE: Remove the specific pinned message with matching context
    user.pinnedMessages = user.pinnedMessages.filter(pinned => {
      // Skip if messageId is missing
      if (!pinned.messageId) {
        console.log("⚠️ Removing invalid pinned message without messageId:", pinned);
        return false; // Remove invalid entries
      }
      
      const pinnedMessageId = pinned.messageId.toString ? pinned.messageId.toString() : String(pinned.messageId);
      const currentMessageId = messageId.toString ? messageId.toString() : String(messageId);
      
      const isMatch = pinnedMessageId === currentMessageId && 
        (
          (chatPartnerId && pinned.context?.chatPartnerId?.toString() === chatPartnerId) ||
          (groupId && pinned.context?.groupId?.toString() === groupId)
        );
      
      return !isMatch;
    });

    const finalLength = user.pinnedMessages.length;
    
    console.log(`📌 Removed ${initialLength - finalLength} pinned messages`);
    
    // Only save if something changed
    if (initialLength !== finalLength) {
      await user.save();
      console.log("📌 After unpinning - pinned messages count:", user.pinnedMessages.length);
    } else {
      console.log("📌 No pinned message found to remove");
    }

    console.log("📌 === unpinMessage END ===");

    res.status(200).json({ 
      message: "Message unpinned successfully",
      pinnedMessages: user.pinnedMessages 
    });
  } catch (err) {
    console.error("❌ unpinMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getPinnedData = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatPartnerId, groupId } = req.query;

    // Now require context - no more global pinned messages
    if (!chatPartnerId && !groupId) {
      return res.status(400).json({ 
        message: "Either chatPartnerId or groupId is required" 
      });
    }

    const user = await User.findById(userId)
      .populate('pinnedMessages.messageId')
      .select('pinnedMessages');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // SAFE: Filter by context with robust error handling
    let filteredPinnedMessages = user.pinnedMessages.filter(pinned => {
      // Skip invalid pinned messages
      if (!pinned.messageId) {
        return false;
      }
      
      // Skip items that don't have proper context structure
      if (!pinned.context) {
        return false;
      }
      
      // NEW: Skip messages that are deleted for everyone
      if (pinned.messageId.deletedForEveryone) {
        return false;
      }
      
      // NEW: Skip messages that are deleted for the current user
      if (pinned.messageId.deletedFor && pinned.messageId.deletedFor.includes(userId)) {
        return false;
      }
      
      return true;
    });

    if (chatPartnerId) {
      filteredPinnedMessages = filteredPinnedMessages.filter(pinned =>
        pinned.context.type === 'direct' &&
        pinned.context.chatPartnerId?.toString() === chatPartnerId
      );
    } else if (groupId) {
      filteredPinnedMessages = filteredPinnedMessages.filter(pinned =>
        pinned.context.type === 'group' &&
        pinned.context.groupId?.toString() === groupId
      );
    }

    // SAFE: Extract message IDs with error handling
    const pinnedMessageIds = filteredPinnedMessages
      .map(pinned => {
        try {
          if (pinned.messageId) {
            if (pinned.messageId._id) {
              return pinned.messageId._id.toString(); // populated
            }
            return pinned.messageId.toString(); // not populated
          }
        } catch (error) {
          console.error("Error extracting message ID from pinned:", pinned, error);
          return null;
        }
        return null;
      })
      .filter(Boolean);

    res.status(200).json({
      pinnedMessages: pinnedMessageIds
    });
  } catch (err) {
    console.error("❌ getPinnedData error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const cleanupPinnedMessages = async () => {
  try {
    console.log("🧹 Starting pinned messages cleanup...");
    
    const users = await User.find({ "pinnedMessages.0": { $exists: true } });
    let totalRemoved = 0;
    
    for (const user of users) {
      const validPinnedMessages = [];
      
      for (const pinned of user.pinnedMessages) {
        if (!pinned.messageId) {
          totalRemoved++;
          continue;
        }
        
        // Check if message still exists and isn't deleted
        const message = await Message.findById(pinned.messageId);
        if (!message || message.deletedForEveryone || 
            (message.deletedFor && message.deletedFor.includes(user._id))) {
          totalRemoved++;
          continue;
        }
        
        validPinnedMessages.push(pinned);
      }
      
      if (validPinnedMessages.length !== user.pinnedMessages.length) {
        user.pinnedMessages = validPinnedMessages;
        await user.save();
      }
    }
    
    console.log(`🧹 Cleanup completed. Removed ${totalRemoved} orphaned pinned messages.`);
  } catch (err) {
    console.error("❌ cleanupPinnedMessages error:", err);
  }
};

export const getMessageById = async (req, res) => {
  try {
    console.log("📨 === getMessageById START ===");
    const { messageId } = req.params;
    const userId = req.user._id;

    console.log("Fetching message:", messageId, "for user:", userId);

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    // Find the message and populate sender information
    const message = await Message.findById(messageId)
      .populate('senderId', 'fullName profilePic email')
      .populate('replyTo', 'text image senderId')
      .lean();

    if (!message) {
      console.log("❌ Message not found:", messageId);
      return res.status(404).json({ message: "Message not found" });
    }

    console.log("✅ Message found:", {
      id: message._id,
      text: message.text?.substring(0, 50) + (message.text?.length > 50 ? '...' : ''),
      hasImage: !!message.image,
      sender: message.senderId?.fullName || 'Unknown'
    });

    // Format the response to match your frontend expectations
    const formattedMessage = {
      _id: message._id,
      text: message.text,
      image: message.image,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      status: message.status,
      senderId: message.senderId ? {
        _id: message.senderId._id,
        fullName: message.senderId.fullName,
        profilePic: message.senderId.profilePic,
        email: message.senderId.email
      } : null,
      replyTo: message.replyTo ? {
        _id: message.replyTo._id,
        text: message.replyTo.text,
        image: message.replyTo.image,
        senderId: message.replyTo.senderId
      } : null
    };

    console.log("📨 === getMessageById END ===");

    res.status(200).json({
      message: "Message details fetched successfully",
      message: formattedMessage
    });
  } catch (err) {
    console.error("❌ getMessageById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByIds = async (req, res) => {
  try {
    console.log("📨 === getMessagesByIds START ===");
    let { messageIds } = req.body;
    const userId = req.user._id;

    console.log("Fetching messages:", messageIds, "for user:", userId);

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "Message IDs array is required" });
    }

    // Handle case where messageIds might be objects with _id property
    const actualMessageIds = messageIds.map(id => {
      if (typeof id === 'string') {
        return id;
      } else if (id && id._id) {
        return id._id;
      } else {
        console.error("Invalid message ID format:", id);
        return null;
      }
    }).filter(Boolean);

    console.log("Processed message IDs:", actualMessageIds);

    // Find all messages and populate sender information
    const messages = await Message.find({ _id: { $in: actualMessageIds } })
      .populate('senderId', 'fullName profilePic email')
      .populate('replyTo', 'text image senderId')
      .lean()
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${messages.length} messages`);

    // Format the responses
    const formattedMessages = messages.map(message => ({
      _id: message._id,
      text: message.text,
      image: message.image,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      status: message.status,
      senderId: message.senderId ? {
        _id: message.senderId._id,
        fullName: message.senderId.fullName,
        profilePic: message.senderId.profilePic,
        email: message.senderId.email
      } : null,
      replyTo: message.replyTo ? {
        _id: message.replyTo._id,
        text: message.replyTo.text,
        image: message.replyTo.image,
        senderId: message.replyTo.senderId
      } : null
    }));

    console.log("📨 === getMessagesByIds END ===");

    res.status(200).json({
      message: "Messages details fetched successfully",
      messages: formattedMessages
    });
  } catch (err) {
    console.error("❌ getMessagesByIds error:", err);
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

    // Now we can send the simple array directly
    res.status(200).json({
      starredMessages: user.starredMessages || [],
      starredChats: user.starredChats || []
    });
  } catch (err) {
    console.error("❌ getStarredData error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

