// server.js - SERVIDOR PRINCIPAL
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// Importa o serviço WhatsApp (NOVO)
const whatsappService = require('./whatsapp-service');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: ['https://glaydsonsilva.netlify.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Configuração Multer para upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Conexão MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/boletos', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB conectado com sucesso!'))
.catch(err => console.error('❌ Erro MongoDB:', err));

// Modelo Boleto
const BoletoSchema = new mongoose.Schema({
    cliente: String,
    telefone: String,
    vencimento: Date,
    valor: Number,
    codigoBarras: String,
    pdfPath: String,
    status: { type: String, default: 'pendente' },
    enviado: { type: Boolean, default: false },
    dataEnvio: Date,
    criadoEm: { type: Date, default: Date.now }
});
const Boleto = mongoose.model('Boleto', BoletoSchema);

// ================= ROTAS WHATSAPP (NOVAS) =================

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        message: 'API de Boletos WhatsApp está funcionando! 🚀',
        endpoints: {
            root: '/',
            health: '/health',
            whatsapp: {
                qr: '/api/whatsapp/qr',
                status: '/api/whatsapp/status',
                send: '/api/whatsapp/send (POST)',
                qr_page: '/public/qr.html'
            },
            boletos: {
                list: '/api/boletos',
                create: '/api/boletos (POST)',
                upload: '/api/upload (POST)'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'whatsapp-boleto-api',
        timestamp: new Date().toISOString()
    });
});

// Rota para obter QR Code
app.get('/api/whatsapp/qr', async (req, res) => {
    try {
        const qrData = whatsappService.getQRCode();
        res.json(qrData);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rota para status do WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
    try {
        const status = whatsappService.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rota para enviar mensagem
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({
                success: false,
                error: 'Número e mensagem são obrigatórios'
            });
        }
        
        const result = await whatsappService.sendText(number, message);
        res.json(result);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rota para gerar novo QR
app.post('/api/whatsapp/new-qr', async (req, res) => {
    try {
        const result = await whatsappService.generateNewQR();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================= ROTAS DE BOLETOS =================

// Listar boletos
app.get('/api/boletos', async (req, res) => {
    try {
        const boletos = await Boleto.find().sort({ vencimento: 1 });
        res.json(boletos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Criar boleto
app.post('/api/boletos', async (req, res) => {
    try {
        const { cliente, telefone, vencimento, valor, codigoBarras } = req.body;
        
        const boleto = new Boleto({
            cliente,
            telefone,
            vencimento: new Date(vencimento),
            valor: parseFloat(valor),
            codigoBarras
        });
        
        await boleto.save();
        res.json({ success: true, boleto });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload de PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
    try {
        const { telefone, vencimento, valor } = req.body;
        
        const boleto = new Boleto({
            cliente: 'Cliente via Upload',
            telefone,
            vencimento: new Date(vencimento),
            valor: parseFloat(valor),
            pdfPath: req.file.path
        });
        
        await boleto.save();
        res.json({ 
            success: true, 
            message: 'Boleto salvo com sucesso!',
            boleto 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enviar lembrete de boleto
app.post('/api/boletos/:id/enviar', async (req, res) => {
    try {
        const boleto = await Boleto.findById(req.params.id);
        
        if (!boleto) {
            return res.status(404).json({ error: 'Boleto não encontrado' });
        }
        
        // Cria mensagem
        const message = `💰 *LEMBRETE DE BOLETO* 💰

👤 Cliente: ${boleto.cliente}
📅 Vencimento: ${boleto.vencimento.toLocaleDateString('pt-BR')}
💵 Valor: R$ ${boleto.valor.toFixed(2)}
📊 Código: ${boleto.codigoBarras || 'Não informado'}

_Por favor, efetue o pagamento até a data de vencimento._`;
        
        // Envia via WhatsApp
        const result = await whatsappService.sendText(boleto.telefone, message);
        
        if (result.success) {
            boleto.enviado = true;
            boleto.dataEnvio = new Date();
            boleto.status = 'enviado';
            await boleto.save();
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota de teste
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API funcionando!',
        whatsapp: whatsappService.getStatus(),
        timestamp: new Date().toISOString()
    });
});

// ================= INICIAR SERVIDOR =================
app.listen(PORT, () => {
    console.log('============================================================');
    console.log('🚀 SERVIDOR INICIADO');
    console.log('============================================================');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🏠 Home: http://localhost:${PORT}/`);
    console.log(`📱 QR Page: http://localhost:${PORT}/public/qr.html`);
    console.log(`🔗 API Test: http://localhost:${PORT}/api/test`);
    console.log(`📱 WhatsApp: WHATSAPP-WEB.JS`);
    console.log(`✅ CORS: https://glaydsonsilva.netlify.app`);
    console.log(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
    console.log('============================================================');
    console.log('📋 Para conectar WhatsApp:');
    console.log(`1. Acesse: http://localhost:${PORT}/public/qr.html`);
    console.log('2. Escaneie o QR Code com seu celular');
    console.log('3. Aguarde confirmação de conexão');
    console.log('============================================================');
});
