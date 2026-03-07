import { json } from "@sveltejs/kit";
import dotenv from "dotenv";

dotenv.config();

export function GET() {
    return json({
        owner: process.env.TARGET_OWNER ?? "",
        repo:  process.env.TARGET_REPO  ?? ""
    });
}
