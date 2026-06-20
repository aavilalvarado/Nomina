// AGREGAR ESTA FUNCIÓN a pages/api/abrir-semana.js
// Llamarla al final de handler(), ANTES de abrir la nueva semana,
// para consolidar la semana que CIERRA (jueves)

// Mapeo de día de la semana a nombre de columna en tabla `asistencias`
const DIA_A_COLUMNA = {
  5: 'viernes',   // viernes
  6: 'sabado',    // sábado
  0: 'domingo',   // domingo
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
}

async function consolidarSemanaQueCierra(supabase) {
  // La semana que cierra es la que está 'abierta' en este momento
  const { data: semanas } = await supabase
    .from('semanas')
    .select('*')
    .eq('estado', 'abierta')
    .order('fecha_inicio', { ascending: false })
    .limit(1)

  if (!semanas || semanas.length === 0) return

  const sem = semanas[0]
  const fechaInicio = new Date(sem.fecha_inicio) // viernes
  const fechaFin    = new Date(sem.fecha_fin)    // jueves

  // Obtener todos los registros de asistencia_diaria de esta semana
  const { data: registros } = await supabase
    .from('asistencia_diaria')
    .select('trabajador_id, obra_id, fecha, valor')
    .gte('fecha', sem.fecha_inicio)
    .lte('fecha', sem.fecha_fin)

  if (!registros || registros.length === 0) return

  // Agrupar por trabajador + obra
  const grupos = {}
  for (const r of registros) {
    const key = `${r.trabajador_id}__${r.obra_id}`
    if (!grupos[key]) grupos[key] = { trabajador_id: r.trabajador_id, obra_id: r.obra_id, dias: {} }
    const fecha = new Date(r.fecha)
    const diaSemana = fecha.getUTCDay()
    const columna = DIA_A_COLUMNA[diaSemana]
    if (columna) grupos[key].dias[columna] = parseFloat(r.valor)
  }

  // Obtener trabajadores para saber si tienen bono y puesto
  const trabajadorIds = [...new Set(registros.map(r => r.trabajador_id))]
  const { data: trabajadores } = await supabase
    .from('trabajadores')
    .select('id, tiene_bono')
    .in('id', trabajadorIds)
  const trabMap = {}
  ;(trabajadores || []).forEach(t => { trabMap[t.id] = t })

  // Para cada grupo, upsert en nominas_obra + asistencias
  for (const grupo of Object.values(grupos)) {
    const { trabajador_id, obra_id, dias } = grupo

    // Buscar o crear nomina_obra para esta semana/obra
    let { data: nomina } = await supabase
      .from('nominas_obra')
      .select('id, estado')
      .eq('semana_id', sem.id)
      .eq('obra_id', obra_id)
      .single()

    if (!nomina) {
      const { data: nueva } = await supabase
        .from('nominas_obra')
        .insert({ semana_id: sem.id, obra_id })
        .select()
        .single()
      nomina = nueva
    }

    // Si la nómina ya fue enviada/aprobada, no sobreescribir
    if (nomina?.estado && nomina.estado !== 'borrador') continue

    const viernes   = dias.viernes   ?? 1.1
    const sabado    = dias.sabado    ?? 0.5
    const domingo   = dias.domingo   ?? 0
    const lunes     = dias.lunes     ?? 1.1
    const martes    = dias.martes    ?? 1.1
    const miercoles = dias.miercoles ?? 1.1
    const jueves    = dias.jueves    ?? 1.1

    const DIAS_COLS = [viernes, sabado, domingo, lunes, martes, miercoles, jueves]
    const dias_total = Math.round(DIAS_COLS.reduce((s, v) => s + v, 0) * 10) / 10

    const trab = trabMap[trabajador_id]
    const bono_aplicado = (trab?.tiene_bono && dias_total >= 6) ? 1 : 0

    await supabase
      .from('asistencias')
      .upsert({
        nomina_obra_id: nomina.id,
        trabajador_id,
        viernes, sabado, domingo, lunes, martes, miercoles, jueves,
        dias_total,
        horas_extra: 0,
        prestamos: 0,
        bono_aplicado,
        total_pagar: 0
      }, { onConflict: 'nomina_obra_id,trabajador_id' })
  }

  console.log(`[consolidar] Semana ${sem.semana_num} consolidada: ${Object.keys(grupos).length} registros`)
}

// ─── MODIFICACIÓN A handler() en abrir-semana.js ───────────────────────────
//
// export default async function handler(req, res) {
//   ...tu código existente...
//
//   // AGREGAR ANTES de crear la nueva semana:
//   await consolidarSemanaQueCierra(supabase)
//
//   // ...resto del código que crea la nueva semana...
// }
//
// Y exportar la función si la mueves a un archivo separado:
// export { consolidarSemanaQueCierra }
