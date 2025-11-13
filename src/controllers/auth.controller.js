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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
        });

        const savedUser = await newUser.save();
        generateToken(savedUser._id, res);

        res.status(201).json({
            _id: savedUser._id,
            fullName: savedUser.fullName,
            email: savedUser.email,
            profilePic: savedUser.profilePic,
        });

        try {
            await sendWelcomeEmail(savedUser.email, savedUser.fullName, process.env.CLIENT_URL);
        } catch (error) {
            console.error("Failed to send welcome email", error);
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
    res.cookie("jwt", "", { 
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none'
    });
    res.status(200).json({ message: "Logged out successfully" });
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic, about } = req.body;
    const userId = req.user._id;

    // Prepare fields to update
    const updateData = {};

    // If profile picture is provided, upload it to Cloudinary
    if (profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      updateData.profilePic = uploadResponse.secure_url;
    }

    // Add 'about' if provided
    if (about) {
      updateData.about = about;
    }

    // If no valid fields were sent
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    // Update user document
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

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

export const deleteAccount = async (req, res, next) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide your password to confirm deletion'
            });
        }

        // Fetch user with password
        const user = await User.findById(req.user._id).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Use the matchPassword method
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Password is incorrect'
            });
        }

        // Delete user
        await User.findByIdAndDelete(req.user._id);

        // Optional: Clear cookie
        res.cookie("jwt", "", { maxAge: 0 });

        res.status(200).json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error("Error in deleteAccount:", error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // Validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Find user with password field
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password
        const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordCorrect) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        res.status(200).json({ 
            message: "Password changed successfully" 
        });

    } catch (error) {
        console.error("Error in changePassword controller:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

