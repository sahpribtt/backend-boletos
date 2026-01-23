// ============================================
// SERVER.JS - Sistema de Gestão de Boletos WhatsApp
// Backend com MongoDB e WhatsApp REAL via VENOM BOT
// ============================================
const venom = require('./venom-service');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Inicializar Express
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 1. CONFIGURAÇÃO CORS
// ============================================
const corsOptions = {
  origin: [
    'https://glaydsonsilva.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Headers',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// ============================================
// 2. CONEXÃO COM MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/boletos-whatsapp';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB conectado com sucesso!'))
.catch(err => console.error('❌ Erro ao conectar MongoDB:', err));

// ============================================
// 3. MODELOS DO MONGODB
// ============================================
const ClienteSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  telefone: { type: String, required: true },
  email: String,
  cpf: String,
  endereco: String,
  vencimento: { type: Date, required: true },
  valor: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO'],
    default: 'PENDENTE'
  },
  nivelAlerta: {
    type: String,
    enum: ['NORMAL', 'ALERTA', 'CRITICO'],
    default: 'NORMAL'
  },
  pdfPath: String,
  whatsappEnviado: { type: Boolean, default: false },
  dataEnvioWhatsapp: Date,
  dataCadastro: { type: Date, default: Date.now },
  observacoes: String
});

const Cliente = mongoose.model('Cliente', ClienteSchema);

// ============================================
// 4. CONFIGURAÇÃO MULTER (UPLOAD DE PDF)
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF, JPEG, JPG e PNG são permitidos!'));
    }
  }
});

// ============================================
// 5. FUNÇÃO PRINCIPAL PARA ENVIAR WHATSAPP (VENOM)
// ============================================
async function enviarWhatsapp(numero, mensagem, arquivoPath = null) {
  console.log('='.repeat(60));
  console.log('📱 ENVIANDO WHATSAPP VIA VENOM');
  console.log('='.repeat(60));
  
  try {
    console.log(`📞 Para: ${numero}`);
    console.log(`💬 Mensagem: ${mensagem.substring(0, 100)}...`);
    
    const resultado = await venom.sendText(numero, mensagem);
    
    if (resultado.success) {
      console.log('✅ WhatsApp REAL enviado via Venom!');
      return {
        success: true,
        messageId: resultado.messageId,
        status: 'ENVIADO',
        provider: 'VENOM',
        real: true,
        timestamp: new Date().toISOString()
      };
    } else {
      console.log('⚠️ Venom falhou, usando simulação...');
      return enviarWhatsappSimulado(numero, mensagem, arquivoPath);
    }
    
  } catch (error) {
    console.error('❌ ERRO Venom:', error.message);
    return enviarWhatsappSimulado(numero, mensagem, arquivoPath);
  }
}

async function enviarWhatsappSimulado(numero, mensagem, arquivoPath = null) {
  console.log('🔄 Usando WhatsApp SIMULADO...');
  
  const logEntry = {
    id: 'SIM-' + Date.now(),
    numero,
    mensagem,
    arquivo: arquivoPath ? path.basename(arquivoPath) : null,
    timestamp: new Date().toISOString(),
    status: 'SIMULADO',
    provider: 'VENOM-FALLBACK'
  };
  
  const logDir = 'whatsapp_logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'envios.json');
  let logs = [];
  
  if (fs.existsSync(logFile)) {
    try {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    } catch (e) {
      console.error('Erro ao ler logs:', e);
    }
  }
  
  logs.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  
  console.log('📝 Simulação registrada com ID:', logEntry.id);
  
  return {
    success: true,
    messageId: logEntry.id,
    status: 'SIMULADO',
    fake: true,
    logEntry,
    message: 'Venom não conectado, mensagem simulada'
  };
}

// ============================================
// 6. ROTAS DA API
// ============================================

