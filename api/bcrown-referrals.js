/**
 * Endpoint Serverless: Procesador Automático de Referidos y Pre-registros BCROWN para Kommo CRM
 * 
 * Escucha las notificaciones que envía el bot de BCROWN (+573013861474 / Bcrown CB) y soporta 2 tipos de eventos:
 * 
 * 1. NUEVA ASIGNACIÓN / REFERIDO INICIAL:
 *    - Extrae: Nombre, WhatsApp, Enlace de Presentación (/w/ o /presentacion/?p=), Contactos disponibles.
 *    - Crea el Lead en etapa: "Nuevas conversaciones" (ID: 113609147).
 *    - Campos: "Enlace Presentación Orayon" (ID: 1054540), "Estado" = "Registro inicial" (enum 618648), "Asesor" = "Cristina Orozco".
 *    - Etiquetas: "Referido BCROWN", etiqueta de País y "Nuevo Prospecto".
 * 
 * 2. NUEVO PREREGISTRO RECIBIDO (ALTA INTENCIÓN):
 *    - Extrae: Nombre, WhatsApp, Perfil (Franquiciado / Herramientas), Disponibilidad, Duda, Experiencia en redes, Chat directo (/c/...).
 *    - Actualiza el Lead existente (o lo crea si no existiera) identificándolo por slug de enlace, teléfono o nombre.
 *    - Mueve la etapa a: "Interés: Franquicia / Negocio" (ID: 113584007) o "Interés: Herramientas IA" (ID: 113584011).
 *    - Campos: "Perfil Orayon" (1054530), "Experiencia MLM" (1054542), "Disponibilidad" (1055110), "Duda" (1055112),
 *      "Enlace de registro" (1055106) y "Estado" = "Pre registro" (enum 618650).
 *    - Etiquetas: Agrega etiqueta "Pre registro" (ID: 169832).
 *    - Crea una NOTA interna con todos los detalles y una TAREA urgente para Cristina Orozco.
 * 
 * URL: https://integracion-ghl-kommo.vercel.app/api/bcrown-referrals
 */

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || '1asolucionesvirtuales';
const KOMMO_TOKEN = process.env.KOMMO_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijg4YjVkM2YxNTE5ZTdjMGM4YmMzMGRjNmNhNzc5OWU0ZmI3NWM3OGQ1MTg0NWZlMmY0YzkzZGM4ZTM5ZGYwNTBhMzZhN2VmYmZiNGYwY2E3In0.eyJhdWQiOiJiZDdjMDlhYy02OWNhLTQ5MjktYjFlMi1lZDg5MjU4MjI3MjIiLCJqdGkiOiI4OGI1ZDNmMTUxOWU3YzBjOGJjMzBkYzZjYTc3OTllNGZiNzVjNzhkNTE4NDVmZTJmNGM5M2RjOGUzOWRmMDUwYTM2YTdlZmJmYjRmMGNhNyIsImlhdCI6MTc5MDYzNDA2MSwibmJmIjoxNzkwNjM0MDYxLCJleHAiOjE5MjQ5MDU2MDAsInN1YiI6IjczMDYxNjkiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjk2Mjg3MzcsImJhc2VfZG9tYWluIjoia29tbW8uY29tIiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImxpc3RfZXh0ZXJuYWxfbWVzc2FnZXMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJzZW5kX2V4dGVybmFsX21lc3NhZ2VzIl0sImhhc2hfdXVpZCI6IjBhYzQ3ZjNkLTc2YmItNDY0YS1iMmVlLWEzYjA4ZjRjNGRiMiIsImFwaV9kb21haW4iOiJhcGktYy5rb21tby5jb20ifQ.KGt1iFAyjXcvf9UKYRyRugfMgqSwB_JcERZ3tRh6bIaugXb9LTSvZQyoNlFDop7C2Naj2dX2wEXdCeo2n9m-HpJAwlLVIGNGrfK1PNVHbVLdgCNWCzDeIZObA_ivBN4ETV2PUevJb8EVMFDXYaQo4xwynsEbt3At-lKne_ZiIOKUaUToQ9lsE8VUqr4LIvkyIp0uqTjavDNcB4q0b07y0xjhwiW7hatynSu2Bvl4bIwL4qJ3JOfCxlPtzy6JGbYyGdr4rYFMVtD97IncCUGJDHk54ALjNsLcbmMWgS9Az1eZ5lrelz0kCIzwbztD6PsionsK0IyJl0T9vmlw39ubyQ';

