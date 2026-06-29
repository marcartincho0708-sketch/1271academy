const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

/* =====================================================
   CONFIGURACIÓN — reemplazá con tus credenciales reales
   https://www.mercadopago.com/developers/panel
   ===================================================== */
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || 'TU_ACCESS_TOKEN_AQUI',
});

const BASE_URL = process.env.BASE_URL || 'https://tudominio.com';

/* =====================================================
   POST /api/crear-preferencia
   Para Checkout Pro (redirige a MP o abre modal)
   ===================================================== */
app.post('/api/crear-preferencia', async (req, res) => {
  try {
    const { cursoId, titulo, descripcion, precio, currency, email } = req.body;

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: cursoId,
            title: `[1271] ${titulo}`,
            description: descripcion,
            category_id: 'education',
            quantity: 1,
            currency_id: currency || 'ARS',
            unit_price: Number(precio),
          },
        ],
        payer: email ? { email } : undefined,
        back_urls: {
          success: `${BASE_URL}/gracias`,
          failure: `${BASE_URL}/error`,
          pending: `${BASE_URL}/pendiente`,
        },
        auto_return: 'approved',
        statement_descriptor: '1271 ACADEMIA',
        external_reference: `1271-${cursoId}-${Date.now()}`,
        // Cuotas sin interés (opcional — configurar en tu panel de MP)
        // payment_methods: { installments: 12 },
      },
    });

    res.json({
      id: result.id,                    // para Checkout Bricks
      init_point: result.init_point,    // para Checkout Pro
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (err) {
    console.error('Error al crear preferencia:', err);
    res.status(500).json({ error: 'No se pudo crear la preferencia de pago.' });
  }
});

/* =====================================================
   POST /api/procesar-pago
   Para Checkout Bricks (tarjeta directo en tu sitio)
   ===================================================== */
app.post('/api/procesar-pago', async (req, res) => {
  try {
    const {
      token,           // token generado por el Brick de tarjeta
      issuer_id,
      payment_method_id,
      transaction_amount,
      installments,
      description,
      payer,
      external_reference,
    } = req.body;

    const payment = new Payment(client);
    const result = await payment.create({
      body: {
        token,
        issuer_id,
        payment_method_id,
        transaction_amount: Number(transaction_amount),
        installments: Number(installments),
        description,
        statement_descriptor: '1271 ACADEMIA',
        external_reference: external_reference || `1271-${Date.now()}`,
        payer: {
          email: payer.email,
          identification: {
            type: payer.identification?.type,
            number: payer.identification?.number,
          },
        },
      },
    });

    const status = result.status;

    if (status === 'approved') {
      res.json({ status: 'approved', message: '¡Pago aprobado!', payment_id: result.id });
    } else if (status === 'in_process' || status === 'pending') {
      res.json({ status: 'pending', message: 'Pago pendiente de acreditación.', payment_id: result.id });
    } else {
      res.json({ status: 'rejected', message: 'El pago fue rechazado. Intentá con otro medio.', payment_id: result.id });
    }
  } catch (err) {
    console.error('Error al procesar pago:', err);
    res.status(500).json({ error: 'Error al procesar el pago.' });
  }
});

/* =====================================================
   POST /api/webhook
   MercadoPago notifica aquí los cambios de estado
   Configuralo en: https://www.mercadopago.com/developers/panel/notifications
   ===================================================== */
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    const paymentId = data?.id;
    console.log(`📩 Webhook recibido — Pago ID: ${paymentId}`);

    // Aquí podés: actualizar tu DB, enviar email de confirmación, activar acceso al curso, etc.
    // const payment = new Payment(client);
    // const info = await payment.get({ id: paymentId });
    // console.log(info.status); // 'approved', 'pending', 'rejected'
  }

  res.sendStatus(200); // MP requiere respuesta 200 inmediata
});

/* =====================================================
   GET /api/health
   ===================================================== */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', marca: '1271 Academia', timestamp: new Date().toISOString() });
});

// Sirve el HTML con la Public Key inyectada desde la variable de entorno
app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const publicKey = process.env.MP_PUBLIC_KEY || 'TU_PUBLIC_KEY_AQUI';
  const injected = html.replace(
    '<script>',
    `<script>window.__MP_PUBLIC_KEY__ = ${JSON.stringify(publicKey)};</script>\n<script>`,
  );
  res.send(injected);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 1271 Backend corriendo en http://localhost:${PORT}`);
  console.log(`   Salud: http://localhost:${PORT}/api/health\n`);
});
