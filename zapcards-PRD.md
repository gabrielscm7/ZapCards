# PRD — ZapCards
**Product Requirements Document**

| | |
|---|---|
| Produto | ZapCards — Sistema de estudos por flashcards |
| Autor | Gabriel Menezes |
| Data | 19 de julho de 2026 |
| Status | Rascunho inicial |

---

## 1. Visão do produto

ZapCards é uma plataforma pessoal de estudo que unifica três momentos que hoje ficam espalhados em ferramentas diferentes: **anotar** (caderno, PDF, fotos, áudio), **organizar o conhecimento** (tags, relações entre assuntos) e **revisar** (flashcards, testes, repetição espaçada) — com uma camada de IA que guia o uso e um bot de WhatsApp que permite estudar em qualquer lugar, por conversa.

## 2. Problema a ser resolvido

- Conteúdo de estudo (aulas, livros, artigos, vídeos) fica disperso em formatos diferentes (papel, PDF, áudio, vídeo), sem um lugar único e pesquisável.
- Transformar esse conteúdo em material de revisão (flashcards, testes) é manual e demorado.
- Ferramentas de repetição espaçada existentes (Anki) têm curva de aprendizado alta e não se integram a um fluxo de estudo por conversa/WhatsApp.
- Falta um sistema que **só responda com base no que a pessoa realmente estudou**, sem misturar informação externa que pode não corresponder ao que foi ensinado/lido.

## 3. Público-alvo

- Uso primário: o próprio Gabriel, para estudo pessoal, preparo de conteúdo técnico e apoio a atletas/clientes.
- Uso secundário (potencial): outros profissionais ou estudantes que quEIram um sistema de estudo pessoal com IA e organização em grafo.

## 4. Objetivos do produto

1. Centralizar qualquer formato de conteúdo de estudo em um único repositório pesquisável (Markdown + tags + grafo).
2. Reduzir o tempo entre "consumir conteúdo" e "ter material de revisão pronto" — geração automática de flashcards/testes.
3. Tornar a revisão possível em qualquer contexto, via WhatsApp, sem precisar abrir um app.
4. Garantir que o sistema nunca "invente" conteúdo — toda resposta vem do que foi armazenado, com fallback explícito quando não houver conteúdo suficiente.

## 5. Escopo funcional

### 5.1 Módulo 1 — Captura e armazenamento
- Criar/editar notas em Markdown diretamente no sistema.
- Importar arquivos: JPEG/PNG, PDF, DOC/DOCX, CSV, MP4/áudio.
- Conversão automática de qualquer formato importado para Markdown.
- OCR para imagens (impressas e manuscritas).
- Transcrição de áudio/vídeo.
- Tags livres por assunto/área/tema.
- Links entre notas (estilo `[[nota]]`), formando um grafo de conhecimento.
- Visualização gráfica (grafo) navegável e filtrável por tag/área.

### 5.2 Módulo 2 — Geração automatizada de conteúdo
- Seleção de uma ou mais notas/nodes como fonte.
- Geração de flashcards (pergunta/resposta) via IA, com nível de dificuldade configurável.
- Geração de testes (múltipla escolha, com gabarito e justificativa).
- Motor de repetição espaçada (agendamento automático de revisões).
- Exportação opcional de flashcards em formato compatível com Anki (`.apkg`).

### 5.3 Módulo 3 — Chatbox interno
- Chat sempre disponível dentro do sistema.
- Responde dúvidas sobre uso do sistema.
- Responde perguntas sobre o conteúdo armazenado (nunca sobre conhecimento externo).
- Executa ações do sistema por comando em linguagem natural (ex: "crie 5 flashcards sobre X").
- Retorna mensagem padrão de conteúdo não encontrado quando aplicável.

### 5.4 Módulo 4 — Bot de WhatsApp
- Início de sessão de estudo por comando em linguagem natural.
- Entrega de flashcards um a um.
- Avaliação da resposta do usuário (certo/errado, com tolerância semântica).
- Envio de resumo de reforço quando a resposta estiver errada.
- Atualização do histórico de revisão (realimenta o motor de repetição espaçada).

## 6. Requisitos não funcionais

| Categoria | Requisito |
|---|---|
| Privacidade | Nenhum dado do usuário é enviado a serviços externos além do necessário para inferência de IA (modelos abertos); sem uso de buscas externas para responder perguntas. |
| Confiabilidade | Falha em qualquer etapa de ingestão (OCR, conversão, transcrição) não deve corromper notas já existentes. |
| Desempenho | Resposta do chatbox e do bot de WhatsApp em tempo aceitável para conversa (poucos segundos). |
| Portabilidade dos dados | Notas armazenadas em Markdown puro, exportáveis sem dependência da plataforma. |
| Escalabilidade | Arquitetura deve suportar crescimento de usuários sem reescrita da base (separação entre app e inferência de IA). |

## 7. Fora de escopo (nesta fase)

- Colaboração multiusuário em tempo real nas mesmas notas.
- Aplicativo mobile nativo (o WhatsApp cobre o uso móvel por enquanto).
- Correção automática de provas/redações dissertativas longas.
- Integração com sistemas de gestão escolar/acadêmica de terceiros.

## 8. Critérios de sucesso

- Um arquivo em qualquer formato suportado é convertido em nota Markdown pesquisável sem intervenção manual.
- Geração de flashcards a partir de notas selecionadas funciona para os três níveis de dificuldade.
- O bot de WhatsApp completa um ciclo de sessão de estudo (pergunta → resposta → avaliação → reforço, se necessário) de ponta a ponta.
- Perguntas sobre assuntos não armazenados retornam a mensagem de fallback, nunca uma resposta inventada.

## 9. Riscos e dependências

| Risco | Mitigação |
|---|---|
| Qualidade de OCR em manuscrito variável | Uso de TrOCR + revisão manual da nota antes de confirmar importação |
| Dependência de provedor externo de inferência (Groq) | Arquitetura desacoplada — trocar de provedor não deve exigir reescrever o backend |
| Mudanças na API não oficial do WhatsApp (se optar por Baileys no MVP) | Migrar para a API oficial da Meta antes de expor a clientes/atletas em produção |
| Custo de infraestrutura de GPU/inferência crescer com uso | Monitorar consumo de tokens; usar modelos menores (8B) para tarefas simples |

## 10. Fases de entrega

1. Núcleo de notas (Markdown + tags + CRUD).
2. Grafo de conhecimento.
3. Ingestão multi-formato (OCR, conversão, transcrição).
4. Geração de flashcards + motor de repetição espaçada.
5. Chatbox interno com RAG.
6. Bot de WhatsApp.

---

*Este PRD descreve o quê e por quê o sistema existe. Para detalhes técnicos de implementação, ver o documento SPEC (`zapcards-SPEC.md`), que é o documento vivo, versionado e atualizado conforme decisões técnicas evoluem.*
