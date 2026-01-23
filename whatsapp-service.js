// whatsapp-service.js
const { create, createSession, CatchQR } = require('@wppconnect-team/wppconnect');
const qrcode = require('qrcode-terminal');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.qrCode = null;
    }

    // Inicia a conexão com WhatsApp
    async start() {
        try {
            console.log('🟡 Iniciando WhatsApp...');
            
            this.client = await create({
                session: 'boleto-bot', // Nome da sessão
                headless: 'new', // Roda sem interface gráfica
                devtools: false, // Não abre devtools
                useChrome: true,
                logQR: true, // Mostra QR no terminal
                disableWelcome: true,
                
                // Callback quando QR Code for gerado
                onQR: (qrCode) => {
                    console.log('🟡 QR Code recebido!');
                    this.qrCode = qrCode;
                    
                    // Mostra QR Code no terminal (útil para Render logs)
                    qrcode.generate(qrCode, { small: true });
                    
                    // Também guarda como base64 para API
                    this.lastQR = `data:image/png;base64,${qrCode}`;
                },
                
                // Callback quando conectar
                onReady: () => {
                    console.log('✅ WhatsApp CONECTADO!');
                    this.isConnected = true;
                },
                
                // Callback para erros
                onError: (error) => {
                    console.error('❌ Erro WhatsApp:', error);
                    this.isConnected = false;
                }
            });
            
            return this.client;
            
        } catch (error) {
            console.error('❌ Erro ao iniciar WhatsApp:', error);
            throw error;
        }
    }

    // Pega o QR Code atual (para mostrar na sua interface)
    getQRCode() {
        return this.qrCode 
            ? { qr: this.qrCode, base64: this.lastQR } 
            : null;
    }

    // Envia uma mensagem de texto
    async sendText(number, message) {
        try {
            if (!this.client || !this.isConnected) {
                await this.start();
            }
            
            // Formata o número: 5511999999999 -> 5511999999999@c.us
            const formattedNumber = `${number}@c.us`;
            
            console.log(`📤 Enviando para ${number}: ${message.substring(0, 50)}...`);
            
            const result = await this.client.sendText(formattedNumber, message);
            
            console.log('✅ Mensagem enviada:', result.id);
            return { success: true, messageId: result.id };
            
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error);
            return { success: false, error: error.message };
        }
    }

    // Verifica status
    getStatus() {
        return {
            connected: this.isConnected,
            hasQR: !!this.qrCode,
            qrCode: this.qrCode ? 'Disponível' : 'Não disponível'
        };
    }
}

// Exporta uma única instância
module.exports = new WhatsAppService();
