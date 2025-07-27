// ARQUITETO: Adicionado dotenv para gerir variáveis de ambiente no servidor.
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs').promises;
const TelegramBot = require('node-telegram-bot-api');

// ARQUITETO: Adicionado Express para criar um endpoint de status, essencial para monitorização.
const express = require('express');
const app = express();

// ARQUITETO: A porta agora é lida do ficheiro .env, permitindo fácil configuração no servidor.
const PORT = process.env.PORT || 9001;

let telegramBotInstances = [];

const STATES = Object.freeze({
    INICIO: 'inicio',
    AGUARDANDO_OPCAO_MENU: 'aguardando_opcao_menu',
    AGUARDANDO_OPCAO_ORCAMENTO: 'aguardando_opcao_orcamento',
    AGUARDANDO_MODO_AGENDAMENTO: 'aguardando_modo_agendamento',
    AGUARDANDO_PRE_AGENDAMENTO_DETALHES: 'aguardando_pre_agendamento_detalhes',
    AGUARDANDO_DESCRICAO_DUVIDA: 'aguardando_descricao_duvida',
    AGUARDANDO_POS_PORTFOLIO: 'aguardando_pos_portfolio',
    AGUARDANDO_POS_SERVICOS: 'aguardando_pos_servicos',
    PRE_AGENDAMENTO_CONCLUIDO: 'pre_agendamento_concluido',
    DUVIDA_REGISTRADA: 'duvida_registrada',
    PARCERIA_INFO_DADA: 'parceria_info_dada',
    FORMULARIO_INSTRUCOES_DADAS: 'formulario_instrucoes_dadas',
    HUMANO_ATIVO: 'humano_ativo',
    AGUARDANDO_CONFIRMACAO_DUVIDA: 'aguardando_confirmacao_duvida',
    AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA: 'aguardando_resposta_pre_especialista',
    AGUARDANDO_INFO_PRE_ESPECIALISTA: 'aguardando_info_pre_especialista',
    AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA: 'aguardando_confirmacao_info_pre_especialista',
    AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA: 'aguardando_confirmacao_parceria_extra',
    AGUARDANDO_INFO_PARCERIA: 'aguardando_info_parceria',
    AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA: 'aguardando_confirmacao_mais_info_parceria',
});

const CONFIG = Object.freeze({
    BOT_STATE_FILE: 'bot_state_estudiojf.json',
    INACTIVE_SESSION_TIMEOUT: 3600000,
    MENU_RESET_TIMEOUT: 1800000,
    HUMAN_REMINDER_TIMEOUT: 600000,
    MAX_INVALID_ATTEMPTS: 2,
    FORM_LINK_ORCAMENTO: 'https://forms.gle/NVqAKXXTLnw5ZVfk6',
    EMAIL_PARCEIROS: 'parceiros@estudiojf.com.br',
    SITE_URL: 'https://www.estudiojf.com.br',
    SERVICOS_URL_ATUALIZADA: 'https://estudiojf.com.br/#servicos',
    SAVE_STATE_INTERVAL: 150,
    INACTIVITY_CHECK_INTERVAL: 60000,
    TYPING_BASE_DELAY: 50,
    TYPING_DELAY_PER_CHAR: 10,
    DEFAULT_TYPING_DURATION: 1500,
    LOAD_SAVE_DELAY: 150,
    // ARQUITETO: As configurações do Telegram agora dependem exclusivamente do arquivo .env.
    TELEGRAM_CONFIGS: [
        { 
            NAME: "Principal", 
            BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN_PRINCIPAL, 
            CHAT_ID: process.env.TELEGRAM_CHAT_ID_PRINCIPAL, 
            TIMEZONE: 'America/Sao_Paulo' 
        },
        { 
            NAME: "Secundario", 
            BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN_SECUNDARIO, 
            CHAT_ID: process.env.TELEGRAM_CHAT_ID_SECUNDARIO, 
            TIMEZONE: 'America/Sao_Paulo' 
        }
    ],
});

const MENSAGENS_ESTADO_PASSIVO = Object.freeze({
    [STATES.PRE_AGENDAMENTO_CONCLUIDO]: `✅ Seu pré-agendamento foi confirmado. Nossa equipe entrará em contato em breve. Se precisar de algo mais ou iniciar um novo atendimento, por favor, digite *menu*.`,
    [STATES.DUVIDA_REGISTRADA]: `✅ Sua dúvida foi registrada. Nossa equipe retornará assim que possível. Se precisar de algo mais ou iniciar um novo atendimento, digite *menu*.`,
    [STATES.PARCERIA_INFO_DADA]: `✅ As informações para contato de parceria foram fornecidas (E-mail: ${CONFIG.EMAIL_PARCEIROS}). Se precisar de algo mais ou iniciar um novo atendimento, digite *menu*.`,
    [STATES.FORMULARIO_INSTRUCOES_DADAS]: `✅ As instruções do formulário de orçamento já foram enviadas (${CONFIG.FORM_LINK_ORCAMENTO}). Após preenchê-lo, nossa equipe o analisará. Se precisar de algo mais ou iniciar um novo atendimento, digite *menu*.`
});

const MENSAGENS_MIDIA_INESPERADA_ATIVO = Object.freeze({
    [STATES.AGUARDANDO_OPCAO_MENU]: "Peço desculpas, mas neste momento preciso que escolha uma opção do menu (1 a 7) digitando o *número* correspondente. Não consigo processar arquivos ou áudios agora. 😊",
    [STATES.AGUARDANDO_OPCAO_ORCAMENTO]: "📎 Entendo que queira enviar um anexo, mas no momento preciso que escolha entre as opções:\n• Digite *1* para Formulário.\n• Digite *2* para Pré-agendar conversa.\n• Digite *menu* para voltar.",
    [STATES.AGUARDANDO_MODO_AGENDAMENTO]: "🗓️ Compreendo, mas agora preciso que escolha a modalidade. Por favor:\n• Digite *1* para Online.\n• Digite *2* Presencial.\n• Digite *menu* para voltar.",
    [STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES]: "🔊 Recebi seu arquivo/áudio, porém agora preciso que informe o Dia da Semana, Data (opcional) e Período (manhã/tarde/noite) desejados.\n\n*Exemplo:* Terça-feira, 05/05, à noite\n\nDigite *menu* para voltar ou *encerrar* para cancelar.",
    [STATES.AGUARDANDO_POS_PORTFOLIO]: "📝 Entendo, mas agora preciso que escolha uma das opções de texto:\n• Digite *3* para Orçamento.\n• Digite *4* para Especialista.",
    [STATES.AGUARDANDO_POS_SERVICOS]: "📝 Compreendo, mas no momento preciso que escolha uma das opções:\n• Digite *3* para solicitar um Orçamento.\n• Digite *menu* para voltar.",
    [STATES.AGUARDANDO_CONFIRMACAO_DUVIDA]: "Recebi seu arquivo/áudio, porém agora preciso da sua confirmação. Por favor, responda com *'sim'* ou *'não'*. Não consigo processar outro arquivo/áudio agora.",
    [STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA]: "Entendo que queira enviar um anexo, mas preciso que responda primeiro à pergunta anterior com *'sim'* ou *'não'*. Não consigo processar outro arquivo/áudio agora.",
    [STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA]: "Compreendo, mas preciso da sua confirmação para continuarmos. Por favor, responda com *'sim'* ou *'não'*. Não consigo processar outro arquivo/áudio agora.",
    [STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA]: "Compreendo o anexo, mas preciso que responda à pergunta sobre enviar informações adicionais com *'sim'* ou *'não'*. Não consigo processar outro arquivo/áudio agora.",
    [STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA]: "Entendo, mas preciso da sua confirmação para adicionar mais informações. Por favor, responda com *'sim'* ou *'não'*. Não consigo processar outro arquivo/áudio agora.",
    GENERICO_MIDIA_NAO_PERMITIDA: "Desculpe, não posso processar este tipo de arquivo ou mídia neste momento. Por favor, envie uma mensagem de texto com a opção ou informação desejada."
});

const PACOTES_KEYWORDS = {
    "pacote silver": "Pacote Silver", "silver": "Pacote Silver",
    "pacote gold": "Pacote Gold", "gold": "Pacote Gold",
    "pacote black": "Pacote Black", "black": "Pacote Black",
    "pacote premium": "Pacote Premium", "premium": "Pacote Premium",
    "projeto de impermeabilização": "Projeto de Impermeabilização", "projeto impermeabilizacao": "Projeto de Impermeabilização",
    "impermeabilização": "Projeto de Impermeabilização", "impermeabilizacao": "Projeto de Impermeabilização"
};

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "estudio-jf-bot"
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

let botPhoneNumber = null;
let lastSessionRestart = null;
let botReady = false;
let isSaving = false;
let isLoading = false;
let botStartTime = null;

const chatStates = new Map();

/**
 * Escapes special characters in a string for Telegram MarkdownV2.
 * @param {string} text The text to escape.
 * @returns {string} The escaped text.
 */
function escapeMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function enviarNotificacaoTelegram(mensagemTexto, tipoNotificacao = "ℹ️ Notificação do Bot WhatsApp") {
    if (telegramBotInstances.length === 0) {
        console.warn('[Telegram] Nenhuma instância de bot Telegram inicializada ou configurada. Notificação não enviada.');
        return;
    }

    for (const instance of telegramBotInstances) {
        if (!instance.bot || !instance.chatId) {
            console.warn(`[Telegram] Instância (Nome: ${instance.name || 'N/A'}) não configurada (sem bot/chatId). Notificação não enviada.`);
            continue;
        }

        const dataHoraFormatada = new Date().toLocaleString('pt-BR', { timeZone: instance.timezone || 'UTC' });
        
        const tipoNotificacaoEscapado = escapeMarkdown(tipoNotificacao);
        const dataHoraFormatadaEscapada = escapeMarkdown(dataHoraFormatada);
        const mensagemCompleta = `*${tipoNotificacaoEscapado}*\n_${dataHoraFormatadaEscapada}_\n\n${mensagemTexto}`;
        
        try {
            await instance.bot.sendMessage(instance.chatId, mensagemCompleta, { parse_mode: 'MarkdownV2' });
            console.log(`[Telegram] Notificação enviada para ${instance.chatId} (Bot: ${instance.name || 'N/A'}).`);
        } catch (error) {
            console.error(`[Telegram] Erro ao enviar para ${instance.chatId} (Bot: ${instance.name || 'N/A'}): ${error.message}`);
            console.error(`[Telegram] Mensagem problemática (primeiros 300 chars): ${mensagemCompleta.substring(0,300)}`);
            if (error.response && error.response.body) {
                try {
                    const errorBody = JSON.parse(error.response.body);
                    console.error(`  [Telegram API Error] Code: ${errorBody.error_code}, Description: ${errorBody.description}`);
                } catch (parseError) {
                    console.error('  [Telegram API Error] Corpo do erro não é JSON ou falhou ao parsear:', error.response.body);
                }
            }
        }
    }
}

function getDefaultChatState(chatId) {
    return {
        currentState: STATES.INICIO, lastTimestamp: Date.now(), isHuman: false, menuDisplayed: false,
        invalidAttempts: 0, schedulingMode: null, schedulingDetails: null, inOrcamento: false,
        humanTakeoverConfirmed: false, reminderSent: false,
    };
}

function cleanupChatState(chatId) {
    chatStates.delete(chatId);
    console.log(`[INFO] [Cleanup] Estado removido para ${chatId}`);
}

