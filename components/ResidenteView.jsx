import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DIAS = ['viernes','sabado','domingo','lunes','martes','miercoles','jueves']
const DIAS_LABEL = ['Vie','Sáb','Dom','Lun','Mar','Mié','Jue']

// Día de hoy como columna de la semana (viernes=0 ... jueves=6)
function getDiaColumnaHoy() {
  const hoy = new Date()
  const js = hoy.getDay() // 0=dom,1=lun,...,6=sáb
  const mapa = { 5:'viernes', 6:'sabado', 0:'domingo', 1:'lunes', 2:'martes', 3:'miercoles', 4:'jueves' }
  return mapa[js] || null
}

function getFechaHoy() {
  return new Date().toISOString().split('T')[0]
}

// Retorna la fecha ISO de cada columna de la semana dado fecha_inicio (viernes)
function getFechasDeSemana(fechaInicio) {
  const base = new Date(fechaInicio)
  const fechas = {}
  DIAS.forEach((d, i) => {
    const f = new Date(base)
    f.setDate(base.getDate() + i)
    fechas[d] = f.toISOString().split('T')[0]
  })
  return fechas
}

function calcularDias(asistencia) {
  return Math.round(DIAS.reduce((sum, d) => {
    const v = parseFloat(asistencia[d])
    return sum + (isNaN(v) ? 0 : v)
  }, 0) * 10) / 10
}

const LISTA_SILVANA = [
  'MUÑIZ RIOS JUAN CARLOS','BENITEZ CARRILLO BUENA VENTURA','RAMIREZ CALDERON RAUL',
  'LOPEZ PEREZ HUMBERTO','GRANADOS MARIN LUIS ENRIQUE','LOEZA CABRERA EMANUEL OSIEL',
  'DIAZ GARCIA JOEL ESAU','VICARIO MANRIQUEZ JUAN MANUEL','HERNANDEZ CRUZ MIGUEL ANGEL',
  'NAJERA RAMIREZ ARTURO','SANDOVAL DIAZ LUIS ARMANDO','JAVALERA MEDINA ADAN FERNANDO',
  'CABRERA BECERRA GONZALO','FARRERA ALVARADO LUIS ENRIQUE','MEDINA VALENCIA JOSE LUIS',
  'GUERRERO ORTEGA SANTOS','HERRERA HERNANDEZ MAURICIO MAGDALENO','DIAZ GARCIA JOSUE JACOB',
  'VELAZQUEZ JAVALERA JUAN ANTONIO','LEMUS GARCIA ANASTACIO','RAMIREZ FLORES LEONEL',
  'RAMIREZ MARTINEZ ALAN DANIEL','MENDOZA ALFONSO CARLOS ENRIQUE',
  'ESPINOZA CASILLAS JONATHAN VALENTIN','LOPEZ CASTILLO CARLOS MAURICIO',
]

