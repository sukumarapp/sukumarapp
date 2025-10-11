// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve the client-side files from the 'client' directory
app.use(express.static(__dirname + '/client'));

let players = {};
let bullets = [];

// --- Game Constants ---
const PLAYER_SIZE = 32;
const BULLET_SIZE = 5;
const PLAYER_SPEED = 3;   // Increased speed slightly for the larger canvas
const BULLET_SPEED = 7;
const PLAYER_HEALTH = 100;
const CANVAS_WIDTH = 1200;  // Match the client-side canvas dimensions
const CANVAS_HEIGHT = 900;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a player joins with their name
    socket.on('joinGame', (name) => {
        players[socket.id] = {
            x: Math.floor(Math.random() * (CANVAS_WIDTH - PLAYER_SIZE)),
            y: Math.floor(Math.random() * (CANVAS_HEIGHT - PLAYER_SIZE)),
            id: socket.id,
            name: name,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`, // Assign a random color
            health: PLAYER_HEALTH,
            kills: 0, // Initialize kills for the scoreboard
            keys: {}  // To store which keys are currently pressed
        };
        console.log(`${name} (ID: ${socket.id}) joined the game.`);

        // Send the complete game state to the new player
        socket.emit('gameState', { players, bullets });
        // Inform all other players about the new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // Handle player movement input from the client
    socket.on('playerMovement', (keys) => {
        if (players[socket.id]) {
            players[socket.id].keys = keys;
        }
    });

    // Handle a player shooting
    socket.on('shoot', (angle) => {
        if (players[socket.id] && players[socket.id].health > 0) {
            const player = players[socket.id];
            bullets.push({
                x: player.x + PLAYER_SIZE / 2,
                y: player.y + PLAYER_SIZE / 2,
                angle: angle,
                ownerId: socket.id,
                id: Math.random() // Simple unique ID for the bullet
            });
        }
    });

    // Handle a player disconnecting from the game
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`${players[socket.id].name} (ID: ${socket.id}) disconnected.`);
            delete players[socket.id];
            // Inform all other clients that this player has left
            io.emit('playerDisconnected', socket.id);
        } else {
            console.log('An unknown user disconnected:', socket.id);
        }
    });
});

// --- Server-Side Game Loop ---
function gameLoop() {
    // 1. Update Player Positions
    for (let id in players) {
        const player = players[id];
        if (player.keys['ArrowUp']) player.y -= PLAYER_SPEED;
        if (player.keys['ArrowDown']) player.y += PLAYER_SPEED;
        if (player.keys['ArrowLeft']) player.x -= PLAYER_SPEED;
        if (player.keys['ArrowRight']) player.x += PLAYER_SPEED;

        // Add boundary checks to keep players on the canvas
        if (player.y < 0) player.y = 0;
        if (player.y > CANVAS_HEIGHT - PLAYER_SIZE) player.y = CANVAS_HEIGHT - PLAYER_SIZE;
        if (player.x < 0) player.x = 0;
        if (player.x > CANVAS_WIDTH - PLAYER_SIZE) player.x = CANVAS_WIDTH - PLAYER_SIZE;
    }

    // 2. Update Bullet Positions and Check for Collisions
    // Loop backwards to safely remove items from the array while iterating
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
        bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

        // Remove bullet if it goes off-screen
        if (bullet.x < 0 || bullet.x > CANVAS_WIDTH || bullet.y < 0 || bullet.y > CANVAS_HEIGHT) {
            bullets.splice(i, 1);
            continue; // Skip to the next bullet
        }

        // Check for bullet-player collision
        for (let id in players) {
            const player = players[id];
            // A player can't shoot themselves
            if (bullet.ownerId !== id) {
                const distance = Math.hypot(
                    bullet.x - (player.x + PLAYER_SIZE / 2),
                    bullet.y - (player.y + PLAYER_SIZE / 2)
                );

                if (distance < PLAYER_SIZE / 2 + BULLET_SIZE / 2) {
                    player.health -= 10;
                    bullets.splice(i, 1); // Remove bullet on hit

                    // Check if the player is destroyed
                    if (player.health <= 0) {
                        // Emit the event for the client-side particle explosion
                        io.emit('playerDestroyed', { x: player.x, y: player.y, color: player.color });

                        // Award a kill to the bullet's owner
                        const killer = players[bullet.ownerId];
                        if (killer) {
                            killer.kills++;
                        }

                        // Respawn the destroyed player
                        player.x = Math.floor(Math.random() * (CANVAS_WIDTH - PLAYER_SIZE));
                        player.y = Math.floor(Math.random() * (CANVAS_HEIGHT - PLAYER_SIZE));
                        player.health = PLAYER_HEALTH;
                    }
                    break; // Exit player loop since the bullet is gone
                }
            }
        }
    }

    // 3. Broadcast the updated game state to all clients
    io.emit('gameState', { players, bullets });
}

// Run the game loop 60 times per second (approx. 16.67ms per frame)
setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});