async function loadBotState() {
    if (isLoading || isSaving) {
        console.log(`[WARN] [Estado] Carregamento adiado (isLoading=${isLoading}, isSaving=${isSaving}).`);
        return;
    }
    isLoading = true;
    console.log('[INFO] [Estado] Carregando estado...');
    chatStates.clear();

    try {
        const data = await fs.readFile(CONFIG.BOT_STATE_FILE, 'utf8');
        const loadedData = JSON.parse(data);
        const loadedChatStates = loadedData.chatStates || {};
        let loadedCount = 0;
        Object.entries(loadedChatStates).forEach(([chatId, persistentState]) => {
            if (persistentState && typeof persistentState.currentState === 'string' && Object.values(STATES).includes(persistentState.currentState)) {
                chatStates.set(chatId, {
                    ...getDefaultChatState(chatId), ...persistentState,
                    inOrcamento: false, humanTakeoverConfirmed: false, reminderSent: false,
                });
                loadedCount++;
            } else {
                console.warn(`[WARN] [Estado] Estado '${persistentState?.currentState}' inválido/obsoleto para ${chatId}. Ignorando.`);
            }
        });
        lastSessionRestart = loadedData.lastSessionRestart || Date.now();
        console.log(`[INFO] [Estado] Carregados ${loadedCount} estados de chat válidos.`);

        const cutoff = Date.now() - 7 * 24 * 3600000;
        let cleanedCount = 0;
        const entriesToDelete = [];
        for (const [chatId, state] of chatStates.entries()) {
            if (!state.lastTimestamp || typeof state.lastTimestamp !== 'number' || state.lastTimestamp < cutoff) {
                entriesToDelete.push(chatId); cleanedCount++;
            }
        }
        for (const chatIdToDelete of entriesToDelete) { cleanupChatState(chatIdToDelete); }
        if (cleanedCount > 0) {
            console.log(`[INFO] [Estado] Removidos ${cleanedCount} estados antigos (> 7 dias) durante carregamento.`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[INFO] [Estado] Arquivo de estado não encontrado. Iniciando com estado vazio.');
        } else {
            console.error('[ERROR] [Estado] Erro crítico ao carregar estado:', error);
            chatStates.clear();
        }
        lastSessionRestart = Date.now();
    } finally {
        isLoading = false;
        console.log('[INFO] [Estado] Carregamento finalizado.');
        setTimeout(async () => { if (!isSaving) { await saveBotState(); } }, CONFIG.LOAD_SAVE_DELAY);
    }
}

async function saveBotState() {
    if (isSaving || isLoading) {
        setTimeout(saveBotState, CONFIG.SAVE_STATE_INTERVAL); return;
    }
    isSaving = true;
    try {
        const persistentChatStates = {};
        for (const [chatId, state] of chatStates.entries()) {
            if (state && typeof state.currentState === 'string' && Object.values(STATES).includes(state.currentState)) {
                persistentChatStates[chatId] = {
                    currentState: state.currentState, lastTimestamp: state.lastTimestamp, isHuman: state.isHuman,
                    menuDisplayed: state.menuDisplayed, invalidAttempts: state.invalidAttempts,
                    schedulingMode: state.schedulingMode, schedulingDetails: state.schedulingDetails,
                };
            }
        }
        const stateToSave = { chatStates: persistentChatStates, lastSessionRestart: lastSessionRestart };
        await fs.writeFile(CONFIG.BOT_STATE_FILE, JSON.stringify(stateToSave, null, 2), 'utf8');
    } catch (error) {
        console.error('[ERROR] [Estado] Erro CRÍTICO ao salvar estado:', error);
    } finally {
        isSaving = false;
    }
}

async function updateChatState(chatId, updates) {
    const currentStateData = chatStates.get(chatId) || getDefaultChatState(chatId);
    const previousState = { ...currentStateData };
    const newStateData = { ...currentStateData, ...updates, lastTimestamp: Date.now() };

    const passiveOrFinalStates = [
        STATES.PRE_AGENDAMENTO_CONCLUIDO, STATES.DUVIDA_REGISTRADA, STATES.PARCERIA_INFO_DADA,
        STATES.FORMULARIO_INSTRUCOES_DADAS, STATES.HUMANO_ATIVO, STATES.INICIO
    ];
    const isChangingToMenuOrInicio = (newStateData.currentState === STATES.INICIO || newStateData.currentState === STATES.AGUARDANDO_OPCAO_MENU) && previousState.currentState !== newStateData.currentState;
    const isTakingValidAction = updates.currentState && !passiveOrFinalStates.includes(updates.currentState) && !isChangingToMenuOrInicio;
    const isResettingFromPassive = passiveOrFinalStates.includes(previousState.currentState) && (newStateData.currentState === STATES.INICIO || newStateData.currentState === STATES.AGUARDANDO_OPCAO_MENU);

    if (isChangingToMenuOrInicio || isTakingValidAction || isResettingFromPassive) {
        newStateData.invalidAttempts = 0;
    }

    const isOnlyTimestampUpdate = Object.keys(updates).length === 0 || (Object.keys(updates).length === 1 && updates.lastTimestamp);
    if (!isOnlyTimestampUpdate && (isChangingToMenuOrInicio || isResettingFromPassive || passiveOrFinalStates.includes(newStateData.currentState))) {
        if (!((Object.keys(updates).length === 1 || (Object.keys(updates).length === 2 && updates.currentState)) && (updates.reminderSent === true || updates.humanTakeoverConfirmed === true))) {
            if (updates.isHuman !== true) {
                newStateData.humanTakeoverConfirmed = false; newStateData.reminderSent = false;
            }
        }
    }

    if (newStateData.currentState === STATES.INICIO || newStateData.currentState === STATES.AGUARDANDO_OPCAO_MENU) {
        newStateData.schedulingMode = null; newStateData.schedulingDetails = null; newStateData.inOrcamento = false;
        if (updates.isHuman === undefined || updates.isHuman === false) { newStateData.isHuman = false; }
        if(newStateData.isHuman === false) {
            newStateData.humanTakeoverConfirmed = false; newStateData.reminderSent = false;
        }
    }

    const schedulingStates = [STATES.AGUARDANDO_MODO_AGENDAMENTO, STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES];
    if (!schedulingStates.includes(newStateData.currentState) && (newStateData.schedulingMode || newStateData.schedulingDetails)) {
        newStateData.schedulingMode = null; newStateData.schedulingDetails = null;
    }
    if (newStateData.currentState !== STATES.AGUARDANDO_OPCAO_ORCAMENTO && newStateData.inOrcamento) {
        newStateData.inOrcamento = false;
    }

    if (updates.currentState === STATES.HUMANO_ATIVO && previousState.currentState !== STATES.HUMANO_ATIVO) {
        newStateData.isHuman = true;
        if (updates.humanTakeoverConfirmed === undefined) newStateData.humanTakeoverConfirmed = false;
        if (updates.reminderSent === undefined) newStateData.reminderSent = false;
    }
    if (updates.isHuman === false) {
        newStateData.humanTakeoverConfirmed = false; newStateData.reminderSent = false;
    }
    chatStates.set(chatId, newStateData);
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function simulateTyping(chatId, duration = CONFIG.DEFAULT_TYPING_DURATION) {
    try {
        const chat = await client.getChatById(chatId);
        if (chat) {
            await chat.sendStateTyping(); await delay(duration); await chat.clearState();
        } else {
            console.warn(`[WARN] [SimulateTyping] Chat ${chatId} não encontrado. Limpando estado.`);
            cleanupChatState(chatId); await saveBotState();
        }
    } catch (error) {
        if (error.message && (error.message.includes('Chat not found') || error.message.includes('Conversion to ParentInt failed') || error.message.includes('Evaluation failed: Error: Could not find chat'))) {
            console.warn(`[WARN] [SimulateTyping] Chat ${chatId} não encontrado (catch). Limpando estado.`);
            cleanupChatState(chatId); await saveBotState();
        } else {
            console.error(`[ERROR] [SimulateTyping] Erro inesperado para ${chatId}:`, error.message);
        }
    }
}

async function sendMessageWithTyping(chat, message, baseDelay = CONFIG.TYPING_BASE_DELAY, delayPerChar = CONFIG.TYPING_DELAY_PER_CHAR) {
    const chatId = chat.id._serialized;
    try {
        const typingDuration = Math.max(CONFIG.TYPING_BASE_DELAY, baseDelay + (message.length * delayPerChar));
        await simulateTyping(chatId, typingDuration);
        await chat.sendMessage(message);
    } catch (error) {
        if (error.message && (error.message.includes('Chat not found') || error.message.includes('Conversion to ParentInt failed') || error.message.includes('Evaluation failed: Error: Could not find chat'))) {
            console.warn(`[WARN] [sendMessage] Chat ${chatId} não encontrado (catch). Limpando estado se existir.`);
            if (chatStates.has(chatId)) { cleanupChatState(chatId); await saveBotState(); }
        } else {
            console.error(`[ERROR] [sendMessage] Erro inesperado ao enviar para ${chatId}:`, error.message);
        }
    }
}

async function greetingMessage() {
    const now = new Date(); const hour = now.getHours();
    if (hour >= 0 && hour < 12) return '☕ *Bom dia!*';
    if (hour >= 12 && hour < 18) return '🌞 *Boa tarde!*';
    return '🌙 *Boa noite!*';
}

async function getContactName(msgOrChatId) {
    let contactName = 'N/A'; let chatIdToUse = null;
    if (typeof msgOrChatId === 'string') { chatIdToUse = msgOrChatId;
    } else if (msgOrChatId && msgOrChatId.from) { chatIdToUse = msgOrChatId.from;
    } else if (msgOrChatId && msgOrChatId.id && msgOrChatId.id._serialized) { chatIdToUse = msgOrChatId.id._serialized; }

    if (chatIdToUse) {
        try {
            const contact = await client.getContactById(chatIdToUse);
            if (contact && contact.pushname) { contactName = contact.pushname;
            } else if (contact && contact.name) { contactName = contact.name;
            } else if (contact && contact.shortName) { contactName = contact.shortName; }
        } catch (e) {
            console.warn(`[Util] Não foi possível obter nome do contato para ${chatIdToUse}: ${e.message}`);
        }
    }
    return escapeMarkdown(contactName);
}

async function displayMenu(msg, chat, isRecall = false) {
    const chatId = chat.id._serialized;
    try {
        if (!isRecall) {
            const name = await getContactName(msg); const greeting = await greetingMessage();
            const welcomeMessage = `${greeting}\n\n👋 Olá ${name}! Bem-vindo(a) ao *Estúdio JF Engenharia e Design*! 🌟\n\nComo posso ajudar você hoje? Escolha uma das opções abaixo:`;
            await sendMessageWithTyping(chat, welcomeMessage); await delay(500);
        } else {
            const shortIntro = "Ok! Escolha uma das opções abaixo:";
            await sendMessageWithTyping(chat, shortIntro);
        }
        const menuText = `*1️⃣ Ver Portfólio e Sobre Nós*\n*2️⃣ Entender Nossos Serviços*\n*3️⃣ Solicitar Orçamento*\n*4️⃣ Falar com Especialista*\n*5️⃣ Outras Dúvidas*\n*6️⃣ Sou Parceiro / Fornecedor*\n*7️⃣ Já sou cliente*`;
        await sendMessageWithTyping(chat, menuText);
        const hintMessage = "_Dica: A qualquer momento, você pode digitar *menu* para ver estas opções ou *encerrar* para finalizar._";
        await sendMessageWithTyping(chat, hintMessage, CONFIG.TYPING_BASE_DELAY, 5);
        await updateChatState(chatId, {
            currentState: STATES.AGUARDANDO_OPCAO_MENU, menuDisplayed: true, isHuman: false,
            inOrcamento: false, schedulingMode: null, schedulingDetails: null,
            humanTakeoverConfirmed: false, reminderSent: false,
        });
    } catch (error) {
        console.error(`[ERROR] [displayMenu] Erro ao processar para ${chatId}:`, error.message);
        try {
            console.warn(`[WARN] [displayMenu] Erro grave, limpando estado ${chatId}.`);
            cleanupChatState(chatId); await saveBotState();
        } catch (cleanupError) {
            console.error(`[ERROR] [displayMenu] Erro adicional ao limpar estado ${chatId}:`, cleanupError.message);
        }
    }
}

async function confirmarPreAgendamento(msg, chat, currentState) {
    const chatId = chat.id._serialized;
    try {
        const mode = currentState.schedulingMode === 'online' ? 'Online (Videochamada)' : currentState.schedulingMode === 'presencial' ? 'Presencial' : '';
        const modeText = mode ? ` na modalidade *${mode}*` : '';
        const detailsText = currentState.schedulingDetails ? `\n*Detalhes fornecidos:* ${currentState.schedulingDetails}` : '';
        const confirmationMsg = `✅ Solicitação de pré-agendamento${modeText} recebida com sucesso!${detailsText}\n\nEntraremos em contato em breve para *confirmar a disponibilidade e o horário exato* dentro do período solicitado. Agradecemos a sua preferência! 🤝`;
        await sendMessageWithTyping(chat, confirmationMsg); await delay(1000);
        const finalMsg = '🌟 Muito obrigado pela confiança no *Estúdio JF Engenharia e Design*! 🌟\n\nSe precisar de algo mais, digite *menu*.';
        await sendMessageWithTyping(chat, finalMsg);

        const contactName = await getContactName(msg);
        const escapedChatId = escapeMarkdown(chatId);
        const escapedMode = escapeMarkdown(mode || 'N/A');
        const escapedDetails = escapeMarkdown(currentState.schedulingDetails || 'Não fornecidos explicitamente no último input');

        const notificacaoMsgTele = `*Cliente:* ${contactName} (${escapedChatId})\n*Tipo:* Pré-agendamento Solicitado\n*Modalidade:* ${escapedMode}\n*Detalhes do Cliente:* ${escapedDetails}`;
        
        console.log(`[INFO] [confirmarPreAgendamento] Enviando notificação Telegram para ${chatId}.`);
        enviarNotificacaoTelegram(notificacaoMsgTele, "🔔 PRÉ-AGENDAMENTO REALIZADO");

        await updateChatState(chatId, {
            currentState: STATES.PRE_AGENDAMENTO_CONCLUIDO, menuDisplayed: false,
            schedulingMode: null, schedulingDetails: null, inOrcamento: false,
        });
    } catch (error) {
        console.error(`[ERROR] [confirmarPreAgendamento] Erro ${chatId}:`, error.message);
        try {
            console.warn(`[WARN] [confirmarPreAgendamento] Erro, limpando estado ${chatId}.`);
            cleanupChatState(chatId); await saveBotState();
        } catch (cleanupError) { console.error(`[ERROR] [confirmarPreAgendamento] Erro adicional ao limpar estado ${chatId}:`, cleanupError.message); }
    }
}

async function handleInvalidResponse(msg, chat, currentState) {
    const chatId = chat.id._serialized;
    const currentStateType = currentState.currentState;
    const inOrcamento = currentState.inOrcamento;
    let attempts = currentState.invalidAttempts + 1;
    console.log(`[WARN] [handleInvalidResponse] Input inválido para ${chatId} no estado '${currentStateType}'. Tentativa ${attempts}. Body: "${msg.body}"`);
    await updateChatState(chatId, { invalidAttempts: attempts });
    const updatedStateData = chatStates.get(chatId);
    if (!updatedStateData) {
        console.error(`[ERROR] [handleInvalidResponse] Estado não encontrado após update para ${chatId}. Abortando.`); return;
    }
    const currentAttempts = updatedStateData.invalidAttempts;

    try {
        const formatoExemploAgendamento = `Por favor, informe o *Dia da Semana*, a *Data* (opcional) e o *Período* (manhã/tarde/noite) juntos.\n\n*Exemplo:* _Terça-feira, 05/05, à noite_`;
        let errorMessage = ''; let resetAttemptsHere = false; let showMainMenu = false;

        if (currentAttempts >= CONFIG.MAX_INVALID_ATTEMPTS) {
            console.log(`[WARN] [handleInvalidResponse] Máximo de tentativas (${currentAttempts}) atingido para ${chatId} no estado ${currentStateType}.`);
            resetAttemptsHere = true;
            if (inOrcamento && currentStateType === STATES.AGUARDANDO_OPCAO_ORCAMENTO) {
                errorMessage = `🤔 Para prosseguirmos com o orçamento, por favor, escolha uma opção válida:\n• Digite *1* para preencher o formulário online.\n• Digite *2* para solicitar um pré-agendamento de conversa.\n\nOu digite *menu* para voltar às opções principais.`;
            } else {
                switch(currentStateType) {
                    case STATES.AGUARDANDO_OPCAO_MENU: errorMessage = "🤔 Desculpe, não consegui entender. Vou te mostrar o menu principal novamente para facilitar."; showMainMenu = true; break;
                    case STATES.AGUARDANDO_MODO_AGENDAMENTO: errorMessage = `🤔 Por favor, escolha como prefere o atendimento:\n• Digite *1* para Online (Videochamada).\n• Digite *2* para Presencial.\n\nOu digite *menu* para voltar.`; break;
                    case STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES: errorMessage = `😕 Desculpe, não consegui identificar o dia e o período na sua mensagem.\n\n${formatoExemploAgendamento}\n\nSe preferir, digite *menu* para voltar ou *encerrar* para cancelar.`; break;
                    case STATES.AGUARDANDO_POS_PORTFOLIO: errorMessage = `🤔 Desculpe, não entendi. Após ver nosso portfólio, o que gostaria de fazer?\n• Digite *3* para solicitar um *orçamento*.\n• Digite *4* para falar com um *especialista*.\n\nOu digite *menu* para ver todas as opções novamente.`; break;
                    case STATES.AGUARDANDO_POS_SERVICOS: errorMessage = `🤔 Desculpe, não entendi. Após ver nossos serviços, por favor, escolha:\n• Digite *3* para solicitar um *orçamento*.\n• Digite *menu* para voltar às opções principais.`; break;
                    case STATES.AGUARDANDO_CONFIRMACAO_DUVIDA: case STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA: case STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA: case STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA: case STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA: errorMessage = `❓ Resposta não reconhecida.\n\nPor favor, responda apenas com *'sim'* ou *'não'*. Se preferir, digite *menu* para voltar.`; break;
                    case STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA: case STATES.AGUARDANDO_INFO_PARCERIA: errorMessage = `📝 Por favor, envie a informação complementar (texto, áudio, documento) ou digite *menu* para cancelar/voltar.`; break;
                    case STATES.AGUARDANDO_DESCRICAO_DUVIDA: errorMessage = "💬 Por favor, *descreva sua dúvida* ou necessidade (ou envie um arquivo/áudio). Se preferir, digite *menu* ou *encerrar*."; break;
                    default: errorMessage = "🤔 Desculpe, não consegui entender. Vou te mostrar o menu principal novamente para facilitar."; showMainMenu = true; break;
                }
            }
            await sendMessageWithTyping(chat, errorMessage);
            if (resetAttemptsHere) { await updateChatState(chatId, { invalidAttempts: 0 }); console.log(`[INFO] [handleInvalidResponse] Tentativas resetadas para ${chatId}.`); }
            if (showMainMenu) { await displayMenu(msg, chat, true); }
        } else {
            if (inOrcamento && currentStateType === STATES.AGUARDANDO_OPCAO_ORCAMENTO) { errorMessage = `🤔 Opção inválida no menu de orçamento. Por favor, escolha:\n• Digite *1* para o formulário online.\n• Digite *2* para pré-agendar uma conversa.\n• Digite *menu* para voltar.`;
            } else {
                switch (currentStateType) {
                    case STATES.AGUARDANDO_OPCAO_MENU: errorMessage = '⚠️ Opção inválida. Por favor, digite o *número* de *1* a *7* correspondente à opção desejada.'; break;
                    case STATES.AGUARDANDO_MODO_AGENDAMENTO: errorMessage = `⚠️ Opção inválida. Por favor, escolha:\n• Digite *1* para Online.\n• Digite *2* para Presencial.`; break;
                    case STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES: errorMessage = `😕 Entrada inválida ou incompleta.\n\n${formatoExemploAgendamento}\n\nDigite *menu* para voltar ou *encerrar* para cancelar.`; break;
                    case STATES.AGUARDANDO_DESCRICAO_DUVIDA: errorMessage = "💬 Por favor, *descreva sua dúvida* ou necessidade (ou envie um arquivo/áudio). Se preferir, digite *menu* ou *encerrar*."; break;
                    case STATES.AGUARDANDO_POS_PORTFOLIO: errorMessage = `🤔 Opção inválida. Após ver nosso portfólio, por favor, escolha:\n• Digite *3* para Orçamento.\n• Digite *4* para falar com Especialista.\n• Digite *menu* para ver todas as opções.`; break;
                    case STATES.AGUARDANDO_POS_SERVICOS: errorMessage = `🤔 Opção inválida. Após ver nossos serviços, escolha:\n• Digite *3* para solicitar um orçamento.\n• Digite *menu* para voltar às opções principais.`; break;
                    case STATES.AGUARDANDO_CONFIRMACAO_DUVIDA: case STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA: case STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA: case STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA: case STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA: errorMessage = "❓ Resposta inválida. Por favor, digite apenas *'sim'* ou *'não'*."; break;
                    case STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA: case STATES.AGUARDANDO_INFO_PARCERIA: errorMessage = "📝 Por favor, envie a informação desejada (texto, áudio, vídeo ou documento) ou digite *menu* para cancelar/voltar."; break;
                    default: errorMessage = `Desculpe, não entendi. 🤔 Digite *menu* para ver as opções ou *encerrar* para finalizar.`; break;
                }
            }
            await sendMessageWithTyping(chat, errorMessage);
        }
    } catch (error) {
        console.error(`[ERROR] [handleInvalidResponse] Erro CRÍTICO para ${chatId}:`, error.message);
        try {
            console.warn(`[WARN] [handleInvalidResponse] Erro grave, limpando estado ${chatId}.`);
            cleanupChatState(chatId); await saveBotState();
        } catch (cleanupError) {
            console.error(`[ERROR] [handleInvalidResponse] Erro adicional ao limpar estado ${chatId}:`, cleanupError.message);
        }
    }
}

async function displayOrcamentoSubMenu(msg, chat) {
    const chatId = chat.id._serialized;
    console.log(`[INFO] [displayOrcamentoSubMenu] Exibindo para ${chatId}.`);
    try {
        const initialMsg = "💰 Para solicitar um orçamento, temos duas opções. Escolha a que preferir:";
        const optionsText = `• *1️⃣ Preencher Formulário Online:* Ideal para detalhar suas necessidades no seu tempo.\n\n• *2️⃣ Pré-agendar Conversa:* Para discutir o projeto diretamente conosco (*online* ou *presencialmente*).\n\nDigite o número (*1* ou *2*) ou *menu* para voltar.`;
        await sendMessageWithTyping(chat, initialMsg); await delay(500);
        await sendMessageWithTyping(chat, optionsText);
        await updateChatState(chatId, { currentState: STATES.AGUARDANDO_OPCAO_ORCAMENTO, menuDisplayed: false, inOrcamento: true });
    } catch (error) {
        console.error(`[ERROR] [displayOrcamentoSubMenu] Erro ${chatId}:`, error.message);
        try {
            console.warn(`[WARN] [displayOrcamentoSubMenu] Erro, limpando estado ${chatId}.`);
            cleanupChatState(chatId); await saveBotState();
        } catch (cleanupError) { console.error(`[ERROR] [displayOrcamentoSubMenu] Erro adicional ao limpar estado ${chatId}:`, cleanupError.message); }
    }
}

async function displayAgendamentoModeMenu(msg, chat) {
    const chatId = chat.id._serialized;
    console.log(`[INFO] [displayAgendamentoModeMenu] Exibindo para ${chatId}.`);
    try {
        const promptMsg = "🗓️ Ótimo! Como você prefere que seja essa conversa inicial sobre o projeto?";
        const optionsMsg = `• *💻 1. Online:* Realizada por videochamada (Google Meet, Zoom, etc.).\n\n• *🏢 2. Presencial:* Em nosso escritório.\n\nDigite o número da modalidade desejada ou *menu* para voltar.`;
        await sendMessageWithTyping(chat, promptMsg); await delay(500);
        await sendMessageWithTyping(chat, optionsMsg);
        await updateChatState(chatId, { currentState: STATES.AGUARDANDO_MODO_AGENDAMENTO, menuDisplayed: false, inOrcamento: false });
    } catch (error) {
        console.error(`[ERROR] [displayAgendamentoModeMenu] Erro ${chatId}:`, error.message);
        try {
            console.warn(`[WARN] [displayAgendamentoModeMenu] Erro, limpando estado ${chatId}.`);
            cleanupChatState(chatId); await saveBotState();
        } catch (cleanupError) { console.error(`[ERROR] [displayAgendamentoModeMenu] Erro adicional ao limpar estado ${chatId}:`, cleanupError.message); }
    }
}

async function handleMenuOption(msg, chat, lowerBody, currentState) {
    const chatId = chat.id._serialized; let validActionTaken = false;
    const validOptions = ['1', '2', '3', '4', '5', '6', '7'];
    if (validOptions.includes(lowerBody)) {
        validActionTaken = true; console.log(`[INFO] [Menu Principal] Opção '${lowerBody}' recebida para ${chatId}.`);
        switch (lowerBody) {
            case '1':
                const portfolioResponse = `✨ Explore nosso trabalho e conheça mais sobre o *Estúdio JF Engenharia e Design*!\n\nNosso site reúne informações completas:\n• Projetos realizados e cases de sucesso.\n• Nossa história, valores e equipe.\n• Formas de contato e .\n• Pioneiros no Brasil em pagamentos com Criptomoedas! ₿\n\nAcesse aqui: ${CONFIG.SITE_URL}`;
                const portfolioConfirmation = `Após explorar nosso site:\n• Digite *3* se desejar solicitar um *orçamento*.\n• Digite *4* para falar com um *especialista*.\n• Digite *menu* para ver todas as opções novamente.`;
                await sendMessageWithTyping(chat, portfolioResponse); await sendMessageWithTyping(chat, portfolioConfirmation);
                await updateChatState(chatId, { currentState: STATES.AGUARDANDO_POS_PORTFOLIO, menuDisplayed: false }); break;
            case '2':
                const servicosResponse = `📐 Oferecemos soluções completas em Engenharia e Design, incluindo nossos pacotes e projetos especializados. Conheça cada um deles em detalhes e veja qual se encaixa melhor em suas necessidades!\n\n• *Pacote Silver*\n• *Pacote Gold*\n• *Pacote Black*\n• *Pacote Premium*\n• *Projeto de Impermeabilização*\n\nVisite nosso site para detalhes completos e para iniciar uma conversa sobre um pacote específico: ${CONFIG.SERVICOS_URL_ATUALIZADA}`;
                const servicosConfirmation = `Após conferir nossos pacotes e serviços:\n• Se já sabe qual pacote ou serviço lhe interessa, pode nos dizer diretamente (ex: "tenho interesse no pacote gold").\n• Digite *3* para solicitar um *orçamento* mais detalhado.\n• Digite *menu* para ver todas as opções novamente.`;
                await sendMessageWithTyping(chat, servicosResponse); await delay(500); await sendMessageWithTyping(chat, servicosConfirmation);
                await updateChatState(chatId, { currentState: STATES.AGUARDANDO_POS_SERVICOS, menuDisplayed: false }); break;
            case '3': await displayOrcamentoSubMenu(msg, chat); break;
            case '4':
                const preEspecialistaQuestion = `Entendido! Você será direcionado(a) a um especialista. 👨‍💻👩‍💻\n\nAntes disso, gostaria de enviar alguma *informação adicional* (como texto, áudio, vídeo ou documento) para adiantar o atendimento?\n\nPor favor, responda com *sim* ou *não*.`;
                await sendMessageWithTyping(chat, preEspecialistaQuestion);
                await updateChatState(chatId, { currentState: STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA, menuDisplayed: false }); break;
            case '5':
                const doubtPrompt = '❓ Entendido. Por favor, descreva sua dúvida ou o que você precisa com o máximo de detalhes possível.\n\nSe preferir, pode também nos enviar *áudio, vídeo ou documentos* para explicar melhor.\n\nQuando terminar de enviar tudo, me avise digitando ou enviando algo.\n\nDigite *menu* para voltar ou *encerrar*.';
                await sendMessageWithTyping(chat, doubtPrompt);
                await updateChatState(chatId, { currentState: STATES.AGUARDANDO_DESCRICAO_DUVIDA, menuDisplayed: false }); break;
            case '6':
                const partnerResponse = `🤝 *Que ótimo receber seu contato!* Estamos sempre abertos a novas parcerias e colaborações com empresas e profissionais.\n\nSe deseja nos apresentar:\n• _Produtos_ inovadores...\n• _Serviços_ especializados...\n• _Propostas de colaboração_...`;
                const partnerInfoEmail = `✅ Por favor, envie sua apresentação ou proposta detalhada para nosso e-mail dedicado a parcerias:\n\n📧 *${CONFIG.EMAIL_PARCEIROS}*\n\nNossa equipe analisará com atenção.\n\n*Importante:* Lembramos que o envio de materiais completos (portfólios, catálogos, vídeos) é *fortemente recomendado* através do e-mail informado para uma análise detalhada.`;
                const partnerFollowUpQuestion = `Além do e-mail, gostaria de nos enviar alguma *mensagem rápida, áudio ou arquivo aqui pelo chat* para complementar?\n\nPor favor, responda com *sim* ou *não*.`;
                await sendMessageWithTyping(chat, partnerResponse); await delay(500); await sendMessageWithTyping(chat, partnerInfoEmail); await delay(500); await sendMessageWithTyping(chat, partnerFollowUpQuestion);
                await updateChatState(chatId, { currentState: STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA, menuDisplayed: false }); break;
            case '7':
                const clienteMsg = "✅ Entendido! Direcionando sua solicitação para nossa equipe. Por favor, aguarde um momento que um especialista responderá por aqui mesmo. Se preferir, pode adiantar o motivo do seu contato. 🧑‍💻";
                await sendMessageWithTyping(chat, clienteMsg);
                const contactNameCliente = await getContactName(msg);
                const escapedChatIdCliente = escapeMarkdown(chatId);
                const notificacaoMsgTeleCliente = `*Usuário (WA):* ${contactNameCliente} (${escapedChatIdCliente})\n*Origem:* Opção 7 \\- "Já sou cliente"`;
                console.log(`[INFO] [Menu Principal] Opção 7: Enviando notificação Telegram para ${chatId}.`);
                enviarNotificacaoTelegram(notificacaoMsgTeleCliente, "🔔 SOLICITAÇÃO DE ATENDIMENTO HUMANO");
                await updateChatState(chatId, { currentState: STATES.HUMANO_ATIVO, menuDisplayed: false, isHuman: true, humanTakeoverConfirmed: false, reminderSent: false }); break;
        }
    } else {
        validActionTaken = false; console.log(`[WARN] [Menu Principal] Input inválido '${msg.body}' de ${chatId} no estado ${currentState.currentState}.`);
        if (currentState.currentState === STATES.AGUARDANDO_OPCAO_MENU) { await handleInvalidResponse(msg, chat, currentState);
        } else { console.log(`[WARN] [Menu Principal] Estado inconsistente (${currentState.currentState}) ou input inesperado. Re-exibindo menu.`); await displayMenu(msg, chat, true); }
    }
    return validActionTaken;
}

async function handleOrcamentoOption(msg, chat, lowerBody, currentState) {
    const chatId = chat.id._serialized; let validActionTaken = false;
    console.log(`[INFO] [Sub-menu Orçamento] Processando "${msg.body}" de ${chatId}`);
    if (lowerBody === '1') {
        validActionTaken = true;
        const formMessagePt1 = `✍️ Excelente! Para criarmos uma proposta *exclusiva e totalmente personalizada*, por favor, preencha nosso formulário online detalhando suas necessidades.`;
        const formMessagePt2 = `Acesse aqui: ${CONFIG.FORM_LINK_ORCAMENTO}`;
        const formMessagePt3 = `*Fique tranquilo(a)!* Assim que você enviar o formulário, nossa equipe comercial será notificada e o analisará. *Não é necessário confirmar o envio aqui no chat.*`;
        const formMessagePt4 = `Se precisar de algo mais, digite *menu*.`;
        await sendMessageWithTyping(chat, formMessagePt1); await sendMessageWithTyping(chat, formMessagePt2);
        await sendMessageWithTyping(chat, formMessagePt3, 100, 15); await sendMessageWithTyping(chat, formMessagePt4);

        const contactName = await getContactName(msg);
        const escapedChatId = escapeMarkdown(chatId);
        const escapedFormLink = escapeMarkdown(CONFIG.FORM_LINK_ORCAMENTO);
        const notificacaoMsgTele = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Link do formulário de orçamento enviado\\.\n*Link:* ${escapedFormLink}`;
        
        console.log(`[INFO] [Sub-menu Orçamento] Opção 1: Enviando notificação Telegram para ${chatId}.`);
        enviarNotificacaoTelegram(notificacaoMsgTele, "ℹ️ LINK DE FORMULÁRIO ENVIADO");

        await updateChatState(chatId, { currentState: STATES.FORMULARIO_INSTRUCOES_DADAS, inOrcamento: false });
        console.log(`[INFO] [Sub-menu Orçamento] Instruções do formulário enviadas para ${chatId} -> '${STATES.FORMULARIO_INSTRUCOES_DADAS}'.`);
    } else if (lowerBody === '2') {
        validActionTaken = true; console.log(`[INFO] [Sub-menu Orçamento] Opção 2: Solicitando pré-agendamento para ${chatId}.`);
        await displayAgendamentoModeMenu(msg, chat);
    } else {
        validActionTaken = false; console.log(`[WARN] [Sub-menu Orçamento] Input inválido "${msg.body}" de ${chatId}.`);
        await handleInvalidResponse(msg, chat, currentState);
    }
    return validActionTaken;
}

async function handlePostPortfolio(msg, chat, lowerBody, currentState) {
    const chatId = chat.id._serialized; let validActionTaken = false;
    if (lowerBody === '3') {
        validActionTaken = true; console.log(`[INFO] [Pós-Portfolio] Input '3' -> Orçamento para ${chatId}.`);
        await displayOrcamentoSubMenu(msg, chat);
    } else if (lowerBody === '4') {
        validActionTaken = true; console.log(`[INFO] [Pós-Portfolio] Input '4' -> Especialista para ${chatId}.`);
        const preEspecialistaQuestion = `Entendido! Você será direcionado(a) a um especialista. 👨‍💻👩‍💻\n\nAntes disso, gostaria de enviar alguma *informação adicional* (como texto, áudio, vídeo ou documento) para adiantar o atendimento?\n\nPor favor, responda com *sim* ou *não*.`;
        await sendMessageWithTyping(chat, preEspecialistaQuestion);
        await updateChatState(chatId, { currentState: STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA, menuDisplayed: false });
    } else {
        validActionTaken = false; console.log(`[WARN] [Pós-Portfolio] Input inválido '${msg.body}' de ${chatId}.`);
        await handleInvalidResponse(msg, chat, currentState);
    }
    return validActionTaken;
}

async function handlePostServicos(msg, chat, lowerBody, currentState) {
    const chatId = chat.id._serialized; let validActionTaken = false;
    if (lowerBody === '3') {
        validActionTaken = true; console.log(`[INFO] [Pós-Serviços] Input '3' -> Orçamento para ${chatId}.`);
        await displayOrcamentoSubMenu(msg, chat);
    } else {
        validActionTaken = false; console.log(`[WARN] [Pós-Serviços] Input inválido '${msg.body}' de ${chatId}.`);
        await handleInvalidResponse(msg, chat, currentState);
    }
    return validActionTaken;
}

async function handleAgendamentoMode(msg, chat, lowerBody, currentState) {
    const chatId = chat.id._serialized; let validActionTaken = false; let selectedMode = null;
    if (lowerBody === '1' || lowerBody.includes('online')) { validActionTaken = true; selectedMode = 'online'; }
    else if (lowerBody === '2' || lowerBody.includes('presencial')) { validActionTaken = true; selectedMode = 'presencial'; }

    if (validActionTaken && selectedMode) {
        console.log(`[INFO] [Modo Agend] ${chatId} escolheu: ${selectedMode}`);
        const promptDayPeriod = `🗓️ Ok, modalidade *${selectedMode === 'online' ? 'Online' : 'Presencial'}* selecionada!\n\nPara continuarmos, por favor, informe o *Dia da Semana*, a *Data* (opcional) e o *Período* (manhã/tarde/noite) desejados. Se tiver um *horário específico* em mente, pode incluir também (opcional).\n\n*Exemplo:* _Quinta-feira, 15/08, pela manhã_`;
        const followUpMsg = "Com essas informações, verificaremos a disponibilidade em nossa agenda.";
        await sendMessageWithTyping(chat, promptDayPeriod); await delay(500); await sendMessageWithTyping(chat, followUpMsg);
        await updateChatState(chatId, { currentState: STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES, schedulingMode: selectedMode });
    } else {
        validActionTaken = false; console.log(`[WARN] [Modo Agend] Input inválido '${msg.body}' de ${chatId}.`);
        await handleInvalidResponse(msg, chat, currentState);
    }
    return validActionTaken;
}

async function handlePreAgendamentoDetalhes(msg, chat, lowerBody, currentState) {
    let validActionTaken = false; const chatId = chat.id._serialized;
    const dayRegex = /\b(segunda|ter[cçÇ]a|quarta|quinta|sexta|s[aáÁ]bado|domingo|hoje|amanh[ãaÃA])(?:-?feira)?\b/i;
    const dateRegex = /\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)\b/;
    const exitRegex = /\b(menu|voltar|cancelar|encerrar)\b/i;
    const periodRegex = /((?:de |pela |da |na |p'?)\s*)?(manhã|manha)|((?:à |a |pela |na |de |da |p'?)\s*)?(tarde)|((?:à |a |de |da |na |p'?)\s*)?(noite)/i;
    const periodMatch = lowerBody.match(periodRegex); let extractedPeriod = null;
    if (periodMatch) { if (periodMatch[2]) extractedPeriod = 'manhã'; else if (periodMatch[4]) extractedPeriod = 'tarde'; else if (periodMatch[6]) extractedPeriod = 'noite'; }
    const hasDayInfo = dayRegex.test(lowerBody) || dateRegex.test(lowerBody); const wantsToExit = exitRegex.test(lowerBody);
    const extractedDayString = lowerBody.match(dayRegex)?.[0] ?? lowerBody.match(dateRegex)?.[0];
    console.log(`[INFO] [Pré-Agend Check] ${chatId} Input: "${msg.body}" | Dia: ${hasDayInfo} (${extractedDayString||'N/A'}) | Período: ${!!extractedPeriod} | Sair: ${wantsToExit}`);

    if (wantsToExit && (lowerBody === 'menu' || lowerBody === 'voltar')) {
        validActionTaken = true; console.log(`[INFO] [Pré-Agend Check] ${chatId} -> Comando Menu/Voltar.`); await displayMenu(msg, chat, true);
    } else if (wantsToExit && (lowerBody === 'encerrar' || lowerBody === 'cancelar')) {
        validActionTaken = true; console.log(`[INFO] [Pré-Agend Check] ${chatId} -> Comando '${lowerBody}'. Cancelando.`); await sendMessageWithTyping(chat, "Ok, pré-agendamento cancelado. 👋");
        await updateChatState(chatId, { currentState: STATES.INICIO, schedulingMode: null, schedulingDetails: null, menuDisplayed: false, inOrcamento: false });
    } else if (hasDayInfo && extractedPeriod) {
        validActionTaken = true; console.log(`[INFO] [Pré-Agend Check] ${chatId} -> Dia (${extractedDayString}) e Período (${extractedPeriod}) OK.`);
        await updateChatState(chatId, { schedulingDetails: msg.body.trim() }); const updatedCurrentState = chatStates.get(chatId);
        await confirmarPreAgendamento(msg, chat, updatedCurrentState);
    } else {
        validActionTaken = false; console.log(`[WARN] [Pré-Agend Check] ${chatId} -> Input inválido/incompleto.`); await handleInvalidResponse(msg, chat, currentState);
    }
    return validActionTaken;
}

function normalizeYesNo(text) {
    if (typeof text !== 'string') return null;
    const cleaned = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\w]/gi, '');
    if (cleaned === 'sim' || cleaned === 's') return 'sim'; if (cleaned === 'nao' || cleaned === 'n') return 'nao'; return null;
}

async function handleYesNoResponse(msg, chat, lowerBody, currentState, actions) {
    const chatId = msg.from; const normalizedResponse = normalizeYesNo(lowerBody); let validActionTaken = false;
    try {
        if (normalizedResponse === 'sim') {
            validActionTaken = true; console.log(`[INFO] [handleYesNoResponse] ${chatId} respondeu SIM no estado ${currentState.currentState}.`);
            const stateUpdates = await actions.onYes(); if (stateUpdates && typeof stateUpdates === 'object') { await updateChatState(chatId, stateUpdates); }
        } else if (normalizedResponse === 'nao') {
            validActionTaken = true; console.log(`[INFO] [handleYesNoResponse] ${chatId} respondeu NÃO no estado ${currentState.currentState}.`);
            const stateUpdates = await actions.onNo(); if (stateUpdates && typeof stateUpdates === 'object') { await updateChatState(chatId, stateUpdates); }
        } else {
            validActionTaken = false; console.log(`[WARN] [handleYesNoResponse] Resposta inválida para Sim/Não de ${chatId}: "${lowerBody}"`); await handleInvalidResponse(msg, chat, currentState);
        }
    } catch (error) {
        console.error(`[ERROR] [handleYesNoResponse] Erro ao processar Sim/Não para ${chatId} no estado ${currentState.currentState}:`, error);
        validActionTaken = false; try { await sendMessageWithTyping(chat, "😕 Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *menu*."); } catch (e) { console.error("Erro ao enviar msg de erro em handleYesNoResponse", e); }
        await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false });
    }
    return validActionTaken;
}

async function handleDescricaoDuvida(msg, chat, lowerBody, currentState) {
    const chatId = msg.from; let mediaTypeText = "Descrição"; let actionValid = true;
    if (msg.hasMedia) {
        if (msg.type === 'image') mediaTypeText = "Imagem"; else if (msg.type === 'audio' || msg.type === 'ptt') mediaTypeText = "Áudio";
        else if (msg.type === 'video') mediaTypeText = "Vídeo"; else if (msg.type === 'document') mediaTypeText = "Documento";
        else if (msg.type === 'sticker') { await sendMessageWithTyping(chat, "💬 Figurinha recebida! Mas para entender sua dúvida, prefiro texto, áudio, vídeo ou documento. 😉"); await updateChatState(chatId, {}); actionValid = true;
        } else { mediaTypeText = "Arquivo"; }
        if (actionValid && msg.type !== 'sticker') { console.log(`[INFO] [Dúvida] Mídia recebida (${mediaTypeText}) de ${chatId}.`); }
    } else {
        if (!lowerBody) { console.log(`[WARN] [Dúvida] Texto vazio recebido de ${chatId}.`); await handleInvalidResponse(msg, chat, currentState); actionValid = false;
        } else { console.log(`[INFO] [Dúvida] Texto recebido de ${chatId}: "${msg.body}"`); }
    }
    if (actionValid && msg.type !== 'sticker' && (msg.hasMedia || lowerBody)) {
        try {
            const confirmationMessage = `✅ ${mediaTypeText} recebido(a).`;
            const followUpQuestion = `❓ Você gostaria de *adicionar mais alguma informação* ou enviar outro arquivo?\n\nPor favor, responda com *sim* ou *não*.`;
            await sendMessageWithTyping(chat, confirmationMessage); await delay(300); await sendMessageWithTyping(chat, followUpQuestion);
            await updateChatState(chatId, { currentState: STATES.AGUARDANDO_CONFIRMACAO_DUVIDA });
        } catch (error) {
            console.error(`[ERROR] [handleDescricaoDuvida] Erro ao processar ${chatId}:`, error); actionValid = false;
            try { await sendMessageWithTyping(chat, "😕 Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *menu*."); } catch (e) { console.error("Erro ao enviar msg de erro em handleDescricaoDuvida", e); }
            await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false });
        }
    }
    return actionValid;
}

async function handleConfirmacaoDuvida(msg, chat, lowerBody, currentState) {
    const chatId = msg.from;
    return handleYesNoResponse(msg, chat, lowerBody, currentState, {
        onYes: async () => {
            console.log(`[INFO] [Dúvida] User ${chatId} quer mais info (Sim).`); const promptMsg = "Ok, pode enviar a informação adicional (texto, áudio, vídeo ou documento).";
            await sendMessageWithTyping(chat, promptMsg); return { currentState: STATES.AGUARDANDO_DESCRICAO_DUVIDA };
        },
        onNo: async () => {
            console.log(`[INFO] [Dúvida] User ${chatId} finalizou dúvida (Não).`); const finalMessage = "✅ Entendido! Obrigado por compartilhar sua dúvida conosco.\n\nNossa equipe analisará e retornará o contato assim que possível.\n\nSe precisar de mais alguma coisa enquanto isso, digite *menu*.";
            await sendMessageWithTyping(chat, finalMessage);
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const notificacaoMsgTele = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Dúvida/Solicitação registrada\\. Aguardando análise da equipe\\.`;
            console.log(`[INFO] [Dúvida] Enviando notificação Telegram para ${chatId}.`);
            enviarNotificacaoTelegram(notificacaoMsgTele, "❓ NOVA DÚVIDA/SOLICITAÇÃO");
            return { currentState: STATES.DUVIDA_REGISTRADA };
        }
    });
}

