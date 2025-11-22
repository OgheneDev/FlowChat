import User from "../models/User.js";

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Convert Map to object for JSON response
    const unreadCounts = {};
    
    if (user.unreadCounts && user.unreadCounts instanceof Map) {
      user.unreadCounts.forEach((count, chatId) => {
        // Remove "group_" prefix for consistent frontend handling
        const cleanId = chatId.startsWith('group_') 
          ? chatId.substring(6) 
          : chatId;
        const isGroup = chatId.startsWith('group_');
        
        // Only include non-zero counts
        if (count > 0) {
          unreadCounts[cleanId] = { count, isGroup };
        }
      });
    }
    
    console.log(`📬 Sending unread counts for user ${user.fullName}:`, unreadCounts);
    res.json(unreadCounts);
  } catch (error) {
    console.error("Error fetching unread counts:", error);
    res.status(500).json({ message: "Error fetching unread counts" });
  }
};