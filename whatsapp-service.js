const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.qrCode = null;
        this.isConnected = false;
        
        // Configuração ULTRA LEVE para Render
        const puppeteerOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        };
        
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: puppeteerOptions
        });

        this.client.on('qr', async (qr) => {
            console.log('QR recebido');
            this.qrCode = await qrcode.toDataURL(qr);
        });

        this.client.on('ready', () => {
            console.log('WhatsApp CONECTADO!');
            this.isConnected = true;
            this.qrCode = null;
        });

        this.client.initialize();
    }

    getQR() {
        return this.qrCode ? {
            success: true,
            qr: this.qrCode,
            message: 'Escaneie o QR Code'
        } : this.isConnected ? {
            success: true,
            connected: true,
            message: 'WhatsApp já está conectado'
        } : {
            success: false,
            message: 'Aguardando QR Code...'
        };
    }
}

module.exports = new WhatsAppService();
