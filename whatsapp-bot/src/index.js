import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import { toDataURL } from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const qrDataUrl = await toDataURL(qr);
      logger.info("=== ESCANEIE O QR CODE NO WHATSAPP (Config > Linked Devices) ===");
      logger.info(qrDataUrl);
      logger.info("=== FIM QR CODE ===");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.info({ statusCode, shouldReconnect }, "Conexao fechada");
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      } else {
        logger.info("Sessao encerrada. Reinicie para gerar novo QR code.");
      }
    } else if (connection === "open") {
      logger.info("WhatsApp bot conectado e pronto para uso!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (!text) continue;

      const jid = msg.key.remoteJid;
      logger.info({ jid, text }, "Mensagem recebida");

      if (text.toLowerCase().includes("treinar") || text.toLowerCase().includes("flashcard")) {
        await handleStudySession(sock, jid, text);
      } else {
        try {
          const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
          });
          const data = await res.json();
          await sock.sendMessage(jid, { text: data.content || "Nao entendi. Tente 'treinar sobre X' para estudar!" });
        } catch {
          await sock.sendMessage(jid, { text: "Ops, o servidor nao esta respondendo. Tente novamente em instantes." });
        }
      }
    }
  });
}

async function handleStudySession(sock, jid, command) {
  await sock.sendMessage(jid, { text: "Buscando flashcards para voce..." });

  try {
    const res = await fetch(`${BACKEND_URL}/api/flashcards`);
    const cards = await res.json();

    if (!cards.length) {
      await sock.sendMessage(jid, { text: "Nenhum flashcard encontrado. Crie alguns no ZapCards primeiro!" });
      return;
    }

    for (const card of cards.slice(0, 10)) {
      await sock.sendMessage(jid, { text: `*${card.question}*` });
    }

    await sock.sendMessage(jid, { text: "Responda cada flashcard com sua resposta. Digite 'pular' para avancar." });
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao carregar flashcards." });
  }
}

connectToWhatsApp().catch(logger.error);
