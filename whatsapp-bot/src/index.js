import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import QRCode from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const studySessions = new Map();
let qrShown = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info("Baileys v%s (latest=%s)", version.join("."), isLatest);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("ZapCards"),
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && !qrShown) {
      qrShown = true;
      logger.info("========================================");
      logger.info("  ZapCards WhatsApp — QR Code");
      logger.info("  Abra WhatsApp no celular");
      logger.info("  Dispositivos Conectados > Vincular");
      logger.info("========================================");

      try {
        const display = await QRCode.toString(qr, { type: "terminal", small: false });
        logger.info("\n%s", display);
      } catch (err) {
        logger.info("QR text: %s", qr);
        logger.info("Cole este texto em: https://www.qr-code-generator.com");
        logger.info("Escolha 'Texto' como tipo e gere o QR");
      }

      logger.info("========================================");
    }

    if (connection === "close") {
      qrShown = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.warn({ code }, "Conexao fechada");

      if (code === DisconnectReason.loggedOut) {
        logger.info("Sessao invalida — removendo auth_info");
        try { fs.rmSync("auth_info", { recursive: true, force: true }); } catch {}
      }

      if (code !== DisconnectReason.loggedOut) {
        logger.info("Tentando reconectar com sessao existente...");
      }

      setTimeout(connectToWhatsApp, 3000);
    } else if (connection === "open") {
      qrShown = false;
      logger.info("========================================");
      logger.info("  ZapCards CONECTADO! Pronto para uso.");
      logger.info("  Envie 'treinar' para estudar.");
      logger.info("========================================");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (!text) continue;

      const jid = msg.key.remoteJid;
      logger.info({ jid, text: text.slice(0, 80) }, "msg");

      const session = studySessions.get(jid);

      if (text.toLowerCase() === "sair" || text.toLowerCase() === "parar") {
        studySessions.delete(jid);
        await sock.sendMessage(jid, { text: "Sessao encerrada. Digite *treinar* para comecar." });
        continue;
      }

      if (session) {
        await handleStudyAnswer(sock, jid, text, session);
        continue;
      }

      if (text.toLowerCase().includes("treinar") || text.toLowerCase().includes("flashcard")) {
        await startStudySession(sock, jid);
      } else {
        try {
          const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
          const data = await res.json();
          await sock.sendMessage(jid, { text: data.content || "Nao entendi. Tente *treinar*!" });
        } catch {
          await sock.sendMessage(jid, { text: "Servidor indisponivel." });
        }
      }
    }
  });
}

async function startStudySession(sock, jid) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/flashcards`);
    const cards = await res.json();
    if (!cards.length) {
      await sock.sendMessage(jid, { text: "Nenhum flashcard. Crie notas primeiro!" });
      return;
    }
    const session = { cards: cards.slice(0, 10), currentIndex: 0 };
    studySessions.set(jid, session);
    await sendCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao buscar flashcards." });
  }
}

async function sendCard(sock, jid, session) {
  if (session.currentIndex >= session.cards.length) {
    studySessions.delete(jid);
    return sock.sendMessage(jid, { text: "*Sessao concluida!* Otimo trabalho!\n\nDigite *treinar* para estudar novamente." });
  }
  const card = session.cards[session.currentIndex];
  return sock.sendMessage(jid, { text: `*${session.currentIndex + 1}/${session.cards.length}* ${card.question}\n\n_Responda ou digite *pular*_` });
}

async function handleStudyAnswer(sock, jid, text, session) {
  if (text.toLowerCase() === "pular") {
    session.currentIndex++;
    return sendCard(sock, jid, session);
  }
  const card = session.cards[session.currentIndex];
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Avalie comparado ao gabarito:\nGabarito: ${card.answer}\nResposta: ${text}\nResponda CORRETO ou INCORRETO com feedback.` }),
    });
    const data = await res.json();
    await sock.sendMessage(jid, { text: `Gabarito: ${card.answer.slice(0, 200)}\n\n${data.content || "Recebido!"}` });
    session.currentIndex++;
    await new Promise(r => setTimeout(r, 1500));
    return sendCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    session.currentIndex++;
    return sendCard(sock, jid, session);
  }
}

connectToWhatsApp().catch(logger.error);