async function handleRespostaPreEspecialista(msg, chat, lowerBody, currentState) {
    const chatId = msg.from;
    return handleYesNoResponse(msg, chat, lowerBody, currentState, {
        onYes: async () => {
            console.log(`[INFO] [Especialista] User ${chatId} quer info pré-especialista (Sim).`); const promptMsg = "Ótimo! Pode enviar a informação que deseja adiantar (texto, áudio, vídeo ou documento).";
            await sendMessageWithTyping(chat, promptMsg); return { currentState: STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA };
        },
        onNo: async () => {
            console.log(`[INFO] [Especialista] User ${chatId} NÃO quer info pré-especialista (Não). Transferindo...`);
            const specialistMessage = "✅ Entendido! Recebemos sua solicitação para falar com um especialista.\n\nUm membro da nossa equipe entrará em contato o mais breve possível aqui mesmo pelo WhatsApp. Por favor, aguarde. ⏳\n\n_Se precisar voltar ao menu principal, digite *menu*._";
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const notificacaoMsgTele = `*Usuário (WA):* ${contactName} (${escapedChatId})\n*Origem:* Solicitou especialista \\- Sem info adicional\\.`;
            console.log(`[INFO] [Especialista] Enviando notificação Telegram para ${chatId}.`);
            enviarNotificacaoTelegram(notificacaoMsgTele, "🔔 SOLICITAÇÃO DE ATENDIMENTO HUMANO");
            await sendMessageWithTyping(chat, specialistMessage);
            return { currentState: STATES.HUMANO_ATIVO, menuDisplayed: false, isHuman: true, humanTakeoverConfirmed: false, reminderSent: false };
        }
    });
}

