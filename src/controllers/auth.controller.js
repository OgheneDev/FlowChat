import User from "../models/User.js";
import bcrypt from "bcryptjs/dist/bcrypt.js";
import { generateToken } from "../lib/utils.js";
import { validationResult } from "express-validator";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import cloudinary from "../lib/cloudinary.js";
import crypto from 'crypto'
import { sendPasswordResetEmail } from "../emails/emailHandlers.js";

export const signup = async (req, res) => {
    const { fullName, email, password } = req.body;

    try {
        // Check for validation errors from express-validator
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Check if user already exists
        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
        });

        if (newUser) {
            const savedUser = await newUser.save();
            generateToken(newUser._id, res);

            res.status(201).json({
             _id: newUser._id,
             fullName: newUser.fullName,
             email: newUser.email,
             profilePic: newUser.profilePic,
            }); 
            try {
                await sendWelcomeEmail(savedUser.email, savedUser.fullName, process.env.CLIENT_URL)
            } catch (error) {
                console.error("Failed to send welcome email", error)
            }
        } else {
            res.status(400).json({ message: "Inavild user data" })
        }  
    } catch (error) {
        console.log("Error in signup controller:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body

    try {
        const user = await User.findOne({email})
        if (!user) {
            return res.status(400).json({message: "Invalid Credentials"})
        }

        const isPasswordCorrect = await bcrypt.compare(password,user.password)
        if (!isPasswordCorrect) {
            return res.status(400).json({message: "Invalid Credentials"})
        }

        generateToken(user._id, res)

        res.status(200).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
        });


    } catch (error) {
        console.error("Error in login controller", error)
        res.status(500).json({message: "Internal server error"})
    }
}

export const logout = async (_, res) => {
    res.cookies("jwt", "", {maxAge:0})
    res.statues(200).json({message: "Logged out successfully"})
}

export const updateProfile = async (req, res) => {
    try {
        const {profilePic} = req.body;
        if (!profilePic) {
            return res.status(400),json({message: "Profile picture is required"});
        }

        const userId = req.user._id;

       const uploadRespone = await cloudinary.uploader(profilePic)

       const updatedUser = await User.findByIdAndUpdate(
        userId,
         {profilePic:uploadRespone.secure_url},
         {new:true}
        );

        res.status(200).json(updatedUser)
    } catch (error) {
        console.log("Error updating user", error);
        res.status(500).json({ message: "Internal server error" })
    }

}

// Forgot Password - Send reset email
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(20).toString("hex");
        const resetTokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // Set token and expiration (1 hour)
        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();

        // Send reset email
        try {
            await sendPasswordResetEmail(
                user.email,
                resetToken, // Send the unhashed token
                process.env.CLIENT_URL
            );
        } catch (emailError) {
            console.error("Error sending reset email:", emailError);
            // Still return success to prevent user enumeration
            return res.status(200).json({ 
                message: "Reset email sent. Check your inbox." 
            });
        }

        res.status(200).json({ 
            message: "Reset email sent. Check your inbox." 
        });

    } catch (error) {
        console.error("Error in forgotPassword controller:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Reset Password - Verify token and update password
export const resetPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const { resetToken } = req.params;

        // Validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Hash the reset token
        const resetTokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ 
                message: "Invalid or expired token" 
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password and clear reset token fields
        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        await user.save();

        res.status(200).json({ 
            message: "Password reset successfully" 
        });

    } catch (error) {
        console.error("Error in resetPassword controller:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};