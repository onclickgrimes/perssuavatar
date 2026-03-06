/**
 * Migration: Create channel_niches table
 *
 * Armazena configurações de nichos de canais para personalizar
 * a criação de vídeos com prompts específicos por nicho.
 */
exports.up = function (knex) {
  return knex.schema
    .createTable("channel_niches", function (table) {
      table.increments("id").primary();
      table.string("name").notNullable().unique();
      table.string("description");
      table.string("icon"); // Emoji ou ícone para identificação visual
      table.text("ai_prompt").notNullable(); // Prompt principal para a IA

      // Configurações específicas do nicho
      table.json("asset_types"); // Tipos de assets permitidos ['image_flux', 'video_stock', 'wavy_grid', etc]
      table.json("emotions"); // Emoções preferidas ['reflexão', 'calma', 'empolgação', etc]
      table.boolean("use_image_prompts").defaultTo(true); // Se deve gerar prompts de imagem
      table.json("camera_movements"); // Movimentos de câmera permitidos
      table.json("transitions"); // Transições permitidas
      table.json("entry_animations"); // Animações de entrada permitidas
      table.json("exit_animations"); // Animações de saída permitidas

      // Configurações de stock footage (Supabase)
      table.json("stock_categories"); // Categorias de vídeos permitidas ['natureza', 'tecnologia', etc]
      table.text("stock_rules"); // Regras adicionais para uso de stock footage

      // Configurações visuais padrão
      table.json("default_colors"); // Cores padrão do nicho
      table.string("default_font"); // Fonte padrão
      table.json("components_allowed"); // Componentes Remotion permitidos ['Timeline3D', 'WavyGrid', etc]

      // Configurações de voz
      table.string("tts_provider").defaultTo("gemini").notNullable();
      table.json("voice_styles").defaultTo("[]");
      table.string('voice_id').nullable();

      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .then(function () {
      // Inserir alguns nichos de exemplo
      return knex("channel_niches").insert([
        {
          name: "História Antiga",
          description:
            "Canais sobre história antiga, arqueologia, civilizações antigas",
          icon: "🏛️",
          ai_prompt: `Você é um diretor de vídeo especializado em documentários históricos épicos.

ESTILO VISUAL:
- Use imagens dramáticas de ruínas, artefatos e reconstruções históricas
- Prefira tons sérios, dourados, terrosos e escuros
- Atmosfera cinematográfica e imersiva
`,
          asset_types: JSON.stringify([
            "image_flux",
            "video_stock",
            "solid_color",
          ]),
          emotions: JSON.stringify([
            "reflexão",
            "seriedade",
            "nostalgia",
            "admiração",
            "mistério",
          ]),
          use_image_prompts: true,
          camera_movements: JSON.stringify([
            "zoom_in_slow",
            "pan_left",
            "pan_right",
            "static",
          ]),
          transitions: JSON.stringify([
            "fade",
            "dissolve",
            "wipe_left",
            "wipe_right",
          ]),
          entry_animations: JSON.stringify(["fade", "slide_up", "zoom_in"]),
          exit_animations: JSON.stringify(["fade", "dissolve", "evaporate"]),
          stock_categories: JSON.stringify([
            "natureza",
            "paisagem",
            "histórico",
            "arquitetura",
          ]),
          stock_rules:
            "Priorize vídeos sem pessoas modernas. Use duração mínima de 5 segundos.",
          default_colors: JSON.stringify([
            "#D4AF37",
            "#8B7355",
            "#2C1810",
            "#F5E6D3",
          ]),
          default_font: "Cinzel",
          components_allowed: JSON.stringify(["Timeline3D", "HighlightWord"]),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          name: "Meditação & Bem-estar",
          description:
            "Canais de meditação, relaxamento, mindfulness e bem-estar",
          icon: "🧘",
          ai_prompt: `Você é um diretor de vídeo especializado em conteúdo meditativo e relaxante.

ESTILO VISUAL:
- Use imagens suaves, natureza, água, céu, flores
- Cores calmas: azuis claros, verdes suaves, brancos, tons pastel
- Movimentos lentos e fluidos, nunca bruscos

COMPONENTES ESPECIAIS:
- Use WavyGrid para backgrounds abstratos e relaxantes
- NUNCA use Timeline3D - é muito agressivo para este nicho
- Use GeometricPatterns com movimentos lentos

EMOÇÕES PRINCIPAIS:
- calma, paz, reflexão, serenidade, contemplação

REGRAS DE STOCK FOOTAGE:
- Apenas vídeos de natureza tranquila (água correndo, folhas, céu)
- Evite qualquer vídeo com ação rápida ou pessoas falando
- Durações longas (8-15 segundos) para manter o ritmo meditativo

HIGHLIGHT WORDS:
- Evite muitos destaques de texto - máximo 1 por cena
- Use animações suaves como "fade" e "wave"
- Cores claras e suaves`,
          asset_types: JSON.stringify([
            "image_flux",
            "video_stock",
            "wavy_grid",
            "geometric_patterns",
          ]),
          emotions: JSON.stringify([
            "calma",
            "paz",
            "reflexão",
            "serenidade",
            "contemplação",
          ]),
          use_image_prompts: true,
          camera_movements: JSON.stringify(["static", "zoom_in_slow"]),
          transitions: JSON.stringify(["fade", "dissolve"]),
          entry_animations: JSON.stringify(["fade", "wave"]),
          exit_animations: JSON.stringify(["fade", "wave", "evaporate"]),
          stock_categories: JSON.stringify([
            "natureza",
            "água",
            "céu",
            "flores",
            "paisagem",
          ]),
          stock_rules:
            "Apenas vídeos calmos e lentos. Duração mínima de 8 segundos. Evite vídeos com pessoas ou ação.",
          default_colors: JSON.stringify([
            "#E8F4F8",
            "#A8D5E5",
            "#87CEAB",
            "#F0F7DA",
          ]),
          default_font: "Lato",
          components_allowed: JSON.stringify([
            "WavyGrid",
            "GeometricPatterns",
            "HighlightWord",
          ]),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          name: "Tecnologia & Inovação",
          description: "Canais sobre tecnologia, startups, gadgets e inovação",
          icon: "🚀",
          ai_prompt: `Você é um diretor de vídeo especializado em conteúdo tecnológico moderno.

ESTILO VISUAL:
- Use imagens futuristas, interfaces digitais, dispositivos tech
- Cores vibrantes: azul elétrico, ciano, roxo neon, preto
- Transições rápidas e dinâmicas

COMPONENTES ESPECIAIS:
- Use WavyGrid para backgrounds tech futuristas
- Use GeometricPatterns com cores neon
- Transições rápidas como "zoom", "glitch", "slide"

EMOÇÕES PRINCIPAIS:
- empolgação, curiosidade, surpresa, urgência, inovação

REGRAS DE STOCK FOOTAGE:
- Priorize vídeos de circuitos, interfaces, dados em movimento
- Durações curtas (3-5 segundos) para manter dinamismo
- Pode usar vídeos com movimento rápido

HIGHLIGHT WORDS:
- Use bastante destaque de texto
- Animações energéticas: "pop", "explode", "bounce"
- Cores neon e vibrantes`,
          asset_types: JSON.stringify([
            "image_flux",
            "video_stock",
            "wavy_grid",
            "geometric_patterns",
            "solid_color",
          ]),
          emotions: JSON.stringify([
            "empolgação",
            "curiosidade",
            "surpresa",
            "urgência",
            "inovação",
          ]),
          use_image_prompts: true,
          camera_movements: JSON.stringify([
            "zoom_in_fast",
            "zoom_out_fast",
            "shake",
            "pan_left",
            "pan_right",
          ]),
          transitions: JSON.stringify([
            "zoom_in",
            "zoom_out",
            "glitch",
            "slide_left",
            "slide_right",
            "wipe_left",
          ]),
          entry_animations: JSON.stringify([
            "pop",
            "explode",
            "bounce",
            "zoom_in",
            "slide_up",
          ]),
          exit_animations: JSON.stringify([
            "explode",
            "scatter",
            "implode",
            "fade",
          ]),
          stock_categories: JSON.stringify([
            "tecnologia",
            "digital",
            "futurista",
            "dados",
          ]),
          stock_rules:
            "Durações curtas (3-5s). Pode usar vídeos com movimento rápido e efeitos digitais.",
          default_colors: JSON.stringify([
            "#00D4FF",
            "#7B2FFF",
            "#FF0080",
            "#0A0A0A",
          ]),
          default_font: "Roboto",
          components_allowed: JSON.stringify([
            "WavyGrid",
            "GeometricPatterns",
            "HighlightWord",
          ]),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTable("channel_niches");
};
