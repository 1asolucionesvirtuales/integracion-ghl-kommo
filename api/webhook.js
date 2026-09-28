/**
 * Webhook Middleware: Integración GoHighLevel (GHL) ⇄ Kommo CRM
 * Cuenta: 1A Soluciones Virtuales (1asolucionesvirtuales.kommo.com)
 * Desplegable en Vercel Serverless Functions
 */

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || '1asolucionesvirtuales';
const KOMMO_TOKEN = process.env.KOMMO_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijg4YjVkM2YxNTE5ZTdjMGM4YmMzMGRjNmNhNzc5OWU0ZmI3NWM3OGQ1MTg0NWZlMmY0YzkzZGM4ZTM5ZGYwNTBhMzZhN2VmYmZiNGYwY2E3In0.eyJhdWQiOiJiZDdjMDlhYy02OWNhLTQ5MjktYjFlMi1lZDg5MjU4MjI3MjIiLCJqdGkiOiI4OGI1ZDNmMTUxOWU3YzBjOGJjMzBkYzZjYTc3OTllNGZiNzVjNzhkNTE4NDVmZTJmNGM5M2RjOGUzOWRmMDUwYTM2YTdlZmJmYjRmMGNhNyIsImlhdCI6MTc5MDYzNDA2MSwibmJmIjoxNzkwNjM0MDYxLCJleHAiOjE5MjQ5MDU2MDAsInN1YiI6IjczMDYxNjkiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjk2Mjg3MzcsImJhc2VfZG9tYWluIjoia29tbW8uY29tIiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImxpc3RfZXh0ZXJuYWxfbWVzc2FnZXMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJzZW5kX2V4dGVybmFsX21lc3NhZ2VzIl0sImhhc2hfdXVpZCI6IjBhYzQ3ZjNkLTc2YmItNDY0YS1iMmVlLWEzYjA4ZjRjNGRiMiIsImFwaV9kb21haW4iOiJhcGktYy5rb21tby5jb20ifQ.KGt1iFAyjXcvf9UKYRyRugfMgqSwB_JcERZ3tRh6bIaugXb9LTSvZQyoNlFDop7C2Naj2dX2wEXdCeo2n9m-HpJAwlLVIGNGrfK1PNVHbVLdgCNWCzDeIZObA_ivBN4ETV2PUevJb8EVMFDXYaQo4xwynsEbt3At-lKne_ZiIOKUaUToQ9lsE8VUqr4LIvkyIp0uqTjavDNcB4q0b07y0xjhwiW7hatynSu2Bvl4bIwL4qJ3JOfCxlPtzy6JGbYyGdr4rYFMVtD97IncCUGJDHk54ALjNsLcbmMWgS9Az1eZ5lrelz0kCIzwbztD6PsionsK0IyJl0T9vmlw39ubyQ';

// IDs Oficiales de Kommo
const PIPELINE_VENTAS_ID = 4524443; // Ventas CRM
const STAGE_REUNION_INICIAL_ID = 105441247; // Reunion Inicial
const PIPELINE_ACTIVOS_ID = 4636139; // Activos CRM

// IDs de Campos Personalizados
const FIELD_ENLACE_SALA = 1043530; // url
const FIELD_CITAS_SEGUIMIENTO = 1038738; // date_time
const FIELD_SEGUNDO_RECORDATORIO = 1046715; // date_time
const FIELD_SEGUIMIENTO_O_CITA = 1046709; // select

// Opciones de "Seguimiento o Cita?"
const ENUM_VENTA_60MIN = 611285; // Reunión 60 min - Venta
const ENUM_VENTA_30MIN = 611287; // Reunión 30 min - Venta Seg
const ENUM_ASESORIA_60MIN = 611289; // Reunión 60 min - Asesoría
const ENUM_ASESORIA_30MIN = 611291; // Reunión 30 min - Asesoría
const ENUM_PRIMERA_ASESORIA_2H = 618182; // Primera asesoría 2h

// Tipos de Tarea
const TASK_TYPE_DEMO_KOMMO = 2913803; // Demo Kommo
const TASK_TYPE_CAPACITACION = 2852135; // Capacitación

// Asesores Principales en Kommo
const USER_CRISTINA = 7306169;
const USER_IVAN = 10095483;

// Etiqueta oficial
const TAG_CITA_AGENDADA = 'Cita Agendada';

// Cache en memoria para descartar webhooks duplicados casi simultáneos
const recentlyProcessed = new Map();

