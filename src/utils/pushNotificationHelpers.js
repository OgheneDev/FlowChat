import admin from "../config/firebase.js";

async function sendPushNotification({ body, title, tokens, data = {} }) {
    // Filter out any invalid tokens
    const validTokens = tokens.filter(token => token && typeof token === 'string' && token.length > 0);
    
    if (validTokens.length === 0) {
        console.log("No valid tokens provided");
        return {
            success: false,
            message: "No valid tokens provided",
            successCount: 0,
            failureCount: 0,
            responses: []
        };
    }

    const messages = validTokens.map(token => ({
        token,
        notification: { title, body },
        data: data // custom data payload
    }));

    try {
        const response = await admin.messaging().sendEach(messages);
        
        console.log("Successful sends:", response.successCount);
        console.log("Failed sends:", response.failureCount);
        
        // Log detailed results
        response.responses.forEach((result, index) => {
            if (result.success) {
                console.log(`Message sent successfully to token: ${validTokens[index]}`);
            } else {
                console.error(`Failed to send to token: ${validTokens[index]} - Error:`, result.error);
                
                // Handle specific error cases
                if (result.error?.code === 'messaging/invalid-registration-token' || 
                    result.error?.code === 'messaging/registration-token-not-registered') {
                    console.log(`Token is invalid or not registered: ${validTokens[index]}`);
                    // You might want to remove this token from your database here
                }
            }
        });

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
        console.error("Error sending push notifications:", error);
        
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