// IDs de Embudo y Etapas
const TARGET_PIPELINE_ID = 14699583;            // Prospectos MLM Orayon
const STAGE_NEW_LEAD = 113609147;               // Nuevas conversaciones (sort 20)
const STAGE_INTEREST_FRANCHISE = 113584007;     // Interés: Franquicia / Negocio (sort 40)
const STAGE_INTEREST_AI_TOOLS = 113584011;      // Interés: Herramientas IA (sort 50)

// IDs de Campos Personalizados
const PRESENTATION_LINK_FIELD_ID = 1054540;     // Enlace Presentación Orayon (url)
const REGISTRATION_LINK_FIELD_ID = 1055106;     // Enlace de registro (url)
const ESTADO_FIELD_ID = 1055108;                // Estado (select)
const ENUM_ESTADO_REGISTRO_INICIAL = 618648;    // "Registro inicial"
const ENUM_ESTADO_PREREGISTRO = 618650;         // "Pre registro"

const PERFIL_ORAYON_FIELD_ID = 1054530;         // Perfil Orayon (select)
const ENUM_PERFIL_FRANQUICIA = 618630;          // "Franquicia Orayon IA"
const ENUM_PERFIL_HERRAMIENTAS = 618632;        // "Herramientas de creación con IA"
const ENUM_PERFIL_AMBOS = 618634;               // "Franquicia y Herramientas"

const EXPERIENCIA_MLM_FIELD_ID = 1054542;       // Experiencia MLM (select)
const ENUM_EXPERIENCIA_SI = 618644;             // "Si"
const ENUM_EXPERIENCIA_NO = 618646;             // "No"

