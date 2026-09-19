const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pathfinder } = require('mineflayer-pathfinder');

const app = express();
const settingsPath = path.join(__dirname, 'settings.json');
let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

let bot;
let reconnectTimeout;
let chatInterval;

// Web Server for Railway
const PORT = process.env.PORT || settings.PORT || 5000;
app.get('/ping', (req, res) => res.send('Pong!'));
app.get('/health', (req, res) => {
    res.json({ status: bot ? 'connected' : 'disconnected', username: bot?.username });
});
app.listen(PORT, () => console.log(`Dashboard listening on port ${PORT}`));

function createBot() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (chatInterval) clearInterval(chatInterval);

    console.log("Spawning a fresh bot instance...");

    try {
        // Read settings fresh and trim whitespace
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        const rawHost = process.env.BOT_HOST || settings.server.ip || '';
        const targetHost = rawHost.trim(); // Clears any trailing or leading spaces

        if (!targetHost || targetHost.includes('your.server.ip')) {
            console.error("🛑 ERROR: You have not configured your real Minecraft IP in settings.json yet!");
            console.log("Waiting 60 seconds before trying again...");
            reconnectTimeout = setTimeout(createBot, 60000);
            return;
        }

        // Determine Minecraft version: fallback to "1.21.1" if settings specify false or empty
        // This prevents autoVersion ping failures when Aternos servers are offline/starting up
        const targetVersion = (process.env.BOT_VERSION || settings.server.version) || '1.21.1';

        bot = mineflayer.createBot({
            host: targetHost,
            port: parseInt(process.env.BOT_PORT) || settings.server.port || 25565,
            username: (process.env.BOT_USERNAME || settings['bot-account'].username || 'HostingBot').trim(),
            version: targetVersion,
            auth: settings['bot-account'].type || 'offline',
            checkTimeoutInterval: 60 * 1000 // Prevents premature timeout during server startup
        });

        bot.loadPlugin(pathfinder);

        bot.once('spawn', () => {
            console.log(`[${bot.username}] Successfully joined the server.`);
            
            if (settings.utils['auto-auth']?.enabled) {
                const pass = process.env.BOT_AUTH_PASSWORD || settings.utils['auto-auth'].password;
                setTimeout(() => {
                    if (bot && bot.entity) bot.chat(`/login ${pass}`);
                }, 3000);
            }

            chatInterval = setInterval(() => {
                if (!bot || !bot.entity) return;
                bot.swingArm('right');

                if (settings.utils['chat-messages']?.enabled) {
                    const msgs = settings.utils['chat-messages'].messages || ["24/7 protection active."];
                    const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
                    bot.chat(randomMsg);
                }
            }, (settings.utils['chat-messages']?.['repeat-delay'] || 30) * 1000);
        });

        // Whitelist handling
        bot.on('chat', (username, message) => {
            if (username === bot.username) return;
            const whitelist = settings.chat?.tpWhitelist || [];
            if (!whitelist.includes(username)) return;

            if (message === '!tp') {
                bot.chat(`/tp ${username}`);
            }
        });

        // Catch connection errors cleanly so Node process doesn't crash on server ping/startup
        bot.on('error', (err) => {
            if (err.message.includes('Unsupported protocol version') || err.message.includes('minecraftVersion')) {
                console.error(`[Mineflayer Event Error]: Server offline or starting up. Skipping autoVersion ping.`);
            } else {
                console.error(`[Mineflayer Event Error]: ${err.message}`);
            }
        });

        bot.once('end', (reason) => {
            console.log(`Bot disconnected safely: ${reason}. Cleaning memory...`);
            cleanupBotMemory();
        });

    } catch (criticalError) {
        console.error(`Initialization structural error: ${criticalError.message}`);
        cleanupBotMemory();
    }
}

function cleanupBotMemory() {
    if (chatInterval) clearInterval(chatInterval);
    
    if (bot) {
        try {
            if (bot.pathfinder) bot.pathfinder.stop();
            bot.removeAllListeners();
            if (bot.inventory) bot.inventory = null;
            if (bot.entities) bot.entities = null;
            bot = null;

            if (global.gc) {
                console.log("Memory scrubbing complete via Garbage Collector.");
                global.gc();
            }
        } catch (e) {
            console.error("Minor error clearing heap objects:", e.message);
        }
    }

    console.log("Scheduling clean reconnection loop in 30 seconds...");
    reconnectTimeout = setTimeout(createBot, 30000);
}

// Start bot
createBot();
