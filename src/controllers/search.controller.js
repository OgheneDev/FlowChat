import User from "../models/User.js";
import Group from "../models/Group.js";
import Message from "../models/Message.js";

export const globalSearch = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    // 🔹 1️⃣ Search Users (excluding current user)
    const users = await User.find(
      {
        _id: { $ne: userId },
        $text: { $search: query },
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .select("fullName email profileImage");

    // 🔹 2️⃣ Search Groups (where user is a member)
    const groups = await Group.find(
      {
        $text: { $search: query },
        members: userId,
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .select("name groupImage members");

    // 🔹 3️⃣ Search Messages (user must be involved)
    const messages = await Message.find(
      {
        $text: { $search: query },
        $or: [
          { senderId: userId },
          { receiverId: userId },
          { groupId: { $exists: true } }, // include group messages
        ],
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .populate("senderId", "fullName profileImage")
      .populate("groupId", "name groupImage")
      .limit(50);

    // ✅ Combine all results into a structured response
    res.status(200).json({
      users,
      groups,
      messages,
    });
  } catch (error) {
    console.error("Error in globalSearch:", error);
    res.status(500).json({ message: "Server error" });
  }
};