async function handleInfoPreEspecialista(msg, chat, lowerBody, currentState) {
    const chatId = msg.from; let mediaTypeText = "Informação"; let actionValid = true;
    if (msg.hasMedia) {
        if (msg.type === 'image') mediaTypeText = "Imagem"; else if (msg.type === 'audio' || msg.type === 'ptt') mediaTypeText = "Áudio";
        else if (msg.type === 'video') mediaTypeText = "Vídeo"; else if (msg.type === 'document') mediaTypeText = "Documento";
        else if (msg.type === 'sticker') { await sendMessageWithTyping(chat, "💬 Figurinha recebida! Se quiser adicionar informações relevantes, por favor use texto, áudio, vídeo ou documento. 😉"); await updateChatState(chatId, {}); actionValid = true;
        } else { mediaTypeText = "Arquivo"; }
        if (actionValid && msg.type !== 'sticker') { console.log(`[INFO] [Especialista] Mídia pré-especialista recebida (${mediaTypeText}) de ${chatId}.`); }
    } else {
        if (!lowerBody) { console.log(`[WARN] [Especialista] Info pré-especialista vazia recebida de ${chatId}.`); await handleInvalidResponse(msg, chat, currentState); actionValid = false;
        } else { console.log(`[INFO] [Especialista] Texto pré-especialista recebido de ${chatId}: "${msg.body}"`); }
    }
    if (actionValid && msg.type !== 'sticker' && (msg.hasMedia || lowerBody)) {
        try {
            const confirmationMessage = `✅ ${mediaTypeText} recebido(a).`; const followUpQuestion = `❓ Algo mais que gostaria de adicionar antes de falarmos com o especialista?\n\nPor favor, responda com *sim* ou *não*.`;
            await sendMessageWithTyping(chat, confirmationMessage); await delay(300); await sendMessageWithTyping(chat, followUpQuestion);
            await updateChatState(chatId, { currentState: STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA });
        } catch (error) {
            console.error(`[ERROR] [handleInfoPreEspecialista] Erro ao processar ${chatId}:`, error); actionValid = false;
            try { await sendMessageWithTyping(chat, "😕 Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *menu*."); } catch (e) { console.error("Erro ao enviar msg erro em handleInfoPreEspecialista", e);}
            await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false });
        }
    }
    return actionValid;
}

