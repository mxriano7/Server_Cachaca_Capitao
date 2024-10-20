// Não alterar o código sem autorização do Desenvolvedor Chefe!

// Arquivos de importação node.js.
import axios from 'axios';
import express from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
dotenv.config();

// Configurações do servidor.
const app = express();
const PORT = process.env.PORT || 5500;

// Middleware para parsear application/x-www-form-urlencoded e application/json.
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Servidor Cachaça Capitão</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #552d24;
                        text-align: center;
                        color: snow;
                        padding: 50px;
                    }
                </style>
            </head>
            <body>
                <h1>Servidor Cachaça Capitão</h1>
                <p>O servidor está online e pronto para receber requisições!</p>
            </body>
        </html>
    `);
});

app.use((req, res, next) => {
    const allowedOrigins = [
        'https://cachacascapitao.netlify.app',
        'https://cachacascapitao.com.br',
        'https://www.cachacascapitao.com.br'
    ];
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// Configurações para envios de dados para adiministrador e cliente.
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.ORDER_EMAIL_USER,
        pass: process.env.ORDER_EMAIL_PASS
    }
});

// Rota para calcular o frete do pedido.
app.post('/calculateFreight', async (req, res) => {
    const { toPostalCode, units } = req.body;
    const allProducts = [
        {
            id: 'amburana750ml',
            width: 10,
            height: 24,
            length: 10,
            weight: 1.6,
            insurance_value: 100
        },
        {
            id: 'carvalho750ml',
            width: 10,
            height: 24,
            length: 10,
            weight: 1.6,
            insurance_value: 120
        },
        {
            id: 'amburana670ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 1.3,
            insurance_value: 60
        },
        {
            id: 'carvalho670ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 1.3,
            insurance_value: 80
        },
        {
            id: 'prata670ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 1.3,
            insurance_value: 60
        },
        {
            id: 'amburana275ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 0.5,
            insurance_value: 25
        },
        {
            id: 'prata275ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 0.5,
            insurance_value: 25
        },
        {
            id: 'jequitiba275ml',
            width: 8,
            height: 30,
            length: 8,
            weight: 0.5,
            insurance_value: 25
        },
        {
            id: 'kit275ml',
            width: 8,
            height: 30,
            length: 20,
            weight: 1.5,
            insurance_value: 75
        }
    ];

    const filteredProducts = allProducts
        .map(product => ({
            ...product,
            quantity: units[product.id] || 0
        }))
        .filter(product => product.quantity >= 1);

    if (filteredProducts.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Nenhum produto com quantidade válida foi fornecido.'
        });
    }

    const options = {
        method: 'POST',
        url: 'https://melhorenvio.com.br/api/v2/me/shipment/calculate',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ME_TOKEN}`,
            'User-Agent': 'API Cachaça Capitão (paulomarianodevgmail.com)'
        },
        data: {
            from: { postal_code: '37310000' },
            to: { postal_code: toPostalCode },
            services: "1,2",
            products: filteredProducts
        }
    };

    try {
        const response = await axios.request(options);
        console.log('Resposta da API:', response.data);
        const correiosData = response.data.filter(service => service.company.name === 'Correios');
        const formattedData = correiosData.length > 0 ? {
            success: true,
            data: correiosData
        } : {
            success: false,
            message: 'Nenhum serviço dos Correios disponível para o trecho.'
        };
        res.json(formattedData);
    } catch (error) {
        console.error('Erro ao calcular frete:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            success: false,
            error: error.response ? error.response.data : error.message
        });
    }
});

