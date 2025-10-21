// client/game.js

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const joinUI = document.getElementById('join-ui');
const playerNameInput = document.getElementById('playerNameInput');
const joinBtn = document.getElementById('joinBtn');
const scoreboard = document.getElementById('scoreboard');
const scoreList = document.getElementById('scoreList');
const restartBtn = document.getElementById('restartBtn');
const endGameBtn = document.getElementById('endGameBtn');
const gameControls = document.getElementById('game-controls');
const developerInfo = document.querySelector('.developer-info');
const muteBtn = document.getElementById('muteBtn');

canvas.width = 1200;
canvas.height = 900;

let players = {};
let bullets = [];
let particles = [];
let shockwaves = []; // For the Smart Bomb animation
let currentPowerUp = null;
let selfId = null;
let notification = { text: '', alpha: 0, fadeSpeed: 0.005 };

let animationFrameId = null; // To store the ID of the requestAnimationFrame

const backgroundMusic = new Audio('assets/audio/background_music.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.1;
let isMuted = false;

const powerUpCollectSound = new Audio('assets/audio/powerup_collect.mp3');
powerUpCollectSound.volume = 0.5;

const smartBombBlastSound = new Audio('assets/audio/bomb_blast.mp3');
smartBombBlastSound.volume = 0.7;

const playerDestroyedSound = new Audio('assets/audio/player_destroyed.mp3');
playerDestroyedSound.volume = 0.5;

const POWERUP_VISUALS = {
    haste: { color: '#80D8FF', symbol: 'S' },
    tripleShot: { color: '#FFD700', symbol: '3' },
    smartBomb: { color: '#FF4081', symbol: 'B' },
    energyShield: { color: '#40C4FF', symbol: 'E' },
    medkit: { color: '#69F0AE', symbol: '+' },
    ricochet: { color: '#B388FF', symbol: 'R' },
    piercingShot: { color: '#FFAB40', symbol: 'P' },
    rapidFire: { color: '#FFFF00', symbol: 'F' }
};

function formatPowerUpName(type) {
    const names = {
        haste: 'Haste', tripleShot: 'Triple Shot', smartBomb: 'Smart Bomb',
        energyShield: 'Energy Shield', medkit: 'Medkit', ricochet: 'Ricochet Shots',
        piercingShot: 'Piercing Shot', rapidFire: 'Rapid Fire'
    };
    return names[type] || 'Unknown Power-up';
}

joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value;
    if (name) {
        socket.emit('joinGame', name);
        joinUI.style.display = 'none';
        developerInfo.style.display = 'none'; // Hide developer info
        canvas.style.display = 'block';
        scoreboard.style.display = 'block';
        backgroundMusic.play();
        animationFrameId = requestAnimationFrame(draw); // Start the game loop
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('keydown', handleGameControlsToggle);
    }
});

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
        backgroundMusic.volume = 0;
        muteBtn.textContent = 'Unmute Music';
    } else {
        backgroundMusic.volume = 0.05;
        muteBtn.textContent = 'Mute Music';
    }
    socket.emit('toggleMute', isMuted);
});

socket.on('muteToggled', (muted) => {
    isMuted = muted;
    if (isMuted) {
        backgroundMusic.volume = 0;
        muteBtn.textContent = 'Unmute Music';
    } else {
        backgroundMusic.volume = 0.05;
        muteBtn.textContent = 'Mute Music';
    }
});

socket.on('gameState', (gameState) => {
    players = gameState.players;
    bullets = gameState.bullets;
    currentPowerUp = gameState.currentPowerUp;
    if (!selfId) selfId = socket.id;
    updateScoreboard(players);
});

socket.on('newPlayer', (player) => { players[player.id] = player; });
socket.on('playerDisconnected', (id) => { delete players[id]; });

socket.on('playerDestroyed', (data) => {
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
            x: data.x + 12, y: data.y + 12,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            size: Math.random() * 4 + 2, color: data.color,
            life: 1, fadeSpeed: Math.random() * 0.03 + 0.01
        });
    }
    playerDestroyedSound.play();
});

socket.on('powerUpSpawned', (powerUp) => { currentPowerUp = powerUp; });

socket.on('powerUpCollected', (data) => {
    currentPowerUp = null;
    notification.text = `${data.playerName} received ${formatPowerUpName(data.type)}!`;
    notification.alpha = 1.5;
    powerUpCollectSound.play();
});

socket.on('smartBombBlast', (data) => {
    shockwaves.push({
        x: data.x + 16, y: data.y + 16,
        startTime: Date.now(),
        duration: 500,
        maxRadius: 300
    });
    smartBombBlastSound.play();
});

socket.on('gameEnded', (killSummary) => {
    cancelAnimationFrame(animationFrameId);
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    canvas.removeEventListener('mousedown', handleMouseDown);

    localStorage.setItem('killSummary', JSON.stringify(killSummary));
    window.location.href = 'summary.html';
});

const keys = {};
const handleKeyDown = (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyW') keys['ArrowUp'] = true;
    if (e.code === 'KeyS') keys['ArrowDown'] = true;
    if (e.code === 'KeyA') keys['ArrowLeft'] = true;
    if (e.code === 'KeyD') keys['ArrowRight'] = true;
    socket.emit('playerMovement', keys);
};
const handleKeyUp = (e) => {
    delete keys[e.code];
    if (e.code === 'KeyW') delete keys['ArrowUp'];
    if (e.code === 'KeyS') delete keys['ArrowDown'];
    if (e.code === 'KeyA') delete keys['ArrowLeft'];
    if (e.code === 'KeyD') delete keys['ArrowRight'];
    socket.emit('playerMovement', keys);
};
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

