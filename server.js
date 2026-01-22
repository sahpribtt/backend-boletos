const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://glaydsonsilva.netlify.app', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());

// Conexão MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Atlas conectado!'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Configuração Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

let twilioClient;
let whatsappConfigurado = false;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    whatsappConfigurado = true;
    console.log('✅ Twilio configurado para WhatsApp');
} else {
    console.log('⚠️ Twilio não configurado - WhatsApp será simulado');
}

// Função para enviar WhatsApp
async function enviarWhatsApp(telefone, mensagem) {
    try {
        if (!whatsappConfigurado || !twilioClient) {
            console.log(`📱 WhatsApp SIMULADO para ${telefone}: ${mensagem.substring(0, 50)}...`);
            return { success: true, simulated: true };
        }

        const message = await twilioClient.messages.create({
            body: mensagem,
            from: TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${telefone}`
        });
        
        console.log(`✅ WhatsApp ENVIADO para ${telefone}: ${message.sid}`);
        return { success: true, messageId: message.sid, simulated: false };
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error.message);
        return { success: false, error: error.message };
    }
}

// Modelo do Cliente
const clienteSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    vencimento: { type: Date, required: true },
    valor: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pendente', 'pago', 'atrasado'], 
        default: 'pendente' 
    },
    mensagensEnviadas: [{
        tipo: String, // 'cadastro', 'lembrete_7_dias', 'lembrete_3_dias', 'lembrete_hoje', 'atraso', 'pagamento'
        dataEnvio: Date,
        status: String
    }],
    dataCadastro: { type: Date, default: Date.now }
});

const Cliente = mongoose.model('Cliente', clienteSchema);

// ========== SISTEMA DE AVISOS AUTOMÁTICOS ==========

async function verificarAvisosAutomaticos() {
    console.log('🔔 Verificando avisos automáticos...');
    
    const hoje = new Date();
    const clientesPendentes = await Cliente.find({ 
        status: 'pendente'
    });

    for (const cliente of clientesPendentes) {
        const vencimento = new Date(cliente.vencimento);
        const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));
        
        // Verificar se já enviou mensagem hoje
        const hojeStr = hoje.toDateString();
        const jaEnviouHoje = cliente.mensagensEnviadas.some(msg => 
            new Date(msg.dataEnvio).toDateString() === hojeStr
        );

        if (jaEnviouHoje) continue;

        let mensagem = '';
        let tipoMensagem = '';

        // AVISO: 7 DIAS ANTES
        if (diffDias === 7) {
            tipoMensagem = 'lembrete_7_dias';
            mensagem = `Olá ${cliente.nome}! 😊\n\n⏰ *LEMBRETE AMIGÁVEL*\nFaltam 7 dias para o vencimento do seu boleto.\n💰 Valor: R$ ${cliente.valor.toFixed(2)}\n📅 Vencimento: ${vencimento.toLocaleDateString('pt-BR')}\n\nEvite juros e multas!`;

        // AVISO: 3 DIAS ANTES (URGENTE)
        } else if (diffDias === 3) {
            tipoMensagem = 'lembrete_3_dias';
            mensagem = `Olá ${cliente.nome}! ⚠️\n\n🚨 *ATENÇÃO: 3 DIAS PARA VENCER!*\nFaltam apenas 3 dias para o vencimento!\n💰 Valor: R$ ${cliente.valor.toFixed(2)}\n📅 Vencimento: ${vencimento.toLocaleDateString('pt-BR')}\n\n*Pague agora para evitar bloqueios!*`;

        // AVISO: VENCENDO HOJE
        } else if (diffDias === 0) {
            tipoMensagem = 'lembrete_hoje';
            mensagem = `Olá ${cliente.nome}! 🚨\n\n⏰ *VENCIMENTO HOJE!*\nSeu boleto vence HOJE!\n💰 Valor: R$ ${cliente.valor.toFixed(2)}\n\n🔴 *PAGUE HOJE PARA EVITAR BLOQUEIO IMEDIATO!*`;

        // AVISO: ATRASADO
        } else if (diffDias < 0) {
            tipoMensagem = 'atraso';
            const diasAtraso = Math.abs(diffDias);
            mensagem = `Olá ${cliente.nome}! ⚠️\n\n🔴 *BOLETO EM ATRASO!*\nSeu boleto está atrasado há ${diasAtraso} dia(s).\n💰 Valor: R$ ${cliente.valor.toFixed(2)}\n📅 Venceu em: ${vencimento.toLocaleDateString('pt-BR')}\n\n🚫 *REGULARIZE IMEDIATAMENTE PARA EVITAR SUSPENSÃO!*`;
            
            // Atualizar status para atrasado
            cliente.status = 'atrasado';
        }

        if (mensagem) {
            try {
                const resultado = await enviarWhatsApp(cliente.telefone, mensagem);
                
                cliente.mensagensEnviadas.push({
                    tipo: tipoMensagem,
                    dataEnvio: new Date(),
                    status: resultado.success ? 'enviada' : 'erro'
                });
                
                await cliente.save();
                console.log(`✅ Aviso enviado para ${cliente.nome}: ${tipoMensagem}`);
            } catch (error) {
                console.error(`❌ Erro ao enviar para ${cliente.nome}:`, error);
            }
        }
    }
}

// Agendar verificação DIÁRIA às 9h
cron.schedule('0 9 * * *', () => {
    console.log('⏰ Executando verificação diária de avisos...');
    verificarAvisosAutomaticos();
});

// ========== ROTAS ==========

// POST /api/clientes - Cadastro com WhatsApp
app.post('/api/clientes', async (req, res) => {
    try {
        const { nome, telefone, vencimento, valor } = req.body;
        
        const cliente = new Cliente({
            nome,
            telefone,
            vencimento: new Date(vencimento),
            valor: parseFloat(valor)
        });

        await cliente.save();
        
        // WhatsApp de confirmação
        const mensagem = `Olá ${nome}! ✅\n\n*BOLETO CADASTRADO COM SUCESSO!*\n💰 Valor: R$ ${parseFloat(valor).toFixed(2)}\n📅 Vencimento: ${new Date(vencimento).toLocaleDateString('pt-BR')}\n\n📱 Você receberá lembretes automáticos 7 dias, 3 dias e no dia do vencimento.\n\nObrigado!`;
        
        const resultadoWhatsApp = await enviarWhatsApp(telefone, mensagem);
        
        // Registrar mensagem enviada
        cliente.mensagensEnviadas.push({
            tipo: 'cadastro',
            dataEnvio: new Date(),
            status: resultadoWhatsApp.success ? 'enviada' : 'erro'
        });
        await cliente.save();

        // Verificar avisos imediatamente (para testes)
        verificarAvisosAutomaticos();
        
        res.json({ 
            success: true, 
            cliente,
            whatsapp: {
                enviado: resultadoWhatsApp.success,
                simulado: resultadoWhatsApp.simulated || false
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/clientes/:id/status - Marcar como PAGO
app.put('/api/clientes/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const cliente = await Cliente.findById(req.params.id);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        cliente.status = status;
        
        // WhatsApp de agradecimento se PAGO
        if (status === 'pago') {
            const mensagem = `Olá ${cliente.nome}! 🎉\n\n✅ *PAGAMENTO CONFIRMADO!*\n💰 Valor: R$ ${cliente.valor.toFixed(2)}\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n\n📱 Seu cadastro está regularizado.\n\nAgradecemos pela confiança!`;
            
            const resultado = await enviarWhatsApp(cliente.telefone, mensagem);
            
            cliente.mensagensEnviadas.push({
                tipo: 'pagamento',
                dataEnvio: new Date(),
                status: resultado.success ? 'enviada' : 'erro'
            });
        }

        await cliente.save();
        res.json({ 
            success: true, 
            cliente,
            mensagem: `Status atualizado para: ${status}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/clientes - Listar todos
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await Cliente.find().sort({ vencimento: 1 });
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/test - Status do sistema
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Sistema de Boletos WhatsApp funcionando!',
        timestamp: new Date(),
        mongodb: 'Conectado',
        whatsapp: whatsappConfigurado ? 'Configurado' : 'Simulado',
        avisos: 'Ativo (verificação diária às 9h)'
    });
});

// GET / - Rota raiz
app.get('/', (req, res) => {
    res.json({ 
        message: 'Sistema Automático de Avisos WhatsApp',
        endpoints: {
            clientes: '/api/clientes (GET, POST)',
            status: '/api/clientes/:id/status (PUT)',
            test: '/api/test'
        },
        recursos: {
            avisos_automaticos: '7 dias, 3 dias, vencimento, atraso',
            whatsapp: whatsappConfigurado ? 'Real' : 'Simulado',
            banco_dados: 'MongoDB Atlas'
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Sistema de avisos rodando na porta ${PORT}`);
    console.log(`📱 WhatsApp: ${whatsappConfigurado ? 'CONFIGURADO' : 'MODO SIMULAÇÃO'}`);
    console.log(`🔔 Sistema de avisos: ATIVO (verificações diárias às 9h)`);
    
    // Verificar avisos ao iniciar
    verificarAvisosAutomaticos();
});