const DISPONIBILIDAD_FIELD_ID = 1055110;        // Disponibilidad (text)
const DUDA_FIELD_ID = 1055112;                  // Duda (text)
const ASESOR_FIELD_ID = 1050637;                // Asesor responsable (text)
const RESPONSIBLE_USER_ID = 7306169;            // Cristina Orozco
const PRIMARY_TALK_ID = 12486;                  // Chat con Bcrown CB (+573013861474)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  try {
    // 1. GET: Ejecutar escaneo completo de mensajes
    if (req.method === 'GET') {
      const results = await scanAndProcessTalk(PRIMARY_TALK_ID);
      return res.status(200).json({
        status: 'ok',
        message: 'Escaneo y sincronización de referidos y pre-registros BCROWN completado.',
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

      const processedItems = [];

      // A. Extraer textos directos del payload si vienen incluidos
      const directTexts = extractDirectTextsFromPayload(body);
      for (const text of directTexts) {
        const itemRes = await processSingleMessage(text);
        if (itemRes) processedItems.push(itemRes);
      }

      // B. Extraer IDs de talks del webhook y escanear mensajes recientes
      const talkIds = extractTalkIdsFromPayload(body);
      if (!talkIds.includes(PRIMARY_TALK_ID)) {
        talkIds.push(PRIMARY_TALK_ID);
      }

      const scanResults = [];
      for (const tId of talkIds) {
        const r = await scanAndProcessTalk(tId);
        scanResults.push({ talkId: tId, ...r });
      }

      return res.status(200).json({
        status: 'ok',
        directProcessed: processedItems,
        talkScan: scanResults
      });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error) {
    console.error('[Bcrown Webhook Error]:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Procesa un mensaje de texto entrante: detecta si es Nueva Asignación o Pre-registro
 */
async function processSingleMessage(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. ¿Es un Pre-registro?
  const isPreregistro = text.includes('Nuevo preregistro recibido') || 
                        (text.includes('Sistema BCROWN ORAYON') && text.includes('Duda:'));
  if (isPreregistro) {
    return await handlePreregistroMessage(text);
  }

  // 2. ¿Es una Nueva Asignación / Referido Inicial?
  const isAssignment = text.includes('se ha registrado una nueva asignación') || 
                       text.includes('bcrown.online/w/') ||
                       text.includes('bcrown.online/presentacion') ||
                       (text.includes('System BCROWN') && text.includes('Nombre:'));
  if (isAssignment) {
    return await handleAssignmentMessage(text);
  }

  return null;
}

/**
 * Procesa evento: NUEVO PREREGISTRO RECIBIDO (Alta Intención)
 */
async function handlePreregistroMessage(text) {
  const parsed = parsePreregistroMessage(text);
  if (!parsed) return null;

  const { name, phone, perfil, disponibilidad, duda, experiencia, chatDirecto, slug } = parsed;

  console.log(`[Bcrown] Procesando PRE-REGISTRO para: ${name} (${phone}) - Perfil: ${perfil}`);

  // Buscar lead existente por slug, link, teléfono o nombre
  const existingLead = await findExistingLead({ phone, link: chatDirecto, slug, name });

  // Mapear opciones
  const perfilEnum = mapPerfilToEnum(perfil);
  const experienciaEnum = mapExperienciaToEnum(experiencia);
  const targetStage = mapPerfilToStage(perfil);
  const countryTag = detectCountryFromPhone(phone);

  const tagsToAdd = [
    { name: 'Referido BCROWN' },
    { name: 'Pre registro' }
  ];
  if (countryTag) tagsToAdd.push({ name: countryTag });

  const customFieldsToSet = [
    {
      field_id: PERFIL_ORAYON_FIELD_ID,
      values: [{ enum_id: perfilEnum }]
    },
    {
      field_id: EXPERIENCIA_MLM_FIELD_ID,
      values: [{ enum_id: experienciaEnum }]
    },
    {
      field_id: DISPONIBILIDAD_FIELD_ID,
      values: [{ value: disponibilidad || '' }]
    },
    {
      field_id: DUDA_FIELD_ID,
      values: [{ value: duda || '' }]
    },
    {
      field_id: REGISTRATION_LINK_FIELD_ID,
      values: [{ value: chatDirecto || '' }]
    },
    {
      field_id: ESTADO_FIELD_ID,
      values: [{ enum_id: ENUM_ESTADO_PREREGISTRO }]
    }
  ];

  let leadId = null;

  if (existingLead) {
    leadId = existingLead.id;

    // Verificar si ya fue actualizado con este pre-registro (evitar tareas duplicadas)
    const existingCf = existingLead.custom_fields_values || [];
    const currentEstado = existingCf.find(c => c.field_id === ESTADO_FIELD_ID)?.values?.[0]?.enum_id;
    const currentRegLink = existingCf.find(c => c.field_id === REGISTRATION_LINK_FIELD_ID)?.values?.[0]?.value;

    if (currentEstado === ENUM_ESTADO_PREREGISTRO && currentRegLink === chatDirecto) {
      return {
        action: 'preregistro_already_updated',
        leadId,
        name
      };
    }

    // Combinar etiquetas existentes
    const existingTags = (existingLead._embedded?.tags || []).map(t => ({ name: t.name }));
    const tagMap = new Map();
    [...existingTags, ...tagsToAdd].forEach(t => tagMap.set(t.name, t));
    const mergedTags = Array.from(tagMap.values());

    const patchPayload = [
      {
        id: leadId,
        status_id: targetStage,
        custom_fields_values: customFieldsToSet,
        _embedded: {
          tags: mergedTags
        }
      }
    ];

    await patchLeads(patchPayload);
    console.log(`[Bcrown] Lead #${leadId} (${name}) ACTUALIZADO con pre-registro en etapa ${targetStage}`);
  } else {
    // Si no existía, crearlo desde cero
    const createPayload = [
      {
        name: name,
        pipeline_id: TARGET_PIPELINE_ID,
        status_id: targetStage,
        custom_fields_values: [
          ...customFieldsToSet,
          {
            field_id: ASESOR_FIELD_ID,
            values: [{ value: 'Cristina Orozco' }]
          }
        ],
        _embedded: {
          tags: tagsToAdd,
          contacts: [
            {
              name: name,
              custom_fields_values: phone ? [
                {
                  field_code: 'PHONE',
                  values: [{ value: phone, enum_code: 'WORK' }]
                }
              ] : []
            }
          ]
        }
      }
    ];

    const createRes = await createComplexLeads(createPayload);
    leadId = createRes[0]?.id;
    console.log(`[Bcrown] Lead #${leadId} (${name}) CREADO DIRECTAMENTE como pre-registro en etapa ${targetStage}`);
  }

  if (leadId) {
    // 1. Agregar nota interna de alta visibilidad
    const noteText = `🚨 NUEVO PREREGISTRO RECIBIDO (ALTA INTENCIÓN)\n` +
      `- Nombre: ${name}\n` +
      `- WhatsApp: ${phone}\n` +
      `- Perfil: ${perfil}\n` +
      `- Disponibilidad: ${disponibilidad}\n` +
      `- Duda: ${duda}\n` +
      `- Experiencia MLM: ${experiencia}\n` +
      `- Chat directo: ${chatDirecto}\n` +
      `- Estado: Pre registro`;
    
    await addLeadNote(leadId, noteText);

    // 2. Crear tarea urgente para Cristina Orozco
    const taskText = `🔥 ALERTA PREREGISTRO: ${name} (${perfil}). Duda: ${duda || 'Sin duda registrada'}. Disponibilidad: ${disponibilidad || 'Inmediata'}.`;
    await createUrgentTask(leadId, taskText);
  }

  return {
    action: existingLead ? 'updated_preregistro' : 'created_preregistro',
    leadId,
    name,
    phone,
    perfil,
    targetStage
  };
}

/**
 * Procesa evento: NUEVA ASIGNACIÓN / REFERIDO INICIAL
 */
async function handleAssignmentMessage(text) {
  const parsed = parseAssignmentMessage(text);
  if (!parsed) return null;

  const { name, phone, link, available, slug } = parsed;

  console.log(`[Bcrown] Procesando ASIGNACIÓN INICIAL para: ${name} (${phone}) - Link: ${link}`);

  // Verificar si ya existe en el embudo
  const existingLead = await findExistingLead({ phone, link, slug, name });
  if (existingLead) {
    return {
      action: 'assignment_already_exists',
      leadId: existingLead.id,
      name: existingLead.name,
      link
    };
  }

  // Crear el Lead y Contacto asociado en la primera etapa
  const countryTag = detectCountryFromPhone(phone);
  const leadTags = [
    { name: 'Referido BCROWN' },
    { name: 'Nuevo Prospecto' }
  ];
  if (countryTag) leadTags.push({ name: countryTag });

  const payload = [
    {
      name: name,
      pipeline_id: TARGET_PIPELINE_ID,
      status_id: STAGE_NEW_LEAD,
      custom_fields_values: [
        {
          field_id: PRESENTATION_LINK_FIELD_ID,
          values: [{ value: link }]
        },
        {
          field_id: ASESOR_FIELD_ID,
          values: [{ value: 'Cristina Orozco' }]
        },
        {
          field_id: ESTADO_FIELD_ID,
          values: [{ enum_id: ENUM_ESTADO_REGISTRO_INICIAL }]
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
                values: [{ value: phone, enum_code: 'WORK' }]
              }
            ] : []
          }
        ]
      }
    }
  ];

  const createdData = await createComplexLeads(payload);
  const createdInfo = createdData[0] || {};
  const leadId = createdInfo.id;

  if (leadId) {
    const noteText = `📌 Asignación BCROWN:\n` +
      `- Nombre: ${name}\n` +
      `- WhatsApp: ${phone}\n` +
      `- Enlace Presentación: ${link}\n` +
      `- Contactos disponibles: ${available || 'N/A'}`;
    await addLeadNote(leadId, noteText);
  }

  return {
    action: 'created_assignment',
    leadId,
    name,
    phone,
    link,
    available
  };
}

/**
 * Parser de mensajes de Pre-registro
 */
function parsePreregistroMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const nameMatch = text.match(/(?:👤\s*Nombre|Nombre):\s*([^\n\r]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  const phoneMatch = text.match(/(?:📲\s*WhatsApp|📱\s*WhatsApp|WhatsApp):\s*(\+?[\d\s-]+)/i);
  const phone = phoneMatch ? phoneMatch[1].replace(/[\s-]/g, '').trim() : null;

  const perfilMatch = text.match(/(?:Perfil):\s*([^\n\r]+)/i);
  const perfil = perfilMatch ? perfilMatch[1].trim() : 'Franquiciado';

  const dispMatch = text.match(/(?:Disponibilidad):\s*([^\n\r]+)/i);
  const disponibilidad = dispMatch ? dispMatch[1].trim() : null;

  const dudaMatch = text.match(/(?:Duda):\s*([^\n\r]+)/i);
  const duda = dudaMatch ? dudaMatch[1].trim() : null;

  const expMatch = text.match(/(?:Experiencia en redes):\s*([^\n\r]+)/i);
  const experiencia = expMatch ? expMatch[1].trim() : null;

  const chatMatch = text.match(/(https?:\/\/bcrown\.online\/c\/[a-zA-Z0-9_-]+)/i);
  const chatDirecto = chatMatch ? chatMatch[1].trim() : null;

  const slugMatch = text.match(/bcrown\.online\/(?:c|w)\/([a-zA-Z0-9_-]+)/i);
  const slug = slugMatch ? slugMatch[1].trim() : null;

  if (!name) return null;

  return { name, phone, perfil, disponibilidad, duda, experiencia, chatDirecto, slug };
}

/**
 * Parser de mensajes de Asignación Inicial
 */
function parseAssignmentMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const nameMatch = text.match(/(?:👤\s*Nombre|Nombre):\s*([^\n\r]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  const phoneMatch = text.match(/(?:📲\s*WhatsApp|📱\s*WhatsApp|WhatsApp):\s*(\+?[\d\s-]+)/i);
  const phone = phoneMatch ? phoneMatch[1].replace(/[\s-]/g, '').trim() : null;

  const linkMatch = text.match(/(https?:\/\/bcrown\.online\/(?:w\/[a-zA-Z0-9_-]+|presentacion\/\?p=[a-zA-Z0-9_-]+))/i);
  const link = linkMatch ? linkMatch[1].trim() : null;

  const slugMatch = text.match(/bcrown\.online\/(?:w\/|presentacion\/\?p=)([a-zA-Z0-9_-]+)/i);
  const slug = slugMatch ? slugMatch[1].trim() : null;

  const availMatch = text.match(/(?:📊\s*Contactos disponibles|Contactos disponibles):\s*(\d+)/i);
  const available = availMatch ? parseInt(availMatch[1], 10) : null;

  if (!name || !link) return null;

  return { name, phone, link, available, slug };
}

/**
 * Mapea texto de perfil al enum ID de Kommo
 */
function mapPerfilToEnum(perfil) {
  const p = (perfil || '').toLowerCase();
  if (p.includes('ambos') || (p.includes('franquicia') && p.includes('herramienta'))) {
    return ENUM_PERFIL_AMBOS; // 618634
  }
  if (p.includes('herramienta')) {
    return ENUM_PERFIL_HERRAMIENTAS; // 618632
  }
  return ENUM_PERFIL_FRANQUICIA; // 618630 (default Franquicia Orayon IA)
}

/**
 * Mapea perfil a la etapa correspondiente del embudo
 */
function mapPerfilToStage(perfil) {
  const p = (perfil || '').toLowerCase();
  if (p.includes('herramienta') && !p.includes('franquicia')) {
    return STAGE_INTEREST_AI_TOOLS; // 113584011
  }
  return STAGE_INTEREST_FRANCHISE; // 113584007
}

/**
 * Mapea experiencia en redes a enum ID de Kommo
 */
function mapExperienciaToEnum(exp) {
  const e = (exp || '').toLowerCase();
  if (e.startsWith('s') || e.includes('sí') || e.includes('si')) {
    return ENUM_EXPERIENCIA_SI; // 618644
  }
  return ENUM_EXPERIENCIA_NO; // 618646
}

/**
 * Busca si ya existe un lead por slug, link, teléfono o nombre
 */
async function findExistingLead({ phone, link, slug, name }) {
  const cleanDigits = phone ? phone.replace(/[^\d]/g, '') : null;

  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads?filter[pipeline_id]=${TARGET_PIPELINE_ID}&with=contacts&limit=250`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok || res.status === 204) return null;
  const data = await res.json();
  const leads = data._embedded?.leads || [];

  for (const lead of leads) {
    const cfValues = lead.custom_fields_values || [];

    for (const cf of cfValues) {
      if (cf.field_id === PRESENTATION_LINK_FIELD_ID || cf.field_id === REGISTRATION_LINK_FIELD_ID) {
        const val = cf.values?.[0]?.value || '';
        if (link && val.trim().toLowerCase() === link.trim().toLowerCase()) {
          return lead;
        }
        if (slug && val.toLowerCase().includes(slug.toLowerCase())) {
          return lead;
        }
      }
    }

    if (name && lead.name && lead.name.trim().toLowerCase() === name.trim().toLowerCase()) {
      return lead;
    }
  }

  // Búsqueda por contacto / teléfono
  if (cleanDigits && cleanDigits.length >= 8) {
    try {
      const contactUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${cleanDigits}&with=leads`;
      const cRes = await fetch(contactUrl, {
        headers: {
          'Authorization': `Bearer ${KOMMO_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      if (cRes.ok && cRes.status !== 204) {
        const cData = await cRes.json();
        const contacts = cData._embedded?.contacts || [];
        for (const c of contacts) {
          const attachedLeads = c._embedded?.leads || [];
          for (const lRef of attachedLeads) {
            const matched = leads.find(l => l.id === lRef.id);
            if (matched) return matched;
          }
        }
      }
    } catch (e) {
      console.warn('[Bcrown] Error buscando contacto por teléfono:', e.message);
    }
  }

  return null;
}

/**
 * Extrae textos directos de payloads JSON o urlencoded
 */
function extractDirectTextsFromPayload(body) {
  const texts = [];
  if (typeof body.text === 'string' && body.text.trim()) texts.push(body.text.trim());
  if (typeof body.message === 'string' && body.message.trim()) texts.push(body.message.trim());

  if (body.message && typeof body.message === 'object') {
    for (const action of ['add', 'update']) {
      const list = body.message[action];
      if (Array.isArray(list)) {
        for (const m of list) {
          if (m && m.text && typeof m.text === 'string') texts.push(m.text.trim());
        }
      }
    }
  }

  for (const key of Object.keys(body)) {
    if (/^message\[(?:add|update)\]\[\d+\]\[text\]$/.test(key) && body[key]) {
      texts.push(String(body[key]).trim());
    }
  }

  return texts;
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
          if (t && (t.id || t.talk_id)) ids.add(Number(t.id || t.talk_id));
        }
      }
    }
  }

  if (body.message) {
    for (const action of ['add', 'update']) {
      const list = body.message[action];
      if (Array.isArray(list)) {
        for (const m of list) {
          if (m && m.talk_id) ids.add(Number(m.talk_id));
        }
      }
    }
  }

  for (const key of Object.keys(body)) {
    const match = key.match(/^(?:talk|message)\[(?:add|update)\]\[\d+\]\[(?:id|talk_id)\]$/);
    if (match && body[key]) {
      ids.add(Number(body[key]));
    }
  }

  ids.add(PRIMARY_TALK_ID);
  return Array.from(ids).filter(Boolean);
}

/**
 * Escanea los mensajes de un Talk y procesa tanto Asignaciones como Pre-registros
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
    if (res.status === 204) return { messagesFound: 0, processed: [] };
    throw new Error(`Error consultando mensajes de talk ${talkId}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const messages = data._embedded?.messages || [];
  const processedList = [];

  for (const msg of messages) {
    if (msg.type !== 'incoming' && msg.message_type !== 'text') continue;
    const r = await processSingleMessage(msg.text);
    if (r) processedList.push(r);
  }

  return {
    messagesScanned: messages.length,
    processedCount: processedList.length,
    processed: processedList
  };
}

/**
 * Actualiza leads vía PATCH /api/v4/leads
 */
async function patchLeads(payload) {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en PATCH /leads: HTTP ${res.status} - ${errText}`);
  }

  return await res.json();
}

/**
 * Crea leads complejos vía POST /api/v4/leads/complex
 */
async function createComplexLeads(payload) {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/complex`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error creando lead en Kommo: HTTP ${res.status} - ${errText}`);
  }

  return await res.json();
}

/**
 * Agrega nota interna a un Lead
 */
async function addLeadNote(leadId, text) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}/notes`;
    const payload = [
      {
        note_type: 'common',
        params: { text }
      }
    ];

    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KOMMO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn(`[Bcrown] Error agregando nota al lead #${leadId}:`, e.message);
  }
}

/**
 * Crea tarea urgente en Kommo para Cristina Orozco
 */
async function createUrgentTask(leadId, text) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks`;
    const completeTill = Math.floor(Date.now() / 1000) + 3600; // 1 hora de plazo

    const payload = [
      {
        text,
        complete_till: completeTill,
        entity_id: leadId,
        entity_type: 'leads',
        responsible_user_id: RESPONSIBLE_USER_ID,
        task_type_id: 1 // Llamada / Seguimiento
      }
    ];

    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KOMMO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn(`[Bcrown] Error creando tarea para lead #${leadId}:`, e.message);
  }
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