async function handleConfirmacaoInfoPreEspecialista(msg, chat, lowerBody, currentState) {
    const chatId = msg.from;
    return handleYesNoResponse(msg, chat, lowerBody, currentState, {
        onYes: async () => {
            console.log(`[INFO] [Especialista] User ${chatId} quer MAIS info pré-especialista (Sim).`); const promptMsg = "Ok, pode enviar a informação adicional.";
            await sendMessageWithTyping(chat, promptMsg); return { currentState: STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA };
        },
        onNo: async () => {
            console.log(`[INFO] [Especialista] User ${chatId} finalizou envio pré-especialista (Não). Transferindo...`);
            const specialistMessage = "✅ Certo! Informações recebidas. Sua solicitação para falar com um especialista foi registrada.\n\nUm membro da nossa equipe entrará em contato o mais breve possível aqui mesmo pelo WhatsApp. Por favor, aguarde. ⏳\n\n_Se precisar voltar ao menu principal, digite *menu*._";
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const notificacaoMsgTele = `*Usuário (WA):* ${contactName} (${escapedChatId})\n*Origem:* Solicitou especialista \\- Concluiu envio de info\\.`;
            console.log(`[INFO] [Especialista] Enviando notificação Telegram para ${chatId}.`);
            enviarNotificacaoTelegram(notificacaoMsgTele, "🔔 SOLICITAÇÃO DE ATENDIMENTO HUMANO");
            await sendMessageWithTyping(chat, specialistMessage);
            return { currentState: STATES.HUMANO_ATIVO, menuDisplayed: false, isHuman: true, humanTakeoverConfirmed: false, reminderSent: false };
        }
    });
}

