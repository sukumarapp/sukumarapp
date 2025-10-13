// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname + '/client'));

let players = {};
let bullets = [];
let currentPowerUp = null;
let powerUpIndex = 0; // For serial spawning
let gameIntervalId; // To store the ID of the game loop interval
let powerUpTimeoutId; // To store the ID of the power-up spawn timeout

// --- Game Constants ---
const PLAYER_SIZE = 24;
const BULLET_SIZE = 3;
const PLAYER_SPEED = 3;
const BULLET_SPEED = 7;
const PLAYER_HEALTH = 100;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const POWERUP_RESPAWN_DELAY = 3000;

const POWERUP_TYPES = [
    'haste', 'tripleShot', 'smartBomb', 'energyShield', 'medkit',
    'ricochet', 'piercingShot', 'rapidFire'
];

const POWERUP_DURATIONS = {
    haste: 8000,
    tripleShot: 10000,
    energyShield: 15000,
    ricochet: 10000,
    piercingShot: 10000,
    rapidFire: 8000,
};

function spawnPowerUp() {
    if (currentPowerUp) return;

    const type = POWERUP_TYPES[powerUpIndex];
    powerUpIndex = (powerUpIndex + 1) % POWERUP_TYPES.length;

    currentPowerUp = {
        x: Math.floor(Math.random() * (CANVAS_WIDTH - 50)) + 25,
        y: Math.floor(Math.random() * (CANVAS_HEIGHT - 50)) + 25,
        type: type,
        size: 20
    };
    io.emit('powerUpSpawned', currentPowerUp);
}

function applyPowerUp(player, type) {
    console.log(`Applying power-up: ${type} to player: ${player.name}`);
    if (POWERUP_DURATIONS[type]) {
        player.activePowerUp = {
            type: type,
            expires: Date.now() + POWERUP_DURATIONS[type]
        };
        if (type === 'energyShield') player.shieldHealth = 3;
    }

    switch (type) {
        case 'medkit':
            player.health = Math.min(PLAYER_HEALTH, player.health + 50);
            break;
        case 'smartBomb':
            io.emit('smartBombBlast', { x: player.x, y: player.y }); // Emit blast event
            bullets = [];
            for (let id in players) {
                if (player.id !== id) {
                    players[id].health -= 50;
                    if (players[id].health <= 0) handlePlayerDeath(players[id], player);
                }
            }
            break;
    }
}

