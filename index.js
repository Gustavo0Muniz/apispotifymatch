// index.js
require('dotenv').config(); // Carrega variáveis de ambiente do .env
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const matchRoutes = require('./routes/match'); // Importa as rotas de /routes/match.js

const app = express();
const port = process.env.PORT || 3000;

// Configuração do CORS (permite requisições do frontend)
app.use(cors()); // Configuração básica, ajuste se necessário para produção

// Middleware
app.use(express.json()); // Para parsear JSON bodies
app.use(express.urlencoded({ extended: true })); // Para parsear URL-encoded bodies
app.use(cookieParser()); // Para parsear cookies

// Configuração da Sessão
// ATENÇÃO: MemoryStore não é recomendado para produção!
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true, // Salva sessões mesmo que não modificadas (útil para o state do OAuth)
    cookie: {
        // secure: process.env.NODE_ENV === 'production', // Use true em produção com HTTPS
        maxAge: 1000 * 60 * 60 * 2 // Duração da sessão (ex: 2 horas)
    }
}));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Usar as rotas definidas em routes/match.js para caminhos que começam com /match
app.use('/match', matchRoutes);

// Rota raiz opcional (pode redirecionar para index.html ou servir diretamente)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para verificar status da autenticação (opcional, mas útil para o frontend)
app.get('/auth/status', (req, res) => {
    res.json({
        user1LoggedIn: !!req.session.access_token_1,
        user2LoggedIn: !!req.session.access_token_2,
        user1Profile: req.session.user_profile_1 || null,
        user2Profile: req.session.user_profile_2 || null,
    });
});


app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log(`Certifique-se de que a Redirect URI no Spotify Dashboard seja: ${process.env.REDIRECT_URI}`);
});