async function handleConfirmacaoParceriaExtra(msg, chat, lowerBody, currentState) {
    const chatId = msg.from;
    return handleYesNoResponse(msg, chat, lowerBody, currentState, {
        onYes: async () => {
            console.log(`[INFO] [Parceiros] User ${chatId} quer info complementar chat (Sim).`); const promptMsg = "Ok, pode enviar a informação complementar (texto, áudio, documento, etc.).";
            await sendMessageWithTyping(chat, promptMsg); return { currentState: STATES.AGUARDANDO_INFO_PARCERIA };
        },
        onNo: async () => {
            console.log(`[INFO] [Parceiros] User ${chatId} NÃO quer info complementar chat (Não).`); const finalMessage = `Entendido. Aguardamos seu contato pelo e-mail ${CONFIG.EMAIL_PARCEIROS}.\n\nSe precisar de mais algo aqui, digite *menu*.`;
            await sendMessageWithTyping(chat, finalMessage);
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const notificacaoMsgTele = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Instruções para parceria (via e\\-mail) fornecidas\\. Não quis enviar info extra pelo chat\\.`;
            console.log(`[INFO] [Parceiros] Enviando notificação Telegram para ${chatId}.`);
            enviarNotificacaoTelegram(notificacaoMsgTele, "🤝 INSTRUÇÕES DE PARCERIA");
            return { currentState: STATES.PARCERIA_INFO_DADA };
        }
    });
}

async function handleInfoParceria(msg, chat, lowerBody, currentState) {
    const chatId = msg.from; let mediaTypeText = "Informação"; let actionValid = true;
    if (msg.hasMedia) {
        if (msg.type === 'image') mediaTypeText = "Imagem"; else if (msg.type === 'audio' || msg.type === 'ptt') mediaTypeText = "Áudio";
        else if (msg.type === 'video') mediaTypeText = "Vídeo"; else if (msg.type === 'document') mediaTypeText = "Documento";
        else if (msg.type === 'sticker') { await sendMessageWithTyping(chat, "💬 Figurinha recebida! Para complementar sua proposta, por favor use texto, áudio, vídeo ou documento. 😉"); await updateChatState(chatId, {}); actionValid = true;
        } else { mediaTypeText = "Arquivo"; }
        if (actionValid && msg.type !== 'sticker') { console.log(`[INFO] [Parceiros] Mídia complementar recebida (${mediaTypeText}) de ${chatId}.`); }
    } else {
        if (!lowerBody) { console.log(`[WARN] [Parceiros] Info complementar vazia recebida de ${chatId}.`); await handleInvalidResponse(msg, chat, currentState); actionValid = false;
        } else { console.log(`[INFO] [Parceiros] Texto complementar recebido de ${chatId}: "${msg.body}"`); }
    }
    if (actionValid && msg.type !== 'sticker' && (msg.hasMedia || lowerBody)) {
        try {
            const confirmationMessage = `✅ ${mediaTypeText} complementar recebido(a).`; const followUpQuestion = `❓ Algo mais que gostaria de adicionar aqui no chat?\n\nPor favor, responda com *sim* ou *não*.`;
            await sendMessageWithTyping(chat, confirmationMessage); await delay(300); await sendMessageWithTyping(chat, followUpQuestion);
            await updateChatState(chatId, { currentState: STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA });
        } catch (error) {
            console.error(`[ERROR] [handleInfoParceria] Erro ao processar ${chatId}:`, error); actionValid = false;
            try { await sendMessageWithTyping(chat, "😕 Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *menu*."); } catch (e) {console.error("Erro ao enviar msg erro handleInfoParceria", e);}
            await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false });
        }
    }
    return actionValid;
}

async function handleConfirmacaoMaisInfoParceria(msg, chat, lowerBody, currentState) {
    const chatId = msg.from;
    return handleYesNoResponse(msg, chat, lowerBody, currentState, {
        onYes: async () => {
            console.log(`[INFO] [Parceiros] User ${chatId} quer MAIS info complementar (Sim).`); const promptMsg = "Ok, pode enviar a informação adicional.";
            await sendMessageWithTyping(chat, promptMsg); return { currentState: STATES.AGUARDANDO_INFO_PARCERIA };
        },
        onNo: async () => {
            console.log(`[INFO] [Parceiros] User ${chatId} finalizou info complementar (Não).`); const finalMessage = `Certo! Informações adicionais recebidas.\n\nLembre-se de enviar sua proposta completa para ${CONFIG.EMAIL_PARCEIROS}.\n\nSe precisar de mais algo aqui, digite *menu*.`;
            await sendMessageWithTyping(chat, finalMessage);
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const notificacaoMsgTele = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Instruções para parceria (via e\\-mail) fornecidas\\. Info extra enviada pelo chat\\.`;
            console.log(`[INFO] [Parceiros] Enviando notificação Telegram para ${chatId}.`);
            enviarNotificacaoTelegram(notificacaoMsgTele, "🤝 INSTRUÇÕES DE PARCERIA");
            return { currentState: STATES.PARCERIA_INFO_DADA };
        }
    });
}

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('[INFO] QR Code recebido, escaneie com seu WhatsApp!');
});

