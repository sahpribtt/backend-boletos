// venom-service.js - COLE TODO ESTE CÓDIGO
const venom = require('venom-bot');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class VenomService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.qrCode = null;
        this.sessionPath = path.join(__dirname, 'tokens', 'boleto-session');
        
        // Garante que a pasta tokens existe
        if (!fs.existsSync(path.join(__dirname, 'tokens'))) {
            fs.mkdirSync(path.join(__dirname, 'tokens'), { recursive: true });
        }
    }

    // Inicia a conexão com WhatsApp
    async start() {
        try {
            console.log('🟡 Iniciando Venom WhatsApp...');
            
            this.client = await venom.create(
                'boleto-session', // Nome da sessão
                (base64Qr, asciiQR) => {
                    // QR Code recebido
                    console.log('🟡 QR Code recebido!');
                    this.qrCode = base64Qr;
                    
                    // Mostra QR no terminal
                    console.log('Escaneie o QR Code abaixo:');
                    qrcode.generate(asciiQR, { small: true });
                    
                    // Converte para base64 para API
                    this.lastQR = `data:image/png;base64,${base64Qr}`;
                },
                (statusSession) => {
                    // Status da sessão
                    console.log('📱 Status:', statusSession);
                    
                    if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess' || statusSession === 'chatsAvailable') {
                        console.log('✅ WhatsApp CONECTADO!');
                        this.isConnected = true;
                        this.qrCode = null;
                    }
                    
                    if (statusSession === 'browserClose' || statusSession === 'serverClose') {
                        console.log('🔴 WhatsApp DESCONECTADO!');
                        this.isConnected = false;
                    }
                },
                {
                    folderNameToken: 'tokens',
                    mkdirFolderToken: '',
                    headless: true,
                    devtools: false,
                    useChrome: true,
                    debug: false,
                    logQR: true,
                    browserWS: '',
                    browserArgs: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ],
                    createPathFileToken: true,
                    addBrowserArgs: ['--disable-web-security']
                },
                (browser, waPage) => {
                    console.log('🌐 Browser inicializado');
                }
            );
            
            console.log('✅ Venom inicializado com sucesso!');
            return this.client;
            
        } catch (error) {
            console.error('❌ Erro ao iniciar Venom:', error);
            throw error;
        }
    }

    // Pega o QR Code atual
    getQRCode() {
        return this.qrCode 
            ? { 
                qr: this.qrCode, 
                base64: this.lastQR,
                message: 'Escaneie com seu WhatsApp' 
            } 
            : null;
    }

    // Envia uma mensagem de texto
    async sendText(number, message) {
        try {
            if (!this.client) {
                await this.start();
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            if (!this.isConnected) {
                return { 
                    success: false, 
                    error: 'WhatsApp não conectado. Escaneie o QR Code primeiro.' 
                };
            }
            
            // Formata o número
            const formattedNumber = number.includes('@c.us') 
                ? number 
                : `${number}@c.us`;
            
            console.log(`📤 Enviando para ${formattedNumber}: ${message.substring(0, 50)}...`);
            
            // Envia a mensagem
            const result = await this.client.sendText(formattedNumber, message);
            
            console.log('✅ Mensagem enviada!');
            return { 
                success: true, 
                messageId: result.id,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error);
            return { 
                success: false, 
                error: error.message
            };
        }
    }

    // Verifica status
    getStatus() {
        return {
            connected: this.isConnected,
            hasQR: !!this.qrCode,
            hasClient: !!this.client,
            sessionPath: this.sessionPath
        };
    }
}

// Exporta uma única instância
module.exports = new VenomService();
