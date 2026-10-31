/**
 * Endpoint Serverless: Procesador Automático de Referidos BCROWN para Kommo CRM
 * 
 * Escucha las notificaciones que envía el bot de BCROWN (+573013861474 / Bcrown CB),
 * extrae automáticamente:
 *   - Nombre del prospecto
 *   - Teléfono WhatsApp
 *   - Enlace personalizado de presentación (https://bcrown.online/w/...)
 *   - Contador de contactos disponibles
 * 
 * Y crea automáticamente el Lead en:
 *   - Embudo: "Prospectos MLM Orayon" (ID: 14699583)
 *   - Etapa: "Triaje Bot en Curso" (ID: 113584003)
 *   - Campo personalizado: "Enlace Presentación Orayon" (ID: 1054540)
 *   - Contacto asociado con teléfono y etiqueta "Referido BCROWN"
 * 
 * URL: https://app.crmcon1asoluciones.com/api/bcrown-referrals
 */

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || '1asolucionesvirtuales';
const KOMMO_TOKEN = process.env.KOMMO_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijg4YjVkM2YxNTE5ZTdjMGM4YmMzMGRjNmNhNzc5OWU0ZmI3NWM3OGQ1MTg0NWZlMmY0YzkzZGM4ZTM5ZGYwNTBhMzZhN2VmYmZiNGYwY2E3In0.eyJhdWQiOiJiZDdjMDlhYy02OWNhLTQ5MjktYjFlMi1lZDg5MjU4MjI3MjIiLCJqdGkiOiI4OGI1ZDNmMTUxOWU3YzBjOGJjMzBkYzZjYTc3OTllNGZiNzVjNzhkNTE4NDVmZTJmNGM5M2RjOGUzOWRmMDUwYTM2YTdlZmJmYjRmMGNhNyIsImlhdCI6MTc5MDYzNDA2MSwibmJmIjoxNzkwNjM0MDYxLCJleHAiOjE5MjQ5MDU2MDAsInN1YiI6IjczMDYxNjkiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjk2Mjg3MzcsImJhc2VfZG9tYWluIjoia29tbW8uY29tIiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImxpc3RfZXh0ZXJuYWxfbWVzc2FnZXMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJzZW5kX2V4dGVybmFsX21lc3NhZ2VzIl0sImhhc2hfdXVpZCI6IjBhYzQ3ZjNkLTc2YmItNDY0YS1iMmVlLWEzYjA4ZjRjNGRiMiIsImFwaV9kb21haW4iOiJhcGktYy5rb21tby5jb20ifQ.KGt1iFAyjXcvf9UKYRyRugfMgqSwB_JcERZ3tRh6bIaugXb9LTSvZQyoNlFDop7C2Naj2dX2wEXdCeo2n9m-HpJAwlLVIGNGrfK1PNVHbVLdgCNWCzDeIZObA_ivBN4ETV2PUevJb8EVMFDXYaQo4xwynsEbt3At-lKne_ZiIOKUaUToQ9lsE8VUqr4LIvkyIp0uqTjavDNcB4q0b07y0xjhwiW7hatynSu2Bvl4bIwL4qJ3JOfCxlPtzy6JGbYyGdr4rYFMVtD97IncCUGJDHk54ALjNsLcbmMWgS9Az1eZ5lrelz0kCIzwbztD6PsionsK0IyJl0T9vmlw39ubyQ';

