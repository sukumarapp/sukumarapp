// client/game.js

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const joinUI = document.getElementById('join-ui');
const playerNameInput = document.getElementById('playerNameInput');
const joinBtn = document.getElementById('joinBtn');
const scoreboard = document.getElementById('scoreboard');
const scoreList = document.getElementById('scoreList');

canvas.width = 1200;
canvas.height = 900;

let players = {};
let bullets = [];
let particles = []; // Replaced 'explosions' with 'particles' for debris
let selfId = null;

joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value;
    if (name) {
        socket.emit('joinGame', name);
        joinUI.style.display = 'none';
        canvas.style.display = 'block';
        scoreboard.style.display = 'block';
    }
});

socket.on('gameState', (gameState) => {
    players = gameState.players;
    bullets = gameState.bullets;
    if (!selfId) {
        selfId = socket.id;
    }
    updateScoreboard(players);
});

socket.on('newPlayer', (player) => {
    players[player.id] = player;
});

socket.on('playerDisconnected', (id) => {
    delete players[id];
});

// MODIFIED: This now creates a particle explosion
socket.on('playerDestroyed', (data) => {
    const particleCount = 30; // The number of pieces the box breaks into
    const playerCenterX = data.x + 16; // Center of the 32x32 player box
    const playerCenterY = data.y + 16;

    // Create multiple particles at the player's location
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1; // Random speed for a natural look

        particles.push({
            x: playerCenterX,
            y: playerCenterY,
            vx: Math.cos(angle) * speed, // Velocity on the x-axis
            vy: Math.sin(angle) * speed, // Velocity on the y-axis
            size: Math.random() * 4 + 2, // Each piece has a random size
            color: data.color,           // Use the color of the destroyed player
            life: 1,                     // Represents 100% life, will decrease to 0
            fadeSpeed: Math.random() * 0.03 + 0.01 // How fast the particle fades
        });
    }
});


const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyW') keys['ArrowUp'] = true;
    if (e.code === 'KeyS') keys['ArrowDown'] = true;
    if (e.code === 'KeyA') keys['ArrowLeft'] = true;
    if (e.code === 'KeyD') keys['ArrowRight'] = true;
    socket.emit('playerMovement', keys);
});

window.addEventListener('keyup', (e) => {
    delete keys[e.code];
    if (e.code === 'KeyW') delete keys['ArrowUp'];
    if (e.code === 'KeyS') delete keys['ArrowDown'];
    if (e.code === 'KeyA') delete keys['ArrowLeft'];
    if (e.code === 'KeyD') delete keys['ArrowRight'];
    socket.emit('playerMovement', keys);
});

canvas.addEventListener('mousedown', (e) => {
    if (players[selfId]) {
        const player = players[selfId];
        const angle = Math.atan2(e.clientY - canvas.getBoundingClientRect().top - (player.y + 16), e.clientX - canvas.getBoundingClientRect().left - (player.x + 16));
        socket.emit('shoot', angle);
    }
});


function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw players
    for (let id in players) {
        const player = players[id];
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, 32, 32);

        // Draw name
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x + 16, player.y - 15);

        // Draw health bar
        ctx.fillStyle = 'red';
        ctx.fillRect(player.x, player.y - 10, 32, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(player.x, player.y - 10, 32 * (player.health / 100), 5);
    }

    // Draw bullets
    bullets.forEach(bullet => {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // NEW: Draw and update particles
    // We loop backwards so we can safely remove particles from the array
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Update position based on velocity
        p.x += p.vx;
        p.y += p.vy;
        
        // Add a little friction to slow them down
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Decrease the life of the particle
        p.life -= p.fadeSpeed;

        // If the particle's life is over, remove it
        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            // Otherwise, draw it
            ctx.save();
            ctx.globalAlpha = p.life; // Fades out as its life decreases
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            ctx.restore();
        }
    }

    requestAnimationFrame(draw);
}

function updateScoreboard(players) {
    const playerArray = Object.values(players);
    playerArray.sort((a, b) => (b.kills || 0) - (a.kills || 0));
    scoreList.innerHTML = '';
    playerArray.forEach(player => {
        const listItem = document.createElement('li');
        listItem.textContent = `${player.name}: ${player.kills || 0} kills`;
        scoreList.appendChild(listItem);
    });
}


draw();

