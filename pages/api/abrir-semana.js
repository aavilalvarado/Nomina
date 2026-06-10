import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  // Solo permitir GET desde Vercel Cron o POST con token
  const authHeader = req.headers.authorization
  if (req.method === 'POST' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  try {
    // Calcular la semana actual (viernes a jueves)
    const hoy = new Date()
    
    // Encontrar el viernes más reciente
    const diaSemana = hoy.getDay() // 0=dom, 1=lun, ..., 5=vie, 6=sab
    const diasDesdeViernes = diaSemana === 5 ? 0 : diaSemana === 6 ? 1 : diaSemana + 2
    
    const viernes = new Date(hoy)
    viernes.setDate(hoy.getDate() - diasDesdeViernes)
    viernes.setHours(0, 0, 0, 0)

    const jueves = new Date(viernes)
    jueves.setDate(viernes.getDate() + 6)

    const fechaInicio = viernes.toISOString().split('T')[0]
    const fechaFin = jueves.toISOString().split('T')[0]

    // Número de semana ISO
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

    // Cerrar semana anterior si está abierta
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

    console.log(`✅ Semana ${semanaNum} abierta automáticamente`)
    
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
