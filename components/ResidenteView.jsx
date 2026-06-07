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
  const [obrasResidente, setObrasResidente] = useState([]) // obras que puede asignar
  const [semana, setSemana] = useState(null)
  const [trabajadores, setTrabajadores] = useState([])
  const [asistencias, setAsistencias] = useState({})
  const [obraSeleccionada, setObraSeleccionada] = useState({}) // obraId por trabajador
  const [nominasPorObra, setNominasPorObra] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [filtro, setFiltro] = useState('todos') // 'todos' | 'asignados' | 'sin-asignar'

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    // Obras asignadas al residente (las únicas que puede seleccionar)
    const { data: asignaciones } = await supabase
      .from('asignaciones')
      .select('obra:obras(id, nombre)')
      .eq('usuario_id', perfil.id)
    const obras = (asignaciones || []).map(a => a.obra)
    setObrasResidente(obras)

    // Semana abierta
    const { data: semanas } = await supabase
      .from('semanas').select('*').eq('estado', 'abierta')
      .order('fecha_inicio', { ascending: false }).limit(1)
    if (!semanas || semanas.length === 0) return
    const sem = semanas[0]
    setSemana(sem)

    // Todos los trabajadores excepto OFICINA
    const { data: todasObras } = await supabase.from('obras').select('id,nombre')
    const oficinaId = (todasObras || []).find(o => o.nombre === 'OFICINA')?.id
    let q = supabase.from('trabajadores')
      .select('id, num_empleado, nombre, puesto, tiene_bono, obra_id')
      .eq('activo', true)
      .order('num_empleado', { ascending: true })
    if (oficinaId) q = q.neq('obra_id', oficinaId)
    const { data: trab } = await q
    setTrabajadores(trab || [])

    // Nóminas de esta semana para las obras del residente
    const obraIds = obras.map(o => o.id)
    let nominasMap = {}
    if (obraIds.length > 0) {
      const { data: nominas } = await supabase
        .from('nominas_obra').select('*')
        .eq('semana_id', sem.id)
        .in('obra_id', obraIds)
      ;(nominas || []).forEach(n => { nominasMap[n.obra_id] = n })
    }
    setNominasPorObra(nominasMap)

    // Cargar asistencias ya guardadas para saber qué obra tiene cada trabajador
    const obraSelecInit = {}
    const asistInit = {}
    for (const obraId of obraIds) {
      const nom = nominasMap[obraId]
      if (!nom) continue
      const { data: asist } = await supabase
        .from('asistencias').select('*, trabajador_id')
        .eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => {
        obraSelecInit[a.trabajador_id] = obraId
        asistInit[a.trabajador_id] = a
      })
    }

    // Inicializar asistencia por defecto para todos
    ;(trab || []).forEach(t => {
      if (!asistInit[t.id]) {
        asistInit[t.id] = {
          trabajador_id: t.id,
          viernes: 1.1, sabado: 1.1, domingo: 0,
          lunes: 1.1, martes: 1.1, miercoles: 1.1, jueves: 1.1,
          horas_extra: 0, prestamos: 0
        }
      }
      if (!obraSelecInit[t.id]) obraSelecInit[t.id] = ''
    })

    setAsistencias(asistInit)
    setObraSeleccionada(obraSelecInit)
  }

  function updateAsistencia(trabajadorId, campo, valor) {
    setAsistencias(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], [campo]: valor } }))
  }

  function updateObra(trabajadorId, obraId) {
    setObraSeleccionada(prev => ({ ...prev, [trabajadorId]: obraId }))
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
    for (const obraId of obrasResidente.map(o => o.id)) {
      const nom = nominasPorObra[obraId]
      if (nom && nom.estado === 'borrador') {
        await supabase.from('nominas_obra')
          .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
          .eq('id', nom.id)
      }
    }
    await cargarDatos(); setEnviando(false)
  }

  // Filtrar trabajadores según selección
  const trabajadoresFiltrados = trabajadores.filter(t => {
    const obraId = obraSeleccionada[t.id]
    if (filtro === 'asignados') return !!obraId
    if (filtro === 'sin-asignar') return !obraId
    return true
  })

  const totalAsignados = trabajadores.filter(t => !!obraSeleccionada[t.id]).length
  const todasBloqueadas = obrasResidente.every(o => nominasPorObra[o.id]?.estado !== 'borrador')

  if (!semana) return (
    <div className="text-center py-20 text-gray-400">
      <div className="text-4xl mb-3">📅</div>
      <p>No hay semana abierta. El superintendente debe abrir la semana.</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">
            Captura — {obrasResidente.map(o => o.nombre).join(' · ')}
          </h2>
          <p className="text-sm text-gray-500">Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {msg && <span className="text-green-600 text-sm font-medium">{msg}</span>}
          {!todasBloqueadas && <>
            <button onClick={guardar} disabled={guardando}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {guardando ? 'Guardando...' : '💾 Guardar'}
            </button>
            <button onClick={() => { if (confirm('¿Enviar nómina? Ya no podrás modificarla.')) enviar() }}
              disabled={enviando}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar nómina →'}
            </button>
          </>}
          {todasBloqueadas && (
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">✓ Enviada</span>
          )}
        </div>
      </div>

      {/* Métricas y filtro */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-2">
          {[['todos','Todos'],['asignados','Asignados'],['sin-asignar','Sin asignar']].map(([val,lbl]) => (
            <button key={val} onClick={() => setFiltro(val)}
              className={`px-3 py-1 rounded-full text-xs border font-medium ${filtro === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {totalAsignados} de {trabajadores.length} trabajadores asignados
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs">#</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs">Trabajador</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs">Puesto</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs">Obra</th>
                {DIAS_LABEL.map(d => (
                  <th key={d} className="text-center px-2 py-3 font-medium text-gray-500 text-xs">{d}</th>
                ))}
                <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs">Días</th>
                <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs">H.Extra</th>
                <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs">Préstamos</th>
                <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs">Bono</th>
              </tr>
            </thead>
            <tbody>
              {trabajadoresFiltrados.map(t => {
                const a = asistencias[t.id] || {}
                const dias = calcularDias(a)
                const tieneFalta = dias < 6
                const bonoAplica = t.tiene_bono && !tieneFalta
                const obraId = obraSeleccionada[t.id]
                const nom = nominasPorObra[obraId]
                const bloqueado = nom && nom.estado !== 'borrador'
                const sinObra = !obraId

                return (
                  <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 ${sinObra ? 'opacity-50' : tieneFalta ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{String(t.num_empleado).padStart(4,'0')}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.nombre}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{t.puesto}</td>
                    <td className="px-3 py-2">
                      <select value={obraId || ''} onChange={e => updateObra(t.id, e.target.value)}
                        disabled={bloqueado}
                        className={`text-xs border rounded px-1 py-1 w-32 ${bloqueado ? 'bg-gray-50 text-gray-400' : obraId ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                        <option value="">— Sin asignar —</option>
                        {obrasResidente.map(o => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                      </select>
                    </td>
                    {DIAS.map(d => (
                      <td key={d} className="px-1 py-2 text-center">
                        <select value={a[d] ?? 1.1}
                          onChange={e => updateAsistencia(t.id, d, parseFloat(e.target.value))}
                          disabled={bloqueado || sinObra}
                          className={`text-xs border rounded px-1 py-0.5 w-12 text-center ${
                            bloqueado || sinObra ? 'bg-gray-50 text-gray-300' :
                            parseFloat(a[d]) === 0 ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200'
                          }`}>
                          <option value={1.1}>✓</option>
                          <option value={0.5}>½</option>
                          <option value={0}>✗</option>
                        </select>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-medium ${sinObra ? 'text-gray-300' : tieneFalta ? 'text-red-500' : 'text-gray-700'}`}>
                        {sinObra ? '—' : dias.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input type="number" min="0" step="0.5" value={a.horas_extra || 0}
                        onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                        disabled={bloqueado || sinObra}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 w-12 text-center disabled:bg-gray-50 disabled:text-gray-300" />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input type="number" min="0" step="100" value={a.prestamos || 0}
                        onChange={e => updateAsistencia(t.id, 'prestamos', e.target.value)}
                        disabled={bloqueado || sinObra}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 w-16 text-center disabled:bg-gray-50 disabled:text-gray-300" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {!sinObra && t.tiene_bono ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bonoAplica ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                          {bonoAplica ? '✓' : '✗'}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={11} className="px-3 py-3 text-xs text-gray-400">
                  {totalAsignados} trabajadores asignados · {trabajadores.filter(t => {
                    const oId = obraSeleccionada[t.id]
                    return oId && calcularDias(asistencias[t.id]||{}) < 6
                  }).length} con falta · 💡 Falta = bono cancelado
                </td>
                <td colSpan={2} className="px-3 py-3 text-right text-xs text-gray-500">
                  H.Extra: {trabajadores.reduce((s,t) => s + (parseFloat((asistencias[t.id]||{}).horas_extra)||0), 0)}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
