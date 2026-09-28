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

// Mapeo opcional de IDs de usuario de GoHighLevel (GHL) -> Kommo
const GHL_USER_MAP = {};

// Etiqueta oficial
const TAG_CITA_AGENDADA = 'Cita Agendada';

// Almacenamiento en memoria para depuración y descarte de duplicados
let lastWebhookReceived = null;
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
      timestamp: new Date().toISOString(),
      lastWebhook: req.query.debug === '1' ? lastWebhookReceived : undefined
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    lastWebhookReceived = {
      receivedAt: new Date().toISOString(),
      headers: req.headers,
      body: payload
    };
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

    // Sincronizar en Kommo garantizando disponibilidad de campos antes del bot
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
      assignedUserId: determineAssignedAdvisor(payload, fullText)
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
      assignedUserId: determineAssignedAdvisor(payload, fullText)
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
      assignedUserId: determineAssignedAdvisor(payload, fullText)
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

  // Por defecto: Ventas CRM
  return {
    scenario: 'ventas',
    pipelineId: PIPELINE_VENTAS_ID,
    stageId: STAGE_REUNION_INICIAL_ID,
    moveStage: true,
    enumCitaId: ENUM_VENTA_60MIN,
    taskTypeId: TASK_TYPE_DEMO_KOMMO,
    taskTitle: 'Demo Kommo - Cita de Venta',
    assignedUserId: determineAssignedAdvisor(payload, fullText)
  };
}

/**
 * Determina el asesor asignado buscando en Custom Data de GHL o campos de staff de la cita
 * (Evita buscar en el texto completo para no confundir el nombre del cliente con el asesor)
 */