// Función auxiliar para pausas (sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handler Principal Serverless (Vercel)
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Middleware GHL ⇄ Kommo CRM (1A Soluciones Virtuales) activo.',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    console.log('Incoming GHL Webhook:', JSON.stringify(payload));

    const contactData = extractContactData(payload);
    const appointmentData = extractAppointmentData(payload);

    if (!contactData.phone && !contactData.email) {
      return res.status(400).json({
        status: 'error',
        message: 'No se encontró teléfono ni correo del contacto en la solicitud de GHL.'
      });
    }

    // Control de duplicados por ráfagas (60 segundos por cita/contacto)
    const idempotencyKey = `${appointmentData.id || ''}_${contactData.email}_${contactData.phone}`;
    const now = Date.now();
    if (recentlyProcessed.has(idempotencyKey) && (now - recentlyProcessed.get(idempotencyKey)) < 60000) {
      console.log(`Evento duplicado descartado por debounce: ${idempotencyKey}`);
      return res.status(200).json({ status: 'ignored', reason: 'debounce_duplicate' });
    }
    recentlyProcessed.set(idempotencyKey, now);

    // Clasificar agenda
    const calendarConfig = classifyCalendar(payload, appointmentData);
    console.log('Configuración detectada para la cita:', calendarConfig);

    // Sincronizar en Kommo en 2 pasos para garantizar disponibilidad de campos antes del bot
    const syncResult = await syncAppointmentWithKommo(contactData, appointmentData, calendarConfig);

    return res.status(200).json({
      status: 'ok',
      result: syncResult
    });

  } catch (err) {
    console.error('Error general procesando webhook de GHL:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

/**
 * Clasifica la cita según el slug o nombre del calendario en GHL
 */
function classifyCalendar(payload, appointmentData) {
  const fullText = JSON.stringify(payload).toLowerCase();

  // Escenario 1: Ventas CRM
  // 1.1 Cita 2da vez Cristina
  if (fullText.includes('consultas-finales-cris')) {
    return {
      scenario: 'ventas',
      pipelineId: PIPELINE_VENTAS_ID,
      stageId: STAGE_REUNION_INICIAL_ID,
      moveStage: true,
      enumCitaId: ENUM_VENTA_30MIN,
      taskTypeId: TASK_TYPE_DEMO_KOMMO,
      taskTitle: 'Demo Kommo - Cita Venta 2da Vez (Cristina)',
      assignedUserId: USER_CRISTINA
    };
  }

  // 1.2 Cita 2da vez Ivan
  if (fullText.includes('consultas-finales-ivan')) {
    return {
      scenario: 'ventas',
      pipelineId: PIPELINE_VENTAS_ID,
      stageId: STAGE_REUNION_INICIAL_ID,
      moveStage: true,
      enumCitaId: ENUM_VENTA_30MIN,
      taskTypeId: TASK_TYPE_DEMO_KOMMO,
      taskTitle: 'Demo Kommo - Cita Venta 2da Vez (Ivan)',
      assignedUserId: USER_IVAN
    };
  }

  // 1.3 Cita Reprogramada
  if (fullText.includes('cita-de-diagnostico-y-primeros-2v')) {
    return {
      scenario: 'ventas',
      pipelineId: PIPELINE_VENTAS_ID,
      stageId: STAGE_REUNION_INICIAL_ID,
      moveStage: true,
      enumCitaId: ENUM_VENTA_60MIN,
      taskTypeId: TASK_TYPE_DEMO_KOMMO,
      taskTitle: 'Demo Kommo - Cita Venta Reprogramada',
      assignedUserId: determineAssignedAdvisor(fullText)
    };
  }

  // 1.4 Cita Embudo Gamificado
  if (fullText.includes('primeros-pasos-cita-diagnostico')) {
    return {
      scenario: 'ventas',
      pipelineId: PIPELINE_VENTAS_ID,
      stageId: STAGE_REUNION_INICIAL_ID,
      moveStage: true,
      enumCitaId: ENUM_VENTA_60MIN,
      taskTypeId: TASK_TYPE_DEMO_KOMMO,
      taskTitle: 'Demo Kommo - Embudo Gamificado',
      assignedUserId: determineAssignedAdvisor(fullText)
    };
  }

  // 1.5 Cita Diagnóstico Primera Vez Venta Directa
  if (fullText.includes('cita-de-diagnostico-y-primeros')) {
    return {
      scenario: 'ventas',
      pipelineId: PIPELINE_VENTAS_ID,
      stageId: STAGE_REUNION_INICIAL_ID,
      moveStage: true,
      enumCitaId: ENUM_VENTA_60MIN,
      taskTypeId: TASK_TYPE_DEMO_KOMMO,
      taskTitle: 'Demo Kommo - Cita Diagnóstico Venta',
      assignedUserId: determineAssignedAdvisor(fullText)
    };
  }

  // Escenario 2: Activos CRM (Clientes Actuales) - NO SE MUEVE DE ETAPA
  // 2.1 Primera asesoría 2 horas (Cristina o Ivan)
  if (fullText.includes('diagnostico-inicial-post-compra-cris')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_PRIMERA_ASESORIA_2H,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Primera Asesoría 2h (Cristina)',
      assignedUserId: USER_CRISTINA
    };
  }
  if (fullText.includes('diagnostico-inicial-post-compra-ivan')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_PRIMERA_ASESORIA_2H,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Primera Asesoría 2h (Ivan)',
      assignedUserId: USER_IVAN
    };
  }

  // 2.2 Asesorías Cristina (1 hora)
  if (fullText.includes('asesoria-1-hora-co-pb') || fullText.includes('asesoria-1-hora-co-pf') || fullText.includes('asesoria-1-hora-co-pa')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_ASESORIA_60MIN,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Asesoría 1h (Cristina)',
      assignedUserId: USER_CRISTINA
    };
  }

  // 2.3 Asesorías Cristina (30 minutos)
  if (fullText.includes('asesoria-30-min-co-pb') || fullText.includes('asesoria-30-min-co-pf') || fullText.includes('asesoria-30-min-co-pa')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_ASESORIA_30MIN,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Asesoría 30m (Cristina)',
      assignedUserId: USER_CRISTINA
    };
  }

  // 2.4 Asesorías Ivan (1 hora)
  if (fullText.includes('asesoria-1-hora-il-pb') || fullText.includes('asesoria-1-hora-il-pf') || fullText.includes('asesoria-1-hora-il-pa')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_ASESORIA_60MIN,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Asesoría 1h (Ivan)',
      assignedUserId: USER_IVAN
    };
  }

  // 2.5 Asesorías Ivan (30 minutos)
  if (fullText.includes('asesoria-30-min-il-pb') || fullText.includes('asesoria-30-min-il-pf') || fullText.includes('asesoria-30-min-il-pa')) {
    return {
      scenario: 'activos',
      pipelineId: PIPELINE_ACTIVOS_ID,
      moveStage: false,
      enumCitaId: ENUM_ASESORIA_30MIN,
      taskTypeId: TASK_TYPE_CAPACITACION,
      taskTitle: 'Capacitación - Asesoría 30m (Ivan)',
      assignedUserId: USER_IVAN
    };
  }

  return {
    scenario: 'ventas',
    pipelineId: PIPELINE_VENTAS_ID,
    stageId: STAGE_REUNION_INICIAL_ID,
    moveStage: true,
    enumCitaId: ENUM_VENTA_60MIN,
    taskTypeId: TASK_TYPE_DEMO_KOMMO,
    taskTitle: 'Demo Kommo - Cita de Venta',
    assignedUserId: determineAssignedAdvisor(fullText)
  };
}

