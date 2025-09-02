require('dotenv').config();
const express = require('express');
const path = require('path');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('./lib');

const app = express();
const PORT = process.env.PORT || 8000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let isAuthenticated = false;
const AUTH_PATH = process.env.AUTH_PATH || './auth';
const Gifted = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: { headless: process.env.HEADLESS !== 'false' }
});

// ==== FRONTEND ROUTES ====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==== QR CODE GENERATE ====
app.post('/api/qr', async (req, res) => {
    if (isAuthenticated) return res.status(403).json({ success: false, error: 'Already authenticated' });

    try {
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: 'session', dataPath: AUTH_PATH }),
            puppeteer: { headless: true }
        });

        client.on('qr', async (qr) => {
            try {
                const qrImage = await qrcode.toDataURL(qr);
                if (!res.headersSent) res.json({ success: true, qr: qrImage, message: 'Scan QR to login' });
            } catch (err) {
                console.error('QR error:', err);
                if (!res.headersSent) res.status(500).json({ success: false, error: 'QR generation failed' });
            }
        });

        client.on('authenticated', () => {
            console.log('Client authenticated');
            isAuthenticated = true;
        });

        client.on('ready', async () => {
            console.log('Client ready');
            await Gifted.initialize().catch(console.error);
            client.destroy().catch(console.error);
            isAuthenticated = true;
        });

        client.on('auth_failure', (msg) => {
            console.error('Auth failure:', msg);
            if (!res.headersSent) res.status(500).json({ success: false, error: 'Authentication failed' });
            client.destroy().catch(console.error);
            isAuthenticated = false;
        });

        await client.initialize();
    } catch (error) {
        console.error('QR endpoint error:', error);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

// ==== PAIRING CODE GENERATE ====
app.post('/api/pair', async (req, res) => {
    if (isAuthenticated) return res.status(403).json({ success: false, error: 'Already authenticated' });

    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\d{10,15}$/.test(phoneNumber)) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: 'session', dataPath: AUTH_PATH }),
            puppeteer: { headless: true }
        });

        client.on('ready', async () => {
            try {
                const pairingCode = await client.requestPairingCode(phoneNumber);
                if (!res.headersSent) res.json({ success: true, pairingCode, message: 'Enter this code in WhatsApp linked devices' });
                await Gifted.initialize().catch(console.error);
                client.destroy().catch(console.error);
                isAuthenticated = true;
            } catch (err) {
                console.error('Pairing code error:', err);
                if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
            }
        });

        client.on('auth_failure', (msg) => {
            console.error('Auth failure:', msg);
            if (!res.headersSent) res.status(500).json({ success: false, error: 'Authentication failed' });
            client.destroy().catch(console.error);
            isAuthenticated = false;
        });

        await client.initialize();
    } catch (error) {
        console.error('Pair endpoint error:', error);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

// ==== START SERVER ====
app.listen(PORT, () => console.log(`🌐 Server running on http://localhost:${PORT}`));
