import mongoose from "mongoose";
import { config } from "./config.js";


async function connectToDb() {
    try {
        await mongoose.connect(config.MONGO_URI);
        console.log(" Database connected successfully");
    } catch (error) {
        console.error(" Database connection error:", error);
        throw error;
    }
}
export default connectToDb