// Rota para enviar o pedido por email e gerar um link de pagamento.
app.post('/sendOrder', async (req, res) => {
    console.log('Requisição recebida em /sendOrder');

    const { firstName, lastName, telephone, cpfCnpj, cep, address, addressComplement, city, state, number, emailLabel, cart, totalAmount, shippingService } = req.body;
    const totalAmountNumber = parseFloat(totalAmount);
    if (isNaN(totalAmountNumber)) {
        return res.status(400).send('Total do pedido inválido.');
    }

    // Configurações do Mercado Pago.
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    // Criar preferência de pagamento.
    try {
        const response = await preference.create({
            body: {
                items: [
                    {
                        title: `Pedido de ${firstName} ${lastName}`,
                        quantity: 1,
                        unit_price: totalAmountNumber,
                        currency_id: 'BRL',
                    }
                ],
                payer: {
                    name: `${firstName} ${lastName}`,
                    email: emailLabel,
                },
                payment_methods: {
                    excluded_payment_methods: [],
                    excluded_payment_types: [],
                    installments: 12,
                },
            }
        });

        // Obter link de pagamento da preferência criada.
        const initPoint = response.init_point;

        const emailBodyClient = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f3f3f3;
            line-height: 1.6;
        }
        .container {
            color: #000;
            max-width: 700px;
            margin: 40px auto;
            padding: 25px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #4a2c2a;
            color: #fff;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            font-size: 26px;
            font-weight: 600;
            box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.1);
        }
        h3 {
            color: #552d24;
            font-size: 22px;
            font-weight: 500;
            border-bottom: 1px solid #ddd;
            padding-bottom: 8px;
        }
        p {
            margin: 8px 0;
            font-size: 16px;
        }
        ul {
            list-style-type: none;
            padding: 0;
            margin: 15px 0;
        }
        li {
            padding: 10px;
            margin-bottom: 10px;
            background-color: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 8px;
        }
        li strong {
            display: block;
            color: #552d24;
            margin-bottom: 4px;
        }
        hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #777;
            background-color: #f9f9f9;
            border-radius: 0 0 8px 8px;
            border-top: 1px solid #ddd;
        }
        .logo {
        color: #552d24;
        }
        a {
        display: inline-block;
        color: #140f07;
        background-color: snow;
        padding: 10px 20px;
        text-decoration: none;
        font-weight: bold;
        border-radius: 10px;
        box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.6);
        transition: all 0.3s ease;
        }
        a:hover {
        background-color: brown;
        color: snow;
        }
        @media (max-width: 600px) {
            .container {
                margin: 20px;
                padding: 20px;
            }
            .header {
                font-size: 24px;
                padding: 15px;
            }
            h3 {
                font-size: 20px;
            }
            p, li {
                font-size: 14px;
            }
        }
    </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                Pedido Recebido!
            </div>
            <p>Olá ${firstName} ${lastName},</p>
            <p>Agradecemos por escolher a Cachaçaria Fazenda do Engenho!</p>
            <p>Abaixo estão os detalhes do seu pedido:</p>
            <hr>
            <p><strong>Status:</strong> Aguardando confirmação do pagamento</p>
            <p><strong>Total do Pedido(Frete incluso):</strong> R$ ${totalAmountNumber.toFixed(2)}</p>
            <p><strong>Serviço de Frete:</strong> ${shippingService.name} - R$ ${shippingService.price.toFixed(2)}</p>
            <p><strong>Endereço para entrega:</strong>
            <br>
            ${address}, ${number} - ${city}/${state}</p>
            ${addressComplement ? `<p><strong>Complemento:</strong> ${addressComplement}</p>` : ''}
            <hr>
            <p><strong>Link para pagamento:</strong>
            <br>
            <a href="${initPoint}">Clique aqui para pagar</a>
            </p>
            <hr>
            <h3>Produtos no Carrinho:</h3>
            <ul>
                ${cart.map(item => `
                    <li>
                        <strong>Produto:</strong> ${item.name}<br>
                        <strong>Preço:</strong> R$ ${item.price.toFixed(2)}<br>
                        <strong>Quantidade:</strong> ${item.quantity}<br>
                        <strong>Subtotal:</strong> R$ ${item.subtotal.toFixed(2)}
                    </li>
                `).join('')}
            </ul>
            <h3>Tempo de Processamento:</h3>
            <ul>
                <li><strong>PIX:</strong> Processamento em tempo real.</li>
                <li><strong>Crédito:</strong> Até 2 dias úteis para confirmação.</li>
                <li><strong>Boleto:</strong> Até 3 dias úteis para compensação.</li>
                <li><strong>Débito:</strong> Processamento em tempo real.</li>
                <li><strong>Após a confirmação do pagamento o envio será realizado dentro de até 3 dias úteis.</strong></li>
            </ul>
            <div class="footer">
                <p>Agradecemos pela sua confiança em nossos serviços. Estamos à disposição para qualquer necessidade e esperamos atendê-lo novamente em breve.</p><br><br>
                <p>Atenciosamente,<br>
                <strong class="logo">Cachaçaria Fazenda do Engenho<br>"Lar da Cachaça Capitão"</strong></p><br><br>
                <p>Atenção: Este é um e-mail automático.<br>
                Por favor, não responda a este e-mail, pois não monitoramos respostas a mensagens automáticas. Se você tiver dúvidas ou precisar de assistência, entre em contato conosco através dos canais de atendimento disponíveis.<br>
                Agradecemos pela sua compreensão!</p>
            </div>
        </div>
    </body>
    </html>
    `;

        const emailBodyAdmin = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f3f3f3;
            line-height: 1.6;
        }
        .container {
            color: #000;
            max-width: 700px;
            margin: 40px auto;
            padding: 25px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #4a2c2a;
            color: #fff;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            font-size: 26px;
            font-weight: 600;
            box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.1);
        }
        h3 {
            color: #552d24;
            font-size: 22px;
            margin: 20px 0 10px;
            font-weight: 500;
            border-bottom: 1px solid #ddd;
            padding-bottom: 8px;
        }
        p {
            margin: 8px 0;
            font-size: 16px;
        }
        ul {
            list-style-type: none;
            padding: 0;
            margin: 15px 0;
        }
        li {
            padding: 10px;
            margin-bottom: 10px;
            background-color: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 8px;
        }
        li strong {
            display: block;
            color: #552d24;
            margin-bottom: 4px;
        }
        hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #777;
            background-color: #f9f9f9;
            border-radius: 0 0 8px 8px;
            border-top: 1px solid #ddd;
        }
        @media (max-width: 600px) {
            .container {
                margin: 20px;
                padding: 20px;
            }
            .header {
                font-size: 24px;
                padding: 15px;
            }
            h3 {
                font-size: 20px;
            }
            p, li {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            Ficha do Pedido
        </div>
        <h3>Dados do Cliente:</h3>
        <p><strong>Nome:</strong> ${firstName} ${lastName}</p>
        <p><strong>CPF/CNPJ:</strong> ${cpfCnpj}</p>
        <p><strong>Telefone:</strong> ${telephone}</p>
        <p><strong>E-mail:</strong> ${emailLabel}</p>
        <p><strong>Endereço:</strong> ${address}, ${number} - ${city}/${state}</p>
        ${addressComplement ? `<p><strong>Complemento:</strong> ${addressComplement}</p>` : ''}
        <hr>
        <h3>Detalhes do Pedido:</h3>
        <p><strong>Status:</strong> Aguardando confirmação do pagamento</p>
        <p><strong>Total do Pedido(Frete incluso):</strong> R$ ${totalAmountNumber.toFixed(2)}</p>
        <p><strong>Frete:</strong> ${shippingService.name} - R$ ${shippingService.price.toFixed(2)}</p>
        <h3>Itens do Pedido:</h3>
        <ul>
            ${cart.map(item => `
                <li>
                    <strong>Produto:</strong> ${item.name}
                    <span><strong>Quantidade:</strong> ${item.quantity}</span>
                    <span><strong>Subtotal:</strong> R$ ${item.subtotal.toFixed(2)}</span>
                </li>
            `).join('')}
        </ul>
        <h3>Tempo de Processamento:</h3>
                <ul>
                    <li><strong>PIX:</strong> Processamento em tempo real.</li>
                    <li><strong>Crédito:</strong> Até 2 dias úteis para confirmação.</li>
                    <li><strong>Boleto:</strong> Até 3 dias úteis para compensação.</li>
                    <li><strong>Débito:</strong> Processamento em tempo real.</li>
                </ul>
        <div class="footer">
            <p><strong>Após a confirmação do pagamento o envio deve ser realizado dentro de até 3 dias úteis.
            <br>
            Verifique seu aplicativo do Mercado Pago para acompanhar o status do pagamento.</strong></p>
        </div>
    </div>
    </body>
    </html>
    `;

        // Configuração do envio do e-mail para o cliente.
        const mailOptionsClient = {
            from: process.env.ORDER_EMAIL_USER,
            to: emailLabel,
            subject: `Obrigado pelo seu pedido, ${firstName} ${lastName}`,
            html: emailBodyClient
        };

        transporter.sendMail(mailOptionsClient, (error, info) => {
            if (error) {
                console.log('Erro ao enviar e-mail para o cliente:', error);
            } else {
                console.log('E-mail enviado para o cliente:', info.response);
            }
        });

        // Configuração do envio do e-mail para o administrador.
        const mailOptionsAdmin = {
            from: process.env.ORDER_EMAIL_USER,
            to: process.env.ORDER_EMAIL_USER,
            subject: `Novo Pedido de ${firstName} ${lastName}`,
            html: emailBodyAdmin
        };

        transporter.sendMail(mailOptionsAdmin, (error, info) => {
            if (error) {
                console.log('Erro ao enviar e-mail para o administrador:', error);
                return res.status(500).send('Erro ao enviar pedido.');
            }

            console.log('E-mail enviado para o administrador:', info.response);
            res.status(200).json({ message: 'Pedido enviado com sucesso!' });
        });

    } catch (error) {
        console.error('Erro ao criar preferência de pagamento:', error);
        return res.status(500).send('Erro ao processar o pedido.');
    }
});

