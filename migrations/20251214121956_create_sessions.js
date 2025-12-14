exports.up = function(knex) {
    return knex.schema
        .createTable('sessions', function(table) {
            table.text('id').primary();
            table.integer('started_at');
            table.integer('ended_at');
            table.text('provider');
            table.text('model');
            table.text('user_id');
            table.text('assistant_name');
            table.text('assistant_id');
            table.text('subject');
            table.text('overview');
            table.text('status');
            table.integer('created_at');
        });
};

exports.down = function(knex) {
    return knex.schema
        .dropTable('sessions');
};
