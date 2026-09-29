/**
 * Endpoint Serverless: Cancelar Cita en GoHighLevel (GHL) desde Kommo CRM
 * Invocable desde Kommo Salesbot al hacer clic en "Cancelar cita"
 * URL: https://integracion-ghl-kommo.vercel.app/api/cancel-appointment
 */

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || '1asolucionesvirtuales';
const KOMMO_TOKEN = process.env.KOMMO_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijg4YjVkM2YxNTE5ZTdjMGM4YmMzMGRjNmNhNzc5OWU0ZmI3NWM3OGQ1MTg0NWZlMmY0YzkzZGM4ZTM5ZGYwNTBhMzZhN2VmYmZiNGYwY2E3In0.eyJhdWQiOiJiZDdjMDlhYy02OWNhLTQ5MjktYjFlMi1lZDg5MjU4MjI3MjIiLCJqdGkiOiI4OGI1ZDNmMTUxOWU3YzBjOGJjMzBkYzZjYTc3OTllNGZiNzVjNzhkNTE4NDVmZTJmNGM5M2RjOGUzOWRmMDUwYTM2YTdlZmJmYjRmMGNhNyIsImlhdCI6MTc5MDYzNDA2MSwibmJmIjoxNzkwNjM0MDYxLCJleHAiOjE5MjQ5MDU2MDAsInN1YiI6IjczMDYxNjkiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjk2Mjg3MzcsImJhc2VfZG9tYWluIjoia29tbW8uY29tIiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImxpc3RfZXh0ZXJuYWxfbWVzc2FnZXMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJzZW5kX2V4dGVybmFsX21lc3NhZ2VzIl0sImhhc2hfdXVpZCI6IjBhYzQ3ZjNkLTc2YmItNDY0YS1iMmVlLWEzYjA4ZjRjNGRiMiIsImFwaV9kb21haW4iOiJhcGktYy5rb21tby5jb20ifQ.KGt1iFAyjXcvf9UKYRyRugfMgqSwB_JcERZ3tRh6bIaugXb9LTSvZQyoNlFDop7C2Naj2dX2wEXdCeo2n9m-HpJAwlLVIGNGrfK1PNVHbVLdgCNWCzDeIZObA_ivBN4ETV2PUevJb8EVMFDXYaQo4xwynsEbt3At-lKne_ZiIOKUaUToQ9lsE8VUqr4LIvkyIp0uqTjavDNcB4q0b07y0xjhwiW7hatynSu2Bvl4bIwL4qJ3JOfCxlPtzy6JGbYyGdr4rYFMVtD97IncCUGJDHk54ALjNsLcbmMWgS9Az1eZ5lrelz0kCIzwbztD6PsionsK0IyJl0T9vmlw39ubyQ';
const GHL_TOKEN = process.env.GHL_TOKEN || 'pit-8c6e43e2-cc22-405c-bdfc-2ed26221954a';

