import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DIAS = ['viernes','sabado','domingo','lunes','martes','miercoles','jueves']
const DIAS_LABEL = ['Vie','Sáb','Dom','Lun','Mar','Mié','Jue']

function calcularDias(asistencia) {
  return Math.round(DIAS.reduce((sum, d) => {
    const v = parseFloat(asistencia[d])
    return sum + (isNaN(v) ? 0 : v)
  }, 0) * 10) / 10
}

export default function ResidenteView({ perfil }) {
  const [obrasResidente, setObrasResidente] = useState([])
  const [semana, setSemana] = useState(null)
  const [trabajadores, setTrabajadores] = useState([])
  const [asistencias, setAsistencias] = useState({})
  const [obraSeleccionada, setObraSeleccionada] = useState({})
  const [nominasPorObra, setNominasPorObra] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [fechasIncidencia, setFechasIncidencia] = useState({})
  const [diasVacaciones, setDiasVacaciones] = useState({})
  const [cargando, setCargando] = useState(true)
  const [prestamosActivos, setPrestamosActivos] = useState({}) // trabajador_id -> true
  const [bajasPendientes, setBajasPendientes] = useState([]) // trabajadores dados de baja para notificar
  const [modoParcial, setModoParcial] = useState({}) // { "trabId_dia": true } cuando está en modo input libre

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
    if (!semanas || semanas.length === 0) return
    const sem = semanas[0]
    setSemana(sem)

    const { data: todasObras } = await supabase.from('obras').select('id,nombre')
    const oficinaId = (todasObras || []).find(o => o.nombre === 'OFICINA')?.id

    // Obtener trabajadores ya asignados por OTROS residentes esta semana
    const { data: todasNominas } = await supabase
      .from('nominas_obra')
      .select('id, obra_id')
      .eq('semana_id', sem.id)

    // Solo nóminas de OTROS residentes (no las propias)
    const nominasOtros = (todasNominas || []).filter(n => !obras.map(o => o.id).includes(n.obra_id))

    let trabajadoresYaAsignados = []
    for (const nom of nominasOtros) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('trabajador_id')
        .eq('nomina_obra_id', nom.id)
      trabajadoresYaAsignados = [...trabajadoresYaAsignados, ...(asist || []).map(a => a.trabajador_id)]
    }

    let q = supabase.from('trabajadores')
      .select('id, num_empleado, nombre, puesto, tiene_bono, obra_id')
      .eq('activo', true).order('num_empleado', { ascending: true, nullsFirst: false })
    if (oficinaId) q = q.neq('obra_id', oficinaId)
    const { data: todosT } = await q

    // Filtrar los ya asignados por otros residentes
    const trab = (todosT || []).filter(t => !trabajadoresYaAsignados.includes(t.id))
    setTrabajadores(trab)

    const obraIds = obras.map(o => o.id)
    let nominasMap = {}
    if (obraIds.length > 0) {
      const { data: nominas } = await supabase
        .from('nominas_obra').select('*')
        .eq('semana_id', sem.id).in('obra_id', obraIds)
      ;(nominas || []).forEach(n => { nominasMap[n.obra_id] = n })
    }
    setNominasPorObra(nominasMap)

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
    ;(trab || []).forEach(t => {
      if (!asistInit[t.id]) asistInit[t.id] = {
        viernes: 1.1, sabado: 0.5, domingo: 0,
        lunes: 1.1, martes: 1.1, miercoles: 1.1, jueves: 1.1,
        horas_extra: 0, prestamos: 0
      }
      if (!obraSelecInit[t.id]) obraSelecInit[t.id] = ''
    })
    setAsistencias(asistInit)
    setObraSeleccionada(obraSelecInit)
    // Cargar préstamos activos
    const { data: prests } = await supabase
      .from('prestamos')
      .select('trabajador_id')
      .eq('activo', true)
    const prestMap = {}
    ;(prests || []).forEach(p => { prestMap[p.trabajador_id] = true })
    setPrestamosActivos(prestMap)

    setCargando(false)
  }

  function updateAsistencia(id, campo, valor) {
    setAsistencias(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }
  function updateObra(id, obraId) {
    setObraSeleccionada(prev => ({ ...prev, [id]: obraId }))
  }
  function updateDiasVacaciones(id, dias) {
    setDiasVacaciones(prev => ({ ...prev, [id]: dias }))
  }
  function updateFecha(id, fecha) {
    setFechasIncidencia(prev => ({ ...prev, [id]: fecha }))
  }

  async function getNominaId(obraId) {
    if (nominasPorObra[obraId]) return nominasPorObra[obraId].id
    const { data, error } = await supabase.from('nominas_obra')
      .insert({ semana_id: semana.id, obra_id: obraId, residente_id: perfil.id })
      .select().single()
    if (error || !data) { console.error('Error creando nomina:', error); return null }
    setNominasPorObra(prev => ({ ...prev, [obraId]: data }))
    return data.id
  }

  async function guardar() {
    if (!semana) return
    setGuardando(true); setMsg('')
    const bajas = []
    for (const t of trabajadores) {
      const obraId = obraSeleccionada[t.id]
      if (!obraId) continue
      // Vacaciones y baja se registran como incidencias
      if (obraId === 'VACACIONES' || obraId === 'BAJA') {
        await supabase.from('incidencias').upsert({
          trabajador_id: t.id,
          semana_id: semana.id,
          tipo: obraId.toLowerCase(),
          reportado_por: perfil.id,
          fecha_inicio: fechasIncidencia[t.id] || null,
          dias_vacaciones: obraId === 'VACACIONES' ? (parseInt(diasVacaciones[t.id]) || 0) : null
        }, { onConflict: 'trabajador_id,semana_id' })
        // Registrar baja para notificación WhatsApp
        if (obraId === 'BAJA') {
          bajas.push({ nombre: t.nombre, fecha: fechasIncidencia[t.id] || new Date().toISOString().split('T')[0] })
        }

        // Si es vacaciones, descontar días del período activo
        if (obraId === 'VACACIONES') {
          const diasUsados = parseInt(diasVacaciones[t.id]) || 0
          if (diasUsados > 0) {
            const { data: periodos } = await supabase
              .from('vacaciones')
              .select('id, dias_disponibles, dias_tomados')
              .eq('trabajador_id', t.id)
              .eq('activo', true)
              .order('fecha_otorgamiento', { ascending: true })
              .limit(1)
            if (periodos && periodos.length > 0) {
              const p = periodos[0]
              const nuevosDisponibles = Math.max(0, (p.dias_disponibles || 0) - diasUsados)
              const nuevosTomados = (p.dias_tomados || 0) + diasUsados
              await supabase.from('vacaciones')
                .update({ dias_disponibles: nuevosDisponibles, dias_tomados: nuevosTomados })
                .eq('id', p.id)
            }
          }
        }
        continue
      }
      const nom = nominasPorObra[obraId]
      if (nom && nom.estado !== 'borrador') continue
      const nominaId = await getNominaId(obraId)
      if (!nominaId) continue
      const a = asistencias[t.id] || {}
      const dias = calcularDias(a)
      await supabase.from('asistencias').upsert({
        nomina_obra_id: nominaId, trabajador_id: t.id,
        viernes: parseFloat(a.viernes)||0, sabado: parseFloat(a.sabado)||0,
        domingo: parseFloat(a.domingo)||0, lunes: parseFloat(a.lunes)||0,
        martes: parseFloat(a.martes)||0, miercoles: parseFloat(a.miercoles)||0,
        jueves: parseFloat(a.jueves)||0, dias_total: dias,
        horas_extra: parseFloat(a.horas_extra)||0,
        prestamos: parseFloat(a.prestamos)||0,
        bono_aplicado: (t.tiene_bono && dias >= 6) ? 1 : 0,
        total_pagar: 0
      }, { onConflict: 'nomina_obra_id,trabajador_id' })
    }
    setGuardando(false); setMsg('✓ Guardado')
    if (bajas.length > 0) setBajasPendientes(bajas)
    setTimeout(() => setMsg(''), 2000)
  }

  async function enviar() {
    await guardar(); setEnviando(true)
    for (const o of obrasResidente) {
      const nom = nominasPorObra[o.id]
      if (nom && nom.estado === 'borrador') {
        await supabase.from('nominas_obra')
          .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
          .eq('id', nom.id)
        // Notificar a Kathe por WhatsApp
        try {
          await fetch('/api/notificar-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'enviada',
              obra: o.nombre,
              residente: perfil.nombre || perfil.email || 'Residente',
              semana: `${semana.semana_num} (${semana.fecha_inicio} al ${semana.fecha_fin})`
            })
          })
        } catch (e) { console.error('WhatsApp notify error:', e) }
      }
    }
    await cargarDatos(); setEnviando(false)
  }

  const trabajadoresFiltrados = trabajadores.filter(t => {
    const obraId = obraSeleccionada[t.id]
    if (filtro === 'asignados') return !!obraId
    if (filtro === 'sin-asignar') return !obraId
    return true
  })

  const totalAsignados = trabajadores.filter(t => !!obraSeleccionada[t.id]).length
  const todasBloqueadas = !cargando && obrasResidente.length > 0 && obrasResidente.filter(o => o && o.id).every(o => nominasPorObra[o.id]?.estado !== 'borrador' && nominasPorObra[o.id]?.estado !== undefined)

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

  // Si todas las nóminas están enviadas, mostrar pantalla de confirmación
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

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Captura — {obrasResidente.filter(o => o && o.nombre).map(o => o.nombre).join(' · ')}</h2>
          <p className="text-xs text-gray-400">Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}</p>
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
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        trabajador: b.nombre,
                        fecha: b.fecha,
                        obra: obraNames,
                        residente: perfil.nombre || perfil.email || 'Residente'
                      })
                    })
                  ))
                  alert('✅ Notificación enviada por WhatsApp al Super, Admin y Aux Admin.')
                } catch (e) {
                  alert('Error al enviar notificación: ' + e.message)
                }
                setBajasPendientes([])
              }}
              className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 animate-pulse">
              📲 Notificar baja por WhatsApp
            </button>
          )}
          {!todasBloqueadas && <>
            <button onClick={guardar} disabled={guardando}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {guardando ? 'Guardando...' : '💾 Guardar'}
            </button>
            <button onClick={() => { if (confirm('¿Enviar nómina? Ya no podrás modificarla.')) enviar() }}
              disabled={enviando}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar nómina →'}
            </button>
          </>}
          {todasBloqueadas && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Enviada</span>}
        </div>
      </div>

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

      {/* Tabla con scroll horizontal */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto" style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse', fontSize:'12px', whiteSpace:'nowrap'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #f3f4f6', background:'#f9fafb'}}>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, position:'sticky', left:0, background:'#f9fafb', zIndex:1}}>#</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'180px'}}>Trabajador</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'130px'}}>Puesto</th>
                <th style={{textAlign:'left', padding:'8px 8px', color:'#9ca3af', fontWeight:500, minWidth:'110px'}}>Obra</th>
                {DIAS_LABEL.map(d => (
                  <th key={d} style={{textAlign:'center', padding:'8px 4px', color:'#9ca3af', fontWeight:500, width:'52px'}}>{d}</th>
                ))}
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
                // Fecha de incidencia para calcular días bloqueados
                const fechaIncidencia = fechasIncidencia[t.id] ? new Date(fechasIncidencia[t.id]) : null
                // Mapeo de días de la semana a fechas
                const fechasSemana = {
                  viernes: semana ? new Date(semana.fecha_inicio) : null,
                  sabado: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 86400000) : null,
                  domingo: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 2*86400000) : null,
                  lunes: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 3*86400000) : null,
                  martes: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 4*86400000) : null,
                  miercoles: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 5*86400000) : null,
                  jueves: semana ? new Date(new Date(semana.fecha_inicio).getTime() + 6*86400000) : null,
                }

                return (
                  <tr key={t.id} style={{borderBottom:'1px solid #f9fafb', background: esBaja ? '#fef2f2' : esVacaciones ? '#f0f9ff' : sinObra ? '#fafafa' : tieneFalta ? '#fff5f5' : 'white'}}>
                    <td style={{padding:'6px 8px', color:'#d1d5db', position:'sticky', left:0, background: sinObra ? '#fafafa' : tieneFalta ? '#fff5f5' : 'white', zIndex:1}}>
                      {(t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0'))}
                    </td>
                    <td style={{padding:'6px 8px', fontWeight:500, color: sinObra ? '#9ca3af' : '#111827'}}>
                      {t.nombre}
                    </td>
                    <td style={{padding:'6px 8px', color:'#6b7280'}}>{t.puesto}</td>
                    <td style={{padding:'6px 8px'}}>
                      <select value={obraId || ''} onChange={e => updateObra(t.id, e.target.value)}
                        disabled={bloqueado}
                        style={{fontSize:'11px', border:'1px solid', borderColor: obraId ? '#93c5fd' : '#e5e7eb', borderRadius:'6px', padding:'2px 4px', width:'105px', background: obraId ? '#eff6ff' : 'white', color: obraId ? '#1d4ed8' : '#6b7280'}}>
                        <option value="">— Sin asignar —</option>
                        {obrasResidente.filter(o => o && o.id).map(o => (
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
                            placeholder={esVacaciones ? 'Inicio vacaciones' : 'Fecha de baja'}
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
                      const maxVal = d === 'sabado' ? 0.5 : 1.1
                      const val = parseFloat(a[d] ?? maxVal)
                      const bloqIncidencia = esIncidencia && fechaIncidencia && fechasSemana[d] && fechasSemana[d] >= fechaIncidencia
                      const disabledCell = bloqueado || sinObra || bloqIncidencia
                      const claveP = `${t.id}_${d}`
                      const enParcial = !!modoParcial[claveP]
                      const esCero = val === 0
                      const esParcial = val > 0 && val < maxVal

                      // Color borde según estado
                      const borderColor = bloqIncidencia ? '#e5e7eb' : esCero ? '#fca5a5' : esParcial ? '#fcd34d' : '#86efac'
                      const bgSelect = bloqIncidencia ? '#f3f4f6' : sinObra ? '#f9fafb' : esCero ? '#fef2f2' : esParcial ? '#fffbeb' : 'white'
                      const textSelect = bloqIncidencia ? '#9ca3af' : sinObra ? '#d1d5db' : esCero ? '#ef4444' : esParcial ? '#b45309' : '#374151'

                      return (
                        <td key={d} style={{padding:'4px 2px', textAlign:'center'}}>
                          {enParcial ? (
                            // Modo input libre: teclear horas parciales
                            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'2px'}}>
                              <input
                                type="number"
                                min={0} max={maxVal} step={0.1}
                                autoFocus
                                value={val}
                                onChange={e => {
                                  let v = parseFloat(e.target.value)
                                  if (isNaN(v)) v = 0
                                  v = Math.min(Math.max(Math.round(v * 10) / 10, 0), maxVal)
                                  updateAsistencia(t.id, d, v)
                                }}
                                disabled={disabledCell}
                                style={{
                                  width:'42px', fontSize:'11px', fontWeight:600,
                                  border:`1px solid ${borderColor}`, borderRadius:'4px',
                                  padding:'2px 3px', textAlign:'center',
                                  background: bgSelect, color: textSelect, outline:'none'
                                }}
                              />
                              <button
                                onClick={() => setModoParcial(prev => { const n={...prev}; delete n[claveP]; return n })}
                                style={{fontSize:'9px', color:'#6b7280', background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1}}>
                                ✕ cerrar
                              </button>
                            </div>
                          ) : (
                            // Modo select: ✓ / ✗ / ✎ parcial
                            <select
                              value={esParcial ? 'PARCIAL' : val}
                              onChange={e => {
                                const v = e.target.value
                                if (v === 'PARCIAL') {
                                  // Activar modo input, poner valor intermedio como punto de partida
                                  updateAsistencia(t.id, d, d === 'sabado' ? 0.3 : 0.5)
                                  setModoParcial(prev => ({ ...prev, [claveP]: true }))
                                } else {
                                  updateAsistencia(t.id, d, parseFloat(v))
                                }
                              }}
                              disabled={disabledCell}
                              style={{
                                fontSize:'11px', border:`1px solid ${borderColor}`,
                                borderRadius:'4px', padding:'2px 1px', width:'46px',
                                textAlign:'center', background: bgSelect, color: textSelect
                              }}>
                              <option value={maxVal}>✓</option>
                              <option value={0}>✗</option>
                              <option value="PARCIAL">{esParcial ? `${val}` : '✎'}</option>
                            </select>
                          )}
                        </td>
                      )
                    })}
                    <td style={{padding:'4px 6px', textAlign:'center', fontWeight:600, color: sinObra ? '#d1d5db' : tieneFalta ? '#ef4444' : '#374151'}}>
                      {esVacaciones ? <span style={{fontSize:'10px',color:'#0369a1',background:'#e0f2fe',padding:'1px 6px',borderRadius:'10px'}}>Vac</span> : esBaja ? <span style={{fontSize:'10px',color:'#dc2626',background:'#fee2e2',padding:'1px 6px',borderRadius:'10px'}}>Baja</span> : sinObra ? '—' : dias % 1 === 0 ? dias : dias.toFixed(1)}
                    </td>
                    <td style={{padding:'4px 4px', textAlign:'center'}}>
                      <input type="number" min="0" max="20" step="0.5"
                        value={a.horas_extra || ''}
                        placeholder="0"
                        onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                        disabled={bloqueado || sinObra}
                        style={{width:'50px', fontSize:'11px', border:'1px solid #e5e7eb', borderRadius:'4px', padding:'2px 4px', textAlign:'center', background: (sinObra || esIncidencia) ? '#f9fafb' : 'white', color: (sinObra || esIncidencia) ? '#d1d5db' : '#374151'}} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{borderTop:'2px solid #e5e7eb', background:'#f9fafb'}}>
                <td colSpan={11} style={{padding:'8px', fontSize:'11px', color:'#9ca3af'}}>
                  {totalAsignados} trabajadores asignados · {trabajadores.filter(t => obraSeleccionada[t.id] && calcularDias(asistencias[t.id]||{}) < 6.0).length} con falta
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