function determineAssignedAdvisor(fullText) {
  if (fullText.includes('ivan') || fullText.includes('ivan.lalinde')) {
    return USER_IVAN;
  }
  return USER_CRISTINA;
}

function extractContactData(payload) {
  const contact = payload.contact || {};
  const first = contact.first_name || payload.first_name || '';
  const last = contact.last_name || payload.last_name || '';
  let name = (first + ' ' + last).trim() || contact.name || payload.name || 'Contacto sin nombre';

  const email = (contact.email || payload.email || '').trim().toLowerCase();
  let phone = (contact.phone || payload.phone || '').trim().replace(/[^\d+]/g, '');
  const companyName = contact.company_name || payload.company_name || '';

  const guests = [];
  const rawGuests = payload.guests || payload.additional_contacts || payload.invitees || [];
  if (Array.isArray(rawGuests)) {
    rawGuests.forEach(g => {
      if (typeof g === 'string') guests.push({ email: g, name: g });
      else if (typeof g === 'object') guests.push(g);
    });
  }

  return { name, email, phone, companyName, guests };
}

function extractAppointmentData(payload) {
  const appt = payload.appointment || payload.calendar || {};
  const id = appt.id || payload.appointment_id || '';

  let startTimeRaw = appt.start_time || appt.startTime || payload.start_time || payload.selected_time || payload.date;
  let startTimeUnix = Math.floor(Date.now() / 1000);
  if (startTimeRaw) {
    const parsedDate = new Date(startTimeRaw);
    if (!isNaN(parsedDate.getTime())) {
      startTimeUnix = Math.floor(parsedDate.getTime() / 1000);
    }
  }

  let meetingLink = appt.address || appt.meeting_location || appt.meetingLocation || payload.meeting_location || payload.zoom_link || '';
  if (!meetingLink && (typeof payload.location === 'string' && payload.location.startsWith('http'))) {
    meetingLink = payload.location;
  }

  let notes = appt.notes || payload.notes || payload.description || payload.details || '';
  if (!notes && payload.customData) {
    notes = payload.customData['Detalles de la cita'] || payload.customData['detalles_de_la_cita'] || '';
  }

  return { id, startTimeUnix, meetingLink, notes };
}