client.on('ready', async () => {
    console.log('[INFO] --- DEBUG: Evento "ready" disparado ---');
    console.log(`[INFO] ✅ WhatsApp conectado.`);
    telegramBotInstances = [];
    if (CONFIG.TELEGRAM_CONFIGS && Array.isArray(CONFIG.TELEGRAM_CONFIGS) && CONFIG.TELEGRAM_CONFIGS.length > 0) {
        for (const tgConfig of CONFIG.TELEGRAM_CONFIGS) {
            if (tgConfig.BOT_TOKEN && tgConfig.CHAT_ID) {
                try {
                    const bot = new TelegramBot(tgConfig.BOT_TOKEN); const me = await bot.getMe();
                    console.log(`[Telegram] Conectado ao bot Telegram (Nome: ${tgConfig.NAME || 'N/A'}, User: @${me.username}) para o chat ID ${tgConfig.CHAT_ID}`);
                    telegramBotInstances.push({ bot, chatId: tgConfig.CHAT_ID, timezone: tgConfig.TIMEZONE || 'UTC', name: tgConfig.NAME || me.username });
                } catch (error) { console.error(`[Telegram] Falha ao inicializar o bot Telegram (Nome: ${tgConfig.NAME || 'N/A'}):`, error.message); }
            } else { console.warn(`[Telegram] Configuração incompleta (Token/Chat ID) para ${tgConfig.NAME || 'uma config'}.`); }
        }
    } else { console.warn('[Telegram] Nenhuma configuração de bot Telegram em CONFIG.TELEGRAM_CONFIGS.'); }

    if (client.info?.wid?._serialized) {
        botPhoneNumber = client.info.wid._serialized; console.log(`[INFO]   > Número Bot: ${botPhoneNumber}`);
    } else { console.error("[ERROR] [FATAL] Falha crítica ao obter informações do cliente. Encerrando."); process.exit(1); }
    botStartTime = Date.now(); 
    console.log('[INFO] --- DEBUG: loadBotState ---'); 
    await loadBotState();
    console.log('[INFO] --- DEBUG: loadBotState concluído ---'); 
    botReady = true;
    
    const startupText = `🚀 Bot Estúdio JF (WhatsApp) Iniciado`;
    const versionText = `Versão: ${CONFIG.BOT_STATE_FILE.match(/v[\d.]+/)?.[0] || 'N/A'}`;
    const onlineSinceText = `Online desde: ${new Date(botStartTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    
    const startupMessageForTelegram = `${escapeMarkdown(startupText)}\n${escapeMarkdown(versionText)}\n${escapeMarkdown(onlineSinceText)}`;
    const startupMessageForConsole = `${startupText}\n${versionText}\n${onlineSinceText}`;

    console.log(`[DEBUG] PONTO DE ENVIO: Notificação "BOT ONLINE" prestes a ser enviada.`);
    enviarNotificacaoTelegram(startupMessageForTelegram, "✅ BOT ONLINE"); 
    console.log(`[INFO] ${startupMessageForConsole}`); 
    await saveBotState();
});

client.on('disconnected', async (reason) => {
    console.log(`[WARN] [ Desconectado] Cliente desconectado: ${reason}`);
    
    const disconnectText = '🔴 Bot Estúdio JF (WhatsApp) Desconectado';
    const reasonText = `Motivo: ${String(reason)}`;
    const dateTimeText = `Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

    const notificationMessage = `${escapeMarkdown(disconnectText)}\n${escapeMarkdown(reasonText)}\n${escapeMarkdown(dateTimeText)}`;

    enviarNotificacaoTelegram(notificationMessage, "⚠️ BOT OFFLINE");
    botReady = false; 
    botPhoneNumber = null; 
    console.log('[INFO] [ Desconectado] Tentando salvar estado...');
    await saveBotState(); 
    console.log('[INFO] [ Desconectado] Estado salvo (ou tentativa concluída).');
});

client.on('auth_failure', msg => {
    console.error('[ERROR] ☠️ FALHA AUTENTICAÇÃO:', msg);
    const escapedMsgDetails = escapeMarkdown(String(msg));
    enviarNotificacaoTelegram(`❌ FALHA DE AUTENTICAÇÃO NO WHATSAPP\nDetalhes: ${escapedMsgDetails}\nData/Hora: ${escapeMarkdown(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}\n\nVERIFICAR URGENTEMENTE!`, "🔥 ERRO CRÍTICO BOT");
    process.exit(1);
});

client.on('message_ack', async (msg, ack) => { });

