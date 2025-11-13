import User from "../models/User";

export const registerDeviceToken = async (req, res) => {
  try {
    const { token, deviceType = 'web' } = req.body;
    const userId = req.user._id;

    console.log('🔑 [HTTP TOKEN REGISTRATION] Starting for user:', userId);
    console.log('📱 [HTTP TOKEN REGISTRATION] Token received:', token);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('👤 [HTTP TOKEN REGISTRATION] User found:', user.fullName);
    console.log('📊 [HTTP TOKEN REGISTRATION] Current tokens before:', user.deviceTokens);

    await user.addDeviceToken(token, deviceType);

    const updatedUser = await User.findById(userId).select('deviceTokens');
    console.log('✅ [HTTP TOKEN REGISTRATION] Tokens after save:', updatedUser.deviceTokens);

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
