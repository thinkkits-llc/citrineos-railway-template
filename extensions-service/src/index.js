/**
 * CitrineOS Extensions Service — Minimal Working Example
 *
 * Demonstrates:
 * 1. Consuming OCPP events from RabbitMQ (TransactionEvent, StatusNotification)
 * 2. Calling CitrineOS Core REST APIs (data API, message API)
 * 3. Health check endpoint for Railway
 *
 * Extend this service to add custom business logic:
 * - Billing integrations
 * - Fleet management alerts
 * - Energy management / demand response
 * - Custom authorization logic
 * - Telemetry and analytics
 */

const amqplib = require('amqplib');
const express = require('express');
const http = require('http');

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@amqp-broker.railway.internal:5672';
const EXCHANGE_NAME = process.env.AMQP_EXCHANGE || 'citrineos';
const QUEUE_NAME = process.env.QUEUE_NAME || 'extensions-service';
const CITRINEOS_API_URL = process.env.CITRINEOS_API_URL || 'http://citrineos-core.railway.internal:8080';
const PORT = process.env.PORT || 3001;

const ROUTING_KEYS = [
  'TransactionEvent',
  'StatusNotification',
  'MeterValues',
  'BootNotification',
];

let connection = null;
let channel = null;
let healthy = false;
let messagesProcessed = 0;

async function connectRabbitMQ() {
  const maxRetries = 10;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AMQP] Connecting (attempt ${attempt}/${maxRetries})...`);
      connection = await amqplib.connect(AMQP_URL);
      channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, 'headers', { durable: true });
      const q = await channel.assertQueue(QUEUE_NAME, { durable: true });

      for (const key of ROUTING_KEYS) {
        await channel.bindQueue(q.queue, EXCHANGE_NAME, '', { action: key });
      }

      console.log(`[AMQP] Connected. Listening on queue "${QUEUE_NAME}" for: ${ROUTING_KEYS.join(', ')}`);
      healthy = true;

      channel.consume(q.queue, handleMessage, { noAck: false });

      connection.on('close', () => {
        console.log('[AMQP] Connection closed. Reconnecting...');
        healthy = false;
        setTimeout(connectRabbitMQ, 5000);
      });

      return;
    } catch (err) {
      console.error(`[AMQP] Connection failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
  }
  console.error('[AMQP] Max retries reached. Service unhealthy.');
}

async function handleMessage(msg) {
  if (!msg) return;

  try {
    const content = JSON.parse(msg.content.toString());
    const action = msg.properties.headers?.action || 'unknown';

    console.log(`[EVENT] ${action} from ${content.stationId || 'unknown'}`);

    switch (action) {
      case 'TransactionEvent':
        await handleTransactionEvent(content);
        break;
      case 'StatusNotification':
        await handleStatusNotification(content);
        break;
      case 'MeterValues':
        await handleMeterValues(content);
        break;
      case 'BootNotification':
        await handleBootNotification(content);
        break;
      default:
        console.log(`[EVENT] Unhandled action: ${action}`);
    }

    messagesProcessed++;
    channel.ack(msg);
  } catch (err) {
    console.error(`[EVENT] Error processing message: ${err.message}`);
    channel.nack(msg, false, false);
  }
}

async function handleTransactionEvent(event) {
  const { stationId, eventType, transactionInfo } = event;
  console.log(`[TRANSACTION] Station ${stationId}: ${eventType} (txId: ${transactionInfo?.transactionId})`);

  // Example: query Core API for station details
  if (eventType === 'Started') {
    const stations = await callCoreAPI('/data/monitoring/chargingStations');
    console.log(`[TRANSACTION] Active stations: ${stations?.length || 0}`);
  }
}

async function handleStatusNotification(event) {
  const { stationId, connectorStatus, evseId } = event;
  console.log(`[STATUS] Station ${stationId} EVSE ${evseId}: ${connectorStatus}`);
}

async function handleMeterValues(event) {
  const { stationId, meterValue } = event;
  if (meterValue?.[0]?.sampledValue) {
    const energy = meterValue[0].sampledValue.find(s => s.measurand === 'Energy.Active.Import.Register');
    if (energy) {
      console.log(`[METER] Station ${stationId}: ${energy.value} Wh`);
    }
  }
}

async function handleBootNotification(event) {
  const { stationId, chargingStation } = event;
  console.log(`[BOOT] Station ${stationId} online: ${chargingStation?.model} (${chargingStation?.vendorName})`);
}

function callCoreAPI(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CITRINEOS_API_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

// Health check + metrics server
const app = express();

app.get('/health', (req, res) => {
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    amqp: healthy ? 'connected' : 'disconnected',
    messagesProcessed,
    uptime: process.uptime(),
  });
});

app.get('/metrics', (req, res) => {
  res.json({
    messagesProcessed,
    routingKeys: ROUTING_KEYS,
    queue: QUEUE_NAME,
    uptime: process.uptime(),
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Extensions service listening on :${PORT}`);
  connectRabbitMQ();
});
