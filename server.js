// server.js - Node.js Backend with Socket.IO and MySQL
const express = require("express");
const mysql = require("mysql2/promise");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "your_password",
  database: "samvad_chat",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Database Schema Setup
async function setupDatabase() {
  const connection = await pool.getConnection();

  try {
    // Create users table
    await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create groups table
    await connection.query(`
            CREATE TABLE IF NOT EXISTS chat_groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_by INT,
                anonymous_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

    // Create group members table
    await connection.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_membership (group_id, user_id)
            )
        `);

    // Create messages table
    await connection.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                is_anonymous BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_group_created (group_id, created_at)
            )
        `);

    console.log("Database tables created successfully");
  } catch (error) {
    console.error("Database setup error:", error);
  } finally {
    connection.release();
  }
}

setupDatabase();

// API Routes

// Register new user
app.post("/api/register", async (req, res) => {
  const { username, password, display_name } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
      [username, hashedPassword, display_name || username]
    );

    res.json({ success: true, userId: result.insertId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (users.length === 0) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create group
app.post("/api/groups", async (req, res) => {
  const { name, created_by, anonymous_enabled } = req.body;

  try {
    const [result] = await pool.query(
      "INSERT INTO chat_groups (name, created_by, anonymous_enabled) VALUES (?, ?, ?)",
      [name, created_by, anonymous_enabled || false]
    );

    // Add creator to group
    await pool.query(
      "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
      [result.insertId, created_by]
    );

    res.json({ success: true, groupId: result.insertId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get user's groups
app.get("/api/groups/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const [groups] = await pool.query(
      `
            SELECT g.*, 
                   (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
            FROM chat_groups g
            INNER JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.created_at DESC
        `,
      [userId]
    );

    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a group
app.get("/api/messages/:groupId", async (req, res) => {
  const { groupId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const [messages] = await pool.query(
      `
            SELECT m.*, u.display_name, u.username
            FROM messages m
            INNER JOIN users u ON m.user_id = u.id
            WHERE m.group_id = ?
            ORDER BY m.created_at DESC
            LIMIT ?
        `,
      [groupId, parseInt(limit)]
    );

    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO for real-time messaging
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join_group", (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`Socket ${socket.id} joined group ${groupId}`);
  });

  socket.on("send_message", async (data) => {
    const { group_id, user_id, message, is_anonymous } = data;

    try {
      const [result] = await pool.query(
        "INSERT INTO messages (group_id, user_id, message, is_anonymous) VALUES (?, ?, ?, ?)",
        [group_id, user_id, message, is_anonymous || false]
      );

      // Get sender info
      const [users] = await pool.query(
        "SELECT display_name, username FROM users WHERE id = ?",
        [user_id]
      );

      const messageData = {
        id: result.insertId,
        group_id,
        user_id,
        message,
        is_anonymous,
        display_name: is_anonymous ? "Anonymous" : users[0].display_name,
        username: is_anonymous ? "Anonymous" : users[0].username,
        created_at: new Date(),
      };

      // Broadcast to all users in the group
      io.to(`group_${group_id}`).emit("new_message", messageData);
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("message_error", { error: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Samvad Chat Server running on port ${PORT}`);
});

// Export for testing
module.exports = { app, io };
