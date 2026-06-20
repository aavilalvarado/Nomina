import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const DIA_A_COLUMNA = {
  5: 'viernes',
  6: 'sabado',
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
}

async function consolidarSemanaQueCierra() {
  const { data: semanas } = await supabase
    .from('semanas')
    .select('*')
    .eq('estado', 'abierta')
    .order('fecha_inicio', { ascending: false })
    .limit(1)

  if (!semanas || semanas.length === 0) return

  const sem = semanas[0]

  const { data: registros } = await supabase
    .from('asistencia_diaria')
    .select('trabajador_id, obra_id, fecha, valor')
    .gte('fecha', sem.fecha_inicio)
    .lte('fecha', sem.fecha_fin)

  if (!registros || registros.length === 0) {
    console.log(`[consolidar] Semana ${sem.semana_num}: sin registros diarios, se omite`)
    return
  }

  // Agrupar por trabajador + obra
  const grupos = {}
  for (const r of registros) {
    const key = `${r.trabajador_id}__${r.obra_id}`
    if (!grupos[key]) grupos[key] = { trabajador_id: r.trabajador_id, obra_id: r.obra_id, dias: {} }
    const diaSemana = new Date(r.fecha).getUTCDay()
    const columna = DIA_A_COLUMNA[diaSemana]
    if (columna) grupos[key].dias[columna] = parseFloat(r.valor)
  }

  // Cargar trabajadores para calcular bono
  const trabIds = [...new Set(registros.map(r => r.trabajador_id))]
  const { data: trabajadores } = await supabase
    .from('trabajadores').select('id, tiene_bono').in('id', trabIds)
  const trabMap = {}
  ;(trabajadores || []).forEach(t => { trabMap[t.id] = t })

  let consolidados = 0
  for (const grupo of Object.values(grupos)) {
    const { trabajador_id, obra_id, dias } = grupo

    // Buscar o crear nomina_obra
    let { data: nomina } = await supabase
      .from('nominas_obra').select('id, estado')
      .eq('semana_id', sem.id).eq('obra_id', obra_id).single()

    if (!nomina) {
      const { data: nueva } = await supabase
        .from('nominas_obra')
        .insert({ semana_id: sem.id, obra_id })
        .select().single()
      nomina = nueva
    }

    // No sobreescribir nóminas ya enviadas/aprobadas
    if (nomina?.estado && nomina.estado !== 'borrador') continue

    const viernes   = dias.viernes   ?? 1.1
    const sabado    = dias.sabado    ?? 0.5
    const domingo   = dias.domingo   ?? 0
    const lunes     = dias.lunes     ?? 1.1
    const martes    = dias.martes    ?? 1.1
    const miercoles = dias.miercoles ?? 1.1
    const jueves    = dias.jueves    ?? 1.1

    const dias_total = Math.round(
      [viernes, sabado, domingo, lunes, martes, miercoles, jueves]
        .reduce((s, v) => s + v, 0) * 10
    ) / 10

    const trab = trabMap[trabajador_id]
    const bono_aplicado = (trab?.tiene_bono && dias_total >= 6) ? 1 : 0

    await supabase.from('asistencias').upsert({
      nomina_obra_id: nomina.id,
      trabajador_id,
      viernes, sabado, domingo, lunes, martes, miercoles, jueves,
      dias_total,
      horas_extra: 0,
      prestamos: 0,
      bono_aplicado,
      total_pagar: 0
    }, { onConflict: 'nomina_obra_id,trabajador_id' })

    consolidados++
  }

  console.log(`[consolidar] Semana ${sem.semana_num}: ${consolidados} registros consolidados a nomina`)
}

export default async function handler(req, res) {
  // Solo permitir GET desde Vercel Cron o POST con token
  const authHeader = req.headers.authorization
  if (req.method === 'POST' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  try {
    // Calcular la semana actual (viernes a jueves)
    const hoy = new Date()
    
    const diaSemana = hoy.getDay()
    const diasDesdeViernes = diaSemana === 5 ? 0 : diaSemana === 6 ? 1 : diaSemana + 2
    
    const viernes = new Date(hoy)
    viernes.setDate(hoy.getDate() - diasDesdeViernes)
    viernes.setHours(0, 0, 0, 0)

    const jueves = new Date(viernes)
    jueves.setDate(viernes.getDate() + 6)

    const fechaInicio = viernes.toISOString().split('T')[0]
    const fechaFin = jueves.toISOString().split('T')[0]

    const startOfYear = new Date(viernes.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((viernes - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
    const semanaNum = `${weekNum}-${viernes.getFullYear()}`

    // Verificar si ya existe esta semana
    const { data: existente } = await supabase
      .from('semanas')
      .select('id')
      .eq('semana_num', semanaNum)
      .single()

    if (existente) {
      return res.status(200).json({ 
        message: `Semana ${semanaNum} ya existe`,
        semana_num: semanaNum 
      })
    }

    // ✅ CONSOLIDAR asistencia_diaria → asistencias ANTES de cerrar la semana
    await consolidarSemanaQueCierra()

    // Cerrar semana anterior
    await supabase
      .from('semanas')
      .update({ estado: 'cerrada' })
      .eq('estado', 'abierta')

    // Crear nueva semana
    const { data: nueva, error } = await supabase
      .from('semanas')
      .insert({
        semana_num: semanaNum,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        estado: 'abierta'
      })
      .select()
      .single()

    if (error) throw error

    console.log(`Semana ${semanaNum} abierta automaticamente`)
    
    return res.status(200).json({
      message: `Semana ${semanaNum} abierta correctamente`,
      semana_num: semanaNum,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin
    })

  } catch (error) {
    console.error('Error al abrir semana:', error)
    return res.status(500).json({ error: error.message })
  }
}