function determineAssignedAdvisor(payload, fullText) {
  // 1. Extraer posibles valores del asesor de Custom Data y campos específicos de staff/cita
  const customData = payload.customData || {};
  const customDataValues = Object.entries(customData)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');

  const appt = payload.appointment || payload.calendar || {};
  const userObj = payload.user || {};

  const candidates = [
    customDataValues,
    payload.assigned_user,
    payload.assigned_user_name,
    payload.assigned_user_email,
    payload.assigned_user_id,
    payload.assignedUserId,
    payload.userId,
    payload.user_id,
    payload.staff_id,
    payload.staff_name,
    payload.staff_email,
    appt.assigned_user,
    appt.assigned_user_name,
    appt.assigned_user_email,
    appt.assigned_user_id,
    appt.assignedUserId,
    appt.userId,
    appt.user_id,
    appt.staffId,
    appt.selectedUser,
    userObj.id,
    userObj.name,
    userObj.email
  ];

  if (Array.isArray(appt.users)) {
    appt.users.forEach(u => candidates.push(typeof u === 'string' ? u : (u.id || u.email || u.name)));
  }

  // 1.1 Revisar mapa directo de IDs de GHL si se configuró
  for (const c of candidates) {
    if (c && GHL_USER_MAP[String(c)]) return GHL_USER_MAP[String(c)];
  }

  // 1.2 Normalizar texto de los candidatos quitando tildes (ej. Iván -> ivan)
  const advisorText = candidates
    .filter(Boolean)
    .join(' ')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Comprobar si los datos de la cita/Custom Data señalan a Iván Lalinde
  if (
    advisorText.includes('ivan') ||
    advisorText.includes('lalinde') ||
    advisorText.includes('ivan.lalinde') ||
    advisorText.includes('ivan.lalinde@1asolucionesvirtuales.com')
  ) {
    console.log('Asesor detectado por Custom Data / Staff: Iván Lalinde');
    return USER_IVAN;
  }

  // Comprobar si los datos de la cita/Custom Data señalan a Cristina Orozco
  if (
    advisorText.includes('cristina') ||
    advisorText.includes('consultas@1asolucionesvirtuales.com')
  ) {
    console.log('Asesor detectado por Custom Data / Staff: Cristina Orozco');
    return USER_CRISTINA;
  }

  // 2. Si no vino en Custom Data ni campos de staff, revisar si el nombre del calendario especifica asesor
  const calendarIdentifier = ((appt.calendarName || '') + ' ' + (appt.id || ''))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (calendarIdentifier.includes('ivan') || calendarIdentifier.includes('lalinde') || calendarIdentifier.includes('-il-')) {
    console.log('Asesor detectado por nombre de calendario: Iván Lalinde');
    return USER_IVAN;
  }
  if (calendarIdentifier.includes('cris') || calendarIdentifier.includes('-co-')) {
    console.log('Asesor detectado por nombre de calendario: Cristina Orozco');
    return USER_CRISTINA;
  }

  // Por defecto (en agendas de distribución aleatoria donde aún no se mapeó Custom Data en GHL)
  console.log('Asesor no encontrado en Custom Data ni calendario. Se asigna Cristina Orozco por defecto.');
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
  let startTimeUnix = parseAppointmentTimestamp(startTimeRaw);

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
 * Parsea la fecha de la cita garantizando que la hora elegida (ej. 9:00 AM)
 * corresponda exactamente a la hora local en Colombia (America/Bogota, UTC-5)
 */
function parseAppointmentTimestamp(rawDateStr) {
  if (!rawDateStr) return Math.floor(Date.now() / 1000);

  if (typeof rawDateStr === 'number') {
    return rawDateStr > 1e11 ? Math.floor(rawDateStr / 1000) : rawDateStr;
  }

  const str = String(rawDateStr).trim();

  // Capturar fecha y hora: YYYY-MM-DDTHH:mm:ss o YYYY-MM-DD HH:mm:ss
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(.*)?$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // Base 0
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const min = parseInt(match[5], 10);
    const sec = parseInt(match[6] || '0', 10);
    const tzPart = (match[7] || '').trim();

    // Si viene con un offset explícito diferente de UTC/Z (ej: -05:00)
    const offsetMatch = tzPart.match(/^([+-])(\d{2}):?(\d{2})?$/);
    if (offsetMatch && !(offsetMatch[1] === '+' && offsetMatch[2] === '00')) {
      const sign = offsetMatch[1] === '+' ? 1 : -1;
      const offHours = parseInt(offsetMatch[2], 10);
      const offMins = parseInt(offsetMatch[3] || '0', 10);
      const totalOffsetMs = sign * (offHours * 60 + offMins) * 60 * 1000;
      const localUtc = Date.UTC(year, month, day, hour, min, sec);
      return Math.floor((localUtc - totalOffsetMs) / 1000);
    }

    // Si viene sin offset o con 'Z' (cuando el servidor o GHL envía la hora local con 'Z'):
    // La hora seleccionada (ej. 9:00 AM) es la hora en Colombia (America/Bogota, UTC-5).
    // Para que Kommo muestre exactamente 09:00 AM, el timestamp UTC debe ser (hour + 5).
    const bogotaUtcMs = Date.UTC(year, month, day, hour + 5, min, sec);
    return Math.floor(bogotaUtcMs / 1000);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Math.floor(parsed.getTime() / 1000);
  }

  return Math.floor(Date.now() / 1000);
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
      console.log(`Actualizando responsable del contacto [${contact.id}] a [${config.assignedUserId}]...`);
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
    console.log(`[PASO 1] Guardando campos personalizados en Lead activo [${leadId}]...`);

    // PASO 1: Guardar primero los campos personalizados, etiquetas y asesor responsable
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
    console.log(`No se encontró Lead activo en el embudo [${config.pipelineId}] para el contacto [${contactId}]. Creando nuevo Lead...`);

    // Crear nuevo lead con todos los campos ya diligenciados
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
    console.log(`Nuevo Lead creado en Kommo: [${leadId}]`);
  }

  // 4. Crear la Tarea correspondiente en Kommo
  let taskText = config.taskTitle;
  if (config.scenario === 'activos' && appointmentData.notes) {
    taskText = `📌 Capacitación GHL: ${appointmentData.notes}`;
  }

  await createTask(leadId, config.assignedUserId, config.taskTypeId, timestampCita, taskText, headers);

  // 5. Dejar una Nota informativa en el Lead
  const formattedDate = new Date(timestampCita * 1000).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const noteContent = `📅 Cita agendada desde GoHighLevel (GHL)\n• Fecha/Hora: ${formattedDate}\n• Enlace de la sala: ${appointmentData.meetingLink || 'No indicado'}\n• Tipo: ${config.taskTitle}\n• Asesor: ${config.assignedUserId === USER_IVAN ? 'Ivan Lalinde' : 'Cristina Orozco'}\n• Notas del cliente: ${appointmentData.notes || 'Ninguna'}`;
  await addNote(leadId, noteContent, headers);

  return {
    contactId,
    leadId,
    assignedUserId: config.assignedUserId,
    scenario: config.scenario,
    appointmentTime: formattedDate
  };
}

