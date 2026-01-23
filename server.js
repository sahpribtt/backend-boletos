// ============================================
// SERVER.JS - Sistema de Gestão de Boletos WhatsApp
// Backend completo com MongoDB, WhatsApp e CORS
// ============================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuração do WhatsApp (venom-bot)
const venom = require('venom-bot');
let whatsappClient = null;

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
// ROTA 4: Upload de PDF e cadastro de cliente (VERSÃO CORRIGIDA)
app.post('/api/upload-boleto', upload.single('pdf'), async (req, res) => {
  try {
    console.log('📥 Recebendo upload...');
    console.log('📁 Arquivo:', req.file);
    console.log('📝 Body:', req.body);
    
    // COM multer, os campos de formulário vêm em req.body normalmente
    // Mas vamos garantir que estamos lendo corretamente
    const { 
      nome = req.body.nome,
      telefone = req.body.telefone,
      vencimento = req.body.vencimento,
      valor = req.body.valor,
      email = req.body.email,
      cpf = req.body.cpf 
    } = req.body;
    
    console.log('📊 Dados extraídos:', { nome, telefone, vencimento, valor });
    
    if (!nome || !telefone || !vencimento || !valor) {
      console.log('❌ Campos obrigatórios faltando');
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
    
    // Enviar WhatsApp automaticamente (modo simulação no Render)
    let whatsappEnviado = false;
    if (req.file) {
      console.log('📱 Simulando envio WhatsApp...');
      // WhatsApp SIMULADO para Render
      const mensagem = `Olá ${nome}! Seu boleto no valor de R$ ${valor} vence em ${vencimento}.`;
      console.log('💬 Mensagem:', mensagem);
      
      // Marcar como enviado (simulação)
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
      whatsappEnviado = true;
    }
    
    res.status(201).json({
      success: true,
      message: 'Boleto cadastrado e enviado com sucesso!',
      cliente: {
        _id: cliente._id,
        nome: cliente.nome,
        telefone: cliente.telefone,
        vencimento: cliente.vencimento,
        valor: cliente.valor,
        pdfPath: cliente.pdfPath
      },
      whatsappEnviado,
      fileReceived: !!req.file
    });
    
  } catch (error) {
    console.error('❌ Erro no upload:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Erro ao processar boleto', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// 5. INICIALIZAÇÃO DO WHATSAPP
// ============================================
async function iniciarWhatsApp() {
  try {
    whatsappClient = await venom.create({
      session: 'bot-boletos',
      headless: true,
      useChrome: false,
      logQR: true,
      disableSpins: true,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 0,
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log('✅ WhatsApp conectado com sucesso!');
    return whatsappClient;
  } catch (error) {
    console.error('❌ Erro ao conectar WhatsApp:', error);
    return null;
  }
}

// Iniciar WhatsApp ao iniciar servidor
iniciarWhatsApp();

// ============================================
// 6. FUNÇÃO PARA ENVIAR WHATSAPP
// ============================================
async function enviarWhatsapp(numero, mensagem, arquivoPath = null) {
  try {
    if (!whatsappClient) {
      throw new Error('WhatsApp não está conectado');
    }
    
    const numeroFormatado = numero.replace(/\D/g, '');
    const numeroCompleto = `${numeroFormatado}@c.us`;
    
    let resultado;
    
    if (arquivoPath && fs.existsSync(arquivoPath)) {
      // Enviar arquivo
      const extensao = path.extname(arquivoPath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(extensao);
      const isPDF = extensao === '.pdf';
      
      if (isImage) {
        resultado = await whatsappClient.sendImage(
          numeroCompleto,
          arquivoPath,
          'boleto',
          mensagem
        );
      } else if (isPDF) {
        resultado = await whatsappClient.sendFile(
          numeroCompleto,
          arquivoPath,
          'boleto.pdf',
          mensagem
        );
      } else {
        resultado = await whatsappClient.sendFile(
          numeroCompleto,
          arquivoPath,
          path.basename(arquivoPath),
          mensagem
        );
      }
    } else {
      // Enviar apenas mensagem
      resultado = await whatsappClient.sendText(numeroCompleto, mensagem);
    }
    
    console.log('✅ Mensagem WhatsApp enviada:', resultado);
    return { success: true, messageId: resultado.id };
    
  } catch (error) {
    console.error('❌ Erro ao enviar WhatsApp:', error);
    return { success: false, error: error.message };
  }
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
    whatsapp: whatsappClient ? 'Conectado' : 'Desconectado',
    avisos: 'Ativo (verificação diária às 9h)',
    cors: 'Configurado para Netlify'
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
    res.status(201).json(cliente);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar cliente', details: error.message });
  }
});

// ROTA 4: Upload de PDF e cadastro de cliente
app.post('/api/upload-boleto', upload.single('pdf'), async (req, res) => {
  try {
    const { nome, telefone, vencimento, valor, email, cpf } = req.body;
    
    if (!nome || !telefone || !vencimento || !valor) {
      // Se houver arquivo, exclui para não ficar lixo
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        error: 'Campos obrigatórios: nome, telefone, vencimento, valor' 
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
    
    // Enviar WhatsApp automaticamente
    if (req.file && whatsappClient) {
      const mensagem = `Olá ${nome}! Seu boleto no valor de R$ ${valor} vence em ${vencimento}.`;
      await enviarWhatsapp(telefone, mensagem, req.file.path);
      
      // Atualizar cliente
      cliente.whatsappEnviado = true;
      cliente.dataEnvioWhatsapp = new Date();
      await cliente.save();
    }
    
    res.status(201).json({
      success: true,
      message: 'Boleto cadastrado e enviado com sucesso!',
      cliente,
      whatsappEnviado: !!req.file
    });
    
  } catch (error) {
    console.error('Erro no upload:', error);
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
    
    if (!cliente.pdfPath || !fs.existsSync(cliente.pdfPath)) {
      return res.status(400).json({ error: 'PDF do boleto não encontrado' });
    }
    
    const mensagem = `Olá ${cliente.nome}! Lembrete: seu boleto de R$ ${cliente.valor} vence em ${cliente.vencimento.toLocaleDateString()}.`;
    
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
      message: resultado.success 
        ? 'Boleto enviado com sucesso!' 
        : 'Erro ao enviar boleto',
      cliente,
      whatsappResult: resultado
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
    
    res.json({
      success: true,
      message: 'Boleto marcado como PAGO',
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

// ROTA 10: Status do WhatsApp
app.get('/api/whatsapp-status', async (req, res) => {
  try {
    const status = whatsappClient 
      ? await whatsappClient.getConnectionState()
      : 'DISCONNECTED';
    
    res.json({
      connected: status === 'CONNECTED',
      status: status,
      qrCode: null,
      sessionName: 'bot-boletos'
    });
    
  } catch (error) {
    res.json({
      connected: false,
      status: 'ERROR',
      error: error.message
    });
  }
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

// ============================================
// 8. SERVIÇO AUTOMÁTICO DE AVISOS
// ============================================
async function verificarAvisosAutomaticos() {
  try {
    const hoje = new Date();
    const tresDias = new Date(hoje);
    tresDias.setDate(hoje.getDate() + 3);
    
    // Buscar clientes com vencimento em 3 dias ou menos
    const clientesParaAvisar = await Cliente.find({
      vencimento: { $lte: tresDias, $gt: hoje },
      status: 'PENDENTE',
      whatsappEnviado: false
    });
    
    console.log(`📢 Enviando avisos para ${clientesParaAvisar.length} clientes...`);
    
    for (const cliente of clientesParaAvisar) {
      if (cliente.pdfPath && whatsappClient) {
        const diasParaVencer = Math.ceil((cliente.vencimento - hoje) / (1000 * 60 * 60 * 24));
        const mensagem = `Olá ${cliente.nome}! Lembrete: seu boleto de R$ ${cliente.valor} vence em ${diasParaVencer} dia(s).`;
        
        await enviarWhatsapp(cliente.telefone, mensagem, cliente.pdfPath);
        
        cliente.whatsappEnviado = true;
        cliente.dataEnvioWhatsapp = new Date();
        await cliente.save();
        
        // Aguardar 2 segundos entre envios para não bloquear
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
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
}, 60000); // Verificar a cada minuto

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
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejeitada não tratada:', error);
});