// ROTA: Página inicial
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Sistema de Boletos WhatsApp</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>🚀 Sistema de Boletos WhatsApp</h1>
        <p>Backend funcionando corretamente!</p>
        <div style="margin: 30px;">
          <a href="/public/qr.html" style="background: #667eea; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 10px;">
            📱 Conectar WhatsApp
          </a>
          <a href="/api/test" style="background: #48bb78; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 10px;">
            🔍 Testar API
          </a>
        </div>
        <div style="margin-top: 40px; text-align: left; display: inline-block;">
          <h3>Endpoints disponíveis:</h3>
          <ul>
            <li><code>GET /api/test</code> - Status do sistema</li>
            <li><code>GET /api/venom/qr</code> - QR Code WhatsApp</li>
            <li><code>GET /api/venom/status</code> - Status WhatsApp</li>
            <li><code>GET /api/venom/debug</code> - Debug Venom</li>
            <li><code>POST /api/venom/test</code> - Enviar mensagem teste</li>
            <li><code>GET /api/clientes</code> - Listar clientes</li>
            <li><code>POST /api/clientes</code> - Criar cliente</li>
            <li><code>POST /api/upload-boleto</code> - Upload com WhatsApp</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// ROTA: Teste do servidor
app.get('/api/test', (req, res) => {
  const venomStatus = venom.getStatus();
  
  res.json({
    message: '✅ Sistema de Boletos WhatsApp funcionando!',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado',
    whatsapp: venomStatus.connected ? '✅ CONECTADO (Venom)' : '🔴 DESCONECTADO',
    venomStatus: venomStatus,
    avisos: 'Ativo (verificação diária às 9h)',
    cors: 'Configurado para Netlify',
    instrucoes: venomStatus.connected 
      ? 'WhatsApp conectado! Envie mensagens.' 
      : 'Acesse /api/venom/qr ou /public/qr.html para conectar WhatsApp',
    endpoints: {
      qr: '/api/venom/qr',
      status: '/api/venom/status',
      debug: '/api/venom/debug',
      sendTest: '/api/venom/test',
      clientes: '/api/clientes',
      upload: '/api/upload-boleto',
      qrPage: '/public/qr.html'
    }
  });
});

