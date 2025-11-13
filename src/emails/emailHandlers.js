import { resendClient, sender } from "../lib/resend.js";
import { createWelcomeEmailTemplate } from "./emailsTemplate.js";
import nodemailer from "nodemailer";

export const sendWelcomeEmail = async (email, name, clientUrl) => {
  const { data, error } = await resendClient.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to: email,
    subject: "Welcome to FlowChat",
    html: createWelcomeEmailTemplate(name, clientUrl),
  });

  if (error) {
    console.error("Error sending welcome email:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      response: error.response?.data,
    });
    throw new Error("Failed to send welcome email");
  }

  console.log("Welcome email sent successfully", data);
};

// ✅ Corrected transporter creation
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendPasswordResetEmail = async (email, token, clientUrl) => {
  try {
    const resetUrl = `${clientUrl}/reset-password/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Password reset email sent successfully");
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};
