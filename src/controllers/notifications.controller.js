import User from "../models/User.js";

export const registerDeviceToken = async (req, res) => {
  try {
    const { token, deviceType = 'web' } = req.body;
    const userId = req.user._id;

    console.log('🔑 [HTTP TOKEN REGISTRATION] Starting for user:', userId);

    // Atomic update - no version conflict possible
    const result = await User.findByIdAndUpdate(
      userId,
      {
        $pull: { deviceTokens: { token } }, // Remove if exists
      },
      { new: false }
    );

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Now add the token with updated timestamp
    await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          deviceTokens: {
            token,
            deviceType,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    );

    console.log('✅ [HTTP TOKEN REGISTRATION] Token registered successfully');
    res.json({ success: true, message: 'Device token registered' });
    
  } catch (error) {
    console.error('💥 [HTTP TOKEN REGISTRATION] Error:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
};

export const removeDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.removeDeviceToken(token);

    res.json({ success: true, message: 'Device token removed' });
  } catch (error) {
    console.error('Error removing device token:', error);
    res.status(500).json({ error: 'Failed to remove device token' });
  }
};
