import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import QRCode from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const studySessions = new Map();

function saveQrImage(qr) {
  try {
    const filepath = "/tmp/zapcards-qr.png";
    QRCode.toFile(filepath, qr, { width: 400, margin: 2 }, (err) => {
      if (!err) logger.info({ filepath }, "QR code image saved to %s", filepath);
    });
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
      logger.info("=== NOVO QR CODE GERADO ===");
      saveQrImage(qr);

      try {
        const smallQr = await QRCode.toString(qr, { type: "terminal", small: true });
        logger.info("QR Code (terminal):\n%s", smallQr);
      } catch {
        logger.info("QR Code (raw, copie e cole em https://www.qr-code-generator.com): %s", qr);
      }

      logger.info("=== Fim do QR Code ===");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.info({ statusCode, shouldReconnect }, "Conexao fechada");
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      } else {
        logger.info("Sessao encerrada. Delete 'auth_info' para gerar novo QR code.");
      }
    } else if (connection === "open") {
      logger.info("ZapCards bot conectado e pronto!");
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

    await sock.sendMessage(jid, {
      text: `*Sessao de Estudos*\n\n${session.cards.length} flashcards prontos!\nVou enviar um de cada vez. Responda cada pergunta.\n\nDigite *pular* para avancar.\nDigite *sair* para encerrar.\n\n*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[0].question}`,
    });

    session.questionShown = true;
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao carregar flashcards. Verifique se o backend esta rodando." });
  }
}

async function handleStudyAnswer(sock, jid, text, session) {
  if (text.toLowerCase() === "pular") {
    session.currentIndex++;
    session.questionShown = false;

    if (session.currentIndex >= session.cards.length) {
      studySessions.delete(jid);
      await sock.sendMessage(jid, {
        text: "*Sessao concluida!*\n\nVoce revisou todos os flashcards. Otimo trabalho!\n\nDigite *treinar* para estudar novamente.",
      });
      return;
    }

    await sock.sendMessage(jid, {
      text: `*Pulado!*\n\n*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[session.currentIndex].question}`,
    });
    session.questionShown = true;
    return;
  }

  if (!session.questionShown) {
    session.currentIndex++;
    session.questionShown = false;

    if (session.currentIndex >= session.cards.length) {
      studySessions.delete(jid);
      await sock.sendMessage(jid, { text: "*Sessao concluida!* Otimo trabalho!\n\nDigite *treinar* para estudar novamente." });
      return;
    }

    await sock.sendMessage(jid, {
      text: `*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[session.currentIndex].question}`,
    });
    session.questionShown = true;
    return;
  }

  const card = session.cards[session.currentIndex];

  try {
    const evalRes = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `Compare minha resposta com o gabarito e me diga se esta correta.\n\nGabarito: ${card.answer}\n\nMinha resposta: ${text}\n\nResponda apenas: CORRETO ou INCORRETO, seguido de um breve feedback.`,
      }),
    });
    const evalData = await evalRes.json();
    const feedback = evalData.content || "Recebido!";

    await sock.sendMessage(jid, {
      text: `*Resposta:*\n${text.slice(0, 200)}\n\n*Gabarito:*\n${card.answer.slice(0, 300)}\n\n*Feedback:*\n${feedback}`,
    });

    session.currentIndex++;

    if (session.currentIndex >= session.cards.length) {
      studySessions.delete(jid);
      await sock.sendMessage(jid, {
        text: "*Sessao concluida!*\n\nVoce revisou todos os flashcards.\n\nDigite *treinar* para estudar novamente.",
      });
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));

    await sock.sendMessage(jid, {
      text: `*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[session.currentIndex].question}`,
    });
    session.questionShown = true;
  } catch (err) {
    logger.error(err);
    session.currentIndex++;
    session.questionShown = false;

    if (session.currentIndex >= session.cards.length) {
      studySessions.delete(jid);
      await sock.sendMessage(jid, { text: "Sessao concluida! Digite *treinar* para estudar novamente." });
    } else {
      await sock.sendMessage(jid, {
        text: `*Flashcard ${session.currentIndex + 1}/${session.cards.length}:*\n\n${session.cards[session.currentIndex].question}`,
      });
      session.questionShown = true;
    }
  }
}

connectToWhatsApp().catch(logger.error);
