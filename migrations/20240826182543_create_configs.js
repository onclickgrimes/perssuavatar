exports.up = function(knex) {
    return knex.schema
        .createTable('configs', function(table) {
            table.string('assistant_name');
            table.string('facebook_user');
            table.string('facebook_pass');
            table.string('store_name');
            table.string('store_address');
            table.string('whatsapp_link');
            table.string('personalized_prompt');
            table.string('phone_number');
            table.string('whatsapp_sales_group');
            table.boolean('autoConnect_whatsapp');
            table.boolean('reply_whatsapp');
            table.boolean('reply_facebook');
         })    
         .then(function () {
            return knex('configs').insert([
                { assistant_name: '', facebook_user:'', facebook_pass:"", store_name: '', store_address: '' , whatsapp_link: '', personalized_prompt: `No inicio do atendimento, deixe claro que é um assistente de IA.
Você está respondendo a mensagens de clientes em anúncios no Facebook Marketplace.
Seja amigável e agradável.
Pode se referir ao veículo apenas pelo modelo, sem mencionar ano.
Se não tiver informação neste contexto para alguma pergunta do usuário, não invente uma resposta, apenas diga que você é um assistente de IA e um vendedor já vai entrar em contato.
Informações úteis:
- Aberto de segunda à sábado, das 9h às 18h, fechando apenas para o almoço.`, phone_number: '', whatsapp_sales_group: '', autoConnect_whatsapp: false, reply_whatsapp: false, reply_facebook: false }
            ])
        });
};

exports.down = function(knex) {
    return knex.schema
        .dropTable('configs');
};