/**
 * Sincroniza la cita con Kommo CRM garantizando que los campos se guarden ANTES de mover la etapa
 */
async function syncAppointmentWithKommo(contactData, appointmentData, config) {
  const headers = {
    'Authorization': `Bearer ${KOMMO_TOKEN}`,
    'Content-Type': 'application/json'
  };

  // 1. Buscar contacto existente en Kommo por teléfono o correo
  let contact = await searchContact(contactData.phone, contactData.email, headers);

  if (!contact) {
    console.log('Contacto no existe en Kommo. Creándolo...');
    contact = await createContact(contactData, config.assignedUserId, headers);
  } else {
    console.log(`Contacto encontrado en Kommo: [${contact.id}] ${contact.name}`);
    if (contact.responsible_user_id !== config.assignedUserId) {
      await updateEntityResponsible('contacts', contact.id, config.assignedUserId, headers);
    }
  }

  const contactId = contact.id;

  // 2. Si hay invitados adicionales, crearlos como contactos secundarios
  if (contactData.guests && contactData.guests.length > 0) {
    for (const guest of contactData.guests) {
      try {
        await createContact({
          name: guest.name || guest.email || 'Invitado de Cita',
          email: guest.email || '',
          phone: guest.phone || '',
          companyName: contactData.companyName
        }, config.assignedUserId, headers);
      } catch (ge) {
        console.warn('No se pudo crear contacto invitado secundario:', ge.message);
      }
    }
  }

  // 3. Buscar Lead activo en el embudo correspondiente (Ventas CRM o Activos CRM)
  let targetLead = await findLeadForContact(contactId, config.pipelineId, headers);

  const timestampCita = appointmentData.startTimeUnix;
  const timestampRecordatorio = timestampCita + (45 * 60); // Cita + 45 minutos

  // Valores de los campos personalizados de la cita
  const customFieldsValues = [
    { field_id: FIELD_CITAS_SEGUIMIENTO, values: [{ value: timestampCita }] },
    { field_id: FIELD_SEGUNDO_RECORDATORIO, values: [{ value: timestampRecordatorio }] },
    { field_id: FIELD_SEGUIMIENTO_O_CITA, values: [{ enum_id: config.enumCitaId }] }
  ];

  if (appointmentData.meetingLink) {
    customFieldsValues.push({
      field_id: FIELD_ENLACE_SALA,
      values: [{ value: appointmentData.meetingLink }]
    });
  }

  let leadId;

  if (targetLead) {
    leadId = targetLead.id;
    console.log(`[PASO 1] Guardando campos personalizados en Lead [${leadId}]...`);

    // PASO 1: Guardar primero los campos personalizados, etiquetas y asesor
    const saveFieldsPayload = {
      responsible_user_id: config.assignedUserId,
      custom_fields_values: customFieldsValues,
      _embedded: {
        tags: mergeTags(targetLead._embedded?.tags, TAG_CITA_AGENDADA)
      }
    };

    const patchUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}`;
    await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(saveFieldsPayload)
    });

    // Pequeña pausa técnica para asegurar la persistencia en la base de datos de Kommo
    await sleep(1500);

    // PASO 2: Si corresponde mover de etapa (Ventas CRM), moverlo AHORA para que el bot lea los campos listos
    if (config.moveStage) {
      console.log(`[PASO 2] Moviendo Lead [${leadId}] a la etapa Reunión Inicial...`);
      await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          pipeline_id: config.pipelineId,
          status_id: config.stageId
        })
      });
    }

  } else {
    console.log(`No se encontró Lead en el embudo [${config.pipelineId}]. Creando nuevo Lead...`);

    // Crear lead con todos los campos ya diligenciados
    const createPayload = {
      name: `Cita: ${contactData.name}`,
      pipeline_id: config.pipelineId,
      status_id: config.moveStage ? config.stageId : undefined,
      responsible_user_id: config.assignedUserId,
      custom_fields_values: customFieldsValues,
      _embedded: {
        contacts: [{ id: contactId }],
        tags: [{ name: TAG_CITA_AGENDADA }]
      }
    };

    const postUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads`;
    const createRes = await fetch(postUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify([createPayload])
    });

    const createData = await createRes.json();
    leadId = createData._embedded?.leads?.[0]?.id;
  }

  // 4. Crear la Tarea correspondiente en Kommo
  let taskText = config.taskTitle;
  if (config.scenario === 'activos' && appointmentData.notes) {
    taskText = `📌 Capacitación GHL: ${appointmentData.notes}`;
  }

  await createTask(leadId, config.assignedUserId, config.taskTypeId, timestampCita, taskText, headers);

  // 5. Dejar una Nota informativa en el Lead
  const formattedDate = new Date(timestampCita * 1000).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const noteContent = `📅 Cita agendada desde GoHighLevel (GHL)\n• Fecha/Hora: ${formattedDate}\n• Enlace de la sala: ${appointmentData.meetingLink || 'No indicado'}\n• Tipo: ${config.taskTitle}\n• Notas del cliente: ${appointmentData.notes || 'Ninguna'}`;
  await addNote(leadId, noteContent, headers);

  return {
    contactId,
    leadId,
    scenario: config.scenario,
    appointmentTime: formattedDate
  };
}

