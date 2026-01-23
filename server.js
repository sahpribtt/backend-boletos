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
    
    // Usa o Venom para enviar
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

// ============================================
// 6. FUNÇÃO WHATSAPP SIMULADO (FALLBACK)
// ============================================
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
  
  // Salvar log
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
// 7. ROTAS DA API
// ============================================

// ROTA 1: Teste do servidor
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
      : 'Acesse /api/venom/qr para conectar WhatsApp',
    endpoints: {
      qr: '/api/venom/qr',
      status: '/api/venom/status',
      sendTest: '/api/venom/test',
      clientes: '/api/clientes',
      upload: '/api/upload-boleto'
    }
  });
});

// ROTA 2: Status do WhatsApp
app.get('/api/whatsapp-status', async (req, res) => {
  const logsDir = 'whatsapp_logs';
  let totalEnvios = 0;
  let ultimosEnvios = [];
  
  // Ler logs
  try {
    const logFile = path.join(logsDir, 'envios.json');
    if (fs.existsSync(logFile)) {
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      totalEnvios = logs.length;
      ultimosEnvios = logs.slice(-5).reverse();
    }
  } catch (error) {
    console.error('Erro ao ler logs:', error);
  }
  
  const venomStatus = venom.getStatus();
  
  res.json({
    provider: 'VENOM BOT',
    connected: venomStatus.connected,
    mode: venomStatus.connected ? 'REAL 🎉' : 'DESCONECTADO',
    message: venomStatus.connected 
      ? 'WhatsApp conectado via Venom!' 
      : 'Conecte o WhatsApp em /api/venom/qr',
    stats: {
      totalEnvios,
      hoje: new Date().toLocaleDateString('pt-BR')
    },
    ultimosEnvios,
    venomStatus: venomStatus
  });
});

// ROTA 3: Listar clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ vencimento: 1 });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar clientes', details: error.message });
  }
});

// ROTA 4: Criar cliente com WhatsApp
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
    
    // Enviar WhatsApp
    const mensagem = `Olá ${cliente.nome}! ✅ Seu boleto foi cadastrado.\n\n` +
                    `💵 Valor: R$ ${cliente.valor}\n` +
                    `📅 Vencimento: ${cliente.vencimento.toLocaleDateString('pt-BR')}\n` +
                    `📋 Status: ${cliente.status}\n\n` +
                    `Obrigado!`;
    
    const whatsappResult = await enviarWhatsapp(cliente.telefone, mensagem);
    
    // Atualizar cliente
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

// ROTA 5: Upload de PDF com WhatsApp
app.post('/api/upload-boleto', upload.single('pdf'), async (req, res) => {
  try {
    console.log('📥 Recebendo upload de boleto...');
    
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
    console.log('✅ Cliente salvo no MongoDB:', cliente._id);
    
    // Enviar WhatsApp
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
    console.error('❌ Erro no upload:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Erro ao processar boleto', 
      details: error.message 
    });
  }
});

// ROTA 6: Enviar WhatsApp para cliente específico
app.post('/api/enviar-whatsapp/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    const mensagem = `Olá ${cliente.nome}! ⏰ Lembrete de boleto\n\n` +
                    `💵 Valor: R$ ${cliente.valor}\n` +
                    `📅 Vencimento: ${cliente.vencimento.toLocaleDateString('pt-BR')}\n` +
                    `📋 Status: ${cliente.status}\n\n` +
                    `Por favor, regularize seu pagamento.`;
    
    const resultado = await enviarWhatsapp(cliente.telefone, mensagem, cliente.pdfPath);
    
    if (resultado.success) {
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
    }
    
    res.json({
      success: resultado.success,
      message: `WhatsApp ${resultado.real ? 'REAL 🎉' : 'simulado'} enviado!`,
      cliente: {
        _id: cliente._id,
        nome: cliente.nome,
        telefone: cliente.telefone
      },
      whatsapp: resultado
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar WhatsApp', details: error.message });
  }
});