export default function ResidenteView({ perfil }) {
  const [obrasResidente, setObrasResidente] = useState([])
  const [semana, setSemana] = useState(null)
  const [trabajadores, setTrabajadores] = useState([])
  const [asistencias, setAsistencias] = useState({})         // { [trab_id]: { viernes, sabado, ... } }
  const [obraSeleccionada, setObraSeleccionada] = useState({})
  const [nominasPorObra, setNominasPorObra] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [fechasIncidencia, setFechasIncidencia] = useState({})
  const [diasVacaciones, setDiasVacaciones] = useState({})
  const [cargando, setCargando] = useState(true)
  const [prestamosActivos, setPrestamosActivos] = useState({})
  const [bajasPendientes, setBajasPendientes] = useState([])
  const [alertasFaltas, setAlertasFaltas] = useState({})     // { [trab_id]: totalFaltas }
  const [fechasSemana, setFechasSemana] = useState({})       // { viernes: 'YYYY-MM-DD', ... }

  const diaColumnaHoy = getDiaColumnaHoy()
  const fechaHoy = getFechaHoy()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setCargando(true)
    const { data: asignaciones } = await supabase
      .from('asignaciones')
      .select('obra_id, obra:obras(id, nombre)')
      .eq('usuario_id', perfil.id)
    const obras = (asignaciones || []).filter(a => a.obra?.id).map(a => ({ id: a.obra.id, nombre: a.obra.nombre }))
    setObrasResidente(obras)

    const { data: semanas } = await supabase
      .from('semanas').select('*').eq('estado', 'abierta')
      .order('fecha_inicio', { ascending: false }).limit(1)
    if (!semanas || semanas.length === 0) { setCargando(false); return }
    const sem = semanas[0]
    setSemana(sem)

    const fechas = getFechasDeSemana(sem.fecha_inicio)
    setFechasSemana(fechas)

    const { data: todasObras } = await supabase.from('obras').select('id,nombre')
    const oficinaId = (todasObras || []).find(o => o.nombre === 'OFICINA')?.id

    // Trabajadores ya asignados por otros residentes esta semana
    const { data: todasNominas } = await supabase
      .from('nominas_obra').select('id, obra_id').eq('semana_id', sem.id)
    const nominasOtros = (todasNominas || []).filter(n => !obras.map(o => o.id).includes(n.obra_id))
    let trabajadoresYaAsignados = []
    for (const nom of nominasOtros) {
      const { data: asist } = await supabase
        .from('asistencias').select('trabajador_id').eq('nomina_obra_id', nom.id)
      trabajadoresYaAsignados = [...trabajadoresYaAsignados, ...(asist || []).map(a => a.trabajador_id)]
    }

    let q = supabase.from('trabajadores')
      .select('id, num_empleado, nombre, puesto, tiene_bono, obra_id')
      .eq('activo', true).order('num_empleado', { ascending: true, nullsFirst: false })
    if (oficinaId) q = q.neq('obra_id', oficinaId)
    const { data: todosT } = await q
    const trab = (todosT || []).filter(t => !trabajadoresYaAsignados.includes(t.id))
    setTrabajadores(trab)

    const obraIds = obras.map(o => o.id)
    let nominasMap = {}
    if (obraIds.length > 0) {
      const { data: nominas } = await supabase
        .from('nominas_obra').select('*').eq('semana_id', sem.id).in('obra_id', obraIds)
      ;(nominas || []).forEach(n => { nominasMap[n.obra_id] = n })
    }
    setNominasPorObra(nominasMap)

    // Cargar asistencia_diaria de esta semana para estas obras
    const trabIds = (trab || []).map(t => t.id)
    let diariasMap = {}  // { [trab_id]: { viernes: valor, ... } }
    if (trabIds.length > 0) {
      const { data: diarias } = await supabase
        .from('asistencia_diaria')
        .select('trabajador_id, fecha, valor')
        .in('trabajador_id', trabIds)
        .gte('fecha', sem.fecha_inicio)
        .lte('fecha', sem.fecha_fin)
      ;(diarias || []).forEach(d => {
        if (!diariasMap[d.trabajador_id]) diariasMap[d.trabajador_id] = {}
        // Mapear fecha → columna
        const col = Object.entries(fechas).find(([, f]) => f === d.fecha)?.[0]
        if (col) diariasMap[d.trabajador_id][col] = parseFloat(d.valor)
      })
    }

    // Cargar obra asignada desde asistencias (nómina ya guardada)
    const obraSelecInit = {}
    const asistInit = {}
    for (const obraId of obraIds) {
      const nom = nominasMap[obraId]
      if (!nom) continue
      const { data: asist } = await supabase
        .from('asistencias').select('*').eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => {
        obraSelecInit[a.trabajador_id] = obraId
        asistInit[a.trabajador_id] = a
      })
    }

    const silvanaId = obras.find(o => o.nombre === 'SILVANA')?.id
    ;(trab || []).forEach(t => {
      // Valores base: usar diaria si existe, si no defaults
      const base = diariasMap[t.id] || {}
      if (!asistInit[t.id]) {
        asistInit[t.id] = {
          viernes:   base.viernes   ?? 1.1,
          sabado:    base.sabado    ?? 0.5,
          domingo:   base.domingo   ?? 0,
          lunes:     base.lunes     ?? 1.1,
          martes:    base.martes    ?? 1.1,
          miercoles: base.miercoles ?? 1.1,
          jueves:    base.jueves    ?? 1.1,
          horas_extra: 0, prestamos: 0
        }
      } else {
        // Mezclar: si hay captura diaria más reciente, prevalece sobre la nómina guardada
        DIAS.forEach(d => {
          if (base[d] !== undefined) asistInit[t.id][d] = base[d]
        })
      }
      if (!obraSelecInit[t.id]) {
        const nombreNorm = t.nombre.trim().toUpperCase().replace(/\s+/g, ' ')
        const enSilvana = silvanaId && LISTA_SILVANA.some(n => {
          const a = nombreNorm.replace(/\s+/g, ' ')
          const b = n.replace(/\s+/g, ' ')
          return a === b || a.startsWith(b) || b.startsWith(a)
        })
        obraSelecInit[t.id] = enSilvana ? silvanaId : ''
      }
    })
    setAsistencias(asistInit)
    setObraSeleccionada(obraSelecInit)

    // Cargar conteo de faltas en los últimos 30 días por trabajador
    if (trabIds.length > 0) {
      const hace30 = new Date()
      hace30.setDate(hace30.getDate() - 30)
      const limite = hace30.toISOString().split('T')[0]
      const { data: faltas } = await supabase
        .from('asistencia_diaria')
        .select('trabajador_id')
        .in('trabajador_id', trabIds)
        .eq('valor', 0)
        .gte('fecha', limite)
      const conteo = {}
      ;(faltas || []).forEach(f => { conteo[f.trabajador_id] = (conteo[f.trabajador_id] || 0) + 1 })
      setAlertasFaltas(conteo)
    }

    // Préstamos activos
    const { data: prests } = await supabase
      .from('prestamos').select('trabajador_id').eq('activo', true)
    const prestMap = {}
    ;(prests || []).forEach(p => { prestMap[p.trabajador_id] = true })
    setPrestamosActivos(prestMap)

    setCargando(false)
  }

  function updateAsistencia(id, campo, valor) {
    setAsistencias(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }
  function updateObra(id, obraId) { setObraSeleccionada(prev => ({ ...prev, [id]: obraId })) }
  function updateDiasVacaciones(id, dias) { setDiasVacaciones(prev => ({ ...prev, [id]: dias })) }
  function updateFecha(id, fecha) { setFechasIncidencia(prev => ({ ...prev, [id]: fecha })) }

  async function getNominaId(obraId) {
    if (nominasPorObra[obraId]) return nominasPorObra[obraId].id
    const { data, error } = await supabase.from('nominas_obra')
      .insert({ semana_id: semana.id, obra_id: obraId, residente_id: perfil.id })
      .select().single()
    if (error || !data) { console.error('Error creando nomina:', error); return null }
    setNominasPorObra(prev => ({ ...prev, [obraId]: data }))
    return data.id
  }

  // Guardar solo el día de hoy en asistencia_diaria
  async function guardarDiario() {
    if (!semana || !diaColumnaHoy) return
    setGuardando(true); setMsg('')

    const registros = []
    const nuevasAlertas = { ...alertasFaltas }
    const bajas = []

    for (const t of trabajadores) {
      const obraId = obraSeleccionada[t.id]
      if (!obraId || obraId === 'VACACIONES' || obraId === 'BAJA') continue

      const a = asistencias[t.id] || {}
      const valor = parseFloat(a[diaColumnaHoy] ?? (diaColumnaHoy === 'sabado' ? 0.5 : 1.1))

      registros.push({ trabajador_id: t.id, obra_id: obraId, fecha: fechaHoy, valor })
    }

    // Guardar incidencias (vacaciones/bajas) igual que antes
    for (const t of trabajadores) {
      const obraId = obraSeleccionada[t.id]
      if (obraId === 'VACACIONES' || obraId === 'BAJA') {
        await supabase.from('incidencias').upsert({
          trabajador_id: t.id, semana_id: semana.id,
          tipo: obraId.toLowerCase(), reportado_por: perfil.id,
          fecha_inicio: fechasIncidencia[t.id] || null,
          dias_vacaciones: obraId === 'VACACIONES' ? (parseInt(diasVacaciones[t.id]) || 0) : null
        }, { onConflict: 'trabajador_id,semana_id' })
        if (obraId === 'BAJA') bajas.push({ nombre: t.nombre, fecha: fechasIncidencia[t.id] || fechaHoy })
        if (obraId === 'VACACIONES') {
          const diasUsados = parseInt(diasVacaciones[t.id]) || 0
          if (diasUsados > 0) {
            const { data: periodos } = await supabase.from('vacaciones')
              .select('id, dias_disponibles, dias_tomados').eq('trabajador_id', t.id)
              .eq('activo', true).order('fecha_otorgamiento', { ascending: true }).limit(1)
            if (periodos?.length > 0) {
              const p = periodos[0]
              await supabase.from('vacaciones').update({
                dias_disponibles: Math.max(0, (p.dias_disponibles || 0) - diasUsados),
                dias_tomados: (p.dias_tomados || 0) + diasUsados
              }).eq('id', p.id)
            }
          }
        }
      }
    }

    if (registros.length > 0) {
      // Llamar API que hace upsert + detecta 3 faltas + notifica WhatsApp
      const resp = await fetch('/api/asistencia-diaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registros, capturado_por: perfil.id })
      })
      const data = await resp.json()

      // Actualizar alertas locales
      if (data.alertas?.length > 0) {
        data.alertas.forEach(a => { nuevasAlertas[a.trabajador_id] = a.totalFaltas })
        setAlertasFaltas(nuevasAlertas)
      }
    }

    setGuardando(false)
    setMsg('✓ Asistencia guardada')
    if (bajas.length > 0) setBajasPendientes(bajas)
    setTimeout(() => setMsg(''), 3000)
  }

  // Enviar nómina semanal (igual que antes, pero primero guarda el día)
  async function enviar() {
    await guardarDiario()
    setEnviando(true)
    for (const o of obrasResidente) {
      const nom = nominasPorObra[o.id]
      if (nom && nom.estado === 'borrador') {
        await supabase.from('nominas_obra')
          .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
          .eq('id', nom.id)
        try {
          await fetch('/api/notificar-whatsapp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'enviada', obra: o.nombre,
              residente: perfil.nombre || perfil.email || 'Residente',
              semana: `${semana.semana_num} (${semana.fecha_inicio} al ${semana.fecha_fin})`
            })
          })
        } catch (e) { console.error('WhatsApp notify error:', e) }
      }
    }
    await cargarDatos()
    setEnviando(false)
  }

  const trabajadoresFiltrados = trabajadores.filter(t => {
    const obraId = obraSeleccionada[t.id]
    if (filtro === 'asignados') return !!obraId
    if (filtro === 'sin-asignar') return !obraId
    return true
  })

  const totalAsignados = trabajadores.filter(t => !!obraSeleccionada[t.id]).length
  const todasBloqueadas = !cargando && obrasResidente.length > 0 &&
    obrasResidente.filter(o => o?.id).every(o =>
      nominasPorObra[o.id]?.estado !== 'borrador' && nominasPorObra[o.id]?.estado !== undefined)

  // ¿Ya capturé hoy?
  const yaCaptureroHoy = diaColumnaHoy === null // domingo no hay captura

  if (cargando) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="text-center">
        <div className="text-3xl mb-3">⏳</div>
        <p className="text-sm">Cargando nómina...</p>
      </div>
    </div>
  )

  if (!semana) return (
    <div className="text-center py-20 text-gray-400">
      <div className="text-4xl mb-3">📅</div>
      <p>No hay semana de nómina abierta.<br/>Regresa el viernes cuando se abra la siguiente semana.</p>
    </div>
  )

  if (todasBloqueadas && obrasResidente.length > 0) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Nómina enviada correctamente</h2>
        <p className="text-gray-500 mb-4">
          Enviaste la nómina de <strong>{obrasResidente.map(o => o.nombre).join(' y ')}</strong> para la semana {semana.semana_num}.
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          El superintendente revisará y aprobará tu nómina.<br/>
          Regresa el <strong>viernes</strong> para capturar la siguiente semana.
        </div>
        <p className="text-xs text-gray-400 mt-4">Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}</p>
      </div>
    </div>
  )

  const nombreDiaHoy = diaColumnaHoy
    ? DIAS_LABEL[DIAS.indexOf(diaColumnaHoy)]
    : 'Hoy'

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">
            Captura — {obrasResidente.filter(o => o?.nombre).map(o => o.nombre).join(' · ')}
          </h2>
          <p className="text-xs text-gray-400">
            Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}
            {diaColumnaHoy && <span className="ml-2 text-blue-500 font-medium">· Hoy: {nombreDiaHoy} {fechaHoy}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-green-600 text-xs font-medium">{msg}</span>}
          {bajasPendientes.length > 0 && (
            <button
              onClick={async () => {
                const obraNames = obrasResidente.map(o => o.nombre).join(', ')
                try {
                  await Promise.all(bajasPendientes.map(b =>
                    fetch('/api/notificar-baja', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trabajador: b.nombre, fecha: b.fecha, obra: obraNames, residente: perfil.nombre || perfil.email || 'Residente' })
                    })
                  ))
                  alert('✅ Notificación enviada por WhatsApp al Super, Admin y Aux Admin.')
                } catch (e) { alert('Error al enviar notificación: ' + e.message) }
                setBajasPendientes([])
              }}
              className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 animate-pulse">
              📲 Notificar baja por WhatsApp
            </button>
          )}
          {!todasBloqueadas && <>
            <button onClick={guardarDiario} disabled={guardando || !diaColumnaHoy}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {guardando ? 'Guardando...' : `💾 Guardar ${nombreDiaHoy}`}
            </button>
            <button
              onClick={() => { if (confirm('¿Enviar nómina de la semana? Ya no podrás modificarla.')) enviar() }}
              disabled={enviando}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar nómina →'}
            </button>
          </>}
          {todasBloqueadas && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Enviada</span>}
        </div>
      </div>

      {/* Banner día de captura */}
      {diaColumnaHoy && (
        <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-center gap-2">
          <span>📋</span>
          <span>Capturando asistencia del <strong>{nombreDiaHoy} {fechaHoy}</strong>. Los días anteriores se muestran en gris (ya guardados).</span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {[['todos','Todos'],['asignados','Asignados'],['sin-asignar','Sin asignar']].map(([val,lbl]) => (
            <button key={val} onClick={() => setFiltro(val)}
              className={`px-3 py-1 rounded-full text-xs border font-medium ${filtro === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{totalAsignados} de {trabajadores.length} asignados</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table style={{borderCollapse:'collapse', fontSize:'12px', whiteSpace:'nowrap'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #f3f4f6', background:'#f9fafb'}}>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, position:'sticky', left:0, background:'#f9fafb', zIndex:1}}>#</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'180px'}}>Trabajador</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'130px'}}>Puesto</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'110px'}}>Obra</th>
                {DIAS.map((d, i) => {
                  const esHoy = d === diaColumnaHoy
                  return (
                    <th key={d} style={{
                      textAlign:'center', padding:'8px 4px', width:'52px',
                      color: esHoy ? '#2563eb' : '#9ca3af',
                      fontWeight: esHoy ? 700 : 500,
                      background: esHoy ? '#eff6ff' : '#f9fafb',
                      borderBottom: esHoy ? '2px solid #2563eb' : undefined
                    }}>
                      {DIAS_LABEL[i]}{esHoy ? ' ●' : ''}
                    </th>
                  )
                })}
                <th style={{textAlign:'center', padding:'8px 6px', color:'#9ca3af', fontWeight:500, width:'44px'}}>Días</th>
                <th style={{textAlign:'center', padding:'8px 6px', color:'#9ca3af', fontWeight:500, width:'60px'}}>H.Extra</th>
              </tr>
            </thead>
            <tbody>
              {trabajadoresFiltrados.map(t => {
                const a = asistencias[t.id] || {}
                const dias = calcularDias(a)
                const tieneFalta = dias < 6.0
                const obraId = obraSeleccionada[t.id]
                const nom = nominasPorObra[obraId]
                const bloqueado = nom && nom.estado !== 'borrador'
                const sinObra = !obraId
                const esVacaciones = obraId === 'VACACIONES'
                const esBaja = obraId === 'BAJA'
                const esIncidencia = esVacaciones || esBaja
                const fechaIncidencia = fechasIncidencia[t.id] ? new Date(fechasIncidencia[t.id]) : null
                const faltas30 = alertasFaltas[t.id] || 0
                const tieneAlertaFaltas = faltas30 >= 3

                return (
                  <tr key={t.id} style={{
                    borderBottom:'1px solid #f9fafb',
                    background: esBaja ? '#fef2f2' : esVacaciones ? '#f0f9ff' : tieneAlertaFaltas ? '#fff7ed' : sinObra ? '#fafafa' : tieneFalta ? '#fff5f5' : 'white'
                  }}>
                    <td style={{padding:'6px 8px', color:'#d1d5db', position:'sticky', left:0, background: sinObra ? '#fafafa' : tieneAlertaFaltas ? '#fff7ed' : tieneFalta ? '#fff5f5' : 'white', zIndex:1}}>
                      {t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0')}
                    </td>
                    <td style={{padding:'6px 8px', fontWeight:500, color: sinObra ? '#9ca3af' : '#111827'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                        {t.nombre}
                        {tieneAlertaFaltas && (
                          <span title={`${faltas30} faltas en los últimos 30 días`}
                            style={{fontSize:'10px', background:'#fed7aa', color:'#c2410c', borderRadius:'10px', padding:'1px 6px', fontWeight:600}}>
                            ⚠️ {faltas30} faltas
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{padding:'6px 8px', color:'#6b7280'}}>{t.puesto}</td>
                    <td style={{padding:'6px 8px'}}>
                      <select value={obraId || ''} onChange={e => updateObra(t.id, e.target.value)}
                        disabled={bloqueado}
                        style={{fontSize:'11px', border:'1px solid', borderColor: obraId ? '#93c5fd' : '#e5e7eb', borderRadius:'6px', padding:'2px 4px', width:'105px', background: obraId ? '#eff6ff' : 'white', color: obraId ? '#1d4ed8' : '#6b7280'}}>
                        <option value="">— Sin asignar —</option>
                        {obrasResidente.filter(o => o?.id).map(o => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                        <option value="VACACIONES">🏖 Vacaciones</option>
                        <option value="BAJA">🚫 Dar de baja</option>
                      </select>
                      {(esVacaciones || esBaja) && (
                        <div style={{marginTop:'3px'}}>
                          <input type="date"
                            value={fechasIncidencia[t.id] || ''}
                            onChange={e => updateFecha(t.id, e.target.value)}
                            disabled={bloqueado}
                            style={{fontSize:'10px', border:'1px solid #e5e7eb', borderRadius:'4px', padding:'2px 4px', width:'105px', color: esVacaciones ? '#0369a1' : '#dc2626'}}
                          />
                          <div style={{fontSize:'9px', color:'#9ca3af', marginTop:'1px'}}>
                            {esVacaciones ? 'Inicio de vacaciones' : 'Fecha de baja'}
                          </div>
                          {esVacaciones && (
                            <div style={{marginTop:'4px', display:'flex', alignItems:'center', gap:'4px'}}>
                              <input type="number" min="1" max="30"
                                value={diasVacaciones[t.id] || ''}
                                onChange={e => updateDiasVacaciones(t.id, e.target.value)}
                                disabled={bloqueado}
                                placeholder="Días"
                                style={{fontSize:'10px', border:'1px solid #bae6fd', borderRadius:'4px', padding:'2px 4px', width:'52px', color:'#0369a1', textAlign:'center'}}
                              />
                              <span style={{fontSize:'9px', color:'#9ca3af'}}>días a descontar</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    {DIAS.map(d => {
                      const esHoy = d === diaColumnaHoy
                      const maxVal = d === 'sabado' ? 0.5 : 1.1
                      const rawVal = a[d] ?? (d === 'sabado' ? 0.5 : 1.1)
                      const val = parseFloat(rawVal)
                      const bloqIncidencia = esIncidencia && fechaIncidencia && fechasSemana[d] && new Date(fechasSemana[d]) >= fechaIncidencia
                      // Días pasados: readonly (ya guardados), solo hoy es editable
                      const esPasado = fechasSemana[d] && fechasSemana[d] < fechaHoy
                      const disabled = bloqueado || sinObra || bloqIncidencia || (!esHoy && !esPasado ? false : !esHoy)

                      const esCero = val === 0
                      const esParcial = val > 0 && val < maxVal
                      const borderColor = bloqIncidencia ? '#e5e7eb' : esCero ? '#fca5a5' : esParcial ? '#fcd34d' : esHoy ? '#86efac' : '#e5e7eb'
                      const bgColor = !esHoy && esPasado ? '#f9fafb' : bloqIncidencia ? '#f3f4f6' : sinObra ? '#f9fafb' : esCero ? '#fef2f2' : esParcial ? '#fffbeb' : esHoy ? '#f0fdf4' : 'white'
                      const textColor = (!esHoy && esPasado) ? '#9ca3af' : bloqIncidencia ? '#9ca3af' : sinObra ? '#d1d5db' : esCero ? '#ef4444' : esParcial ? '#b45309' : '#374151'

                      return (
                        <td key={d} style={{padding:'4px 2px', textAlign:'center', background: esHoy ? '#f0fdf4' : undefined}}>
                          <input
                            type="number"
                            min={0} max={maxVal} step={0.1}
                            value={val}
                            onChange={e => {
                              if (!esHoy) return
                              let v = parseFloat(e.target.value)
                              if (isNaN(v)) v = 0
                              v = Math.min(Math.max(Math.round(v * 10) / 10, 0), maxVal)
                              updateAsistencia(t.id, d, v)
                            }}
                            disabled={disabled}
                            readOnly={!esHoy}
                            style={{
                              width:'46px', fontSize:'11px', fontWeight: esHoy ? 600 : 400,
                              border:`1px solid ${borderColor}`, borderRadius:'4px',
                              padding:'2px 4px', textAlign:'center',
                              background: bgColor, color: textColor,
                              cursor: !esHoy ? 'default' : 'text',
                              outline:'none'
                            }}
                          />
                        </td>
                      )
                    })}
                    <td style={{padding:'4px 6px', textAlign:'center', fontWeight:600, color: sinObra ? '#d1d5db' : tieneFalta ? '#ef4444' : '#374151'}}>
                      {esVacaciones ? <span style={{fontSize:'10px',color:'#0369a1',background:'#e0f2fe',padding:'1px 6px',borderRadius:'10px'}}>Vac</span>
                        : esBaja ? <span style={{fontSize:'10px',color:'#dc2626',background:'#fee2e2',padding:'1px 6px',borderRadius:'10px'}}>Baja</span>
                        : sinObra ? '—' : dias % 1 === 0 ? dias : dias.toFixed(1)}
                    </td>
                    <td style={{padding:'4px 4px', textAlign:'center'}}>
                      <input type="number" min="0" max="20" step="0.5"
                        value={a.horas_extra || ''}
                        placeholder="0"
                        onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                        disabled={bloqueado || sinObra}
                        style={{width:'50px', fontSize:'11px', border:'1px solid #e5e7eb', borderRadius:'4px', padding:'2px 4px', textAlign:'center', background: (sinObra || esIncidencia) ? '#f9fafb' : 'white', color: (sinObra || esIncidencia) ? '#d1d5db' : '#374151'}}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{borderTop:'2px solid #e5e7eb', background:'#f9fafb'}}>
                <td colSpan={11} style={{padding:'8px', fontSize:'11px', color:'#9ca3af'}}>
                  {totalAsignados} trabajadores asignados
                  {Object.values(alertasFaltas).filter(v => v >= 3).length > 0 && (
                    <span style={{color:'#c2410c', marginLeft:'8px'}}>
                      · ⚠️ {Object.values(alertasFaltas).filter(v => v >= 3).length} con 3+ faltas en 30 días
                    </span>
                  )}
                </td>
                <td style={{padding:'8px', textAlign:'center', fontSize:'11px', fontWeight:600, color:'#374151'}}>
                  {trabajadores.reduce((s,t) => s + (parseFloat((asistencias[t.id]||{}).horas_extra)||0), 0)}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
