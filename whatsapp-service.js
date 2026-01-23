// whatsapp-service.js - VERSÃO PARA RENDER
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Para Render, precisamos de configuração especial
const isRender = process.env.RENDER || false;
const chromePath = isRender 
  ? '/usr/bin/google-chrome-stable'  // Caminho no Render
  : null;

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.qrCode = null;
        this.lastQR = null;
        this.connectionStatus = 'disconnected';
        
        // Cria diretório para sessões
        const sessionDir = path.join(__dirname, 'whatsapp_sessions');
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // Inicializa o cliente
        this.initClient();
    }

    initClient() {
        console.log('🟡 Inicializando WhatsApp Web no Render...');
        
        // Configuração especial para Render
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
            ]
        };
        
        // Se estiver no Render, usa Chrome instalado
        if (chromePath) {
            puppeteerOptions.executablePath = chromePath;
            console.log('✅ Usando Chrome do Render:', chromePath);
        }
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "boleto-bot-render",
                dataPath: path.join(__dirname, 'whatsapp_sessions')
            }),
            puppeteer: puppeteerOptions,
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // Evento QR Code
        this.client.on('qr', async (qr) => {
            console.log('🟡 QR Code recebido!');
            this.qrCode = qr;
            
            try {
                // Gera QR como base64
                this.lastQR = await qrcode.toDataURL(qr);
                console.log('✅ QR Code convertido para base64');
                
                // Também mostra no terminal
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

        // Eventos de status
        this.client.on('authenticated', () => {
            console.log('🔐 Autenticado!');
            this.connectionStatus = 'authenticated';
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
            this.connectionStatus = 'auth_failure';
            this.isConnected = false;
        });

        this.client.on('disconnected', (reason) => {
            console.log('🔴 Desconectado:', reason);
            this.isConnected = false;
            this.connectionStatus = 'disconnected';
            
            // Tenta reconectar após 10 segundos
            setTimeout(() => {
                console.log('🔄 Tentando reconectar...');
                this.initClient();
            }, 10000);
        });

        // Inicializa
        this.client.initialize().catch(error => {
            console.error('❌ Erro ao inicializar WhatsApp:', error);
            
            // Tenta novamente com fallback
            if (error.message.includes('Chrome')) {
                console.log('🔄 Tentando com configuração alternativa...');
                this.initClientWithFallback();
            }
        });
    }
    
    // Método fallback se a primeira tentativa falhar
    initClientWithFallback() {
        console.log('🔄 Usando configuração alternativa...');
        
        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        };
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "boleto-bot-fallback",
                dataPath: path.join(__dirname, 'whatsapp_sessions_fallback')
            }),
            puppeteer: puppeteerOptions
        });
        
        // Copia os mesmos event handlers
        this.client.on('qr', async (qr) => {
            console.log('🟡 QR Code recebido (fallback)!');
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
        
        this.client.on('ready', () => {
            console.log('✅ WhatsApp CONECTADO via fallback!');
            this.isConnected = true;
            this.connectionStatus = 'connected';
            this.qrCode = null;
            this.lastQR = null;
        });
        
        this.client.initialize();
    }

    // Resto do código permanece igual...
    getQRCode() {
        if (this.qrCode && this.lastQR) {
            return {
                success: true,
                qr: this.qrCode,
                base64: this.lastQR,
                message: 'Escaneie com seu WhatsApp',
                timestamp: new Date().toISOString()
            };
        } else if (this.isConnected) {
            return {
                success: true,
                connected: true,
                message: 'WhatsApp já está conectado!',
                timestamp: new Date().toISOString()
            };
        } else {
            return {
                success: false,
                message: 'Aguardando QR Code...',
                connected: false,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendText(number, message) {
        try {
            if (!this.isConnected || !this.client) {
                return {
                    success: false,
                    error: 'WhatsApp não está conectado. Escaneie o QR Code primeiro.'
                };
            }

            const cleanNumber = number.replace(/\D/g, '');
            const formattedNumber = cleanNumber.includes('@c.us') 
                ? cleanNumber 
                : `${cleanNumber}@c.us`;

            console.log(`📤 Enviando para: ${formattedNumber}`);
            
            const result = await this.client.sendMessage(formattedNumber, message);
            
            console.log('✅ Mensagem enviada!');
            return {
                success: true,
                messageId: result.id.id,
                timestamp: new Date().toISOString(),
                to: formattedNumber
            };
            
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            status: this.connectionStatus,
            hasQR: !!this.qrCode,
            hasClient: !!this.client,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new WhatsAppService();
