// whatsapp-service.js - VERSÃO QUE FUNCIONA NO RENDER
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
        
        // Configuração ESPECÍFICA para Render
        this.initClient();
    }

    initClient() {
        console.log('🟡 Inicializando WhatsApp Web...');
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "boleto-bot-render",
                dataPath: path.join(__dirname, 'whatsapp_sessions')
            }),
            puppeteer: {
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
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // Evento QR Code
        this.client.on('qr', async (qr) => {
            console.log('🟡 QR Code recebido!');
            this.qrCode = qr;
            
            // Gera QR como base64
            try {
                this.lastQR = await qrcode.toDataURL(qr);
                console.log('✅ QR Code convertido para base64');
                
                // Salva QR em arquivo temporário (opcional)
                const qrPath = path.join(__dirname, 'public', 'qr_temp.png');
                await qrcode.toFile(qrPath, qr);
                
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
            
            // Tenta reconectar automaticamente
            setTimeout(() => {
                console.log('🔄 Tentando reconectar...');
                this.client.initialize();
            }, 5000);
        });

        // Inicializa
        this.client.initialize();
    }

    getQRCode() {
        return this.qrCode ? {
            qr: this.qrCode,
            base64: this.lastQR,
            message: 'Escaneie com seu WhatsApp',
            timestamp: new Date().toISOString()
        } : null;
    }

    async sendText(number, message) {
        try {
            if (!this.isConnected || !this.client) {
                return {
                    success: false,
                    error: 'WhatsApp não está conectado. Escaneie o QR Code primeiro.'
                };
            }

            // Formata número
            const formattedNumber = number.includes('@c.us') 
                ? number 
                : `${number.replace(/\D/g, '')}@c.us`;

            console.log(`📤 Enviando para ${formattedNumber}: ${message.substring(0, 50)}...`);
            
            const result = await this.client.sendMessage(formattedNumber, message);
            
            console.log('✅ Mensagem enviada! ID:', result.id.id);
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

    // Função para forçar geração de novo QR
    async generateNewQR() {
        if (this.client) {
            // Destroi e recria cliente
            await this.client.destroy();
            this.initClient();
            return { success: true, message: 'Novo QR Code sendo gerado...' };
        }
        return { success: false, error: 'Cliente não inicializado' };
    }
}

module.exports = new WhatsAppService();
