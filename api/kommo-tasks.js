/**
 * Endpoint Serverless: Sincronización de Tareas de Kommo a GoHighLevel (GHL)
 * Bloquea la disponibilidad en los calendarios de GHL cuando Cristina o Iván crean tareas en Kommo.
 * 
 * - Si la tarea es para "Todo el día" (23:59 o tipo "Bloqueado"), bloquea el día completo (00:00 a 23:59).
 * - Si la tarea tiene horario/duración específica (media hora, una hora, etc.), bloquea exactamente ese bloque.
 * - Si la tarea se completa o se elimina en Kommo, remueve el bloqueo en GHL.
 * - Omite tareas de citas generadas por GHL (Demo Kommo, Capacitación) para evitar duplicidades.
 * 
 * URL: https://integracion-ghl-kommo.vercel.app/api/kommo-tasks
 */

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || '1asolucionesvirtuales';
const KOMMO_TOKEN = process.env.KOMMO_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijg4YjVkM2YxNTE5ZTdjMGM4YmMzMGRjNmNhNzc5OWU0ZmI3NWM3OGQ1MTg0NWZlMmY0YzkzZGM4ZTM5ZGYwNTBhMzZhN2VmYmZiNGYwY2E3In0.eyJhdWQiOiJiZDdjMDlhYy02OWNhLTQ5MjktYjFlMi1lZDg5MjU4MjI3MjIiLCJqdGkiOiI4OGI1ZDNmMTUxOWU3YzBjOGJjMzBkYzZjYTc3OTllNGZiNzVjNzhkNTE4NDVmZTJmNGM5M2RjOGUzOWRmMDUwYTM2YTdlZmJmYjRmMGNhNyIsImlhdCI6MTc5MDYzNDA2MSwibmJmIjoxNzkwNjM0MDYxLCJleHAiOjE5MjQ5MDU2MDAsInN1YiI6IjczMDYxNjkiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjk2Mjg3MzcsImJhc2VfZG9tYWluIjoia29tbW8uY29tIiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImxpc3RfZXh0ZXJuYWxfbWVzc2FnZXMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJzZW5kX2V4dGVybmFsX21lc3NhZ2VzIl0sImhhc2hfdXVpZCI6IjBhYzQ3ZjNkLTc2YmItNDY0YS1iMmVlLWEzYjA4ZjRjNGRiMiIsImFwaV9kb21haW4iOiJhcGktYy5rb21tby5jb20ifQ.KGt1iFAyjXcvf9UKYRyRugfMgqSwB_JcERZ3tRh6bIaugXb9LTSvZQyoNlFDop7C2Naj2dX2wEXdCeo2n9m-HpJAwlLVIGNGrfK1PNVHbVLdgCNWCzDeIZObA_ivBN4ETV2PUevJb8EVMFDXYaQo4xwynsEbt3At-lKne_ZiIOKUaUToQ9lsE8VUqr4LIvkyIp0uqTjavDNcB4q0b07y0xjhwiW7hatynSu2Bvl4bIwL4qJ3JOfCxlPtzy6JGbYyGdr4rYFMVtD97IncCUGJDHk54ALjNsLcbmMWgS9Az1eZ5lrelz0kCIzwbztD6PsionsK0IyJl0T9vmlw39ubyQ';
const GHL_TOKEN = process.env.GHL_TOKEN || 'pit-8c6e43e2-cc22-405c-bdfc-2ed26221954a';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'cPUAy47pw5ViqH06T63U';

// Mapeo de usuarios Kommo <-> GoHighLevel
const USER_MAPPING = {
  '7306169': 'mKFMMIOboPnMktIEP8tm',  // Cristina Orozco
  '10095483': 'SJAtUAv8tGmB66cwwpEk', // Iván Lalinde
};

