import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DIAS = ['viernes','sabado','domingo','lunes','martes','miercoles','jueves']
const DIAS_LABEL = ['Vie','Sáb','Dom','Lun','Mar','Mié','Jue']

function calcularDias(asistencia) {
  return DIAS.reduce((sum, d) => {
    const v = parseFloat(asistencia[d])
    return sum + (v === 1.1 ? 1 : isNaN(v) ? 0 : v)
  }, 0)
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
  const [cargando, setCargando] = useState(true)

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
      .eq('activo', true).order('num_empleado', { ascending: true })
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
        viernes: 1.1, sabado: 1.1, domingo: 0,
        lunes: 1.1, martes: 1.1, miercoles: 1.1, jueves: 1.1,
        horas_extra: 0, prestamos: 0
      }
      if (!obraSelecInit[t.id]) obraSelecInit[t.id] = ''
    })
    setAsistencias(asistInit)
    setObraSeleccionada(obraSelecInit)
    setCargando(false)
  }

  function updateAsistencia(id, campo, valor) {
    setAsistencias(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }
  function updateObra(id, obraId) {
    setObraSeleccionada(prev => ({ ...prev, [id]: obraId }))
  }
  function updateFecha(id, fecha) {
    setFechasIncidencia(prev => ({ ...prev, [id]: fecha }))
  }

  async function getNominaId(obraId) {
    if (nominasPorObra[obraId]) return nominasPorObra[obraId].id
    const { data } = await supabase.from('nominas_obra')
      .insert({ semana_id: semana.id, obra_id: obraId, residente_id: perfil.id })
      .select().single()
    setNominasPorObra(prev => ({ ...prev, [obraId]: data }))
    return data.id
  }

  async function guardar() {
    if (!semana) return
    setGuardando(true); setMsg('')
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
          fecha_inicio: fechasIncidencia[t.id] || null
        }, { onConflict: 'trabajador_id,semana_id' })
        continue
      }
      const nom = nominasPorObra[obraId]
      if (nom && nom.estado !== 'borrador') continue
      const nominaId = await getNominaId(obraId)
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
  const todasBloqueadas = !cargando && obrasResidente.length > 0 && obrasResidente.every(o => nominasPorObra[o.id]?.estado !== 'borrador' && nominasPorObra[o.id]?.estado !== undefined)

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
          <h2 className="font-semibold text-gray-900 text-sm">Captura — {obrasResidente.map(o => o.nombre).join(' · ')}</h2>
          <p className="text-xs text-gray-400">Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-green-600 text-xs font-medium">{msg}</span>}
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
                const tieneFalta = dias < 6
                const obraId = obraSeleccionada[t.id]
                const nom = nominasPorObra[obraId]
                const bloqueado = nom && nom.estado !== 'borrador'
                const sinObra = !obraId || obraId === 'VACACIONES' || obraId === 'BAJA'
                const esVacaciones = obraId === 'VACACIONES'
                const esBaja = obraId === 'BAJA'

                return (
                  <tr key={t.id} style={{borderBottom:'1px solid #f9fafb', background: esBaja ? '#fef2f2' : esVacaciones ? '#f0f9ff' : sinObra ? '#fafafa' : tieneFalta ? '#fff5f5' : 'white'}}>
                    <td style={{padding:'6px 8px', color:'#d1d5db', position:'sticky', left:0, background: sinObra ? '#fafafa' : tieneFalta ? '#fff5f5' : 'white', zIndex:1}}>
                      {String(t.num_empleado).padStart(4,'0')}
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
                        {obrasResidente.map(o => (
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
                        </div>
                      )}
                    </td>
                    {DIAS.map(d => (
                      <td key={d} style={{padding:'4px 2px', textAlign:'center'}}>
                        <select value={a[d] ?? 1.1}
                          onChange={e => updateAsistencia(t.id, d, parseFloat(e.target.value))}
                          disabled={bloqueado || sinObra}
                          style={{fontSize:'11px', border:'1px solid', borderColor: parseFloat(a[d])===0 ? '#fca5a5' : '#e5e7eb', borderRadius:'4px', padding:'2px 1px', width:'46px', textAlign:'center', background: parseFloat(a[d])===0 ? '#fef2f2' : sinObra ? '#f9fafb' : 'white', color: parseFloat(a[d])===0 ? '#ef4444' : sinObra ? '#d1d5db' : '#374151'}}>
                          <option value={1.1}>✓</option>
                          <option value={0.5}>½</option>
                          <option value={0}>✗</option>
                        </select>
                      </td>
                    ))}
                    <td style={{padding:'4px 6px', textAlign:'center', fontWeight:600, color: sinObra ? '#d1d5db' : tieneFalta ? '#ef4444' : '#374151'}}>
                      {esVacaciones ? <span style={{fontSize:'10px',color:'#0369a1',background:'#e0f2fe',padding:'1px 6px',borderRadius:'10px'}}>Vac</span> : esBaja ? <span style={{fontSize:'10px',color:'#dc2626',background:'#fee2e2',padding:'1px 6px',borderRadius:'10px'}}>Baja</span> : sinObra ? '—' : dias % 1 === 0 ? dias : dias.toFixed(1)}
                    </td>
                    <td style={{padding:'4px 4px', textAlign:'center'}}>
                      <input type="number" min="0" max="20" step="0.5"
                        value={a.horas_extra || ''}
                        placeholder="0"
                        onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                        disabled={bloqueado || sinObra}
                        style={{width:'50px', fontSize:'11px', border:'1px solid #e5e7eb', borderRadius:'4px', padding:'2px 4px', textAlign:'center', background: sinObra ? '#f9fafb' : 'white', color: sinObra ? '#d1d5db' : '#374151'}} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{borderTop:'2px solid #e5e7eb', background:'#f9fafb'}}>
                <td colSpan={11} style={{padding:'8px', fontSize:'11px', color:'#9ca3af'}}>
                  {totalAsignados} trabajadores asignados · {trabajadores.filter(t => obraSeleccionada[t.id] && calcularDias(asistencias[t.id]||{}) < 6).length} con falta
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
