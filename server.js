const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

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
    dataCadastro: { type: Date, default: Date.now }
});

const Cliente = mongoose.model('Cliente', clienteSchema);

// ========== ROTAS ==========

// 1. LISTAR CLIENTES
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await Cliente.find().sort({ vencimento: 1 });
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. ADICIONAR CLIENTE
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
        
        console.log(`✅ Cliente salvo: ${nome} - R$ ${valor}`);
        
        res.json({ 
            success: true, 
            cliente,
            mensagem: 'Boleto cadastrado com sucesso!'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. ATUALIZAR STATUS
app.put('/api/clientes/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const cliente = await Cliente.findById(req.params.id);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        cliente.status = status;
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

// 4. ROTA DE TESTE
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Backend funcionando!',
        timestamp: new Date(),
        mongodb: 'Conectado'
    });
});

// ROTA RAIZ
app.get('/', (req, res) => {
    res.json({ 
        message: 'Backend Sistema de Boletos',
        endpoints: {
            clientes: '/api/clientes',
            test: '/api/test'
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT}`);
});
