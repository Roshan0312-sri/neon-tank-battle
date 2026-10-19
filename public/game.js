const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let players = {};
let bullets = {};
let obstacles = [];
let boosters = [];
let particles = [];

let player = {
    x: 100,
    y: 100,
    radius: 18,
    name: 'Tanker',
    color: '#00ffcc',
    speed: 3.5,
    score: 0,
    health: 100,
    hullAngle: 0,      
    turretAngle: 0,    
    targetTurretAngle: 0,
    weapon: 'normal',
    powerupStartTime: 0,
    powerupDuration: 6000,
    isDashing: false,
    dashCooldown: 0
};

let keys = {};
let lastShotTime = 0;

// Handle Menu Deploy Button
document.getElementById('startButton').addEventListener('click', () => {
    const nameInput = document.getElementById('playerNameInput').value.trim();
    if (nameInput) {
        player.name = nameInput;
        socket.emit('setPlayerName', nameInput);
    }
    document.getElementById('menuOverlay').style.display = 'none';
});

// ==========================================
// WEB AUDIO SYNTHESIZER
// ==========================================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

window.addEventListener('click', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });

function playShootSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'grenade') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
}

function playDashSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, audioCtx.currentTime);
    filter.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    filter.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.2);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start();
}

function playExplosionSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, audioCtx.currentTime);
    filter.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.4);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start();
}

function playPowerupPickupSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(500, now + 0.08);
    osc.frequency.setValueAtTime(750, now + 0.16);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
}
// ==========================================

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
    }
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    if (socket.id && players[socket.id]) {
        player.x = players[socket.id].x;
        player.y = players[socket.id].y;
        player.color = players[socket.id].color;
        player.score = players[socket.id].score || 0;
        player.health = players[socket.id].health || 100;
        player.hullAngle = players[socket.id].hullAngle || 0;
        player.turretAngle = players[socket.id].turretAngle || 0;
        player.targetTurretAngle = player.turretAngle;
        player.weapon = players[socket.id].weapon || 'normal';
        if (players[socket.id].name) {
            player.name = players[socket.id].name;
        }
    }
});

socket.on('currentObstacles', (serverObstacles) => {
    obstacles = serverObstacles;
});

socket.on('currentBoosters', (serverBoosters) => {
    boosters = serverBoosters;
});

socket.on('boosterSpawned', (serverBoosters) => {
    boosters = serverBoosters;
});

socket.on('boosterTaken', (data) => {
    boosters = data.boosters;
    if (socket.id && data.playerId === socket.id) {
        player.weapon = data.weapon;
        player.powerupStartTime = Date.now();
        player.powerupDuration = data.duration;
        playPowerupPickupSound();
    } else if (players[data.playerId]) {
        players[data.playerId].weapon = data.weapon;
    }
});

socket.on('weaponExpired', (expiredSocketId) => {
    if (socket.id && expiredSocketId === socket.id) {
        player.weapon = 'normal';
    } else if (players[expiredSocketId]) {
        players[expiredSocketId].weapon = 'normal';
    }
});

socket.on('newPlayer', (data) => {
    players[data.id] = data.player;
});

socket.on('playerMoved', (data) => {
    if (socket.id && data.id === socket.id) return;
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
        players[data.id].hullAngle = data.hullAngle;
        players[data.id].turretAngle = data.turretAngle;
    }
});

socket.on('disconnectPlayer', (id) => {
    delete players[id];
});

socket.on('bulletUpdate', (serverBullets) => {
    bullets = serverBullets;
});

socket.on('playerDamaged', (data) => {
    players = data.scores;
    if (socket.id && players[socket.id]) {
        player.x = players[socket.id].x;
        player.y = players[socket.id].y;
        player.score = players[socket.id].score || 0;
        player.health = players[socket.id].health || 100;
    }
    playExplosionSound();
});

socket.on('spawnSparks', (data) => {
    playExplosionSound();
    for (let i = 0; i < data.count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
            x: data.x,
            y: data.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * 2.5 + 1,
            color: data.color || '#ffff00',
            alpha: 1.0,
            decay: Math.random() * 0.04 + 0.02
        });
    }
});

