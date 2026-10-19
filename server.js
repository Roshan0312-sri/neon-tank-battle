const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const bullets = {};
let boosters = [];
const boosterTimeouts = {};
let bulletIdCounter = 0;

const neonColors = ['#00ffcc', '#ff0055', '#ffff00', '#0099ff', '#ff6600', '#cc00ff', '#33ff00'];

const levels = [
    // Level 1: Classic Arena (Balanced)
    [
        { x: 200, y: 150, width: 120, height: 30 },
        { x: 500, y: 100, width: 30, height: 140 },
        { x: 350, y: 350, width: 100, height: 30 },
        { x: 150, y: 420, width: 30, height: 100 },
        { x: 600, y: 400, width: 120, height: 30 }
    ],
    // Level 2: Maze Corridors (Tight pathways)
    [
        { x: 150, y: 150, width: 200, height: 25 },
        { x: 450, y: 150, width: 200, height: 25 },
        { x: 150, y: 400, width: 200, height: 25 },
        { x: 450, y: 400, width: 200, height: 25 },
        { x: 380, y: 220, width: 40, height: 160 }
    ],
    // Level 3: Open Warfare (Pillars & Cover)
    [
        { x: 200, y: 150, width: 40, height: 40 },
        { x: 560, y: 150, width: 40, height: 40 },
        { x: 360, y: 260, width: 80, height: 80 },
        { x: 200, y: 410, width: 40, height: 40 },
        { x: 560, y: 410, width: 40, height: 40 }
    ]
];

let currentLevelIndex = 0;
let obstacles = levels[currentLevelIndex];

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

function switchLevel() {
    currentLevelIndex = (currentLevelIndex + 1) % levels.length;
    obstacles = levels[currentLevelIndex];

    boosters = [];
    for (let id in boosterTimeouts) {
        clearTimeout(boosterTimeouts[id]);
        delete boosterTimeouts[id];
    }

    io.emit('currentObstacles', obstacles);
    io.emit('boosterSpawned', boosters);

    for (let id in players) {
        let p = players[id];
        do {
            p.x = Math.random() * 600 + 100;
            p.y = Math.random() * 400 + 100;
        } while (obstacles.some(o => checkCircleRect(p.x, p.y, p.radius, o.x, o.y, o.width, o.height)));
    }
    io.emit('currentPlayers', players);
}

setInterval(switchLevel, 120000);

function spawnBooster() {
    if (boosters.length === 0) {
        let bx, by, colliding;
        do {
            bx = Math.random() * 700 + 50;
            by = Math.random() * 500 + 50;
            colliding = obstacles.some(o => checkCircleRect(bx, by, 15, o.x, o.y, o.width, o.height));
        } while (colliding);

        const boosterId = Math.random();
        const type = Math.random() > 0.5 ? 'laser' : 'grenade';
        
        const newBooster = { 
            id: boosterId, 
            x: bx, 
            y: by, 
            type: type, 
            radius: 12
        };

        boosterTimeouts[boosterId] = setTimeout(() => {
            const index = boosters.findIndex(b => b.id === boosterId);
            if (index !== -1) {
                boosters.splice(index, 1);
                delete boosterTimeouts[boosterId];
                io.emit('boosterSpawned', boosters);
            }
        }, 8000);

        boosters.push(newBooster);
        io.emit('boosterSpawned', boosters);
    }
    
    const nextSpawnTime = Math.floor(Math.random() * (23000 - 17000 + 1)) + 17000;
    setTimeout(spawnBooster, nextSpawnTime);
}

const initialDelay = Math.floor(Math.random() * (23000 - 17000 + 1)) + 17000;
setTimeout(spawnBooster, initialDelay);

