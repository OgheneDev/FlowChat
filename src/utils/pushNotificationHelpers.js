import admin from "../config/firebase.js";

async function sendPushNotification({ body, title, tokens, data = {} }) {
    console.log('🚀 START sendPushNotification');
    console.log('📨 Input - Title:', title, 'Body:', body);
    console.log('🎯 Input Tokens:', tokens);
    console.log('📦 Input Data:', data);
    
    const validTokens = tokens.filter(token => token && typeof token === 'string' && token.length > 0);
    
    console.log('✅ Valid tokens after filtering:', validTokens);
    console.log('📊 Valid tokens count:', validTokens.length);
    
    if (validTokens.length === 0) {
        console.log("❌ No valid tokens provided");
        return {
            success: false,
            message: "No valid tokens provided",
            successCount: 0,
            failureCount: 0,
            responses: []
        };
    }

    // CRITICAL FIX: Only send data payload, NO notification field
    // The Service Worker will create the notification
    const messages = validTokens.map(token => ({
        token,
        // Remove this line: notification: { title, body },
        data: {
            ...data,
            // Add title and body to data instead
            notificationTitle: title,
            notificationBody: body
        }
    }));

    console.log('📤 Prepared messages for FCM:', messages);

    try {
        console.log('🔄 Calling admin.messaging().sendEach()...');
        const response = await admin.messaging().sendEach(messages);
        
        console.log("✅ FCM Response - Successful sends:", response.successCount);
        console.log("❌ FCM Response - Failed sends:", response.failureCount);
        
        response.responses.forEach((result, index) => {
            if (result.success) {
                console.log(`✅ Message sent successfully to token: ${validTokens[index]}`);
            } else {
                console.error(`❌ Failed to send to token: ${validTokens[index]} - Error:`, result.error);
                
                if (result.error?.code === 'messaging/invalid-registration-token' || 
                    result.error?.code === 'messaging/registration-token-not-registered') {
                    console.log(`🗑️ Token is invalid or not registered: ${validTokens[index]}`);
                }
            }
        });

        console.log('🎉 sendPushNotification completed successfully');
        return {
            success: true,
            message: `Notifications sent successfully`,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses.map((result, index) => ({
                token: validTokens[index],
                success: result.success,
                error: result.error
            }))
        };

    } catch (error) {
        console.error("💥 Error sending push notifications:", error);
        
        return {
            success: false,
            message: "Failed to send notifications",
            error: error.message,
            successCount: 0,
            failureCount: validTokens.length,
            responses: []
        };
    }
}

export default sendPushNotification;