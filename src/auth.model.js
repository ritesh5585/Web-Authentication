import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        minlength: [3, "Email must be at least 3 characters long"],
    },
    contact: {
        type: String,
        required: false,
        trim: true,
    },
    password: {
        type: String,
        required: function () {
            return !this.googleId;
        },
    },
    refreshToken: {
        type: String,
        default: null,
    },
    resetToken: {
        type: String,
        default: null,
    },
    resetTokenExpiry: {
        type: Date,
        default: null,
    },
    fullname: {
        type: String,
        required: true,
    },
    googleId: {
        type: String,
        default: null,
    },
    profilepic: {
        type: String,
        default: null,
    },
}, { timestamps: true });

userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

const userModel = mongoose.model("auth", userSchema);
export default userModel;