const FIELD_ID_CITA_GHL = 1054302; // Campo personalizado en Kommo con el ID de la cita en GHL
const TASK_TYPE_DEMO_KOMMO = 2913803;
const TASK_TYPE_CAPACITACION = 2852135;
const TAG_CITA_CANCELADA = 'Cita Cancelada';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Endpoint de cancelación de citas GHL desde Kommo activo.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};
    console.log('Incoming Kommo Cancel Webhook:', JSON.stringify(body));

    // 1. Extraer ID del lead enviado por Salesbot
    let leadId = body.lead_id || body.leadId || body.id;
    if (!leadId && body['lead[id]']) leadId = body['lead[id]'];
    if (!leadId && req.query.lead_id) leadId = req.query.lead_id;

    let appointmentId = body.appointment_id || body.appointmentId || body.ghl_appointment_id;

    const kommoHeaders = {
      'Authorization': `Bearer ${KOMMO_TOKEN}`,
      'Content-Type': 'application/json'
    };

    let leadData = null;

    // 2. Si no viene el appointmentId directamente en la petición, buscarlo en Kommo
    if (leadId) {
      const leadUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}?with=contacts`;
      const leadRes = await fetch(leadUrl, { headers: kommoHeaders });
      if (leadRes.ok) {
        leadData = await leadRes.json();
        const ghlField = leadData.custom_fields_values?.find(f => f.field_id === FIELD_ID_CITA_GHL);
        if (ghlField && ghlField.values?.[0]?.value) {
          appointmentId = ghlField.values[0].value;
        }
      }
    }

    if (!appointmentId) {
      return res.status(400).json({
        status: 'error',
        message: 'No se encontró el ID de la cita de GHL en la solicitud ni en los campos del lead de Kommo.'
      });
    }

    console.log(`Cancelando cita [${appointmentId}] en GoHighLevel...`);

    // 3. Cancelar la cita en GoHighLevel mediante su API oficial v2
    const ghlUrl = `https://services.leadconnectorhq.com/calendars/events/appointments/${appointmentId}`;
    const ghlRes = await fetch(ghlUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GHL_TOKEN}`,
        'Version': '2021-04-15',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ appointmentStatus: 'cancelled' })
    });

    const ghlResponseData = await ghlRes.json().catch(() => ({}));
    console.log(`Respuesta de cancelación en GHL [${ghlRes.status}]:`, JSON.stringify(ghlResponseData));

    if (!ghlRes.ok) {
      return res.status(ghlRes.status).json({
        status: 'error',
        message: `GoHighLevel rechazó la cancelación: ${ghlResponseData.message || ghlRes.statusText}`,
        ghlResponse: ghlResponseData
      });
    }

    // 4. Actualizar Kommo: Cerrar tareas pendientes de cita, agregar etiqueta y nota
    if (leadId) {
      await updateKommoOnCancellation(leadId, appointmentId, leadData, kommoHeaders);
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Cita cancelada con éxito en GoHighLevel y Kommo CRM.',
      appointmentId,
      leadId
    });

  } catch (err) {
    console.error('Error procesando cancelación de cita:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

/**
 * Cierra tareas de cita, agrega etiqueta y deja nota informativa en Kommo
 */
async function updateKommoOnCancellation(leadId, appointmentId, leadData, headers) {
  try {
    // A. Completar tareas de Demo Kommo y Capacitación vinculadas a este lead
    const tasksUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks?filter[entity_id]=${leadId}&filter[entity_type]=leads&filter[is_completed]=0`;
    const tasksRes = await fetch(tasksUrl, { headers });
    if (tasksRes.ok) {
      const tasksData = await tasksRes.json();
      const activeTasks = tasksData._embedded?.tasks || [];
      for (const t of activeTasks) {
        if (t.task_type_id === TASK_TYPE_DEMO_KOMMO || t.task_type_id === TASK_TYPE_CAPACITACION) {
          await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/tasks/${t.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ is_completed: true })
          });
          console.log(`Tarea [${t.id}] de cita completada automáticamente en Kommo.`);
        }
      }
    }

    // B. Agregar etiqueta "Cita Cancelada" al lead
    const existingTags = (leadData?._embedded?.tags || []).map(t => ({ name: t.name }));
    if (!existingTags.some(t => t.name === TAG_CITA_CANCELADA)) {
      existingTags.push({ name: TAG_CITA_CANCELADA });
    }

    await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        _embedded: { tags: existingTags }
      })
    });

    // C. Dejar una Nota informativa en el Lead
    const noteText = `❌ CITA CANCELADA AUTOMÁTICAMENTE\n• La cita con ID [${appointmentId}] fue cancelada en GoHighLevel desde Kommo / Salesbot.\n• El horario en el calendario de GHL quedó libre inmediatamente.\n• Las tareas de cita fueron completadas automáticamente.`;
    await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          note_type: 'common',
          params: { text: noteText }
        }
      ])
    });

  } catch (e) {
    console.error('Error actualizando Kommo tras cancelación:', e);
  }
}
