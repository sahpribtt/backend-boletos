const express = require('express');
const whatsapp = require('./whatsapp-service');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Rota principal
app.get('/', (req, res) => {
    res.json({
        message: 'API WhatsApp Boletos',
        endpoints: {
            qr: '/api/qr',
            status: '/api/status'
        }
    });
});

// QR Code
app.get('/api/qr', (req, res) => {
    res.json(whatsapp.getQR());
});

// Status
app.get('/api/status', (req, res) => {
    res.json({
        connected: whatsapp.isConnected,
        hasQR: !!whatsapp.qrCode,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
