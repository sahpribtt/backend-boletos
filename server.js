// ============================================
// SERVER.JS - Sistema de Gestão de Boletos WhatsApp
// Backend com MongoDB e WhatsApp REAL via Z-API
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
// 5. CONFIGURAÇÃO VENOM WHATSAPP (SIMPLES!)
// ============================================

// Função principal para enviar WhatsApp AGORA COM VENOM
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
// 8. FUNÇÃO WHATSAPP SIMULADO (FALLBACK)
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
    provider: 'SIMULAÇÃO'
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
    message: isZAPIConfigured() 
      ? 'Z-API falhou, mensagem simulada' 
      : 'Configure Z-API no Render Dashboard para envio real'
  };
}

// ============================================
// 9. ROTAS DA API
// ============================================

// ROTA 1: Teste do servidor
app.get('/api/test', (req, res) => {
  const zapiConfigurado = isZAPIConfigured();
  
  res.json({
    message: '✅ Sistema de Boletos WhatsApp funcionando!',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado',
    whatsapp: zapiConfigurado ? 'Z-API Configurado 🎉' : 'SIMULADO (configure Z-API)',
    zapiConfigured: zapiConfigurado,
    zapiConfig: {
      hasInstanceId: !!ZAPI_INSTANCE_ID,
      hasToken: !!ZAPI_TOKEN,
      instanceIdValid: ZAPI_INSTANCE_ID !== 'SUA_INSTANCE_ID_AQUI',
      tokenValid: ZAPI_TOKEN !== 'SEU_TOKEN_AQUI'
    },
    avisos: 'Ativo (verificação diária às 9h)',
    cors: 'Configurado para Netlify',
    instrucoes: zapiConfigurado 
      ? 'WhatsApp REAL ativo via Z-API!' 
      : 'Para WhatsApp real: Configure ZAPI_INSTANCE_ID e ZAPI_TOKEN no Render Dashboard'
  });
});

// ROTA 2: Status do WhatsApp
app.get('/api/whatsapp-status', async (req, res) => {
  const logsDir = 'whatsapp_logs';
  let totalEnvios = 0;
  let ultimosEnvios = [];
  let zapiTest = null;
  
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
  
  // Testar Z-API se configurado
  const zapiConfigurado = isZAPIConfigured();
  if (zapiConfigurado) {
    try {
      const testUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/status`;
      const response = await fetch(testUrl, {
        headers: { 'Client-Token': ZAPI_TOKEN }
      });
      
      zapiTest = {
        status: response.status,
        ok: response.ok,
        online: response.ok
      };
      
      if (response.ok) {
        const data = await response.json();
        zapiTest.details = data;
      }
    } catch (error) {
      zapiTest = { 
        error: error.message,
        online: false
      };
    }
  }
  
  res.json({
    provider: zapiConfigurado ? 'Z-API' : 'SIMULADO',
    configured: zapiConfigurado,
    connected: zapiConfigurado ? (zapiTest?.online || false) : true,
    mode: zapiConfigurado ? 'REAL 🎉' : 'TESTE (simulado)',
    message: zapiConfigurado 
      ? 'Z-API configurado. WhatsApp REAL ativo!' 
      : 'Configure Z-API no Render Dashboard para WhatsApp real.',
    stats: {
      totalEnvios,
      hoje: new Date().toLocaleDateString('pt-BR'),
      zapiTest: zapiTest
    },
    ultimosEnvios,
    configInfo: {
      hasCredentials: !!ZAPI_INSTANCE_ID && !!ZAPI_TOKEN,
      instanceIdPresent: ZAPI_INSTANCE_ID !== '3EDA88A2D647214BD1661AA3C48FFF2B',
      tokenPresent: ZAPI_TOKEN !== '1D69AC03D290655DAF386BF7'
    },
    help: {
      renderConfig: 'No Render Dashboard: Environment → Add Variable',
      variablesNeeded: 'ZAPI_INSTANCE_ID e ZAPI_TOKEN',
      testUrl: zapiConfigurado 
        ? `https://backend-boletos-v2.onrender.com/api/test-zapi` 
        : null
    }
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

// ROTA 6: Testar Z-API diretamente
app.get('/api/test-zapi', async (req, res) => {
  const zapiConfigurado = isZAPIConfigured();
  
  if (!zapiConfigurado) {
    return res.status(400).json({ 
      success: false,
      error: 'Z-API não configurado',
      instrucoes: {
        step1: 'Acesse Render Dashboard',
        step2: 'Vá em Environment → Add Variable',
        step3: 'Adicione: ZAPI_INSTANCE_ID = sua_instance_id',
        step4: 'Adicione: ZAPI_TOKEN = seu_token',
        step5: 'Redeploy e teste novamente'
      },
      currentConfig: {
        instanceId: ZAPI_INSTANCE_ID,
        token: ZAPI_TOKEN ? '***presente***' : 'ausente'
      }
    });
  }
  
  try {
    const testUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/status`;
    console.log('🔗 Testando Z-API:', testUrl.replace(ZAPI_TOKEN, '***'));
    
    const response = await fetch(testUrl, {
      headers: { 'Client-Token': ZAPI_TOKEN }
    });
    
    const status = await response.json();
    
    res.json({
      success: response.ok,
      statusCode: response.status,
      zapiStatus: status,
      config: {
        instanceId: ZAPI_INSTANCE_ID ? '***' + ZAPI_INSTANCE_ID.slice(-8) : 'N/A',
        hasToken: !!ZAPI_TOKEN,
        tokenLength: ZAPI_TOKEN ? ZAPI_TOKEN.length : 0
      },
      message: response.ok 
        ? '✅ Z-API conectado e funcionando!' 
        : '❌ Z-API com problemas'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      config: {
        instanceId: ZAPI_INSTANCE_ID ? '***' + ZAPI_INSTANCE_ID.slice(-8) : 'N/A',
        hasToken: !!ZAPI_TOKEN
      }
    });
  }
});

// ROTA 7: Enviar WhatsApp para cliente específico
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

// ROTA 8: Marcar como pago
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

// ROTA 9: Ver logs WhatsApp
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
        reais: logs.filter(l => l.provider === 'Z-API').length,
        simulados: logs.filter(l => l.provider === 'SIMULAÇÃO').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler logs', details: error.message });
  }
});

// ROTA 10: Servir arquivos
app.get('/api/uploads/:file', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// ============================================
// 10. INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  const zapiConfigurado = isZAPIConfigured();
  
  console.log('='.repeat(60));
  console.log('🚀 SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 API Test: http://localhost:${PORT}/api/test`);
  console.log(`📱 WhatsApp: ${zapiConfigurado ? 'Z-API CONFIGURADO 🎉' : 'MODO SIMULAÇÃO'}`);
  console.log(`✅ CORS: https://glaydsonsilva.netlify.app`);
  console.log(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
  console.log('='.repeat(60));
  
  if (!zapiConfigurado) {
    console.log('⚠️ ATENÇÃO: Z-API não configurado!');
    console.log('📋 Para WhatsApp REAL:');
    console.log('1. Acesse Render Dashboard');
    console.log('2. Vá em Environment → Add Variable');
    console.log('3. Adicione: ZAPI_INSTANCE_ID = sua_instance_id');
    console.log('4. Adicione: ZAPI_TOKEN = seu_token');
    console.log('5. Aguarde redeploy automático');
    console.log('='.repeat(60));
  }
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejeitada não tratada:', error);
});
