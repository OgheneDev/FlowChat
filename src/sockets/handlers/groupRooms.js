import { log } from "../logger.js";
import Group from "../../models/Group.js";
import { io } from "../config.js";
import { userSocketMap } from "../state.js";

/**
 * Register all group-related socket events.
 * @param {Socket} socket
 * @param {string} userName
 * @param {string} userId
 */
export const registerGroupRoomHandlers = (socket, userName, userId) => {
  socket.on("groupAdded", async ({ groupId }) => {
    log(`${userName} added to group ${groupId}`);

    try {
      const group = await Group.findById(groupId).populate("members", "_id");
      if (!group) {
        return socket.emit("error", { message: "Group not found" });
      }

      const isMember = group.members.some(
        (m) => m._id.toString() === userId
      );

      if (!isMember) {
        return socket.emit("error", {
          message: "You are not a member of this group",
        });
      }

      // Join the room and tell the client it succeeded
      socket.join(`group:${groupId}`);
      socket.emit("joinedGroupRoom", { groupId });
      log("success", `${userName} joined group ${groupId}`);
    } catch (err) {
      log("error", "groupAdded", err);
      socket.emit("error", { message: "Failed to join group" });
    }
  });

  socket.on("leaveGroup", ({ groupId }) => {
    log(`${userName} left group ${groupId}`);
    socket.leave(`group:${groupId}`);
    socket.emit("leftGroupRoom", { groupId });
  });

  socket.on("groupUpdated", async ({ group }) => {
    // The server already validated the request – we just broadcast.
    // `group` contains the **new** group object (populated as needed)
    io.to(`group:${group._id}`).emit("groupUpdated", { group });
    log("broadcast", `group ${group._id} updated`);
  });

  socket.on("memberPromoted", async ({ groupId, newAdminId }) => {
    const group = await Group.findById(groupId)
      .select("members admins")
      .lean();

    if (!group) return;

    const payload = {
      groupId,
      newAdminId,
      admins: group.admins.map(String),
    };

    io.to(`group:${groupId}`).emit("memberPromoted", payload);
    log("broadcast", `member ${newAdminId} promoted in group ${groupId}`);
  });

  socket.on("memberRemoved", async ({ groupId, removedMemberId }) => {
    // Tell the removed user to leave the room
    const removedSocketId = userSocketMap[removedMemberId];
    if (removedSocketId) {
      io.to(removedSocketId).emit("youWereRemoved", { groupId });
      // Force-leave the socket room
      const removedSocket = io.sockets.sockets.get(removedSocketId);
      removedSocket?.leave(`group:${groupId}`);
    }

    // Tell everybody else
    io.to(`group:${groupId}`).emit("memberRemoved", {
      groupId,
      removedMemberId,
    });
    log("broadcast", `member ${removedMemberId} removed from group ${groupId}`);
  });
};