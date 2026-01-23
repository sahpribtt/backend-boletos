// whatsapp-service.js - SERVIÇO WHATSAPP FUNCIONAL
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
        
        // Cria diretório para sessões
        const sessionDir = path.join(__dirname, 'whatsapp_sessions');
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // Inicializa o cliente
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
            
            try {
                // Gera QR como base64
                this.lastQR = await qrcode.toDataURL(qr);
                console.log('✅ QR Code convertido para base64');
                
                // Também mostra no terminal (útil para debug)
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

        // Evento Autenticado
        this.client.on('authenticated', () => {
            console.log('🔐 Autenticado!');
            this.connectionStatus = 'authenticated';
        });

        // Evento Falha de Autenticação
        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
            this.connectionStatus = 'auth_failure';
            this.isConnected = false;
        });

        // Evento Desconectado
        this.client.on('disconnected', (reason) => {
            console.log('🔴 Desconectado:', reason);
            this.isConnected = false;
            this.connectionStatus = 'disconnected';
            
            // Tenta reconectar após 5 segundos
            setTimeout(() => {
                console.log('🔄 Tentando reconectar...');
                this.client.initialize();
            }, 5000);
        });

        // Inicializa o cliente
        this.client.initialize();
    }

    // Obtém QR Code atual
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

    // Envia mensagem de texto
    async sendText(number, message) {
        try {
            // Verifica se está conectado
            if (!this.isConnected || !this.client) {
                return {
                    success: false,
                    error: 'WhatsApp não está conectado. Escaneie o QR Code primeiro.'
                };
            }

            // Formata o número (remove caracteres não numéricos e adiciona @c.us)
            const cleanNumber = number.replace(/\D/g, '');
            const formattedNumber = cleanNumber.includes('@c.us') 
                ? cleanNumber 
                : `${cleanNumber}@c.us`;

            console.log(`📤 Enviando mensagem para: ${formattedNumber}`);
            console.log(`📝 Mensagem: ${message.substring(0, 100)}...`);
            
            // Envia a mensagem
            const result = await this.client.sendMessage(formattedNumber, message);
            
            console.log('✅ Mensagem enviada com sucesso!');
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

    // Obtém status do serviço
    getStatus() {
        return {
            connected: this.isConnected,
            status: this.connectionStatus,
            hasQR: !!this.qrCode,
            hasClient: !!this.client,
            timestamp: new Date().toISOString()
        };
    }

    // Força nova geração de QR
    async generateNewQR() {
        try {
            if (this.client) {
                await this.client.destroy();
                this.isConnected = false;
                this.qrCode = null;
                this.lastQR = null;
                this.connectionStatus = 'disconnected';
                
                // Recria o cliente
                this.initClient();
                
                return { 
                    success: true, 
                    message: 'Novo QR Code sendo gerado...' 
                };
            }
            return { 
                success: false, 
                error: 'Cliente não inicializado' 
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Exporta uma única instância
module.exports = new WhatsAppService();
