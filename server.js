// ============================================
// SERVER.JS - Sistema de Gestão de Boletos WhatsApp
// Backend completo com MongoDB, WhatsApp SIMULADO e CORS
// ============================================

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
// 1. CONFIGURAÇÃO CORS (SOLUÇÃO DO SEU PROBLEMA)
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

// Aplicar CORS em TODAS as rotas
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // IMPORTANTE para requisições preflight

// Middleware para parsing JSON
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
// 5. WHATSAPP SIMULADO (FUNCIONAL PARA TESTES)
// ============================================

console.log('✅ WhatsApp em modo simulação (Render não suporta venom-bot)');

// ============================================
// 6. FUNÇÃO PARA ENVIAR WHATSAPP SIMULADO
// ============================================
async function enviarWhatsapp(numero, mensagem, arquivoPath = null) {
  console.log('='.repeat(60));
  console.log('📱 WHATSAPP SIMULADO - REGISTRO DO ENVIO:');
  console.log('='.repeat(60));
  console.log(`👤 Para: ${numero}`);
  console.log(`💬 Mensagem: ${mensagem}`);
  console.log(`📎 Anexo: ${arquivoPath ? 'Sim (' + path.basename(arquivoPath) + ')' : 'Não'}`);
  console.log(`⏰ Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(60));
  
  // Salvar log em arquivo
  const logDir = 'whatsapp_logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logEntry = {
    id: 'SIM-' + Date.now(),
    numero,
    mensagem,
    arquivo: arquivoPath ? path.basename(arquivoPath) : null,
    timestamp: new Date().toISOString(),
    status: 'SIMULADO'
  };
  
  const logFile = path.join(logDir, 'envios.json');
  let logs = [];
  
  if (fs.existsSync(logFile)) {
    logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  
  logs.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  
  console.log('✅ Registro salvo em:', logFile);
  
  return {
    success: true,
    messageId: logEntry.id,
    status: 'SIMULADO',
    fake: true,
    logEntry: logEntry,
    message: 'WhatsApp simulado para testes. Em produção, configure Twilio/Z-API.'
  };
}

// ============================================
// 7. ROTAS DA API
// ============================================

// ROTA 1: Teste do servidor
app.get('/api/test', (req, res) => {
  res.json({
    message: '✅ Sistema de Boletos WhatsApp funcionando!',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado',
    whatsapp: 'SIMULADO (para testes)',
    avisos: 'Ativo (verificação diária às 9h)',
    cors: 'Configurado para Netlify',
    instrucoes: 'Para WhatsApp real: Configure Twilio ou Z-API'
  });
});

// ROTA 2: Listar todos os clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ vencimento: 1 });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar clientes', details: error.message });
  }
});

// ROTA 3: Criar novo cliente
app.post('/api/clientes', async (req, res) => {
  try {
    const cliente = new Cliente(req.body);
    await cliente.save();
    
    // Simular envio WhatsApp
    const mensagem = `Olá ${cliente.nome}! Seu boleto no valor de R$ ${cliente.valor} foi cadastrado. Vencimento: ${cliente.vencimento.toLocaleDateString('pt-BR')}.`;
    await enviarWhatsapp(cliente.telefone, mensagem);
    
    // Atualizar cliente
    cliente.whatsappEnviado = true;
    cliente.dataEnvioWhatsapp = new Date();
    await cliente.save();
    
    res.status(201).json({
      success: true,
      message: 'Cliente cadastrado e WhatsApp simulado!',
      cliente,
      whatsappEnviado: true
    });
    
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar cliente', details: error.message });
  }
});

// ROTA 4: Upload de PDF e cadastro de cliente
app.post('/api/upload-boleto', upload.single('pdf'), async (req, res) => {
  try {
    console.log('📥 Recebendo upload...');
    
    const { nome, telefone, vencimento, valor, email, cpf } = req.body;
    
    if (!nome || !telefone || !vencimento || !valor) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        error: 'Campos obrigatórios: nome, telefone, vencimento, valor',
        received: { nome, telefone, vencimento, valor }
      });
    }
    
    // Criar cliente
    const cliente = new Cliente({
      nome,
      telefone,
      email,
      cpf,
      vencimento: new Date(vencimento),
      valor: parseFloat(valor),
      status: 'PENDENTE',
      pdfPath: req.file ? req.file.path : null,
      nivelAlerta: 'NORMAL'
    });
    
    await cliente.save();
    console.log('✅ Cliente salvo no MongoDB:', cliente._id);
    
    // Enviar WhatsApp automaticamente (simulado)
    let whatsappResultado = null;
    
    if (req.file) {
      const mensagem = `Olá ${nome}! 📄 Seu boleto foi cadastrado.\n\n` +
                      `💵 Valor: R$ ${valor}\n` +
                      `📅 Vencimento: ${new Date(vencimento).toLocaleDateString('pt-BR')}\n` +
                      `📎 Arquivo: ${req.file.originalname}`;
      
      whatsappResultado = await enviarWhatsapp(telefone, mensagem, req.file.path);
      
      // Atualizar cliente
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
    }
    
    res.status(201).json({
      success: true,
      message: 'Boleto cadastrado e WhatsApp simulado!',
      cliente: {
        _id: cliente._id,
        nome: cliente.nome,
        telefone: cliente.telefone,
        vencimento: cliente.vencimento,
        valor: cliente.valor,
        pdfPath: cliente.pdfPath
      },
      whatsappEnviado: !!req.file,
      whatsappResult: whatsappResultado,
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

// ROTA 5: Enviar boleto via WhatsApp
app.post('/api/enviar-whatsapp/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    const mensagem = `Olá ${cliente.nome}! Lembrete: seu boleto de R$ ${cliente.valor} vence em ${cliente.vencimento.toLocaleDateString('pt-BR')}.`;
    
    const resultado = await enviarWhatsapp(
      cliente.telefone,
      mensagem,
      cliente.pdfPath
    );
    
    if (resultado.success) {
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
    }
    
    res.json({
      success: resultado.success,
      message: 'Boleto simulado enviado com sucesso!',
      cliente,
      whatsappResult: resultado,
      instrucoes: 'Para envio real, configure Twilio/Z-API'
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao enviar WhatsApp', 
      details: error.message 
    });
  }
});

// ROTA 6: Marcar como pago
app.put('/api/clientes/:id/pago', async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'PAGO',
        nivelAlerta: 'NORMAL'
      },
      { new: true }
    );
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Enviar mensagem de agradecimento
    const mensagem = `Olá ${cliente.nome}! ✅ Seu pagamento foi confirmado. Obrigado!`;
    await enviarWhatsapp(cliente.telefone, mensagem);
    
    res.json({
      success: true,
      message: 'Boleto marcado como PAGO e agradecimento simulado!',
      cliente
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao atualizar status', 
      details: error.message 
    });
  }
});

// ROTA 7: Atualizar cliente
app.put('/api/clientes/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    res.json(cliente);
    
  } catch (error) {
    res.status(400).json({ 
      error: 'Erro ao atualizar cliente', 
      details: error.message 
    });
  }
});

// ROTA 8: Excluir cliente
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Excluir arquivo PDF se existir
    if (cliente.pdfPath && fs.existsSync(cliente.pdfPath)) {
      fs.unlinkSync(cliente.pdfPath);
    }
    
    await Cliente.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Cliente excluído com sucesso'
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao excluir cliente', 
      details: error.message 
    });
  }
});

// ROTA 9: Verificar boletos vencidos
app.get('/api/verificar-vencimentos', async (req, res) => {
  try {
    const hoje = new Date();
    const tresDias = new Date(hoje);
    tresDias.setDate(hoje.getDate() + 3);
    
    const seteDias = new Date(hoje);
    seteDias.setDate(hoje.getDate() + 7);
    
    // Boletos CRÍTICOS (menos de 3 dias)
    const criticos = await Cliente.find({
      vencimento: { $lte: tresDias, $gt: hoje },
      status: 'PENDENTE'
    });
    
    // Boletos ALERTA (entre 3 e 7 dias)
    const alertas = await Cliente.find({
      vencimento: { $lte: seteDias, $gt: tresDias },
      status: 'PENDENTE'
    });
    
    // Boletos VENCIDOS
    const vencidos = await Cliente.find({
      vencimento: { $lt: hoje },
      status: 'PENDENTE'
    });
    
    res.json({
      hoje: hoje.toISOString(),
      criticos: criticos.length,
      alertas: alertas.length,
      vencidos: vencidos.length,
      detalhes: {
        criticos,
        alertas,
        vencidos
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao verificar vencimentos', 
      details: error.message 
    });
  }
});

// ROTA 10: Status do WhatsApp Simulado
app.get('/api/whatsapp-status', async (req, res) => {
  const logsDir = 'whatsapp_logs';
  let totalEnvios = 0;
  let ultimosEnvios = [];
  
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
  
  res.json({
    provider: 'SIMULADO',
    configured: true,
    connected: true,
    mode: 'TESTE (gratuito)',
    message: 'WhatsApp em modo simulação. Para produção, configure Twilio/Z-API.',
    stats: {
      totalEnvios,
      hoje: new Date().toLocaleDateString('pt-BR'),
      ultimaAtualizacao: new Date().toISOString()
    },
    ultimosEnvios,
    instrucoes: {
      twilio: 'Para WhatsApp real: 1. Compre Twilio 2. Configure variáveis TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN',
      zapi: 'Alternativa brasileira: Z-API.io (mais barato)'
    }
  });
});

// ROTA 11: Servir arquivos PDF
app.get('/api/pdf/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// ROTA 12: Ver logs dos envios simulados
app.get('/api/whatsapp-logs', (req, res) => {
  try {
    const logFile = path.join('whatsapp_logs', 'envios.json');
    
    if (!fs.existsSync(logFile)) {
      return res.json({
        message: 'Nenhum envio registrado ainda',
        logs: []
      });
    }
    
    const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    
    res.json({
      total: logs.length,
      logs: logs.reverse()
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler logs', details: error.message });
  }
});

// ============================================
// 8. SERVIÇO AUTOMÁTICO DE AVISOS
// ============================================
async function verificarAvisosAutomaticos() {
  try {
    const hoje = new Date();
    const tresDias = new Date(hoje);
    tresDias.setDate(hoje.getDate() + 3);
    
    const clientesParaAvisar = await Cliente.find({
      vencimento: { $lte: tresDias, $gt: hoje },
      status: 'PENDENTE',
      whatsappEnviado: false
    });
    
    console.log(`📢 Simulando avisos para ${clientesParaAvisar.length} clientes...`);
    
    for (const cliente of clientesParaAvisar) {
      const diasParaVencer = Math.ceil((cliente.vencimento - hoje) / (1000 * 60 * 60 * 24));
      const mensagem = `Olá ${cliente.nome}! ⏰ Lembrete: seu boleto de R$ ${cliente.valor} vence em ${diasParaVencer} dia(s).`;
      
      await enviarWhatsapp(cliente.telefone, mensagem, cliente.pdfPath);
      
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('Erro no serviço automático:', error);
  }
}

// Executar verificação às 9h todos os dias
setInterval(() => {
  const agora = new Date();
  if (agora.getHours() === 9 && agora.getMinutes() === 0) {
    verificarAvisosAutomaticos();
  }
}, 60000);

// Executar uma vez ao iniciar
setTimeout(verificarAvisosAutomaticos, 10000);

// ============================================
// 9. INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
  console.log(`🔗 API Test: http://localhost:${PORT}/api/test`);
  console.log(`✅ CORS configurado para: https://glaydsonsilva.netlify.app`);
  console.log(`📱 WhatsApp: MODO SIMULAÇÃO (para testes)`);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejeitada não tratada:', error);
});
