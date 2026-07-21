import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import http from "http";
import QRCode from "qrcode";

const logger = pino({ level: "info" });
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const PORT = process.env.PORT || 3000;

const studySessions = new Map();
let currentQrRaw = "";
let qrShown = false;

function startQrServer() {
  http.createServer((req, res) => {
    if (req.url === "/qr.png" && currentQrRaw) {
      QRCode.toBuffer(currentQrRaw, { width: 500, margin: 2 }, (err, buffer) => {
        if (err) { res.writeHead(500); return res.end("QR error"); }
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(buffer);
      });
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:40px">
        <h1>ZapCards QR Code</h1>
        ${currentQrRaw ? `<img src="/qr.png" style="max-width:400px;border:8px solid #22c55e;border-radius:16px"><p style="margin-top:20px;color:#aaa">Escaneie com WhatsApp > Dispositivos Conectados > Vincular</p>` : "<p>Aguardando QR code...</p>"}
      </body></html>`);
    }
  }).listen(PORT, "0.0.0.0", () => {
    logger.info("QR server on port %s", PORT);
  });
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();
  logger.info("Baileys v%s", version.join("."));

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
      currentQrRaw = qr;
      logger.info("--- QR CODE GERADO ---");
      logger.info("Abra o link do servico no navegador e va em /qr.png");
      logger.info("Ou copie o texto abaixo e cole em qr-code-generator.com (opcao Texto):");
      logger.info("%s", qr);
      logger.info("--- FIM QR CODE ---");
    }

    if (connection === "close") {
      qrShown = false;
      currentQrRaw = "";
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.warn({ code }, "Desconectado");

      if (code === DisconnectReason.loggedOut) {
        logger.info("Sessao invalida — limpando auth_info");
        try { fs.rmSync("auth_info", { recursive: true, force: true }); } catch {}
      }
      setTimeout(connectToWhatsApp, 5000);
    } else if (connection === "open") {
      qrShown = false;
      currentQrRaw = "";
      logger.info("--- CONECTADO AO WHATSAPP ---");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (!text) continue;

      const jid = msg.key.remoteJid;

      const session = studySessions.get(jid);
      if (text.toLowerCase() === "sair" || text.toLowerCase() === "parar") {
        studySessions.delete(jid);
        await sock.sendMessage(jid, { text: "Sessao encerrada. Digite *treinar* para comecar." });
        continue;
      }
      if (session) { await handleStudyAnswer(sock, jid, text, session); continue; }

      if (text.toLowerCase().includes("treinar") || text.toLowerCase().includes("flashcard")) {
        await handleStudyCommand(sock, jid, text);
      } else if (
        text.toLowerCase() === "notas" ||
        text.toLowerCase().startsWith("listar") ||
        text.toLowerCase() === "minhas notas"
      ) {
        await handleListNotes(sock, jid);
      } else if (
        text.toLowerCase().startsWith("nota ") ||
        text.toLowerCase().startsWith("ler ") ||
        text.toLowerCase().startsWith("ver ") ||
        text.toLowerCase().startsWith("abrir ")
      ) {
        await handleReadNote(sock, jid, text);
      } else {
        try {
          const res = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
          const data = await res.json();
          await sock.sendMessage(jid, { text: data.content || "Nao entendi." });
        } catch { await sock.sendMessage(jid, { text: "Servidor indisponivel." }); }
      }
    }
  });
}

async function handleListNotes(sock, jid) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/notes`);
    const notes = await res.json();

    if (!notes.length) {
      await sock.sendMessage(jid, { text: "Nenhuma nota encontrada. Crie notas no ZapCards!" });
      return;
    }

    const lines = notes.map((n, i) =>
      `${i + 1}. *${n.title || "Sem titulo"}*${n.area ? ` [${n.area}]` : ""}\n   Tags: ${n.tags?.map(t => t.name).join(", ") || "nenhuma"}`
    );

    const chunks = [];
    let current = "*Suas Notas:*\n\n";
    for (const line of lines) {
      if ((current + line).length > 3800) {
        chunks.push(current);
        current = line + "\n";
      } else {
        current += line + "\n";
      }
    }
    if (current.trim()) chunks.push(current);

    for (const chunk of chunks) {
      await sock.sendMessage(jid, { text: chunk });
    }

    await sock.sendMessage(jid, { text: "Envie *ler <numero>* ou *ver <titulo>* para abrir uma nota." });
  } catch {
    await sock.sendMessage(jid, { text: "Erro ao buscar notas." });
  }
}

async function handleReadNote(sock, jid, text) {
  try {
    let query = text.replace(/^(nota|ler|ver|abrir)\s+/i, "").trim();

    if (/^\d+$/.test(query)) {
      const res = await fetch(`${BACKEND_URL}/api/notes`);
      const notes = await res.json();
      const idx = parseInt(query) - 1;
      if (idx < 0 || idx >= notes.length) {
        await sock.sendMessage(jid, { text: "Numero invalido. Use *notas* para ver a lista." });
        return;
      }
      query = notes[idx].id;
    } else {
      const searchRes = await fetch(`${BACKEND_URL}/api/notes?search=${encodeURIComponent(query)}`);
      const searchNotes = await searchRes.json();
      if (!searchNotes.length) {
        await sock.sendMessage(jid, { text: `Nota "${query}" nao encontrada.` });
        return;
      }
      query = searchNotes[0].id;
    }

    const noteRes = await fetch(`${BACKEND_URL}/api/notes/${query}`);
    if (!noteRes.ok) { await sock.sendMessage(jid, { text: "Nota nao encontrada." }); return; }

    const note = await noteRes.json();
    const content = note.content_md || "(vazio)";

    const sendChunks = (str, prefix) => {
      const chunks = [];
      for (let i = 0; i < str.length; i += 3800) {
        chunks.push(str.slice(i, i + 3800));
      }
      return chunks;
    };

    await sock.sendMessage(jid, { text: `*${note.title || "Sem titulo"}*${note.area ? ` [${note.area}]` : ""}\n` });

    const parts = sendChunks(content);
    for (const part of parts) {
      await sock.sendMessage(jid, { text: part });
    }

    if (note.tags?.length) {
      await sock.sendMessage(jid, { text: `Tags: ${note.tags.map(t => t.name).join(", ")}` });
    }
  } catch {
    await sock.sendMessage(jid, { text: "Erro ao ler nota." });
  }
}

async function handleStudyCommand(sock, jid, text) {
  const topic = text
    .replace(/treinar|flashcards|flashcard|criar|sobre/gi, "")
    .trim()
    .replace(/^[:\-\s]+/, "");

  if (topic) {
    await sock.sendMessage(jid, { text: `Gerando flashcards sobre *${topic}*... Aguarde um momento.` });
    await generateAndStudy(sock, jid, topic);
    return;
  }

  const res = await fetch(`${BACKEND_URL}/api/flashcards`);
  const cards = await res.json();
  if (cards.length > 0) {
    await sock.sendMessage(jid, { text: `Encontrei ${cards.length} flashcards. Iniciando sessao...` });
    const session = { cards: cards.slice(0, 10), currentIndex: 0 };
    studySessions.set(jid, session);
    await sendCard(sock, jid, session);
    return;
  }

  await sock.sendMessage(jid, { text: "Nao ha flashcards ainda. Envie *treinar sobre <assunto>* para gerar novos. Ex: *treinar sobre biologia*" });
}

async function generateAndStudy(sock, jid, topic) {
  try {
    const notesRes = await fetch(`${BACKEND_URL}/api/notes?search=${encodeURIComponent(topic)}`);
    let notes = await notesRes.json();

    if (!notes.length) {
      const allRes = await fetch(`${BACKEND_URL}/api/notes`);
      notes = await allRes.json();
    }

    if (!notes.length) {
      await sock.sendMessage(jid, { text: "Nenhuma nota encontrada. Crie notas no ZapCards primeiro!" });
      return;
    }

    const noteIds = notes.slice(0, 5).map(n => n.id);

    const genRes = await fetch(`${BACKEND_URL}/api/flashcards/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_ids: noteIds, difficulty: "medio", quantity: 5 }),
    });

    if (!genRes.ok) {
      await sock.sendMessage(jid, { text: "Erro ao gerar flashcards. Tente novamente." });
      return;
    }

    const newCards = await genRes.json();

    if (!newCards.length) {
      await sock.sendMessage(jid, { text: "Nao foi possivel gerar flashcards. Verifique se as notas tem conteudo suficiente." });
      return;
    }

    await sock.sendMessage(jid, { text: `*${newCards.length} flashcards gerados!* Iniciando sessao...` });

    const session = { cards: newCards, currentIndex: 0 };
    studySessions.set(jid, session);
    await sendCard(sock, jid, session);
  } catch (err) {
    logger.error(err);
    await sock.sendMessage(jid, { text: "Erro ao gerar flashcards. Verifique se o servidor esta rodando." });
  }
}

async function startStudySession(sock, jid) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/flashcards`);
    const cards = await res.json();
    if (!cards.length) { await sock.sendMessage(jid, { text: "Nenhum flashcard. Crie notas primeiro!" }); return; }
    const session = { cards: cards.slice(0, 10), currentIndex: 0 };
    studySessions.set(jid, session);
    await sendCard(sock, jid, session);
  } catch { await sock.sendMessage(jid, { text: "Erro ao buscar flashcards." }); }
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
  if (text.toLowerCase() === "pular") { session.currentIndex++; return sendCard(sock, jid, session); }
  const card = session.cards[session.currentIndex];
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `Avalie comparado ao gabarito:\nGabarito: ${card.answer}\nResposta: ${text}\nResponda CORRETO ou INCORRETO com feedback.` }) });
    const data = await res.json();
    await sock.sendMessage(jid, { text: `Gabarito: ${card.answer.slice(0, 200)}\n\n${data.content || "Recebido!"}` });
    session.currentIndex++;
    await new Promise(r => setTimeout(r, 1500));
    return sendCard(sock, jid, session);
  } catch { session.currentIndex++; return sendCard(sock, jid, session); }
}

startQrServer();
connectToWhatsApp().catch(logger.error);