client.on('message_create', async msg => {
    if (!msg || !msg.from || !msg.from.endsWith('@c.us') || msg.isGroup || msg.isStatus) { return; }
    if (!botReady || !botPhoneNumber) { console.log("[WARN] Bot não pronto. Ignorando msg."); return; }
    if (msg.fromMe) {
        if (msg.to?.endsWith('@c.us') && msg.to !== botPhoneNumber) {
            const targetChatId = msg.to; const cmdBody = msg.body?.trim().toLowerCase() ?? '';
            if (cmdBody.includes('assumir') || cmdBody.includes('assumindo')) {
                console.log(`[INFO] [Takeover] Comando 'assumir' (do bot) detectado para ${targetChatId}`);
                await updateChatState(targetChatId, { isHuman: true, humanTakeoverConfirmed: true, reminderSent: false, currentState: STATES.HUMANO_ATIVO, menuDisplayed: false, });
                await saveBotState(); return;
            }
        }
        return;
    }
    const chatId = msg.from; const lowerBody = msg.body?.trim().toLowerCase() ?? '';
    if (!lowerBody && (msg.type === 'e2e_notification' || msg.type === 'notification_template' || msg.type === 'gp2')) { console.log(`[INFO] [MsgCreate] Ignorando notificação vazia (${msg.type}) de ${chatId}.`); return; }

    let chat;
    try { chat = await msg.getChat(); if (!chat) { console.warn(`[WARN] [MsgCreate] Chat ${chatId} não obtido. Limpando.`); cleanupChatState(chatId); await saveBotState(); return; }
    } catch (e) { console.error(`[ERROR] [MsgCreate] Erro CRÍTICO getChat ${chatId}: ${e.message}`); cleanupChatState(chatId); await saveBotState(); return; }

    let currentStateData = chatStates.get(chatId); const firstInteractionInSession = !currentStateData;
    if (firstInteractionInSession) { currentStateData = getDefaultChatState(chatId); chatStates.set(chatId, currentStateData); console.log(`[INFO] [MsgCreate] Primeira interação detectada para ${chatId}.`); }
    const { currentState: stateType, isHuman, schedulingDetails } = currentStateData;

    if (stateType === STATES.INICIO && (msg.type === 'audio' || msg.type === 'ptt') && !isHuman) {
        console.log(`[INFO] [MsgCreate] Primeira interação via áudio ${chatId}. Enviando aviso e menu.`);
        const greeting = await greetingMessage(); const warningMsg = `${greeting}\n\n👋 Olá! Recebi seu áudio. Para prosseguir, por favor, utilize uma das opções de texto do menu abaixo. 😊`;
        await sendMessageWithTyping(chat, warningMsg); await displayMenu(msg, chat, false); return;
    }

    console.log(`[INFO] --- Msg Recebida [${new Date().toLocaleTimeString('pt-BR')}] De: ${chatId} Tipo: ${msg.type} Estado: ${stateType} Humano: ${isHuman}`);
    
    let stateChangedDuringProcessing = false;
    try {
        if (isHuman) {
            if (lowerBody === 'reiniciar' || lowerBody === 'menu') {
                console.log(`[INFO] [MsgCreate] Comando '${lowerBody}' recebido durante atendimento humano. Reativando bot para ${chatId}.`);
                await displayMenu(msg, chat, true); stateChangedDuringProcessing = true;
            } else {
                await updateChatState(chatId, {}); stateChangedDuringProcessing = true;
            }
            if (stateChangedDuringProcessing || firstInteractionInSession) { await saveBotState(); } return;
        }

        if (lowerBody === 'encerrar') {
            console.log(`[INFO] [Global] Comando 'encerrar' recebido de ${chatId}.`);
            const contactName = await getContactName(msg);
            const escapedChatId = escapeMarkdown(chatId);
            const escapedState = escapeMarkdown(currentStateData.currentState);
            const summaryMsg = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Cliente digitou "encerrar"\\.\n*Último estado do bot:* ${escapedState}`;
            enviarNotificacaoTelegram(summaryMsg, "🚫 ATENDIMENTO ENCERRADO PELO CLIENTE");
            await sendMessageWithTyping(chat, "Ok, atendimento encerrado. 👋"); cleanupChatState(chatId); stateChangedDuringProcessing = true;
        } else if (lowerBody === 'menu' || lowerBody === 'reiniciar') {
            console.log(`[INFO] [Global] Comando '${lowerBody}' recebido de ${chatId} (Bot ativo) -> Exibindo Menu Curto (Estado Atual: ${stateType}).`);
            await displayMenu(msg, chat, true); stateChangedDuringProcessing = true;
        } else {
            let detectedPackageName = null;
            if (msg.type === 'chat' && lowerBody) {
                for (const keyword in PACOTES_KEYWORDS) { if (lowerBody.includes(keyword)) { detectedPackageName = PACOTES_KEYWORDS[keyword]; break; } }
            }
            if (detectedPackageName) {
                console.log(`[INFO] [PackageDetect] Pacote '${detectedPackageName}' detectado para ${chatId}.`);
                const contactName = await getContactName(msg); let responseMessage = "";
                if (detectedPackageName === "Projeto de Impermeabilização") {
                    responseMessage = `Olá ${contactName}! Que bom que você está buscando soluções para *impermeabilização*. 👍\n\nSeu contato sobre o *${detectedPackageName}* já foi direcionado a um de nossos especialistas na área. Ele(a) possui o conhecimento técnico ideal para te ajudar com as melhores soluções!\n\nAguarde só um momento, que logo ele(a) entrará em contato por aqui mesmo. Se precisar de outras opções, é só digitar *menu*.`;
                } else {
                    responseMessage = `Olá ${contactName}! Que ótimo seu interesse no *${detectedPackageName}*! ✨\n\nJá estou encaminhando você para um de nossos especialistas, que entrará em contato em instantes.\n\nPara elaborarmos uma proposta sob medida para você, nosso formulário de orçamento é uma ferramenta chave! Ele nos permite captar todos os detalhes importantes para um projeto personalizado.\n➡️ *Formulário para Orçamento Personalizado:* ${CONFIG.FORM_LINK_ORCAMENTO}\n\nNosso consultor irá solicitar o preenchimento para detalhar seu orçamento. Se quiser adiantar, pode preencher agora. Caso contrário, não tem problema, ele te guiará depois. O importante é que seu atendimento está garantido!\n\nEnquanto isso, se precisar de outras informações ou voltar ao menu principal, é só digitar *menu*.`;
                }
                await sendMessageWithTyping(chat, responseMessage);
                const escapedChatId = escapeMarkdown(chatId);
                const escapedPackageName = escapeMarkdown(detectedPackageName);
                const notificacaoMsgTelePacote = `*Usuário (WA):* ${contactName} (${escapedChatId})\n*Origem:* Interesse no "${escapedPackageName}"`;
                enviarNotificacaoTelegram(notificacaoMsgTelePacote, "🔔 SOLICITAÇÃO DE ATENDIMENTO HUMANO");
                await updateChatState(chatId, { currentState: STATES.HUMANO_ATIVO, isHuman: true, humanTakeoverConfirmed: false, reminderSent: false, menuDisplayed: false });
                stateChangedDuringProcessing = true;
            } else {
                const passiveStates = [ STATES.PRE_AGENDAMENTO_CONCLUIDO, STATES.DUVIDA_REGISTRADA, STATES.PARCERIA_INFO_DADA, STATES.FORMULARIO_INSTRUCOES_DADAS ];
                if (passiveStates.includes(stateType)) {
                    const ackWordsRegex = /^\s*(ok|obg|obrigado|grato|vlw|valeu|👍|beleza|blz|certo|entendi|entendido|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿)\s*$/i;
                    if (msg.type === 'chat' && ackWordsRegex.test(lowerBody)) { await updateChatState(chatId, {}); stateChangedDuringProcessing = true; }
                    else { const reminderMsg = MENSAGENS_ESTADO_PASSIVO[stateType]; if (reminderMsg) { await sendMessageWithTyping(chat, reminderMsg); } else { await sendMessageWithTyping(chat, "O atendimento anterior foi concluído. Se precisar de algo mais, digite *menu*."); } await updateChatState(chatId, {}); stateChangedDuringProcessing = true; }
                } else {
                    const mediaAllowedStates = [ STATES.AGUARDANDO_DESCRICAO_DUVIDA, STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA, STATES.AGUARDANDO_INFO_PARCERIA ];
                    const isMediaAllowedInCurrentState = mediaAllowedStates.includes(stateType);
                    if (msg.hasMedia && !isMediaAllowedInCurrentState) { const msgRejeicaoAtivo = MENSAGENS_MIDIA_INESPERADA_ATIVO[stateType] || MENSAGENS_MIDIA_INESPERADA_ATIVO.GENERICO_MIDIA_NAO_PERMITIDA; await sendMessageWithTyping(chat, msgRejeicaoAtivo); await updateChatState(chatId, {}); stateChangedDuringProcessing = true;
                    } else {
                        const greetingRegex = /^\s*(oi+|ol[aá]+|bom\s+dia|boa\s+tarde|boa\s+noite|opa+|eai+|eae+|salve+|koe+|blz|beleza)\s*$/i; const isGreeting = greetingRegex.test(lowerBody);
                        const noResetStatesOnGreeting = [ STATES.AGUARDANDO_CONFIRMACAO_DUVIDA, STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA, STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA, STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA, STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA, STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES, STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA, STATES.AGUARDANDO_INFO_PARCERIA, STATES.AGUARDANDO_DESCRICAO_DUVIDA, STATES.AGUARDANDO_OPCAO_ORCAMENTO, STATES.AGUARDANDO_MODO_AGENDAMENTO ];
                        const canResetOnGreeting = isGreeting && stateType !== STATES.INICIO && !noResetStatesOnGreeting.includes(stateType);
                        if (canResetOnGreeting) { console.log(`[INFO] [Global] Saudação '${lowerBody}' recebida em estado resetável ('${stateType}'). Exibindo Menu Curto.`); await displayMenu(msg, chat, true); stateChangedDuringProcessing = true;
                        } else {
                            let handlerFunction = null;
                            switch (stateType) {
                                case STATES.AGUARDANDO_OPCAO_MENU: handlerFunction = handleMenuOption; break; case STATES.AGUARDANDO_OPCAO_ORCAMENTO: handlerFunction = handleOrcamentoOption; break; case STATES.AGUARDANDO_POS_PORTFOLIO: handlerFunction = handlePostPortfolio; break;
                                case STATES.AGUARDANDO_POS_SERVICOS: handlerFunction = handlePostServicos; break; case STATES.AGUARDANDO_MODO_AGENDAMENTO: handlerFunction = handleAgendamentoMode; break; case STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES: handlerFunction = handlePreAgendamentoDetalhes; break;
                                case STATES.AGUARDANDO_DESCRICAO_DUVIDA: handlerFunction = handleDescricaoDuvida; break; case STATES.AGUARDANDO_CONFIRMACAO_DUVIDA: handlerFunction = handleConfirmacaoDuvida; break; case STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA: handlerFunction = handleRespostaPreEspecialista; break;
                                case STATES.AGUARDANDO_INFO_PRE_ESPECIALISTA: handlerFunction = handleInfoPreEspecialista; break; case STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA: handlerFunction = handleConfirmacaoInfoPreEspecialista; break; case STATES.AGUARDANDO_CONFIRMACAO_PARCERIA_EXTRA: handlerFunction = handleConfirmacaoParceriaExtra; break;
                                case STATES.AGUARDANDO_INFO_PARCERIA: handlerFunction = handleInfoParceria; break; case STATES.AGUARDANDO_CONFIRMACAO_MAIS_INFO_PARCERIA: handlerFunction = handleConfirmacaoMaisInfoParceria; break;
                                case STATES.INICIO: console.log(`[INFO] [Estado Inicio - Switch] Mensagem não tratada recebida. Exibindo menu completo.`); await displayMenu(msg, chat, false); stateChangedDuringProcessing = true; break;
                                default: console.log(`[WARN] [Default - Switch Ativo] Estado '${stateType}' inesperado. Exibindo menu curto.`); await displayMenu(msg, chat, true); stateChangedDuringProcessing = true; break;
                            }
                            if (handlerFunction) { const actionResult = await handlerFunction(msg, chat, lowerBody, currentStateData); if (actionResult !== false) { stateChangedDuringProcessing = true; } }
                        }
                    }
                }
            }
        }
    } catch (handlerError) {
        console.error(`[ERROR] [MsgCreate] Erro CRÍTICO estado '${stateType}' (${chatId}):`, handlerError);
        try { await sendMessageWithTyping(chat, "😕 Desculpe, ocorreu um erro inesperado. Tente novamente ou digite *menu*."); await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false }); stateChangedDuringProcessing = true;
        } catch (fallbackError) { console.error(`[ERROR] [MsgCreate] Erro fallback (${chatId}):`, fallbackError); cleanupChatState(chatId); stateChangedDuringProcessing = true; }
    } finally { if (stateChangedDuringProcessing || firstInteractionInSession) { await saveBotState(); } }
});

setInterval(async () => {
    const now = Date.now();
    if (!botReady || chatStates.size === 0) return;

    let stateChangedInInterval = false;
    const chatIds = Array.from(chatStates.keys());

    for (const chatId of chatIds) {
        const state = chatStates.get(chatId);
        if (!state) continue;

        const { lastTimestamp, currentState: stateType, isHuman, humanTakeoverConfirmed, reminderSent } = state;

        if (typeof lastTimestamp !== 'number' || lastTimestamp > now) {
            console.warn(`[WARN] [Inatividade] Timestamp inválido para ${chatId}. Removendo.`);
            cleanupChatState(chatId); stateChangedInInterval = true; continue;
        }
        const timeSinceLastInteraction = now - lastTimestamp;

        try {
            if (timeSinceLastInteraction > CONFIG.INACTIVE_SESSION_TIMEOUT) {
                console.log(`[INFO] [Inatividade] Timeout GERAL (${(CONFIG.INACTIVE_SESSION_TIMEOUT / 60000)} min) para ${chatId}. Limpando.`);
                
                const contactName = await getContactName(chatId);
                const escapedChatId = escapeMarkdown(chatId);
                const escapedStateType = escapeMarkdown(stateType);
                const inactiveMinutes = Math.round(CONFIG.INACTIVE_SESSION_TIMEOUT / 60000);
                
                const summaryMsg = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Sessão expirada por inatividade geral\\.\n*Último estado do bot:* ${escapedStateType}\n*Tempo inativo:* ${inactiveMinutes} min`;
                
                enviarNotificacaoTelegram(summaryMsg, "⏰ SESSÃO EXPIRADA POR INATIVIDADE");
                cleanupChatState(chatId); stateChangedInInterval = true; continue;
            }

            if (stateType === STATES.HUMANO_ATIVO && isHuman && !humanTakeoverConfirmed && !reminderSent && timeSinceLastInteraction > CONFIG.HUMAN_REMINDER_TIMEOUT) {
                console.log(`[INFO] [Inatividade] Enviando lembrete humano (aguardando takeover) para ${chatId}.`);
                await updateChatState(chatId, { reminderSent: true }); stateChangedInInterval = true;
                const updatedStateForReminder = chatStates.get(chatId);
                if (!updatedStateForReminder || !updatedStateForReminder.reminderSent) {
                    console.error(`[ERROR] [Inatividade] Falha ao definir reminderSent=true para ${chatId}.`); continue;
                }
                const chat = await client.getChatById(chatId);
                if (chat) {
                    const reminderMsg = "👋 Olá! Vimos que você solicitou falar com um especialista/atendente. Só para confirmar, nossa equipe já foi notificada e entrará em contato por aqui assim que possível. Agradecemos a paciência! 🙏\n\n_(Se já estiver sendo atendido, pode ignorar esta mensagem)._";
                    await chat.sendMessage(reminderMsg).catch(e => console.error(`[ERROR] [Inatividade] Erro ao enviar lembrete humano para ${chatId}: ${e.message}`));
                } else {
                    console.warn(`[WARN] [Inatividade] Chat ${chatId} não encontrado para lembrete humano. Limpando.`); cleanupChatState(chatId);
                } continue;
            }
            
            const waitingInputStatesForTimeout = [STATES.AGUARDANDO_OPCAO_MENU, STATES.AGUARDANDO_OPCAO_ORCAMENTO, STATES.AGUARDANDO_MODO_AGENDAMENTO, STATES.AGUARDANDO_PRE_AGENDAMENTO_DETALHES, STATES.AGUARDANDO_POS_PORTFOLIO, STATES.AGUARDANDO_POS_SERVICOS, STATES.AGUARDANDO_CONFIRMACAO_DUVIDA, STATES.AGUARDANDO_RESPOSTA_PRE_ESPECIALISTA, STATES.AGUARDANDO_CONFIRMACAO_INFO_PRE_ESPECIALISTA,];
            const isWaitingForBotInput = !isHuman && waitingInputStatesForTimeout.includes(stateType);
            if (isWaitingForBotInput && timeSinceLastInteraction > CONFIG.MENU_RESET_TIMEOUT) {
                console.log(`[INFO] [Inatividade] Timeout de INPUT (${(CONFIG.MENU_RESET_TIMEOUT / 60000)} min) para ${chatId} no estado '${stateType}'. Resetando.`);
                
                const contactName = await getContactName(chatId);
                const escapedChatId = escapeMarkdown(chatId);
                const escapedStateType = escapeMarkdown(stateType);
                const inactiveMinutes = Math.round(CONFIG.MENU_RESET_TIMEOUT / 60000);

                const summaryMsg = `*Cliente:* ${contactName} (${escapedChatId})\n*Ação:* Atendimento resetado por inatividade do cliente em responder ao bot\\.\n*Estava no estado:* ${escapedStateType}\n*Tempo inativo:* ${inactiveMinutes} min`;
                
                enviarNotificacaoTelegram(summaryMsg, "🔄 ATENDIMENTO RESETADO POR INATIVIDADE");
                const chat = await client.getChatById(chatId);
                if (chat) {
                    const timeoutMsg = `👋 Olá! Notei que não interagimos por um tempo. A conversa foi reiniciada.\n\nSe precisar de ajuda, é só digitar *menu* para ver as opções novamente, ou digite *encerrar* se não precisar mais. 😊`;
                    await sendMessageWithTyping(chat, timeoutMsg);
                    await updateChatState(chatId, { currentState: STATES.INICIO, menuDisplayed: false, invalidAttempts: 0, schedulingMode: null, schedulingDetails: null, inOrcamento: false, isHuman: false, humanTakeoverConfirmed: false, reminderSent: false }); stateChangedInInterval = true;
                } else {
                    console.warn(`[WARN] [Inatividade] Chat ${chatId} não encontrado para msg timeout input. Limpando.`); cleanupChatState(chatId); stateChangedInInterval = true;
                }
                continue;
            }
        } catch (error) {
            console.error(`[ERROR] [Inatividade] Erro CRÍTICO processando ${chatId} estado '${stateType}':`, error.message); cleanupChatState(chatId); stateChangedInInterval = true;
        }
    }
    if (stateChangedInInterval) { console.log("[INFO] [Inatividade] Alterações detectadas, salvando estado..."); await saveBotState(); }
}, CONFIG.INACTIVITY_CHECK_INTERVAL);

app.get('/status', (req, res) => {
    res.status(200).json({
        ready: botReady,
        phoneNumber: botPhoneNumber,
        startTime: botStartTime ? new Date(botStartTime).toISOString() : null,
        activeChats: chatStates.size
    });
});

app.listen(PORT, () => {
    console.log(`[INFO] [Servidor] API do Bot Estúdio JF a rodar na porta ${PORT}.`);
    console.log("[INFO] [Cliente] A inicializar o cliente do WhatsApp...");
    client.initialize().catch(err => {
        console.error("[ERROR] ☠️ Erro CRÍTICO na inicialização do cliente:", err);
        const escapedErrorMessage = escapeMarkdown(String(err.message));
        enviarNotificacaoTelegram(`🔥 ERRO CRÍTICO NA INICIALIZAÇÃO DO BOT WHATSAPP\nErro: ${escapedErrorMessage}\n\nO BOT NÃO ESTÁ FUNCIONANDO!`, "🔥 ERRO CRÍTICO BOT");
        process.exit(1);
    });
});