function spawnMuzzleFlash(x, y, weaponType) {
    let color = weaponType === 'laser' ? '#00ffff' : weaponType === 'grenade' ? '#ff6600' : '#ffff00';
    for (let i = 0; i < 5; i++) {
        const angle = (Math.random() - 0.5) * 0.8 + player.turretAngle;
        const speed = Math.random() * 3 + 2;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * 3 + 1.5,
            color: color,
            alpha: 1.0,
            decay: 0.08
        });
    }
}

function spawnDashTrail(x, y, color) {
    particles.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        radius: 14,
        color: color,
        alpha: 0.6,
        decay: 0.05
    });
}

function checkCircleRect(cx, cy, radius, rx, ry, rw, rh) {
    let testX = cx;
    let testY = cy;
    if (cx < rx) testX = rx;
    else if (cx > rx + rw) testX = rx + rw;
    if (cy < ry) testY = ry;
    else if (cy > ry + rh) testY = ry + rh;
    
    let distX = cx - testX;
    let distY = cy - testY;
    return (distX * distX + distY * distY) <= (radius * radius);
}

function lerpAngle(a, b, t) {
    const diff = (b - a) % (Math.PI * 2);
    const shortest = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + shortest * t;
}

function handleInput() {
    let moved = false;
    let currentSpeed = player.speed;

    if (player.dashCooldown > 0) {
        player.dashCooldown--;
    }

    if ((keys['ShiftLeft'] || keys['ShiftRight']) && player.dashCooldown === 0 && !player.isDashing) {
        player.isDashing = true;
        player.dashCooldown = 90; 
        playDashSound();
        setTimeout(() => {
            player.isDashing = false;
        }, 200);
    }

    if (player.isDashing) {
        currentSpeed = player.speed * 3.2;
        spawnDashTrail(player.x, player.y, player.color);
    }

    if (keys['KeyA']) {
        player.hullAngle -= 0.04;
        moved = true;
    }
    if (keys['KeyD']) {
        player.hullAngle += 0.04;
        moved = true;
    }

    let nextX = player.x;
    let nextY = player.y;

    if (keys['KeyW']) {
        nextX += Math.cos(player.hullAngle) * currentSpeed;
        nextY += Math.sin(player.hullAngle) * currentSpeed;
        moved = true;
    }
    if (keys['KeyS']) {
        nextX -= Math.cos(player.hullAngle) * (currentSpeed * 0.6);
        nextY -= Math.sin(player.hullAngle) * (currentSpeed * 0.6);
        moved = true;
    }

    if (moved) {
        if (nextX > player.radius && nextX < canvas.width - player.radius &&
            nextY > player.radius && nextY < canvas.height - player.radius) {
            let collides = obstacles.some(o => checkCircleRect(nextX, nextY, player.radius, o.x, o.y, o.width, o.height));
            if (!collides) {
                player.x = nextX;
                player.y = nextY;
            }
        }
    }

    if (keys['ArrowLeft']) {
        player.targetTurretAngle -= 0.06;
    }
    if (keys['ArrowRight']) {
        player.targetTurretAngle += 0.06;
    }

    player.turretAngle = lerpAngle(player.turretAngle, player.targetTurretAngle, 0.25);

    if (moved || player.isDashing) {
        socket.emit('playerMovement', { 
            x: player.x, 
            y: player.y, 
            hullAngle: player.hullAngle, 
            turretAngle: player.turretAngle 
        });
    }

    let now = Date.now();
    let fireRate = player.weapon === 'grenade' ? 600 : player.weapon === 'laser' ? 150 : 250;
    if (keys['Space'] && now - lastShotTime > fireRate) {
        let vx = Math.cos(player.turretAngle);
        let vy = Math.sin(player.turretAngle);
        let spawnX = player.x + vx * 26;
        let spawnY = player.y + vy * 26;

        socket.emit('shoot', { x: spawnX, y: spawnY, vx, vy, weapon: player.weapon });
        spawnMuzzleFlash(spawnX, spawnY, player.weapon);
        playShootSound(player.weapon);
        lastShotTime = now;
    }
}

function drawObstacles() {
    for (let i = 0; i < obstacles.length; i++) {
        let o = obstacles[i];
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0099ff';
        ctx.fillStyle = '#112233';
        ctx.strokeStyle = '#0099ff';
        ctx.lineWidth = 2;
        ctx.fillRect(o.x, o.y, o.width, o.height);
        ctx.strokeRect(o.x, o.y, o.width, o.height);
        ctx.restore();
    }
}

