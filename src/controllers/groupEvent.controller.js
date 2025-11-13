import GroupEventMessage from "../models/GroupEventMessage.js";
import { io } from "../sockets/config.js";
import Group from "../models/Group.js";

// Helper to broadcast to a group room
const broadcastToGroup = (groupId, event, payload) => {
  console.log(`[Socket Broadcast] Emitting event '${event}' to group room 'group:${groupId}'`, {
    payloadType: typeof payload,
    hasPayload: !!payload,
    payloadId: payload?._id || 'N/A'
  });
  io.to(`group:${groupId}`).emit(event, payload);
};

// Create a group event
export const createGroupEvent = async (req, res) => {
  const startTime = Date.now();
  const requestId = `event-create-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] Starting createGroupEvent`, {
    groupId: req.params.groupId,
    userId: req.user?._id,
    userAgent: req.get('User-Agent'),
    body: { ...req.body, additionalData: req.body.additionalData ? '[EXISTS]' : null }
  });

  try {
    const { groupId } = req.params;
    const { type, userId, userName, targetUserId, targetUserName, additionalData } = req.body;

    console.log(`[${requestId}] Validating group existence: ${groupId}`);
    
    // Verify group exists
    const group = await Group.findById(groupId);
    if (!group) {
      console.warn(`[${requestId}] Group not found: ${groupId}`);
      return res.status(404).json({ message: 'Group not found' });
    }

    console.log(`[${requestId}] Group found: ${group.name} (${group._id})`, {
      memberCount: group.members?.length || 0
    });

    // Check if user is a member of the group
    const isMember = group.members.some(member => 
      member.toString() === req.user._id.toString()
    );
    
    console.log(`[${requestId}] User membership check:`, {
      userId: req.user._id,
      isMember,
      groupMembers: group.members.length
    });
    
    if (!isMember) {
      console.warn(`[${requestId}] User ${req.user._id} is not a member of group ${groupId}`);
      return res.status(403).json({ message: 'Not a member of this group' });
    }

    console.log(`[${requestId}] Creating new GroupEventMessage`, {
      type,
      groupId,
      userId: userId || req.user._id,
      userName,
      targetUserId,
      targetUserName,
      additionalDataExists: !!additionalData
    });

    const eventMessage = new GroupEventMessage({
      type,
      groupId,
      userId: userId || req.user._id,
      userName,
      targetUserId,
      targetUserName,
      additionalData,
      isEvent: true
    });

    console.log(`[${requestId}] Saving event message to database...`);
    await eventMessage.save();
    console.log(`[${requestId}] Event message saved successfully:`, {
      eventId: eventMessage._id,
      createdAt: eventMessage.createdAt
    });

    // Populate user data for the response
    console.log(`[${requestId}] Populating user data...`);
    await eventMessage.populate('userId', 'fullName profilePic');
    await eventMessage.populate('targetUserId', 'fullName profilePic');
    console.log(`[${requestId}] User data populated:`, {
      userName: eventMessage.userId?.fullName,
      targetUserName: eventMessage.targetUserId?.fullName
    });

    // Emit socket event for real-time updates
    console.log(`[${requestId}] Broadcasting socket event...`);
    broadcastToGroup(groupId, 'groupEventCreated', eventMessage);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] createGroupEvent completed successfully`, {
      duration: `${duration}ms`,
      eventId: eventMessage._id,
      eventType: eventMessage.type
    });

    res.status(201).json(eventMessage);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error creating group event:`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      groupId: req.params.groupId,
      userId: req.user?._id
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get events for a group
export const getGroupEvents = async (req, res) => {
  const startTime = Date.now();
  const requestId = `events-fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] Starting getGroupEvents`, {
    groupId: req.params.groupId,
    userId: req.user?._id,
    query: req.query,
    userAgent: req.get('User-Agent')
  });

  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    console.log(`[${requestId}] Validating group existence: ${groupId}`);
    
    // Verify group exists
    const group = await Group.findById(groupId);
    if (!group) {
      console.warn(`[${requestId}] Group not found: ${groupId}`);
      return res.status(404).json({ message: 'Group not found' });
    }

    console.log(`[${requestId}] Group found: ${group.name} (${group._id})`);

    // Check if user is a member of the group
    const isMember = group.members.some(member => 
      member.toString() === req.user._id.toString()
    );
    
    console.log(`[${requestId}] User membership check:`, {
      userId: req.user._id,
      isMember,
      groupMembers: group.members.length
    });
    
    if (!isMember) {
      console.warn(`[${requestId}] User ${req.user._id} is not a member of group ${groupId}`);
      return res.status(403).json({ message: 'Not a member of this group' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log(`[${requestId}] Fetching events from database`, {
      groupId,
      page: pageNum,
      limit: limitNum,
      skip
    });

    const events = await GroupEventMessage.find({ groupId })
      .populate('userId', 'fullName profilePic')
      .populate('targetUserId', 'fullName profilePic')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    console.log(`[${requestId}] Events fetched successfully:`, {
      count: events.length,
      eventIds: events.map(e => e._id)
    });

    console.log(`[${requestId}] Counting total documents...`);
    const total = await GroupEventMessage.countDocuments({ groupId });
    console.log(`[${requestId}] Total documents count:`, { total });

    const result = {
      events,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] getGroupEvents completed successfully`, {
      duration: `${duration}ms`,
      eventsReturned: events.length,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      totalEvents: result.total
    });

    res.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error fetching group events:`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      groupId: req.params.groupId,
      userId: req.user?._id,
      query: req.query
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};