function handlePlayerDeath(deadPlayer, killerPlayer) {
    if (killerPlayer && killerPlayer.id !== deadPlayer.id) {
        killerPlayer.kills++;
    }
    io.emit('playerDestroyed', { x: deadPlayer.x, y: deadPlayer.y, color: deadPlayer.color });
    deadPlayer.health = PLAYER_HEALTH;
    deadPlayer.x = Math.floor(Math.random() * (CANVAS_WIDTH - PLAYER_SIZE));
    deadPlayer.y = Math.floor(Math.random() * (CANVAS_HEIGHT - PLAYER_SIZE));
    deadPlayer.activePowerUp = null;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinGame', (name) => {
        players[socket.id] = {
            id: socket.id, name, x: 200, y: 200,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            health: PLAYER_HEALTH, kills: 0, keys: {},
            activePowerUp: null, lastShotTime: 0
        };
        // This emit is crucial and only contains variables that are defined
        socket.emit('gameState', { players, bullets, currentPowerUp });
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (keys) => {
        if (players[socket.id]) players[socket.id].keys = keys;
    });

    socket.on('shoot', (angle) => {
        const player = players[socket.id];
        if (!player || player.health <= 0) return;

        const fireRate = (player.activePowerUp?.type === 'rapidFire') ? 100 : 300;
        if (Date.now() - player.lastShotTime < fireRate) return;
        player.lastShotTime = Date.now();

        const bulletCount = (player.activePowerUp?.type === 'tripleShot') ? 3 : 1;
        const spread = Math.PI / 12;

        for (let i = 0; i < bulletCount; i++) {
            const currentAngle = angle + (i - Math.floor(bulletCount / 2)) * spread;
            bullets.push({
                x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2, angle: currentAngle,
                ownerId: socket.id,
                bouncesLeft: (player.activePowerUp?.type === 'ricochet') ? 2 : 0,
                isPiercing: (player.activePowerUp?.type === 'piercingShot'),
                playersHit: []
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('restartGame', () => {
        startGame(); // Restart the game
        io.emit('gameRestarted'); // Optional: emit an event for client-side confirmation/notification
    });

    socket.on('endGame', () => {
        clearInterval(gameIntervalId);
        clearTimeout(powerUpTimeoutId);
        
        const killSummary = Object.values(players).map(player => ({
            name: player.name,
            kills: player.kills
        }));
        io.emit('gameEnded', killSummary);

        players = {}; // Clear players after game ends
        bullets = [];
        currentPowerUp = null;
    });
});

function startGame() {
    for (let id in players) {
        players[id].health = PLAYER_HEALTH;
        players[id].kills = 0;
        players[id].activePowerUp = null;
        players[id].x = Math.floor(Math.random() * (CANVAS_WIDTH - PLAYER_SIZE));
        players[id].y = Math.floor(Math.random() * (CANVAS_HEIGHT - PLAYER_SIZE));
    }
    bullets = [];
    currentPowerUp = null;
    powerUpIndex = 0; // Reset power-up index

    clearInterval(gameIntervalId); // Clear any existing interval
    clearTimeout(powerUpTimeoutId); // Clear any existing timeout

    gameIntervalId = setInterval(gameLoop, 1000 / 60);
    powerUpTimeoutId = setTimeout(spawnPowerUp, POWERUP_RESPAWN_DELAY);
    io.emit('gameState', { players, bullets, currentPowerUp });
}

function gameLoop() {
    for (let id in players) {
        const player = players[id];
        let currentSpeed = PLAYER_SPEED;
        if (player.activePowerUp?.type === 'haste') currentSpeed *= 2.0;
        
        if (player.keys['ArrowUp']) player.y -= currentSpeed;
        if (player.keys['ArrowDown']) player.y += currentSpeed;
        if (player.keys['ArrowLeft']) player.x -= currentSpeed;
        if (player.keys['ArrowRight']) player.x += currentSpeed;

        player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, player.x));
        player.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, player.y));

        if (player.activePowerUp && Date.now() > player.activePowerUp.expires) {
            player.activePowerUp = null;
        }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
        bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

        if (bullet.x < 0 || bullet.x > CANVAS_WIDTH) {
            if (bullet.bouncesLeft > 0) { bullet.angle = Math.PI - bullet.angle; bullet.bouncesLeft--; }
            else { bullets.splice(i, 1); continue; }
        }
        if (bullet.y < 0 || bullet.y > CANVAS_HEIGHT) {
            if (bullet.bouncesLeft > 0) { bullet.angle = -bullet.angle; bullet.bouncesLeft--; }
            else { bullets.splice(i, 1); continue; }
        }

        for (let id in players) {
            const player = players[id];
            if (bullet.ownerId !== id && !bullet.playersHit.includes(id)) {
                if (Math.hypot(bullet.x - (player.x + 16), bullet.y - (player.y + 16)) < PLAYER_SIZE / 2) {
                    if (player.activePowerUp?.type === 'energyShield' && player.shieldHealth > 0) {
                        player.shieldHealth--;
                        if (player.shieldHealth <= 0) player.activePowerUp = null;
                    } else {
                        player.health -= 10;
                    }
                    if (!bullet.isPiercing) { bullets.splice(i, 1); }
                    else { bullet.playersHit.push(id); }
                    if (player.health <= 0) handlePlayerDeath(player, players[bullet.ownerId]);
                    break;
                }
            }
        }
    }

    if (currentPowerUp) {
        for (let id in players) {
            const player = players[id];
            if (Math.hypot(currentPowerUp.x - (player.x + 16), currentPowerUp.y - (player.y + 16)) < 36) {
                applyPowerUp(player, currentPowerUp.type);
                io.emit('powerUpCollected', { playerName: player.name, type: currentPowerUp.type });
                currentPowerUp = null;
                setTimeout(spawnPowerUp, POWERUP_RESPAWN_DELAY);
                break;
            }
        }
    }

    io.emit('gameState', { players, bullets, currentPowerUp });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startGame(); // Initial game start
});