function drawBoosters() {
    for (let i = 0; i < boosters.length; i++) {
        let b = boosters[i];
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.shadowBlur = 15;
        ctx.shadowColor = b.type === 'laser' ? '#00ffff' : '#ff6600';
        ctx.fillStyle = b.type === 'laser' ? '#00ffff' : '#ff6600';
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.closePath();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.type === 'laser' ? 'L' : 'G', 0, 0);
        ctx.restore();
    }
}

function drawPowerupTimerBar() {
    if (player.weapon === 'normal') return;

    let elapsed = Date.now() - player.powerupStartTime;
    let timeLeft = Math.max(0, player.powerupDuration - elapsed);
    let ratio = timeLeft / player.powerupDuration;

    let barX = 15;
    let barY = 150;
    let barWidth = 12;
    let barHeight = 300;

    ctx.save();
    ctx.fillStyle = '#112233';
    ctx.strokeStyle = player.weapon === 'laser' ? '#00ffff' : '#ff6600';
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    let fillHeight = barHeight * ratio;
    ctx.fillStyle = player.weapon === 'laser' ? '#00ffff' : '#ff6600';
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(barX, barY + (barHeight - fillHeight), barWidth, fillHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.weapon === 'laser' ? 'L' : 'G', barX + barWidth / 2, barY - 10);
    ctx.restore();
}

function drawRealisticTank(p, isLocal = false) {
    if (isLocal && p.weapon !== 'normal') {
        let elapsed = Date.now() - p.powerupStartTime;
        let timeLeft = Math.max(0, p.powerupDuration - elapsed);
        if (timeLeft < 1500) {
            if (Math.floor(Date.now() / 150) % 2 === 0) {
                return;
            }
        }
    }

    let tankColor = p.color || '#00ffcc';

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.turretAngle || 0);

    let r = parseInt(tankColor.slice(1, 3), 16) || 0;
    let g = parseInt(tankColor.slice(3, 5), 16) || 255;
    let b = parseInt(tankColor.slice(5, 7), 16) || 204;
    
    let gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, 180);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 180, -0.35, 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.hullAngle || 0);

    ctx.shadowBlur = 12;
    ctx.shadowColor = tankColor;

    ctx.fillStyle = '#444455';
    ctx.strokeStyle = tankColor;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-20, -16, 40, 8);
    ctx.strokeRect(-20, -16, 40, 8);
    ctx.fillRect(-20, 8, 40, 8);
    ctx.strokeRect(-20, 8, 40, 8);

    ctx.fillStyle = '#161622';
    ctx.strokeStyle = tankColor;
    ctx.lineWidth = 2;
    ctx.fillRect(-15, -10, 30, 20);
    ctx.strokeRect(-15, -10, 30, 20);

    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(15, -5, 2.5, 0, Math.PI * 2);
    ctx.arc(15, 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.turretAngle || 0);

    ctx.shadowBlur = 15;
    ctx.shadowColor = tankColor;

    ctx.fillStyle = tankColor;
    ctx.fillRect(0, -3, 26, 6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, -3, 26, 6);

    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = tankColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.closePath();

    ctx.restore();

    ctx.shadowBlur = 0;

    // Display player custom name and score
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    let displayName = p.name || 'Tanker';
    ctx.fillText(`${displayName} (Scr: ${p.score || 0})`, p.x, p.y - 35);

    const barWidth = 40;
    const barHeight = 5;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(p.x - barWidth / 2, p.y - 28, barWidth, barHeight);

    const healthPercent = Math.max(p.health, 0) / 100;
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(p.x - barWidth / 2, p.y - 28, barWidth * healthPercent, barHeight);
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.restore();
    }
}

function gameLoop() {
    handleInput();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawObstacles();
    drawBoosters();
    drawPowerupTimerBar();

    drawRealisticTank(player, true);

    for (let id in players) {
        if (id !== socket.id) {
            drawRealisticTank(players[id], false);
        }
    }

    for (let id in bullets) {
        let b = bullets[id];
        ctx.beginPath();
        if (b.type === 'laser') {
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#00ffff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffff';
        } else if (b.type === 'grenade') {
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ff6600';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff6600';
        } else {
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffff00';
        }
        ctx.fill();
        ctx.closePath();
    }

    updateAndDrawParticles();

    requestAnimationFrame(gameLoop);
}

gameLoop();