async function searchContact(phone, email, headers) {
  if (phone) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${cleanPhone}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data._embedded?.contacts?.length > 0) return data._embedded.contacts[0];
    }
  }

  if (email) {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${encodeURIComponent(email)}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data._embedded?.contacts?.length > 0) return data._embedded.contacts[0];
    }
  }

  return null;
}

async function createContact(contactData, responsibleUserId, headers) {
  const customFieldsValues = [];
  if (contactData.phone) {
    customFieldsValues.push({
      field_code: 'PHONE',
      values: [{ value: contactData.phone, enum_code: 'WORK' }]
    });
  }
  if (contactData.email) {
    customFieldsValues.push({
      field_code: 'EMAIL',
      values: [{ value: contactData.email, enum_code: 'WORK' }]
    });
  }

  const payload = {
    name: contactData.name,
    responsible_user_id: responsibleUserId,
    custom_fields_values: customFieldsValues
  };

  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify([payload])
  });

  const data = await res.json();
  return data._embedded?.contacts?.[0];
}

async function updateEntityResponsible(entityType, entityId, responsibleUserId, headers) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/${entityType}/${entityId}`;
    await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ responsible_user_id: responsibleUserId })
    });
  } catch (e) {
    console.error(`Error actualizando responsable en ${entityType} ${entityId}:`, e);
  }
}

async function findLeadForContact(contactId, pipelineId, headers) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads?filter[contacts][id]=${contactId}&with=contacts`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const data = await res.json();
    const leads = data._embedded?.leads || [];

    const matchingLead = leads.find(l => l.pipeline_id === pipelineId);
    if (matchingLead) return matchingLead;

    return leads[0] || null;
  } catch (e) {
    return null;
  }
}

async function createTask(leadId, responsibleUserId, taskTypeId, dueTimestamp, text, headers) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks`;
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          responsible_user_id: responsibleUserId,
          entity_id: leadId,
          entity_type: 'leads',
          task_type_id: taskTypeId,
          complete_till: dueTimestamp,
          text: text
        }
      ])
    });
    console.log(`Tarea [${taskTypeId}] creada en lead ${leadId} para el usuario ${responsibleUserId}`);
  } catch (e) {
    console.error('Error creando tarea en Kommo:', e);
  }
}

async function addNote(leadId, text, headers) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}/notes`;
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          note_type: 'common',
          params: { text }
        }
      ])
    });
  } catch (e) {
    console.error('Error agregando nota en Kommo:', e);
  }
}

function mergeTags(existingTags, newTagName) {
  const tags = (existingTags || []).map(t => ({ name: t.name }));
  if (!tags.some(t => t.name === newTagName)) {
    tags.push({ name: newTagName });
  }
  return tags;
}
