import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import QRCode from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const PHONE_NUMBER = process.env.WHATSAPP_PHONE_NUMBER || "";

const studySessions = new Map();

function saveQrImage(qr) {
  try {
    QRCode.toFile("/tmp/zapcards-qr.png", qr, { width: 400, margin: 2 }, () => {});
  } catch {}
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logger.info("========================================");
      logger.info("  ZapCards WhatsApp Bot — Autenticacao  ");
      logger.info("========================================");

      saveQrImage(qr);

      try {
        const smallQr = await QRCode.toString(qr, { type: "terminal", small: true });
        logger.info("QR Code (escaneie com WhatsApp):\n%s", smallQr);
      } catch (err) {
        logger.info("QR raw: %s (cole em https://www.qr-code-generator.com)", qr);
      }

      if (PHONE_NUMBER) {
        try {
          const code = await sock.requestPairingCode(PHONE_NUMBER);
          logger.info("Pairing code enviado para %s: %s", PHONE_NUMBER, code);
          logger.info("Se o QR nao funcionar, use o codigo numerico acima no WhatsApp");
        } catch (err) {
          logger.info("Pairing code indisponivel. Use o QR code acima.");
        }
      } else {
        logger.info("Defina WHATSAPP_PHONE_NUMBER para receber codigo numerico via SMS.");
      }

      logger.info("========================================");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.info({ statusCode, shouldReconnect }, "Conexao fechada — reconectando em 5s");
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      } else {
        logger.info("Sessao encerrada. Delete 'auth_info' e reinicie.");
      }
    } else if (connection === "open") {
      logger.info("========================================");
      logger.info("  ZapCards WhatsApp Bot CONECTADO!      ");
      logger.info("  Envie 'treinar' para iniciar estudos  ");
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
      logger.info({ jid, text: text.slice(0, 100) }, "Mensagem recebida");

      const session = studySessions.get(jid);

      if (text.toLowerCase() === "sair" || text.toLowerCase() === "parar") {
        studySessions.delete(jid);
        await sock.sendMessage(jid, {
          text: "Sessao de estudo encerrada. Para estudar novamente, digite *treinar* ou *flashcard*.",
        });
        continue;
      }

      if (session) {
        await handleStudyAnswer(sock, jid, text, session);
        continue;
      }

      if (text.toLowerCase().includes("treinar") || text.toLowerCase().includes("flashcard")) {
        await startStudySession(sock, jid, text);
      } else {
        try {
          const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
          const data = await res.json();
          await sock.sendMessage(jid, {
            text:
              data.content ||
              "Nao entendi. Tente *treinar* para estudar ou faca uma pergunta sobre seu material!",
          });
        } catch {
          await sock.sendMessage(jid, {
            text: "Ops, o servidor nao esta respondendo. Tente novamente em instantes.",
          });
        }
      }
    }
  });
}

async function startStudySession(sock, jid, command) {
  await sock.sendMessage(jid, { text: "Buscando flashcards para voce..." });

  try {
    const res = await fetch(`${BACKEND_URL}/api/flashcards`);
    const cards = await res.json();

    if (!cards.length) {
      await sock.sendMessage(jid, {
        text: "Nenhum flashcard encontrado. Crie alguns no ZapCards primeiro!",
      });
      return;
    }

    const session = {
      cards: cards.slice(0, 10),
      currentIndex: 0,
      questionShown: false,
    };

    studySessions.set(jid, session);
    await sendNextCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao carregar flashcards." });
  }
}

function sendNextCard(sock, jid, session) {
  if (session.currentIndex >= session.cards.length) {
    studySessions.delete(jid);
    return sock.sendMessage(jid, {
      text: "*Sessao concluida!*\n\nVoce revisou todos os flashcards. Otimo trabalho!\n\nDigite *treinar* para estudar novamente.",
    });
  }

  session.questionShown = true;
  return sock.sendMessage(jid, {
    text: `*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[session.currentIndex].question}\n\n_Digite sua resposta ou *pular* para avancar_`,
  });
}

async function handleStudyAnswer(sock, jid, text, session) {
  if (text.toLowerCase() === "pular") {
    session.currentIndex++;
    session.questionShown = false;
    await sock.sendMessage(jid, { text: "*Pulado!*" });
    return sendNextCard(sock, jid, session);
  }

  const card = session.cards[session.currentIndex];

  try {
    const evalRes = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `Compare minha resposta com o gabarito e me diga se esta correta. Responda apenas: CORRETO ou INCORRETO, seguido de um breve feedback.\n\nGabarito: ${card.answer}\n\nMinha resposta: ${text}`,
      }),
    });
    const evalData = await evalRes.json();
    const feedback = evalData.content || "Recebido!";

    await sock.sendMessage(jid, {
      text: `*Sua resposta:* ${text.slice(0, 150)}\n\n*Gabarito:* ${card.answer.slice(0, 250)}\n\n*Feedback:* ${feedback}`,
    });

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