const handleMouseDown = (e) => {
    if (players[selfId]) {
        const player = players[selfId];
        const angle = Math.atan2(e.clientY - canvas.getBoundingClientRect().top - (player.y + 12), e.clientX - canvas.getBoundingClientRect().left - (player.x + 12));
        socket.emit('shoot', angle);
    }
};
canvas.addEventListener('mousedown', handleMouseDown);

restartBtn.addEventListener('click', () => {
    socket.emit('restartGame');
    notification.text = 'Game restarted by a player!';
    notification.alpha = 1.5;
});

endGameBtn.addEventListener('click', () => {
    socket.emit('endGame');
});

function handleGameControlsToggle(event) {
    if (event.ctrlKey && event.key === 'm') {
        event.preventDefault();
        if (gameControls.style.display === 'none' || gameControls.style.display === '') {
            gameControls.style.display = 'flex';
        } else {
            gameControls.style.display = 'none';
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Shockwaves (for Smart Bomb)
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const wave = shockwaves[i];
        const elapsed = Date.now() - wave.startTime;
        const progress = elapsed / wave.duration;

        if (progress >= 1) {
            shockwaves.splice(i, 1);
            continue;
        }

        const currentRadius = wave.maxRadius * progress;
        const alpha = 1 - progress;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = POWERUP_VISUALS.smartBomb.color;
        ctx.lineWidth = 5 * (1 - progress);
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Draw Power-up Item
    if (currentPowerUp) {
        const visual = POWERUP_VISUALS[currentPowerUp.type];
        if (!visual) {
            console.error("Attempted to draw unknown power-up type:", currentPowerUp.type);
            return;
        }
        const time = Date.now();
        const waveProgress = (time % 2000) / 2000;
        const waveRadius = waveProgress * 40;
        const waveAlpha = 1 - waveProgress;
        ctx.save();
        ctx.globalAlpha = waveAlpha;
        ctx.strokeStyle = visual.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(currentPowerUp.x, currentPowerUp.y, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const blinkValue = 0.75 + Math.sin(time / 200) * 0.25;
        ctx.save();
        ctx.globalAlpha = blinkValue;
        ctx.fillStyle = visual.color;
        ctx.beginPath();
        ctx.arc(currentPowerUp.x, currentPowerUp.y, currentPowerUp.size / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        ctx.fillStyle = 'black';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(visual.symbol, currentPowerUp.x, currentPowerUp.y);
    }

    // Draw players
    for (let id in players) {
        const player = players[id];

        // --- NEW BOT DRAWING LOGIC ---
        const headRadius = 12;
        const bodyHeight = 12;
        const headCenterY = player.y + headRadius;
        const bodyY = player.y + headRadius;

        // Draw Body (Rectangle)
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, bodyY, 24, bodyHeight);

        // Draw Head (Half-Circle)
        ctx.beginPath();
        ctx.arc(player.x + headRadius, headCenterY, headRadius, Math.PI, 0);
        ctx.fill();

        // Draw Eyes (Two White Circles with Pupils)
        const eyeY = player.y + headRadius - 2;
        const eyeOffsetX = 6;
        const eyeRadius = 3;
        const pupilRadius = 1;

        // Left Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(player.x + headRadius - eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(player.x + headRadius - eyeOffsetX, eyeY, pupilRadius, 0, Math.PI * 2);
        ctx.fill();

        // Right Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(player.x + headRadius + eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(player.x + headRadius + eyeOffsetX, eyeY, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
        // --- END OF BOT DRAWING LOGIC ---

        // Draw power-up cues
        if (player.activePowerUp) {
            const cueType = player.activePowerUp.type;
            if (cueType === 'energyShield') {
                ctx.strokeStyle = POWERUP_VISUALS.energyShield.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(player.x + 12, player.y + 12, 17, 0, Math.PI * 2);
                ctx.stroke();
            } else if (['haste', 'rapidFire', 'tripleShot', 'ricochet', 'piercingShot'].includes(cueType)) {
                ctx.strokeStyle = POWERUP_VISUALS[cueType].color;
                ctx.lineWidth = 2;
                ctx.strokeRect(player.x - 1, player.y - 1, 26, 26);
            }
        }
        
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x + 12, player.y - 15);
        
        ctx.fillStyle = 'red';
        ctx.fillRect(player.x, player.y - 10, 24, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(player.x, player.y - 10, 24 * (player.health / 100), 5);
    }
    
    // Draw bullets
    bullets.forEach(bullet => {
        ctx.fillStyle = bullet.isPiercing ? 'orange' : (bullet.bouncesLeft > 0 ? '#B388FF' : 'yellow');
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.99; p.vy *= 0.99;
        p.life -= p.fadeSpeed;
        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            ctx.restore();
        }
    }

    // Draw Notification
    if (notification.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, notification.alpha);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 5;
        ctx.fillText(notification.text, canvas.width / 2, 50);
        ctx.restore();
        notification.alpha -= notification.fadeSpeed;
    }

    requestAnimationFrame(draw);
}

function updateScoreboard(players) {
    const playerArray = Object.values(players);
    playerArray.sort((a, b) => (b.kills || 0) - (a.kills || 0));
    scoreList.innerHTML = '';
    playerArray.forEach(player => {
        const listItem = document.createElement('li');
        listItem.textContent = `${player.name}: ${player.kills || 0} Eliminations`;
        scoreList.appendChild(listItem);
    });
}

// Initial draw call in case the game loop hasn't started
draw();