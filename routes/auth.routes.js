import express from "express";
const router = express.Router();
import { check } from "express-validator";
import { signup, login, logout, updateProfile, forgotPassword, resetPassword, deleteAccount, changePassword } from "../src/controllers/auth.controller.js";
import { protect } from "../src/middleware/auth.middleware.js";

router.post(
    "/signup",
    [
        check("fullName", "Full name is required").notEmpty(),
        check("email", "Please include a valid email").isEmail(),
        check("password", "Please enter a password with 8 or more characters").isLength({ min: 8 }),
    ],
    signup
);

router.post(
    "/login",
    login
);

router.post( 
    "/logout",
    logout
);

router.put(
    "/update-profile",
    protect,
    updateProfile
);

router.get(
    "/check",
    protect,
    (req, res) => res.status(200).json(req.user)
);

router.delete(
    "/delete",
    protect,
    deleteAccount
)

router.post(
    "/forgot-password",
    [
        check("email", "Please include a valid email").isEmail().notEmpty(),
    ],
    forgotPassword
);

router.put(
    "/reset-password/:resetToken",
    [
        check("password", "Please enter a password with 8 or more characters")
            .isLength({ min: 8 })
            .notEmpty(),
    ], 
    resetPassword
);

router.put(
    "/change-password",
    protect,
    [
        check("currentPassword", "Current password is required").notEmpty(),
        check("newPassword", "Please enter a new password with 8 or more characters")
            .isLength({ min: 8 })
            .notEmpty(),
    ],
    changePassword
);

export const authRouter = router;