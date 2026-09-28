# Integración GoHighLevel (GHL) ⇄ Kommo CRM (1A Soluciones Virtuales)

Middleware Serverless para sincronizar automáticamente las citas agendadas en GoHighLevel con **Kommo CRM**, clasificando las agendas de **Ventas CRM** y de **Clientes Activos CRM**.

---

## 🎯 Escenarios que atiende la integración

### 1. Escenario Ventas (Embudo: Ventas CRM)
* **Agendas:** 
  * Cita de Diagnóstico y Primeros Pasos (Directo)
  * Embudo Gamificado
  * Cita Reprogramada
  * Consultas Finales (2da cita - Cristina e Iván)
* **Acciones automáticas:**
  1. Busca si el contacto existe por teléfono o correo (si no existe, lo crea con nombre, teléfono, correo y empresa).
  2. Si hay invitados adicionales, los asocia a la ficha del contacto.
  3. Actualiza el campo **Enlace de la sala** (`1043530`).
  4. Coloca la fecha y hora en el campo **Citas/Seguimientos** (`1038738`).
  5. Calcula **Cita + 45 minutos** y lo guarda en **2do recordatorio** (`1046715`).
  6. Marca la opción en **Seguimiento o Cita?** (`1046709`) como *Reunión 60 min - Venta* o *Reunión 30 min - Venta Seg*.
  7. Agrega la etiqueta **`Cita Agendada`**.
  8. Mueve el lead a la etapa **`Reunion Inicial`** (incluso si estaba en etapa de Perdido).
  9. Asigna el responsable correcto (Cristina o Iván) al lead y a sus contactos asociados.
  10. Crea una tarea en Kommo de tipo **`Demo Kommo`** a la fecha y hora exacta de la cita.

### 2. Escenario Clientes Activos (Embudo: Activos CRM)
* **Agendas:** 
  * Diagnóstico Inicial Post-compra 2h (Cristina e Iván)
  * Asesorías de 1 hora (Planes Banano, Fresa, Aguacate)
  * Asesorías de 30 minutos (Planes Banano, Fresa, Aguacate)
* **Acciones automáticas:**
  1. Busca o crea el contacto y su lead en el embudo **Activos CRM**.
  2. **Respeta y NO cambia la etapa actual del lead**.
  3. Llena el enlace de la sala, fecha/hora exacta y **Cita + 45 minutos** en el 2do recordatorio.
  4. Marca la opción de asesoría correspondiente en **Seguimiento o Cita?** (2h, 1h o 30m).
  5. Agrega la etiqueta **`Cita Agendada`**.
  6. Crea una tarea en Kommo de tipo **`Capacitación`** a la hora de la cita, conteniendo las notas o respuestas del formulario de GHL (*"Detalles de la cita"*).

---

## 🚀 Despliegue en Vercel (Paso a Paso)

1. En tu cuenta de GitHub, crea un nuevo repositorio llamado:
   `integracion-ghl-kommo`
2. Sube los archivos de esta carpeta:
   * `package.json`
   * `vercel.json`
   * `README.md`
   * Carpeta `api/` con `webhook.js`
3. En [vercel.com](https://vercel.com), haz clic en **Add New... ➔ Project**.
4. Importa el repositorio `integracion-ghl-kommo` y haz clic en **Deploy**.
5. Vercel te dará una URL (ejemplo: `https://integracion-ghl-kommo.vercel.app`).

---

## ⚡ Configuración en GoHighLevel (GHL)

1. En tu cuenta de GHL, ve a **Automation ➔ Workflows**.
2. Crea o edita el Workflow de confirmación de citas (por ejemplo, el que se dispara cuando el estado de la cita es `Booked` o `Confirmed`).
3. Añade la acción **Webhook** (POST).
4. Pega tu URL de Vercel:
   `https://tu-proyecto.vercel.app/api/webhook`
5. ¡Listo! Cada vez que un cliente agende en cualquiera de tus calendarios, Kommo se actualizará en tiempo real.