const TARGET_PIPELINE_ID = 14699583;      // Prospectos MLM Orayon
const TARGET_STATUS_ID = 113609147;       // Nuevo Prospecto (primera etapa operativa)
const PRESENTATION_LINK_FIELD_ID = 1054540; // Enlace Presentación Orayon
const BCROWN_CONTACT_ID = 18962276;       // Bcrown CB
const PRIMARY_TALK_ID = 12486;            // Chat con Bcrown CB

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  try {
    // 1. GET: Ejecutar escaneo o health-check
    if (req.method === 'GET') {
      const results = await scanAndProcessTalk(PRIMARY_TALK_ID);
      return res.status(200).json({
        status: 'ok',
        message: 'Escaneo y sincronización de referidos BCROWN completado.',
        results
      });
    }

    // 2. POST: Procesar webhook de Kommo o llamada manual
    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = require('querystring').parse(body);
        }
      }

      console.log('[Bcrown Webhook] Payload entrante:', JSON.stringify(body));

      // Si nos envían directamente el texto del mensaje (ej: desde un Salesbot o prueba manual)
      if (body.text || body.message) {
        const text = body.text || body.message;
        const parsed = parseBcrownMessage(text);
        if (parsed) {
          const createRes = await createLeadIfNew(parsed);
          return res.status(200).json({ status: 'ok', lead: createRes });
        }
      }

      // Extraer talk_id del webhook de Kommo (talk[add], talk[update])
      const talkIds = extractTalkIdsFromPayload(body);
      if (!talkIds.includes(PRIMARY_TALK_ID)) {
        talkIds.push(PRIMARY_TALK_ID);
      }

      const allResults = [];
      for (const tId of talkIds) {
        const r = await scanAndProcessTalk(tId);
        allResults.push({ talkId: tId, ...r });
      }

      return res.status(200).json({
        status: 'ok',
        processed: allResults
      });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error) {
    console.error('[Bcrown Webhook Error]:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Parsea el texto del mensaje recibido de BCROWN
 */
function parseBcrownMessage(text) {
  if (!text || typeof text !== 'string') return null;

  // Debe contener indicios del sistema de asignación de BCROWN
  const isBcrownAssignment = text.includes('se ha registrado una nueva asignación') || 
                             text.includes('bcrown.online/w/') ||
                             (text.includes('System BCROWN') && text.includes('Nombre:'));

  if (!isBcrownAssignment) return null;

  // Extraer Nombre
  const nameMatch = text.match(/(?:👤\s*Nombre|Nombre):\s*([^\n\r]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // Extraer Teléfono / WhatsApp
  const phoneMatch = text.match(/(?:📲\s*WhatsApp|📱\s*WhatsApp|WhatsApp):\s*(\+?[\d\s-]+)/i);
  const phone = phoneMatch ? phoneMatch[1].replace(/[\s-]/g, '').trim() : null;

  // Extraer Enlace personal de presentación
  const linkMatch = text.match(/(https?:\/\/bcrown\.online\/w\/[a-zA-Z0-9_-]+)/i);
  const link = linkMatch ? linkMatch[1].trim() : null;

  // Extraer Contactos disponibles
  const availMatch = text.match(/(?:📊\s*Contactos disponibles|Contactos disponibles):\s*(\d+)/i);
  const available = availMatch ? parseInt(availMatch[1], 10) : null;

  if (!name || !link) return null;

  return { name, phone, link, available, raw: text };
}

/**
 * Extrae IDs de conversación de los payloads de Kommo
 */
function extractTalkIdsFromPayload(body) {
  const ids = new Set();

  if (body.talk_id || body.talkId || body.id) {
    ids.add(Number(body.talk_id || body.talkId || body.id));
  }

  if (body.talk) {
    for (const action of ['add', 'update']) {
      const list = body.talk[action];
      if (Array.isArray(list)) {
        for (const t of list) {
          if (t && t.id) ids.add(Number(t.id));
        }
      }
    }
  }

  for (const key of Object.keys(body)) {
    const match = key.match(/^talk\[(?:add|update)\]\[\d+\]\[(?:id|talk_id)\]$/);
    if (match && body[key]) {
      ids.add(Number(body[key]));
    }
  }

  return Array.from(ids).filter(Boolean);
}

/**
 * Escanea los mensajes de un Talk específico y procesa nuevos referidos
 */
async function scanAndProcessTalk(talkId) {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/talks/${talkId}/messages?limit=100`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    if (res.status === 204) return { messagesFound: 0, created: [] };
    throw new Error(`Error consultando mensajes de talk ${talkId}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const messages = data._embedded?.messages || [];
  const createdLeads = [];
  const skippedLeads = [];

  for (const msg of messages) {
    if (msg.type !== 'incoming' && msg.message_type !== 'text') continue;
    const parsed = parseBcrownMessage(msg.text);
    if (!parsed) continue;

    const result = await createLeadIfNew(parsed);
    if (result.created) {
      createdLeads.push(result);
    } else {
      skippedLeads.push(result);
    }
  }

  return {
    messagesScanned: messages.length,
    created: createdLeads,
    skipped: skippedLeads
  };
}

/**
 * Verifica si el prospecto ya existe en el embudo (por teléfono o enlace) y lo crea si es nuevo
 */
async function createLeadIfNew(referral) {
  const { name, phone, link, available } = referral;

  // 1. Verificar si ya existe un lead con este enlace de presentación
  const existingLead = await findExistingLeadByLinkOrPhone(link, phone);
  if (existingLead) {
    return {
      created: false,
      reason: 'Lead ya existe en el embudo',
      leadId: existingLead.id,
      name: existingLead.name,
      link
    };
  }

  // 2. Crear el Lead y Contacto asociado vía POST /api/v4/leads/complex
  const countryTag = detectCountryFromPhone(phone);
  const leadTags = [{ name: 'Referido BCROWN' }];
  if (countryTag) {
    leadTags.push({ name: countryTag });
  }

  const payload = [
    {
      name: name,
      pipeline_id: TARGET_PIPELINE_ID,
      status_id: TARGET_STATUS_ID,
      custom_fields_values: [
        {
          field_id: PRESENTATION_LINK_FIELD_ID,
          values: [
            {
              value: link
            }
          ]
        }
      ],
      _embedded: {
        tags: leadTags,
        contacts: [
          {
            name: name,
            custom_fields_values: phone ? [
              {
                field_code: 'PHONE',
                values: [
                  {
                    value: phone,
                    enum_code: 'WORK'
                  }
                ]
              }
            ] : []
          }
        ]
      }
    }
  ];

  const createUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/complex`;
  const postRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`Error creando lead en Kommo: HTTP ${postRes.status} - ${errText}`);
  }

  const createdData = await postRes.json();
  const createdInfo = createdData[0] || {};

  return {
    created: true,
    leadId: createdInfo.id,
    contactId: createdInfo.contact_id,
    name,
    phone,
    link,
    available
  };
}

/**
 * Busca si ya existe un lead con este link o este teléfono en el pipeline
 */
async function findExistingLeadByLinkOrPhone(link, phone) {
  // Consultar leads del pipeline
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads?filter[pipeline_id]=${TARGET_PIPELINE_ID}&limit=250`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) return null;
  if (res.status === 204) return null;

  const data = await res.json();
  const leads = data._embedded?.leads || [];

  for (const lead of leads) {
    // Revisar si coincide el campo personalizado de enlace
    const cfValues = lead.custom_fields_values || [];
    for (const cf of cfValues) {
      if (cf.field_id === PRESENTATION_LINK_FIELD_ID) {
        const val = cf.values?.[0]?.value;
        if (val && link && val.trim().toLowerCase() === link.trim().toLowerCase()) {
          return lead;
        }
      }
    }
  }

  return null;
}

/**
 * Detecta el país según el prefijo telefónico internacional para etiquetar en Kommo
 */
function detectCountryFromPhone(phone) {
  if (!phone) return null;
  const p = phone.replace(/[^\d]/g, '');

  // Prefijos de 3 dígitos (Latinoamérica)
  if (p.startsWith('593')) return 'Ecuador';
  if (p.startsWith('591')) return 'Bolivia';
  if (p.startsWith('595')) return 'Paraguay';
  if (p.startsWith('598')) return 'Uruguay';
  if (p.startsWith('502')) return 'Guatemala';
  if (p.startsWith('503')) return 'El Salvador';
  if (p.startsWith('504')) return 'Honduras';
  if (p.startsWith('505')) return 'Nicaragua';
  if (p.startsWith('506')) return 'Costa Rica';
  if (p.startsWith('507')) return 'Panama';

  // Prefijos de 2 dígitos
  if (p.startsWith('57')) return 'Colombia';
  if (p.startsWith('52')) return 'Mexico';
  if (p.startsWith('54')) return 'Argentina';
  if (p.startsWith('56')) return 'Chile';
  if (p.startsWith('51')) return 'Peru';
  if (p.startsWith('58')) return 'Venezuela';
  if (p.startsWith('34')) return 'España';
  if (p.startsWith('55')) return 'Brasil';
  if (p.startsWith('39')) return 'Italia';
  if (p.startsWith('49')) return 'Alemania';
  if (p.startsWith('33')) return 'Francia';
  if (p.startsWith('44')) return 'Reino Unido';

  // Prefijos de 1 dígito / Caribe NANP
  if (p.startsWith('1809') || p.startsWith('1829') || p.startsWith('1849')) return 'Rep Dominicana';
  if (p.startsWith('1787') || p.startsWith('1939')) return 'Puerto Rico';
  if (p.startsWith('1')) return 'EEUU';

  return null;
}
