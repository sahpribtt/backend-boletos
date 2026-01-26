// whatsapp-service.js - VERSÃO SIMPLIFICADA PARA RENDER
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.qrCode = null;
        this.lastQR = null;
        this.connectionStatus = 'disconnected';
        
        // Inicializa
        this.initClient();
    }

    initClient() {
        console.log('🟡 Inicializando WhatsApp Web...');
        
        // Configuração PARA RENDER
        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ],
            // IMPORTANTE: No Render, puppeteer já vem com Chrome
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        };
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "boleto-bot",
                dataPath: path.join(__dirname, 'whatsapp_sessions')
            }),
            puppeteer: puppeteerOptions
        });

        // Evento QR Code
        this.client.on('qr', async (qr) => {
            console.log('🟡 QR Code recebido!');
            this.qrCode = qr;
            
            try {
                this.lastQR = await qrcode.toDataURL(qr);
                console.log('✅ QR Code convertido para base64');
                
                const qrTerminal = require('qrcode-terminal');
                qrTerminal.generate(qr, { small: true });
                
            } catch (error) {
                console.error('❌ Erro ao gerar QR:', error);
            }
        });

        // Evento Ready
        this.client.on('ready', () => {
            console.log('✅ WhatsApp CONECTADO e PRONTO!');
            this.isConnected = true;
            this.connectionStatus = 'connected';
            this.qrCode = null;
            this.lastQR = null;
        });

        this.client.on('authenticated', () => {
            console.log('🔐 Autenticado!');
            this.connectionStatus = 'authenticated';
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
            this.connectionStatus = 'auth_failure';
        });

        this.client.on('disconnected', (reason) => {
            console.log('🔴 Desconectado:', reason);
            this.isConnected = false;
            this.connectionStatus = 'disconnected';
        });

        // Inicializa com tratamento de erro
        this.client.initialize().catch(error => {
            console.error('❌ Erro ao inicializar WhatsApp:', error);
            
            // Se for erro de Chrome, tenta sem executablePath
            if (error.message.includes('Chrome') || error.message.includes('browser')) {
                console.log('🔄 Tentando sem executablePath...');
                this.initClientWithoutChromePath();
            }
        });
    }
    
    // Fallback: tenta sem especificar executablePath
    initClientWithoutChromePath() {
        console.log('🔄 Usando configuração fallback...');
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "boleto-bot-fallback",
                dataPath: path.join(__dirname, 'whatsapp_sessions_fallback')
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            }
        });
        
        // Mesmos event handlers
        this.client.on('qr', async (qr) => {
            console.log('🟡 QR Code recebido (fallback)!');
            this.qrCode = qr;
            try {
                this.lastQR = await qrcode.toDataURL(qr);
                console.log('✅ QR Code convertido');
            } catch (error) {
                console.error('❌ Erro:', error);
            }
        });
        
        this.client.on('ready', () => {
            console.log('✅ WhatsApp CONECTADO!');
            this.isConnected = true;
            this.connectionStatus = 'connected';
        });
        
        this.client.initialize().catch(error => {
            console.error('❌ Erro no fallback:', error);
        });
    }

    getQRCode() {
        if (this.qrCode && this.lastQR) {
            return {
                success: true,
                qr: this.qrCode,
                base64: this.lastQR,
                message: 'Escaneie com seu WhatsApp'
            };
        } else if (this.isConnected) {
            return {
                success: true,
                connected: true,
                message: 'WhatsApp conectado!'
            };
        } else {
            return {
                success: false,
                message: 'Aguardando QR Code...'
            };
        }
    }

    async sendText(number, message) {
        try {
            if (!this.isConnected) {
                return { success: false, error: 'WhatsApp não conectado' };
            }

            const cleanNumber = number.replace(/\D/g, '');
            const formattedNumber = `${cleanNumber}@c.us`;
            
            const result = await this.client.sendMessage(formattedNumber, message);
            
            return {
                success: true,
                messageId: result.id.id
            };
            
        } catch (error) {
            console.error('❌ Erro:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            status: this.connectionStatus,
            hasQR: !!this.qrCode,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new WhatsAppService();
