import { log } from "../logger.js";
import Message from "../../models/Message.js";
import { activeSearches } from "../state.js";

export const registerSearchHandlers = (socket, userName, userId) => {
  socket.on("searchMessages", async (query) => {
    log("search", `${userName} is searching messages for "${query}"`);
    try {
      if (!query?.trim()) {
        return socket.emit("error", { message: "Search query cannot be empty" });
      }
      activeSearches[userId] = query;

      const results = await Message.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(30)
        .populate("senderId", "fullName profilePic")
        .populate("receiverId", "fullName profilePic")
        .populate("groupId", "name")
        .lean();

      socket.emit("searchResults", results);
      log("success", `Search results sent to ${userName}`, { count: results.length });
    } catch (err) {
      log("error", "searchMessages error", err);
      socket.emit("error", { message: "Failed to search messages" });
    }
  });

  socket.on("clearSearch", () => {
    log("clean", `${userName} cleared search`);
    delete activeSearches[userId];
  });
};