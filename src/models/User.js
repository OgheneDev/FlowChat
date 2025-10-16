import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email:{
        type: String,
        required: true,
        unique: true
    },
    fullName:{
        type: String,
        required: true,
    },
    password:{
        type: String,
        required: true,
        minlenght: 8
    },
    profilePic:{
        type: String,
        default: ""
    },
    online: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: null
    },
    starredMessages: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Message" }
    ],
    starredChats: [
       { type: mongoose.Schema.Types.ObjectId, ref: "Chat" }
    ],
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },
}, {timestamps: true} // CreatedAt & UpdatedAt
);

userSchema.index({ fullName: "text", email: "text" });

const User = mongoose.model("User", userSchema);

export default User