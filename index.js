const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const express = require('express');
const app = express();

let bot;
let reconnectTimeout;

// 1. Web server setup (Required for Railway's self-ping)
const PORT = process.env.PORT || 5000;
app.get('/ping', (req, res) => res.send('Pong!'));
app.listen(PORT, () => console.log(`Web dashboard running on port ${PORT}`));

function createBot() {
    console.log("Spawning a fresh bot instance...");

    // Clean up any lingering reconnection timers
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    bot = mineflayer.createBot({
        host: process.env.BOT_HOST || 'your.server.ip',
        port: parseInt(process.env.BOT_PORT) || 25565,
        username: process.env.BOT_USERNAME || 'HostingBot',
        version: false // Auto-detect version
    });

    // Load plugins
    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
        console.log(`Bot joined successfully as ${bot.username}`);
        
        // Simple Anti-AFK (Swings arm every 15 seconds)
        const afkInterval = setInterval(() => {
            if (bot && bot.entity) {
                bot.swingArm('right');
            }
        }, 15000);

        // Clear this interval when the bot ends
        bot.once('end', () => clearInterval(afkInterval));
    });

    // Handle bot disconnection
    bot.once('end', (reason) => {
        console.log(`Bot disconnected: ${reason}. Cleaning memory...`);
        cleanupBotInstance();
    });

    bot.once('kicked', (reason) => {
        console.log(`Bot was kicked: ${reason}`);
    });

    bot.on('error', (err) => {
        console.error(`Mineflayer Error: ${err.message}`);
    });
}

// 2. The Critical Memory Leak Fix Function
function cleanupBotInstance() {
    if (!bot) return;

    try {
        // Stop any pathfinding movements immediately
        if (bot.pathfinder) {
            bot.pathfinder.stop();
        }

        // Remove every single event listener attached to the bot object
        bot.removeAllListeners();

        // Nullify sub-objects to break reference cycles in the heap
        if (bot.inventory) bot.inventory = null;
        if (bot.entities) bot.entities = null;

        // Nullify the main bot reference completely
        bot = null;

        // 3. Force Garbage Collection if enabled via the package.json flag
        if (global.gc) {
            console.log("Forcing Garbage Collection to clear heap...");
            global.gc();
        }
    } catch (e) {
        console.error("Error during memory cleanup:", e);
    }

    // Reconnect after 30 seconds
    console.log("Scheduling reconnection in 30 seconds...");
    reconnectTimeout = setTimeout(createBot, 30000);
}

// Start the bot loop
createBot();
