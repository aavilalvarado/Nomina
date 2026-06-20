// pages/api/asistencia-diaria.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { registros, capturado_por } = req.body
  // registros: [{ trabajador_id, obra_id, fecha, valor }]

  if (!registros || !Array.isArray(registros)) {
    return res.status(400).json({ error: 'registros requeridos' })
  }

  const alertas = [] // trabajadores que llegaron a 3 faltas

  for (const r of registros) {
    const { trabajador_id, obra_id, fecha, valor } = r

    // Upsert asistencia del día
    const { error } = await supabase
      .from('asistencia_diaria')
      .upsert({
        trabajador_id,
        obra_id,
        fecha,
        valor: parseFloat(valor),
        capturado_por,
        updated_at: new Date().toISOString()
      }, { onConflict: 'trabajador_id,fecha' })

    if (error) {
      console.error('Error upsert asistencia_diaria:', error)
      continue
    }

    // Si es falta (0), contar faltas en los últimos 30 días
    if (parseFloat(valor) === 0) {
      const hace30 = new Date()
      hace30.setDate(hace30.getDate() - 30)
      const fechaLimite = hace30.toISOString().split('T')[0]

      const { data: faltas } = await supabase
        .from('asistencia_diaria')
        .select('id')
        .eq('trabajador_id', trabajador_id)
        .eq('valor', 0)
        .gte('fecha', fechaLimite)

      const totalFaltas = (faltas || []).length

      if (totalFaltas >= 3) {
        // Obtener nombre del trabajador y obra para la notificación
        const { data: trab } = await supabase
          .from('trabajadores')
          .select('nombre')
          .eq('id', trabajador_id)
          .single()

        const { data: obra } = await supabase
          .from('obras')
          .select('nombre')
          .eq('id', obra_id)
          .single()

        alertas.push({
          trabajador_id,
          nombre: trab?.nombre || 'Trabajador',
          obra: obra?.nombre || 'Obra',
          totalFaltas,
          fecha
        })
      }
    }
  }

  // Enviar notificaciones WhatsApp para cada alerta
  for (const alerta of alertas) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notificar-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'faltas_acumuladas',
          trabajador: alerta.nombre,
          obra: alerta.obra,
          totalFaltas: alerta.totalFaltas,
          fecha: alerta.fecha
        })
      })
    } catch (e) {
      console.error('Error notificando WhatsApp:', e)
    }
  }

  return res.status(200).json({ ok: true, alertas })
}
