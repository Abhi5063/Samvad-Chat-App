# Samvad Chat Application Setup Guide

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

## Installation Steps

### 1. Install Dependencies

Create a `package.json` file:

```json
{
  "name": "samvad-chat",
  "version": "1.0.0",
  "description": "A modern anonymous group chat application",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5",
    "bcrypt": "^5.1.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

Install packages:

```bash
npm install
```

### 2. MySQL Database Setup

Log into MySQL and create the database:

```sql
CREATE DATABASE samvad_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Update the database credentials in `server.js`:

```javascript
const pool = mysql.createPool({
  host: "localhost",
  user: "your_mysql_username",
  password: "your_mysql_password",
  database: "samvad_chat",
});
```

### 3. Project Structure

```
samvad-chat/
├── server.js           # Backend server
├── package.json        # Dependencies
├── public/
│   └── index.html     # Frontend UI
└── README.md          # This file
```

### 4. Running the Application

Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server will run on `http://localhost:3000`

## API Endpoints

### Authentication

- **POST** `/api/register` - Register new user

  ```json
  {
    "username": "john_doe",
    "password": "securepass",
    "display_name": "John Doe"
  }
  ```

- **POST** `/api/login` - User login
  ```json
  {
    "username": "john_doe",
    "password": "securepass"
  }
  ```

### Groups

- **POST** `/api/groups` - Create new group

  ```json
  {
    "name": "Fun Friday Group",
    "created_by": 1,
    "anonymous_enabled": true
  }
  ```

- **GET** `/api/groups/:userId` - Get user's groups

### Messages

- **GET** `/api/messages/:groupId?limit=50` - Get group messages

## Socket.IO Events

### Client to Server

- `join_group` - Join a group room

  ```javascript
  socket.emit("join_group", groupId);
  ```

- `send_message` - Send a message
  ```javascript
  socket.emit("send_message", {
    group_id: 1,
    user_id: 1,
    message: "Hello!",
    is_anonymous: true,
  });
  ```

### Server to Client

- `new_message` - Receive new message
  ```javascript
  socket.on("new_message", (data) => {
    console.log(data);
  });
  ```

## Frontend Integration

To connect the frontend to the backend, add this to your HTML:

```html
<script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
<script>
  const socket = io("http://localhost:3000");
  const userId = 1; // Get from login
  const groupId = 1; // Current group

  // Join group
  socket.emit("join_group", groupId);

  // Send message
  function sendMessage() {
    const message = document.getElementById("messageInput").value;
    socket.emit("send_message", {
      group_id: groupId,
      user_id: userId,
      message: message,
      is_anonymous: isAnonymous,
    });
  }

  // Receive messages
  socket.on("new_message", (data) => {
    // Add message to chat UI
    displayMessage(data);
  });
</script>
```

## Features

**Implemented Features:**

- Real-time messaging with Socket.IO
- Anonymous messaging toggle
- Group chat functionality
- User authentication with bcrypt
- Message persistence in MySQL
- Responsive mobile-first UI
- Modern gradient design
- Online status indicators

## Security Notes

1. Change default MySQL credentials
2. Use environment variables for sensitive data
3. Implement rate limiting for production
4. Add JWT authentication for better security
5. Use HTTPS in production
6. Sanitize user inputs

## Database Schema

### users

- id (PK)
- username (unique)
- password_hash
- display_name
- created_at

### chat_groups

- id (PK)
- name
- created_by (FK)
- anonymous_enabled
- created_at

### group_members

- id (PK)
- group_id (FK)