io.on('connection', (socket) => {
    console.log(`A player connected: ${socket.id}`);

    const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];

    let spawnX, spawnY, colliding;
    do {
        spawnX = Math.random() * 600 + 100;
        spawnY = Math.random() * 400 + 100;
        colliding = obstacles.some(o => checkCircleRect(spawnX, spawnY, 18, o.x, o.y, o.width, o.height));
    } while (colliding);

    players[socket.id] = {
        x: spawnX,
        y: spawnY,
        radius: 18,
        name: 'Tanker',
        color: randomColor,
        score: 0,
        health: 100,
        hullAngle: 0,
        turretAngle: 0,
        weapon: 'normal',
        powerupTimer: null
    };

    socket.on('setPlayerName', (customName) => {
        if (customName && typeof customName === 'string') {
            players[socket.id].name = customName.trim().substring(0, 12);
            io.emit('currentPlayers', players);
        }
    });

    socket.emit('currentPlayers', players);
    socket.emit('currentObstacles', obstacles);
    socket.emit('currentBoosters', boosters);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            const collides = obstacles.some(o => checkCircleRect(movementData.x, movementData.y, players[socket.id].radius, o.x, o.y, o.width, o.height));
            if (!collides) {
                players[socket.id].x = movementData.x;
                players[socket.id].y = movementData.y;
                players[socket.id].hullAngle = movementData.hullAngle;
                players[socket.id].turretAngle = movementData.turretAngle;

                for (let i = boosters.length - 1; i >= 0; i--) {
                    let b = boosters[i];
                    let dist = Math.hypot(players[socket.id].x - b.x, players[socket.id].y - b.y);
                    if (dist < players[socket.id].radius + b.radius) {
                        players[socket.id].weapon = b.type;
                        
                        if (boosterTimeouts[b.id]) {
                            clearTimeout(boosterTimeouts[b.id]);
                            delete boosterTimeouts[b.id];
                        }
                        
                        boosters.splice(i, 1);

                        if (players[socket.id].powerupTimer) {
                            clearTimeout(players[socket.id].powerupTimer);
                        }

                        players[socket.id].powerupTimer = setTimeout(() => {
                            if (players[socket.id]) {
                                players[socket.id].weapon = 'normal';
                                io.emit('weaponExpired', socket.id);
                            }
                        }, 6000);

                        io.emit('boosterTaken', { 
                            boosters: boosters, 
                            playerId: socket.id, 
                            weapon: b.type, 
                            duration: 6000 
                        });
                        break;
                    }
                }

                socket.broadcast.emit('playerMoved', { 
                    id: socket.id, 
                    x: movementData.x, 
                    y: movementData.y, 
                    hullAngle: movementData.hullAngle,
                    turretAngle: movementData.turretAngle
                });
            }
        }
    });

    socket.on('shoot', (bulletData) => {
        const id = bulletIdCounter++;
        let speedMultiplier = 8;
        let radius = 4;

        if (bulletData.weapon === 'laser') {
            speedMultiplier = 18;
            radius = 2.5;
        } else if (bulletData.weapon === 'grenade') {
            speedMultiplier = 3.5;
            radius = 7;
        }

        bullets[id] = {
            x: bulletData.x,
            y: bulletData.y,
            vx: bulletData.vx * speedMultiplier,
            vy: bulletData.vy * speedMultiplier,
            playerId: socket.id,
            radius: radius,
            type: bulletData.weapon
        };
    });

    socket.on('disconnect', () => {
        console.log(`A player disconnected: ${socket.id}`);
        if (players[socket.id] && players[socket.id].powerupTimer) {
            clearTimeout(players[socket.id].powerupTimer);
        }
        delete players[socket.id];
        io.emit('disconnectPlayer', socket.id);
    });
});

setInterval(() => {
    for (let id in bullets) {
        let b = bullets[id];
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
            delete bullets[id];
            continue;
        }

        let hitWall = false;
        for (let i = 0; i < obstacles.length; i++) {
            let o = obstacles[i];
            if (checkCircleRect(b.x, b.y, b.radius, o.x, o.y, o.width, o.height)) {
                delete bullets[id];
                hitWall = true;
                const sparkColor = b.type === 'laser' ? '#00ffff' : b.type === 'grenade' ? '#ff6600' : '#0099ff';
                io.emit('spawnSparks', { x: b.x, y: b.y, color: sparkColor, count: b.type === 'grenade' ? 16 : 6 });
                break;
            }
        }
        if (hitWall) continue;

        for (let playerId in players) {
            let p = players[playerId];
            if (b.playerId !== playerId) {
                let dist = Math.hypot(b.x - p.x, b.y - p.y);
                if (dist < p.radius + b.radius) {
                    let damage = b.type === 'grenade' ? 50 : b.type === 'laser' ? 35 : 25;
                    p.health -= damage;
                    delete bullets[id];

                    io.emit('spawnSparks', { x: b.x, y: b.y, color: '#ff0055', count: 12 });

                    if (p.health <= 0) {
                        p.health = 100;
                        do {
                            p.x = Math.random() * 600 + 100;
                            p.y = Math.random() * 400 + 100;
                        } while (obstacles.some(o => checkCircleRect(p.x, p.y, p.radius, o.x, o.y, o.width, o.height)));

                        if (players[b.playerId]) {
                            players[b.playerId].score += 1;
                        }
                    }

                    io.emit('playerDamaged', { scores: players });
                    break;
                }
            }
        }
    }

    io.emit('bulletUpdate', bullets);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});