exports.up = function(knex) {
    return knex.schema
        .createTable('messages', function(table) {
            table.text('id').primary();
            table.text('session_id').references('id').inTable('sessions');
            table.text('role');
            table.text('content');
            table.integer('timestamp');
            table.text('metadata');
            table.integer('created_at');
        });
};

exports.down = function(knex) {
    return knex.schema
        .dropTable('messages');
};
