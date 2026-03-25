# PixGo API Documentation

## Introduction

The PixGo API allows you to integrate PIX payments into your application quickly and securely. Our RESTful API uses JSON for communication and provides webhooks for real-time notifications.

🌟 **Key Features**:

✅ Instant PIX payment generation  
✅ Real-time payment status  
✅ Automatic webhook notifications  
✅ CPF/CNPJ validation support  
✅ Secure API key authentication  
✅ Detailed transaction logs  

🔗 **Base URL**:  
`https://pixgo.org/api/v1`

🚀 **Quick Start**:  
Get your API key, make a POST request to create a payment and receive the PIX QR Code instantly.

---

## Authentication

All API requests require authentication using your API key in the `X-API-Key` header.

📝 **Getting your API Key**:

1. Create an account at [pixgo.org](https://pixgo.org)  
2. Validate your wallet information  
3. Navigate to **"Checkouts"** section  
4. Generate your API key  

🔑 **Header Example**:
X-API-Key: pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

pgsql
Copiar
Editar

⚠️ **Security**: Keep your API Key secure. Never expose it in client-side code or public repositories.

---

## API Endpoints

### 🔗 POST `/api/v1/payment/create` — **Create Payment**

Creates a new PIX payment request.

📝 **Parameters**:
```json
{
  "amount": 25.50,
  "description": "Produto XYZ",
  "customer_name": "João Silva",
  "customer_cpf": "12345678901",
  "customer_email": "joao@exemplo.com",
  "customer_phone": "(11) 99999-9999",
  "customer_address": "Rua das Flores, 123, Centro, São Paulo, SP, 01234-567",
  "webhook_url": "https://exemplo.com/webhook",
  "external_id": "pedido_123"
}
📋 Validation Rules:

amount: Required. Minimum R$ 10.00, maximum varies by your level

customer_name: Optional. Maximum 100 characters

customer_cpf: Optional. 11 digits (CPF) or 14 digits (CNPJ)

customer_email: Optional. Valid email, maximum 255 characters

customer_phone: Optional. Phone with area code, maximum 20 characters

customer_address: Optional. Complete address, maximum 500 characters

external_id: Optional. Maximum 50 characters

description: Optional. Maximum 200 characters

✅ Success Response: (201)

json
Copiar
Editar
{
  "success": true,
  "data": {
    "payment_id": "dep_1234567890abcdef",
    "external_id": "pedido_123",
    "amount": 25.50,
    "status": "pending",
    "qr_code": "00020126580014BR.GOV.BCB.PIX...",
    "qr_image_url": "https://pixgo.org/qr/dep_1234567890abcdef.png",
    "expires_at": "2025-01-15T12:20:00",
    "created_at": "2025-01-15T12:00:00"
  }
}
❌ Error Response: (400)

json
Copiar
Editar
{
  "success": false,
  "error": "LIMIT_EXCEEDED",
  "message": "Valor excede seu limite atual de R$ 300,00",
  "current_limit": 300.00,
  "amount_requested": 500.00
}
🔍 GET /api/v1/payment/{id}/status — Check Payment Status
Retrieves the current status of a payment.

✅ Success Response: (200)

json
Copiar
Editar
{
  "success": true,
  "data": {
    "payment_id": "dep_1234567890abcdef",
    "external_id": "pedido_123",
    "amount": 25.50,
    "status": "completed",
    "customer_name": "João Silva",
    "customer_cpf": "12345678901",
    "customer_phone": "(11) 99999-9999",
    "created_at": "2025-01-15T12:00:00",
    "updated_at": "2025-01-15T12:15:30"
  }
}
📊 GET /api/v1/payment/{id} — Get Payment Details
Retrieves complete payment information.

✅ Success Response: (200)

json
Copiar
Editar
{
  "success": true,
  "data": {
    "payment_id": "dep_1234567890abcdef",
    "external_id": "pedido_123",
    "amount": 25.50,
    "status": "completed",
    "customer_name": "João Silva",
    "customer_cpf": "12345678901",
    "customer_phone": "(11) 99999-9999",
    "customer_address": "Rua das Flores, 123, Centro, São Paulo, SP, 01234-567",
    "description": "Produto XYZ",
    "qr_code": "00020126580014BR.GOV.BCB.PIX...",
    "qr_image_url": "https://pixgo.org/qr/dep_1234567890abcdef.png",
    "webhook_url": "https://exemplo.com/webhook",
    "created_at": "2025-01-15T12:00:00",
    "updated_at": "2025-01-15T12:15:30",
    "expires_at": "2025-01-15T12:20:00"
  }
}
📋 Payment Status Values
pending - Awaiting payment

completed - Payment confirmed

expired - Payment expired (20 minutes)

cancelled - Payment cancelled

⚠️ User Limits:
Payment limits evolve based on your confirmed transaction history. Wallet must be validated to use the API.
Daily limit per payer CPF/CNPJ: R$ 10,000.00 (R$ 5,000.00 for CPF + R$ 5,000.00 for CNPJ)

Webhooks
Webhooks provide real-time notifications when payment status changes. Configure a webhook URL to receive automatic updates.

⚙️ Configuration:

✅ Include webhook_url when creating a payment
✅ Your endpoint must accept POST requests
✅ Respond with HTTP 200–299 to confirm receipt
✅ Timeout: 10 seconds per attempt

📡 Webhook Payload:

json
Copiar
Editar
{
  "event": "payment.completed",
  "data": {
    "payment_id": "dep_1234567890abcdef",
    "external_id": "pedido_123",
    "amount": 25.50,
    "status": "completed",
    "customer_name": "João Silva",
    "customer_cpf": "12345678901",
    "customer_phone": "(11) 99999-9999",
    "description": "Produto XYZ",
    "created_at": "2025-01-15T12:00:00",
    "updated_at": "2025-01-15T12:15:30"
  },
  "timestamp": "2025-01-15T12:15:35"
}
🔔 Available Events:

payment.created - Payment created

payment.completed - Payment confirmed

payment.expired - Payment expired

payment.cancelled - Payment cancelled

Code Examples
🐘 PHP Example
php
Copiar
Editar
<?php
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => 'https://pixgo.org/api/v1/payment/create',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-API-Key: pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'amount' => 25.50,
        'description' => 'Produto XYZ',
        'customer_name' => 'João Silva',
        'customer_cpf' => '12345678901',
        'customer_email' => 'joao@exemplo.com',
        'customer_phone' => '(11) 99999-9999',
        'customer_address' => 'Rua das Flores, 123, Centro, São Paulo, SP, 01234-567',
        'webhook_url' => 'https://exemplo.com/webhook',
        'external_id' => 'pedido_123'
    ])
]);

$response = curl_exec($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);

if ($httpCode === 201) {
    $data = json_decode($response, true);
    echo "Pagamento criado: " . $data['data']['payment_id'];
    echo "QR Code URL: " . $data['data']['qr_image_url'];
} else {
    echo "Erro: " . $response;
}
🟨 JavaScript Example
js
Copiar
Editar
const axios = require('axios');

async function createPayment() {
    try {
        const response = await axios.post('https://pixgo.org/api/v1/payment/create', {
            amount: 25.50,
            description: 'Produto XYZ',
            customer_name: 'João Silva',
            customer_cpf: '12345678901',
            customer_email: 'joao@exemplo.com',
            customer_phone: '(11) 99999-9999',
            customer_address: 'Rua das Flores, 123, Centro, São Paulo, SP, 01234-567',
            webhook_url: 'https://exemplo.com/webhook',
            external_id: 'pedido_123'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
            }
        });

        console.log('Pagamento criado:', response.data.data.payment_id);
        console.log('QR Code URL:', response.data.data.qr_image_url);
        
        return response.data;
    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
    }
}

createPayment();
🔔 Webhook Handler (PHP)
php
Copiar
Editar
<?php
// webhook.php - Receber notificações da PixGo API

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    exit('Invalid JSON');
}

if (!isset($data['event']) || !isset($data['data'])) {
    http_response_code(400);
    exit('Invalid webhook format');
}

$event = $data['event'];
$payment = $data['data'];

switch ($event) {
    case 'payment.completed':
        $paymentId = $payment['payment_id'];
        $externalId = $payment['external_id'];
        $amount = $payment['amount'];
        updateOrderStatus($externalId, 'completed');
        error_log("Pagamento confirmado: {$paymentId} - Valor: R$ {$amount}");
        break;
    case 'payment.expired':
        $externalId = $payment['external_id'];
        updateOrderStatus($externalId, 'expired');
        break;
    case 'payment.cancelled':
        $externalId = $payment['external_id'];
        updateOrderStatus($externalId, 'cancelled');
        break;
}

http_response_code(200);
echo 'OK';

function updateOrderStatus($orderId, $status) {
    // Implementar sua lógica de atualização aqui
}
🔍 Check Status (PHP)
php
Copiar
Editar
function checkPaymentStatus($paymentId) {
    $curl = curl_init();
    
    curl_setopt_array($curl, [
        CURLOPT_URL => "https://pixgo.org/api/v1/payment/{$paymentId}/status",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'X-API-Key: pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        ]
    ]);
    
    $response = curl_exec($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    
    if ($httpCode === 200) {
        $data = json_decode($response, true);
        return $data['data']['status'];
    }
    
    return false;
}

// Uso
$status = checkPaymentStatus('dep_1234567890abcdef');
echo "Status do pagamento: " . $status;
Getting Started
📋 Registration Process:

Access pixgo.org and create your account

Validate your PIX wallet information

Navigate to the "Checkouts" section

Generate your production API Key

Start integrating PIX payments

🔑 API Keys:
All API keys are for production use – there is no separate test environment.

nginx
Copiar
Editar
pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
💰 Payment Limits by Level
Initial Level (Up to R$ 299.99 confirmed): Limit of R$ 300.00

Level 2 (Above R$ 300.00 confirmed): Limit of R$ 500.00

Level 3 (Above R$ 500.00 confirmed): Limit of R$ 1,000.00

Level 4 (Above R$ 1,000.00 confirmed): Limit of R$ 3,000.00

Maximum Level (Above R$ 3,000.00 confirmed): Limit of R$ 5,000.00

📊 How Limits Work:

Based on total confirmed payments (status = completed)

PIX wallet must be validated

Minimum amount: R$ 10.00

Daily limit per CPF/CNPJ: R$ 10,000.00

Automatic evolution based on transaction history

🔔 Webhook Testing Tools
ngrok - Expose localhost

webhook.site - Capture requests

Postman - Simulate endpoints

⏱️ Payment Expiration
All PIX payments expire automatically 20 minutes after creation.

⚠️ Important: All payments are processed in real time in the production environment. There is no separate test environment.