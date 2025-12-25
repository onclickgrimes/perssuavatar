/**
 * Migration: Cria tabela de base de conhecimento para assistentes
 * 
 * Esta tabela armazena documentos/arquivos indexados com embeddings
 * para permitir busca semântica por RAG (Retrieval-Augmented Generation)
 */

exports.up = function(knex) {
  return knex.schema
    // Tabela de fontes de conhecimento (pastas/arquivos)
    .createTable('knowledge_sources', function(table) {
      table.increments('id').primary();
      table.string('assistant_id').notNullable().index(); // ID do assistente
      table.string('name').notNullable(); // Nome amigável
      table.string('path').notNullable(); // Caminho da pasta/arquivo
      table.string('type').notNullable().defaultTo('folder'); // 'folder' | 'file'
      table.text('extensions'); // JSON: extensões permitidas (ex: [".ts", ".tsx", ".md"])
      table.text('excludes'); // JSON: padrões a excluir (ex: ["node_modules", ".git"])
      table.integer('file_count').defaultTo(0); // Quantidade de arquivos indexados
      table.integer('chunk_count').defaultTo(0); // Quantidade de chunks indexados
      table.boolean('is_synced').defaultTo(false); // Se está sincronizado
      table.boolean('use_gitignore').defaultTo(true); // Usar .gitignore por padrão
      table.timestamp('last_synced_at'); // Última sincronização
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // Tabela de chunks de conhecimento (embeddings)
    .createTable('knowledge_chunks', function(table) {
      table.increments('id').primary();
      table.integer('source_id').unsigned().notNullable()
        .references('id').inTable('knowledge_sources').onDelete('CASCADE');
      table.string('file_path').notNullable(); // Caminho do arquivo original
      table.string('file_name').notNullable(); // Nome do arquivo
      table.text('content').notNullable(); // Conteúdo do chunk
      table.integer('chunk_index').notNullable(); // Índice do chunk no arquivo
      table.integer('start_line'); // Linha inicial no arquivo
      table.integer('end_line'); // Linha final no arquivo
      table.text('embedding'); // JSON: vetor de embedding (número[])
      table.text('metadata'); // JSON: metadados extras
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Índices para busca
      table.index(['source_id', 'file_path']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('knowledge_chunks')
    .dropTableIfExists('knowledge_sources');
};