/**
 * Busca contacto por teléfono (múltiples variantes con prefijo internacional) o por correo electrónico
 */
async function searchContact(phone, email, headers) {
  if (phone) {
    const cleanDigits = phone.replace(/[^\d]/g, '');
    const phoneQueries = [cleanDigits];

    // Si es un número colombiano de 10 dígitos (ej. 3133931654)
    if (cleanDigits.length === 10 && cleanDigits.startsWith('3')) {
      phoneQueries.push(`+57${cleanDigits}`);
      phoneQueries.push(`57${cleanDigits}`);
    } else if (cleanDigits.startsWith('57') && cleanDigits.length === 12) {
      phoneQueries.push(`+${cleanDigits}`);
      phoneQueries.push(cleanDigits.substring(2));
    }

    for (const q of phoneQueries) {
      try {
        const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data._embedded?.contacts?.length > 0) {
            return data._embedded.contacts[0];
          }
        }
      } catch (err) {
        console.warn(`Error buscando contacto con teléfono ${q}:`, err.message);
      }
    }
  }

  if (email) {
    try {
      const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${encodeURIComponent(email)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data._embedded?.contacts?.length > 0) {
          return data._embedded.contacts[0];
        }
      }
    } catch (err) {
      console.warn(`Error buscando contacto con email ${email}:`, err.message);
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

/**
 * Busca si el contacto tiene un Lead ACTIVO en el pipeline indicado
 * Evita retornar leads de otros contactos o leads cerrados/ganados/perdidos
 */
async function findLeadForContact(contactId, pipelineId, headers) {
  try {
    // 1. Obtener leads asociados al contacto específico
    const contactUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts/${contactId}?with=leads`;
    const contactRes = await fetch(contactUrl, { headers });
    if (!contactRes.ok) return null;

    const contactData = await contactRes.json();
    const contactLeads = contactData._embedded?.leads || [];
    if (contactLeads.length === 0) return null;

    // 2. Consultar únicamente los leads vinculados a este contacto
    const leadIds = contactLeads.map(l => l.id);
    const filterQuery = leadIds.map(id => `filter[id][]=${id}`).join('&');
    const leadsUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads?${filterQuery}&with=contacts`;
    const leadsRes = await fetch(leadsUrl, { headers });
    if (!leadsRes.ok) return null;

    const leadsData = await leadsRes.json();
    const leads = leadsData._embedded?.leads || [];

    // 3. Buscar lead activo en el pipeline (que no esté cerrado ni en pérdida)
    const activeLead = leads.find(l =>
      l.pipeline_id === pipelineId &&
      l.status_id !== 142 && // No ganado
      l.status_id !== 143    // No perdido
    );

    if (activeLead) {
      console.log(`Lead activo encontrado para contacto [${contactId}]: [${activeLead.id}] ${activeLead.name}`);
      return activeLead;
    }

    console.log(`Contacto [${contactId}] no tiene leads activos en pipeline [${pipelineId}].`);
    return null;
  } catch (e) {
    console.error('Error buscando lead para contacto:', e);
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
    console.log(`Tarea [${taskTypeId}] creada en lead ${leadId} para el asesor ${responsibleUserId}`);
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