// ROTA 7: Marcar como pago
app.put('/api/clientes/:id/pago', async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      { status: 'PAGO', nivelAlerta: 'NORMAL' },
      { new: true }
    );
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Enviar mensagem de agradecimento
    const mensagem = `Olá ${cliente.nome}! 🎉 Pagamento confirmado!\n\n` +
                    `✅ Boleto de R$ ${cliente.valor} foi pago.\n` +
                    `📅 Vencimento: ${cliente.vencimento.toLocaleDateString('pt-BR')}\n` +
                    `🙏 Obrigado pela pontualidade!`;
    
    const whatsappResult = await enviarWhatsapp(cliente.telefone, mensagem);
    
    res.json({
      success: true,
      message: `Boleto marcado como PAGO! Agradecimento ${whatsappResult.real ? 'REAL 🎉' : 'simulado'} enviado.`,
      cliente,
      whatsapp: whatsappResult
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status', details: error.message });
  }
});

// ROTA 8: Ver logs WhatsApp
app.get('/api/whatsapp-logs', (req, res) => {
  try {
    const logFile = path.join('whatsapp_logs', 'envios.json');
    if (!fs.existsSync(logFile)) {
      return res.json({ 
        total: 0, 
        logs: [],
        message: 'Nenhum envio registrado ainda'
      });
    }
    
    const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    res.json({ 
      total: logs.length, 
      logs: logs.reverse(),
      summary: {
        reais: logs.filter(l => l.provider === 'VENOM').length,
        simulados: logs.filter(l => l.provider === 'VENOM-FALLBACK').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler logs', details: error.message });
  }
});

// ROTA 9: Servir arquivos
app.get('/api/uploads/:file', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// ============================================
// 8. ROTAS VENOM (PARA CONECTAR WHATSAPP)
// ============================================

// ROTA para obter QR Code
app.get('/api/venom/qr', async (req, res) => {
  try {
    const qrData = venom.getQRCode();
    
    if (!qrData) {
      // Inicia WhatsApp
      await venom.start();
      
      // Aguarda 3 segundos
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const newQrData = venom.getQRCode();
      
      if (!newQrData) {
        return res.json({
          status: 'initializing',
          message: 'Aguarde... recarregue em 5 segundos.',
          refreshIn: 5
        });
      }
      
      return res.json({
        status: 'qr_ready',
        qrCode: newQrData.base64,
        message: 'Escaneie com seu WhatsApp'
      });
    }
    
    res.json({
      status: 'qr_ready',
      qrCode: qrData.base64,
      message: 'QR Code para WhatsApp'
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ROTA para status do Venom
app.get('/api/venom/status', (req, res) => {
  const status = venom.getStatus();
  res.json({
    connected: status.connected,
    hasQR: status.hasQR,
    hasClient: status.hasClient,
    timestamp: new Date().toISOString(),
    instructions: !status.connected 
      ? 'Conecte em: /api/venom/qr' 
      : 'Pronto para enviar mensagens!'
  });
});

// ROTA para enviar teste direto
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

// ROTA para desconectar Venom
app.post('/api/venom/logout', async (req, res) => {
  try {
    if (venom.client) {
      await venom.client.logout();
    }
    venom.isConnected = false;
    venom.client = null;
    
    res.json({
      success: true,
      message: 'Desconectado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 9. INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 API Test: http://localhost:${PORT}/api/test`);
  console.log(`📱 WhatsApp: VENOM BOT`);
  console.log(`🔗 QR Code: http://localhost:${PORT}/api/venom/qr`);
  console.log(`✅ CORS: https://glaydsonsilva.netlify.app`);
  console.log(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
  console.log('='.repeat(60));
  console.log('📋 Para conectar WhatsApp:');
  console.log(`1. Acesse: http://localhost:${PORT}/api/venom/qr`);
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