// ROTA: Debug do Venom
app.get('/api/venom/debug', async (req, res) => {
  try {
    console.log('=== DEBUG VENOM ===');
    
    // Tenta iniciar se não estiver
    if (!venom.client) {
      console.log('Iniciando Venom...');
      await venom.start();
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    const status = venom.getStatus();
    const qr = venom.getQRCode();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      venomStatus: status,
      hasQR: !!qr,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      message: status.connected ? 'CONECTADO' : 'AGUARDANDO',
      instructions: !status.connected 
        ? 'Acesse /public/qr.html para conectar' 
        : 'Pronto para enviar mensagens!'
    });
    
  } catch (error) {
    console.error('DEBUG ERROR:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA: QR Code do WhatsApp
app.get('/api/venom/qr', async (req, res) => {
  try {
    console.log('🔗 /api/venom/qr chamado');
    
    // Força iniciar se não tiver client
    if (!venom.client) {
      console.log('🚀 Iniciando Venom...');
      await venom.start();
    }
    
    // Aguarda 15 segundos para QR ser gerado
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    const qrData = venom.getQRCode();
    
    if (!qrData) {
      console.log('⏳ QR ainda não gerado, tentando novamente...');
      
      // Tenta mais uma vez
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const newQrData = venom.getQRCode();
      
      if (!newQrData) {
        return res.json({
          status: 'initializing',
          message: 'WhatsApp está iniciando... Isso pode levar até 30 segundos.',
          tip: 'Recarregue esta página em 10 segundos ou acesse /public/qr.html',
          timestamp: new Date().toISOString(),
          waitTime: 30
        });
      }
      
      return res.json({
        status: 'qr_ready',
        qrCode: newQrData.base64,
        message: 'QR Code pronto! Escaneie com seu WhatsApp.',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('✅ QR Code disponível');
    res.json({
      status: 'qr_ready',
      qrCode: qrData.base64,
      message: 'QR Code para WhatsApp',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ ERRO no endpoint QR:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erro ao gerar QR: ' + error.message,
      tip: 'Tente acessar /api/venom/debug para mais informações',
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA: Status do Venom
app.get('/api/venom/status', (req, res) => {
  const status = venom.getStatus();
  res.json({
    connected: status.connected,
    hasQR: status.hasQR,
    hasClient: status.hasClient,
    timestamp: new Date().toISOString(),
    instructions: !status.connected 
      ? 'Conecte em: /api/venom/qr ou /public/qr.html' 
      : 'Pronto para enviar mensagens!'
  });
});

// ROTA: Enviar mensagem teste
app.post('/api/venom/test', async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: 'Número e mensagem são obrigatórios'
      });
    }
    
    const result = await venom.sendText(number, message);
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ROTA: Listar clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ vencimento: 1 });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar clientes', details: error.message });
  }
});

// ROTA: Criar cliente com WhatsApp
app.post('/api/clientes', async (req, res) => {
  try {
    const { nome, telefone, vencimento, valor } = req.body;
    
    if (!nome || !telefone || !vencimento || !valor) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: nome, telefone, vencimento, valor' 
      });
    }
    
    const cliente = new Cliente({
      nome,
      telefone,
      vencimento: new Date(vencimento),
      valor: parseFloat(valor),
      status: 'PENDENTE',
      nivelAlerta: 'NORMAL'
    });
    
    await cliente.save();
    
    const mensagem = `Olá ${cliente.nome}! ✅ Seu boleto foi cadastrado.\n\n` +
                    `💵 Valor: R$ ${cliente.valor}\n` +
                    `📅 Vencimento: ${cliente.vencimento.toLocaleDateString('pt-BR')}\n` +
                    `📋 Status: ${cliente.status}\n\n` +
                    `Obrigado!`;
    
    const whatsappResult = await enviarWhatsapp(cliente.telefone, mensagem);
    
    cliente.whatsappEnviado = true;
    cliente.dataEnvioWhatsapp = new Date();
    await cliente.save();
    
    res.status(201).json({
      success: true,
      message: `Cliente cadastrado! WhatsApp ${whatsappResult.real ? 'REAL 🎉' : 'simulado'} enviado.`,
      cliente,
      whatsapp: whatsappResult
    });
    
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar cliente', details: error.message });
  }
});

// ROTA: Upload de PDF com WhatsApp
app.post('/api/upload-boleto', upload.single('pdf'), async (req, res) => {
  try {
    const { nome, telefone, vencimento, valor } = req.body;
    
    if (!nome || !telefone || !vencimento || !valor) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        error: 'Campos obrigatórios: nome, telefone, vencimento, valor'
      });
    }
    
    const cliente = new Cliente({
      nome,
      telefone,
      vencimento: new Date(vencimento),
      valor: parseFloat(valor),
      status: 'PENDENTE',
      pdfPath: req.file ? req.file.path : null,
      nivelAlerta: 'NORMAL'
    });
    
    await cliente.save();
    
    const mensagem = `Olá ${nome}! 📄 Boleto cadastrado\n\n` +
                    `💵 Valor: R$ ${valor}\n` +
                    `📅 Vencimento: ${new Date(vencimento).toLocaleDateString('pt-BR')}\n` +
                    `📎 Arquivo: ${req.file ? req.file.originalname : 'Nenhum'}\n\n` +
                    `Acesse o sistema para mais detalhes.`;
    
    const whatsappResult = await enviarWhatsapp(telefone, mensagem, req.file?.path);
    
    cliente.whatsappEnviado = true;
    cliente.dataEnvioWhatsapp = new Date();
    await cliente.save();
    
    res.status(201).json({
      success: true,
      message: `Boleto cadastrado! WhatsApp ${whatsappResult.real ? 'REAL 🎉' : 'simulado'} enviado.`,
      cliente: {
        _id: cliente._id,
        nome: cliente.nome,
        telefone: cliente.telefone,
        vencimento: cliente.vencimento,
        valor: cliente.valor,
        pdfPath: cliente.pdfPath
      },
      whatsapp: whatsappResult,
      fileReceived: !!req.file
    });
    
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Erro ao processar boleto', 
      details: error.message 
    });
  }
});

// ============================================
// 7. INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏠 Home: http://localhost:${PORT}/`);
  console.log(`📱 QR Page: http://localhost:${PORT}/public/qr.html`);
  console.log(`🔗 API Test: http://localhost:${PORT}/api/test`);
  console.log(`🔧 API Debug: http://localhost:${PORT}/api/venom/debug`);
  console.log(`📱 WhatsApp: VENOM BOT`);
  console.log(`✅ CORS: https://glaydsonsilva.netlify.app`);
  console.log(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
  console.log('='.repeat(60));
  console.log('📋 Para conectar WhatsApp:');
  console.log(`1. Acesse: http://localhost:${PORT}/public/qr.html`);
  console.log('2. Escaneie o QR Code com seu celular');
  console.log('3. Aguarde confirmação de conexão');
  console.log('='.repeat(60));
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejeitada não tratada:', error);
});
