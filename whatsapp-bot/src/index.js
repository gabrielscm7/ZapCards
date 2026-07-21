import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import QRCode from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const studySessions = new Map();

async function connectToWhatsApp() {
  try { fs.rmSync("auth_info", { recursive: true, force: true }); } catch {}

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  logger.info("Baileys version: %s", version.join("."));

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    connectTimeoutMs: 120_000,
    defaultQueryTimeoutMs: 60_000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logger.info("========================================");
      logger.info("  QR CODE PARA CONECTAR WHATSAPP");
      logger.info("========================================");
      logger.info("  No celular: WhatsApp > Dispositivos");
      logger.info("  Conectados > Vincular Dispositivo");
      logger.info("========================================");

      try {
        const qrStr = await QRCode.toString(qr, {
          type: "terminal",
          small: false,
        });
        logger.info(qrStr);
      } catch {
        logger.info("QR raw: %s", qr.slice(0, 100));
      }

      logger.info("========================================");
      logger.info("  Se o QR acima nao funcionar, cole");
      logger.info("  este texto em qr-code-generator.com:");
      logger.info("  %s", qr);
      logger.info("========================================");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        logger.info("Sessao expirada — limpando e tentando novamente em 3s");
        try { fs.rmSync("auth_info", { recursive: true, force: true }); } catch {}
        setTimeout(connectToWhatsApp, 3000);
      } else if (shouldReconnect) {
        logger.info("Conexao fechada — reconectando em 5s");
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === "open") {
      logger.info("========================================");
      logger.info("  CONECTADO! Bot pronto para uso.");
      logger.info("  Envie 'treinar' para estudar.");
      logger.info("========================================");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.buttonsResponseMessage?.selectedButtonId ||
        "";
      if (!text) continue;

      const jid = msg.key.remoteJid;
      logger.info({ jid, text: text.slice(0, 100) }, "msg");

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
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
          const data = await res.json();
          await sock.sendMessage(jid, { text: data.content || "Nao entendi. Tente *treinar* para estudar!" });
        } catch {
          await sock.sendMessage(jid, { text: "Servidor indisponivel no momento." });
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
      await sock.sendMessage(jid, { text: "Nenhum flashcard. Crie notas no ZapCards primeiro!" });
      return;
    }

    const session = { cards: cards.slice(0, 10), currentIndex: 0, questionShown: false };
    studySessions.set(jid, session);
    await sendNextCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao buscar flashcards." });
  }
}

async function sendNextCard(sock, jid, session) {
  if (session.currentIndex >= session.cards.length) {
    studySessions.delete(jid);
    return sock.sendMessage(jid, { text: "*Sessao concluida!* Otimo trabalho!\n\nDigite *treinar* para estudar novamente." });
  }
  session.questionShown = true;
  return sock.sendMessage(jid, { text: `*${session.currentIndex + 1}/${session.cards.length}* ${session.cards[session.currentIndex].question}\n\n_Digite resposta ou *pular*_` });
}

async function handleStudyAnswer(sock, jid, text, session) {
  if (text.toLowerCase() === "pular") {
    session.currentIndex++;
    session.questionShown = false;
    await sock.sendMessage(jid, { text: "Pulado." });
    return sendNextCard(sock, jid, session);
  }

  const card = session.cards[session.currentIndex];

  try {
    const evalRes = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Avalie minha resposta comparada ao gabarito:\n\nGabarito: ${card.answer}\n\nResposta: ${text}\n\nResponda CORRETO ou INCORRETO com breve feedback.` }),
    });
    const evalData = await evalRes.json();
    await sock.sendMessage(jid, { text: `Gabarito: ${card.answer.slice(0, 200)}\n\nFeedback: ${evalData.content || "Recebido!"}` });

    session.currentIndex++;
    session.questionShown = false;
    await new Promise((r) => setTimeout(r, 1500));
    return sendNextCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    session.currentIndex++;
    session.questionShown = false;
    return sendNextCard(sock, jid, session);
  }
}

connectToWhatsApp().catch(logger.error);