// Rota para enviar o contato por email.
app.post('/sendContact', (req, res) => {
    console.log('Requisição recebida em /sendContact');

    const { name, email, message } = req.body;

    const emailBodyClient = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f3f3f3;
            line-height: 1.6;
        }
        .container {
            color: #000;
            max-width: 700px;
            margin: 40px auto;
            padding: 25px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #4a2c2a;
            color: #fff;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            font-size: 26px;
            font-weight: 600;
            box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.1);
        }
        h3 {
            color: #552d24;
            font-size: 22px;
            margin: 20px 0 10px;
            font-weight: 500;
            border-bottom: 1px solid #ddd;
            padding-bottom: 8px;
        }
        p {
            margin: 8px 0;
            font-size: 16px;
        }
        .footer {
            margin-top: 30px;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #777;
            background-color: #f9f9f9;
            border-radius: 0 0 8px 8px;
            border-top: 1px solid #ddd;
        }
        .logo {
        color: #552d24;
        }
        @media (max-width: 600px) {
            .container {
                margin: 20px;
                padding: 20px;
            }
            .header {
                font-size: 24px;
                padding: 15px;
            }
            h3 {
                font-size: 20px;
            }
            p {
                font-size: 14px;
            }
        }
    </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Solicitação de Contato Recebida</div>
            <h3>Olá, ${name}!</h3>
            <p>Recebemos sua solicitação de contato e um atendente entrará em contato com você em até 48 horas.</p>
            <p><strong>Mensagem enviada:</strong> ${message}</p>
            <p>Atenciosamente,<br>
            <strong class="logo">Cachaçaria Fazenda do Engenho<br>"Lar da Cachaça Capitão"</strong></p><br><br>
            <div class="footer">
                <p>Atenção: Este é um e-mail automático.<br>
                Por favor, não responda a este e-mail, pois não monitoramos respostas a mensagens automáticas.
                Se você tiver dúvidas ou precisar de assistência, entre em contato conosco através dos canais de atendimento disponíveis.<br>
                Agradecemos pela sua compreensão!</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const emailBodyAdmin = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f3f3f3;
            line-height: 1.6;
        }
        .container {
            color: #000;
            max-width: 700px;
            margin: 40px auto;
            padding: 25px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #4a2c2a;
            color: #fff;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            font-size: 26px;
            font-weight: 600;
            box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.1);
        }
        h3 {
            color: #552d24;
            font-size: 22px;
            margin: 20px 0 10px;
            font-weight: 500;
            border-bottom: 1px solid #ddd;
            padding-bottom: 8px;
        }
        p {
            margin: 8px 0;
            font-size: 16px;
        }
        .footer {
            margin-top: 30px;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #777;
            background-color: #f9f9f9;
            border-radius: 0 0 8px 8px;
            border-top: 1px solid #ddd;
        }
        .logo {
        color: #552d24;
        }
        @media (max-width: 600px) {
            .container {
                margin: 20px;
                padding: 20px;
            }
            .header {
                font-size: 24px;
                padding: 15px;
            }
            h3 {
                font-size: 20px;
            }
            p {
                font-size: 14px;
            }
        }
    </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Novo Contato Recebido</div>
            <h3>Dados do Contato:</h3>
            <p><strong>Nome:</strong> ${name}</p>
            <p><strong>E-mail:</strong> ${email}</p>
            <p><strong>Mensagem:</strong> ${message}</p>
            <div class="footer">
                <p>Atenção: Este é um e-mail automático.<br>
                Por favor, não responda a este e-mail, pois não monitoramos respostas a mensagens automáticas.
                Se você tiver dúvidas ou precisar de assistência, entre em contato conosco através dos canais de atendimento disponíveis.<br>
                Agradecemos pela sua compreensão!</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Configuração do envio do e-mail para o cliente.
    const mailOptionsClient = {
        from: process.env.CONTACT_EMAIL_USER,
        to: email,
        subject: 'Confirmação de Solicitação de Contato',
        html: emailBodyClient
    };

    transporter.sendMail(mailOptionsClient, (error, info) => {
        if (error) {
            console.log('Erro ao enviar contato para o cliente:', error);
            return res.status(500).json({ message: 'Erro ao enviar contato.' });
        } else {
            console.log('Contato enviado para o cliente:', info.response);
            return res.status(200).json({ message: 'Contato enviado com sucesso!' });
        }
    });

    // Configuração do envio do e-mail para o administrador.
    const mailOptionsAdmin = {
        from: process.env.CONTACT_EMAIL_USER,
        to: process.env.CONTACT_EMAIL_USER,
        subject: `Solicitação de contato de ${name}`,
        html: emailBodyAdmin
    };

    transporter.sendMail(mailOptionsAdmin, (error, info) => {
        if (error) {
            console.log('Erro ao enviar contato para o administrador:', error);
            return res.status(500).json({ message: 'Erro ao enviar contato.' });
        } else {
            console.log('Contato enviado para o administrador:', info.response);
        }
    });
});

// Servidor Online.
app.listen(PORT, () => {
    console.log(`Servidor online em ${PORT}`);
});