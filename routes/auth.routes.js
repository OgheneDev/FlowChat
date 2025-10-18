import express from "express";
const router = express.Router();
import { check } from "express-validator";
import { signup, login, logout, updateProfile, forgotPassword, resetPassword } from "../src/controllers/auth.controller.js";
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

// Forgot Password Route
router.post(
    "/forgot-password",
    [
        check("email", "Please include a valid email").isEmail().notEmpty(),
    ],
    forgotPassword
);

// Reset Password Route
router.put(
    "/reset-password/:resetToken",
    [
        check("password", "Please enter a password with 8 or more characters")
            .isLength({ min: 8 })
            .notEmpty(),
    ], 
    resetPassword
);

export const authRouter = router;