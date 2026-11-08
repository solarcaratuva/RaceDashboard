import { io } from "socket.io-client";

// Replace with your Flask server URL
const URL = "http://localhost:5500"; 
export const socket = io(URL);