// Tareas generadas automáticamente por GHL para citas que no deben crear bloqueos duplicados
const EXCLUDED_TASK_TYPES = [
  2913803, // Demo Kommo
  2852135  // Capacitación
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  // Verificación / Health Check o Sync Manual
  if (req.method === 'GET') {
    if (req.query && req.query.sync_all === 'true') {
      try {
        const results = await syncAllActiveKommoTasks();
        return res.status(200).json({
          status: 'ok',
          message: 'Sincronización completa de tareas activas de Kommo a GHL realizada.',
          results
        });
      } catch (syncErr) {
        return res.status(500).json({ status: 'error', message: syncErr.message });
      }
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Endpoint de bloqueo automático de calendarios GHL desde tareas de Kommo activo.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = require('querystring').parse(body);
      }
    }

    console.log('Incoming Kommo Task Webhook:', JSON.stringify(body));

    const taskEvents = extractTasksFromPayload(body);
    console.log(`[Kommo Tasks] Eventos extraídos: ${taskEvents.length}`, JSON.stringify(taskEvents));

    if (taskEvents.length === 0) {
      return res.status(200).json({
        status: 'ok',
        message: 'No se detectaron tareas para procesar en el payload.'
      });
    }

    const processed = [];

    for (const ev of taskEvents) {
      const { action, id } = ev;
      const result = await processTaskEvent(action, id, ev.task);
      processed.push({ taskId: id, action, result });
    }

    return res.status(200).json({
      status: 'ok',
      processed
    });

  } catch (err) {
    console.error('Error general procesando webhook de tareas de Kommo:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

/**
 * Procesa un evento individual de tarea (add, update, delete)
 */
async function processTaskEvent(action, taskId, rawTaskData) {
  try {
    // Si la acción es eliminación directa en el webhook
    if (action === 'delete') {
      console.log(`[Kommo Task #${taskId}] Evento DELETE recibido. Eliminando bloqueo en GHL...`);
      const removed = await removeGhlBlockSlotByTaskId(taskId);
      return { status: 'deleted_from_ghl', removed };
    }

    // Consultar el estado más reciente de la tarea en la API de Kommo
    const task = await fetchKommoTask(taskId);

    // Si la tarea ya no existe en Kommo (404), remover bloqueo en GHL
    if (!task) {
      console.log(`[Kommo Task #${taskId}] Tarea no encontrada en Kommo (404). Eliminando bloqueo en GHL...`);
      const removed = await removeGhlBlockSlotByTaskId(taskId);
      return { status: 'task_not_found_removed_block', removed };
    }

    // Validar usuario responsable
    const responsibleUserId = String(task.responsible_user_id || '');
    const ghlUserId = USER_MAPPING[responsibleUserId];
    if (!ghlUserId) {
      console.log(`[Kommo Task #${taskId}] Usuario Kommo [${responsibleUserId}] no está en USER_MAPPING. Se omite.`);
      return { status: 'ignored_unmapped_user', responsibleUserId };
    }

    // Si la tarea fue completada en Kommo, liberar el horario en GHL
    if (task.is_completed) {
      console.log(`[Kommo Task #${taskId}] Tarea marcada como completada en Kommo. Liberando horario en GHL...`);
      const removed = await removeGhlBlockSlotByTaskId(taskId, ghlUserId);
      return { status: 'completed_task_block_removed', removed };
    }

    // Omitir tareas de citas creadas por GoHighLevel para evitar sobreescribir o duplicar
    if (isGhlAppointmentTask(task)) {
      console.log(`[Kommo Task #${taskId}] Tarea de cita GHL detectada ("${task.text}"). Se omite para no duplicar.`);
      return { status: 'ignored_ghl_appointment_task', text: task.text };
    }

    // Calcular inicio y fin del bloqueo según fecha, hora y duración
    const blockTimes = calculateBlockTimes(task);
    if (!blockTimes) {
      console.warn(`[Kommo Task #${taskId}] No se pudo calcular tiempo de bloqueo (complete_till: ${task.complete_till}).`);
      return { status: 'invalid_times', complete_till: task.complete_till };
    }

    // Crear o actualizar el bloqueo en GHL
    const blockTitle = `[Kommo #${task.id}] ${cleanTaskText(task.text)}`;
    console.log(`[Kommo Task #${taskId}] Creando/actualizando bloqueo en GHL: "${blockTitle}" (${blockTimes.startTime} a ${blockTimes.endTime}) para usuario GHL [${ghlUserId}]`);

    // 1. Remover cualquier bloqueo anterior de esta misma tarea para no duplicar
    await removeGhlBlockSlotByTaskId(taskId, ghlUserId);

    // 2. Crear el nuevo bloqueo en GHL
    const ghlBlock = await createGhlBlockSlot({
      locationId: GHL_LOCATION_ID,
      assignedUserId: ghlUserId,
      title: blockTitle,
      startTime: blockTimes.startTime,
      endTime: blockTimes.endTime
    });

    return {
      status: 'block_created',
      ghlBlockId: ghlBlock.id,
      assignedUserId: ghlUserId,
      startTime: blockTimes.startTime,
      endTime: blockTimes.endTime,
      isAllDay: blockTimes.isAllDay
    };

  } catch (e) {
    console.error(`[Kommo Task #${taskId}] Error procesando tarea:`, e);
    return { status: 'error', message: e.message };
  }
}

/**
 * Consulta los datos autoritativos de la tarea en Kommo
 */
async function fetchKommoTask(taskId) {
  try {
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks/${taskId}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${KOMMO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[Kommo API] Error consultando tarea ${taskId}: HTTP ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[Kommo API] Error en fetchKommoTask(${taskId}):`, err);
    return null;
  }
}

/**
 * Detecta si una tarea corresponde a una cita de GHL
 */
function isGhlAppointmentTask(task) {
  if (EXCLUDED_TASK_TYPES.includes(task.task_type_id)) return true;
  const text = (task.text || '').toLowerCase();
  if (text.includes('demo kommo - cita')) return true;
  if (text.includes('cita diagnstico') || text.includes('cita diagnostico') || text.includes('cita diagnstico')) return true;
  if (text.includes('capacitacin - asesora') || text.includes('capacitacion - asesoria')) return true;
  return false;
}

/**
 * Limpia y recorta el texto de la tarea para el título de GHL
 */
function cleanTaskText(text) {
  if (!text) return 'Bloqueo';
  const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
  return clean.length > 70 ? clean.substring(0, 70) + '...' : clean;
}

/**
 * Calcula fechas ISO 8601 en zona horaria de Colombia (UTC-5)
 */
function calculateBlockTimes(task) {
  const completeTillSec = Number(task.complete_till);
  if (!completeTillSec || isNaN(completeTillSec)) return null;

  // Colombia es estrictamente UTC-5 sin cambio de horario (DST)
  const COL_OFFSET_MS = -5 * 60 * 60 * 1000;
  const taskDateCol = new Date(completeTillSec * 1000 + COL_OFFSET_MS);

  const colHour = taskDateCol.getUTCHours();
  const colMin = taskDateCol.getUTCMinutes();

  const y = taskDateCol.getUTCFullYear();
  const m = String(taskDateCol.getUTCMonth() + 1).padStart(2, '0');
  const d = String(taskDateCol.getUTCDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  // Se considera "Todo el día" si Kommo la colocó a las 23:58/23:59 o si es tipo "Bloqueado" sin hora específica
  const isAllDay = (colHour === 23 && colMin >= 58) || (task.task_type_id === 3669360 && (!task.duration || task.duration >= 86400));

  if (isAllDay) {
    return {
      isAllDay: true,
      startTime: `${dateStr}T00:00:00-05:00`,
      endTime: `${dateStr}T23:59:59-05:00`
    };
  }

  // Tarea con horario específico: complete_till es la hora fijada
  const h = String(colHour).padStart(2, '0');
  const min = String(colMin).padStart(2, '0');
  const s = String(taskDateCol.getUTCSeconds()).padStart(2, '0');
  const startTime = `${dateStr}T${h}:${min}:${s}-05:00`;

  // Duración en segundos: si es 0 o no viene, usar por defecto 3600 (1 hora)
  const durationSec = (task.duration && task.duration > 0) ? Number(task.duration) : 3600;
  const endTimestampMs = (completeTillSec + durationSec) * 1000;
  const endDateCol = new Date(endTimestampMs + COL_OFFSET_MS);

  const endY = endDateCol.getUTCFullYear();
  const endM = String(endDateCol.getUTCMonth() + 1).padStart(2, '0');
  const endD = String(endDateCol.getUTCDate()).padStart(2, '0');
  const endH = String(endDateCol.getUTCHours()).padStart(2, '0');
  const endMin = String(endDateCol.getUTCMinutes()).padStart(2, '0');
  const endS = String(endDateCol.getUTCSeconds()).padStart(2, '0');
  const endTime = `${endY}-${endM}-${endD}T${endH}:${endMin}:${endS}-05:00`;

  return {
    isAllDay: false,
    startTime,
    endTime
  };
}

/**
 * Crea un Block Slot en GoHighLevel mediante su API oficial v2
 */
async function createGhlBlockSlot(blockData) {
  const url = 'https://services.leadconnectorhq.com/calendars/events/block-slots';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GHL_TOKEN}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(blockData)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GHL Block-Slots API error (${res.status}): ${data.message || res.statusText}`);
  }

  return data;
}

/**
 * Busca y elimina bloqueos en GHL correspondientes a una tarea de Kommo
 */
async function removeGhlBlockSlotByTaskId(taskId, specificGhlUserId = null) {
  const removedIds = [];
  try {
    const usersToCheck = specificGhlUserId 
      ? [specificGhlUserId] 
      : Object.values(USER_MAPPING);

    const now = Date.now();
    const startMs = now - (7 * 24 * 60 * 60 * 1000);   // Desde hace 7 días
    const endMs = now + (90 * 24 * 60 * 60 * 1000);    // Hasta 90 días adelante

    const searchTag = `[Kommo #${taskId}]`;

    for (const userId of usersToCheck) {
      const getUrl = `https://services.leadconnectorhq.com/calendars/blocked-slots?locationId=${GHL_LOCATION_ID}&userId=${userId}&startTime=${startMs}&endTime=${endMs}`;
      const getRes = await fetch(getUrl, {
        headers: {
          'Authorization': `Bearer ${GHL_TOKEN}`,
          'Version': '2021-07-28',
          'Accept': 'application/json'
        }
      });

      if (!getRes.ok) continue;
      const data = await getRes.json().catch(() => ({}));
      const events = data.events || [];

      for (const ev of events) {
        if (ev.title && ev.title.includes(searchTag)) {
          console.log(`[Kommo Task #${taskId}] Eliminando bloqueo GHL anterior: "${ev.title}" (ID: ${ev.id})`);
          const delUrl = `https://services.leadconnectorhq.com/calendars/events/${ev.id}`;
          const delRes = await fetch(delUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${GHL_TOKEN}`,
              'Version': '2021-07-28',
              'Accept': 'application/json'
            }
          });

          if (delRes.ok) {
            removedIds.push(ev.id);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error buscando/eliminando bloqueos GHL para tarea [${taskId}]:`, err);
  }

  return removedIds;
}

/**
 * Extrae tareas y acciones del payload de webhook de Kommo (JSON o URL-encoded)
 */
function extractTasksFromPayload(body) {
  const tasks = [];

  // 1. Si viene como objeto estructurado: body.task.add, body.task.update, body.task.delete
  if (body && body.task && typeof body.task === 'object') {
    for (const action of ['add', 'update', 'delete']) {
      const list = body.task[action];
      if (Array.isArray(list)) {
        for (const t of list) {
          if (t && t.id) {
            tasks.push({ action, id: String(t.id), task: t });
          }
        }
      }
    }
  }

  // 2. Si viene aplanado o url-encoded: task[add][0][id], task[update][0][id], etc.
  for (const key of Object.keys(body)) {
    const match = key.match(/^task\[(add|update|delete)\]\[(\d+)\]\[id\]$/);
    if (match) {
      const action = match[1];
      const index = match[2];
      const id = String(body[key]);
      if (id && !tasks.some(t => t.id === id && t.action === action)) {
        const prefix = `task[${action}][${index}]`;
        const taskObj = {
          id,
          responsible_user_id: body[`${prefix}[responsible_user_id]`],
          complete_till: body[`${prefix}[complete_till]`],
          text: body[`${prefix}[text]`],
          task_type_id: body[`${prefix}[task_type_id]`],
          is_completed: body[`${prefix}[is_completed]`] === '1' || body[`${prefix}[is_completed]`] === true
        };
        tasks.push({ action, id, task: taskObj });
      }
    }
  }

  // 3. Soporte para pruebas directas: { action: 'add', taskId: 12345 }
  if (tasks.length === 0 && (body.taskId || body.id)) {
    const id = String(body.taskId || body.id);
    const action = body.action || 'update';
    tasks.push({ action, id, task: body });
  }

  return tasks;
}

/**
 * Sincronización masiva de todas las tareas activas actuales en Kommo hacia GHL
 */
async function syncAllActiveKommoTasks() {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks?filter[is_completed]=0&limit=250`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Error consultando tareas activas en Kommo: HTTP ${res.status}`);
  }

  const data = await res.json();
  const tasks = data._embedded?.tasks || [];
  const results = [];

  for (const task of tasks) {
    const respId = String(task.responsible_user_id || '');
    if (!USER_MAPPING[respId]) continue;
    if (isGhlAppointmentTask(task)) continue;

    const blockRes = await processTaskEvent('update', task.id, task);
    results.push({ taskId: task.id, text: task.text, user: respId, blockRes });
  }

  return results;
}
