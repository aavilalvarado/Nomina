import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'


const DIAS = ['viernes','sabado','domingo','lunes','martes','miercoles','jueves']
const DIAS_LABEL = ['Vie','Sáb','Dom','Lun','Mar','Mié','Jue']

function calcularDias(a) {
  return DIAS.reduce((sum, d) => {
    const v = parseFloat(a[d])
    return sum + (v === 1.1 ? 1 : isNaN(v) ? 0 : v)
  }, 0)
}

function SinObraCaptura({ trabajadores, semana, perfil, supabase, onGuardado }) {
  const [obras, setObras] = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState({})
  const [asistencias, setAsistencias] = useState({})
  const [nominasPorObra, setNominasPorObra] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    supabase.from('obras').select('id,nombre').eq('activa',true).neq('nombre','OFICINA').order('nombre')
      .then(({data}) => setObras(data||[]))
    // Inicializar asistencias
    const init = {}
    ;(trabajadores||[]).forEach(t => {
      init[t.id] = { viernes:1.1, sabado:1.1, domingo:0, lunes:1.1, martes:1.1, miercoles:1.1, jueves:1.1, horas_extra:0 }
    })
    setAsistencias(init)
  }, [trabajadores])

  async function getNominaId(obraId) {
    if (nominasPorObra[obraId]) return nominasPorObra[obraId]
    let { data: nom } = await supabase.from('nominas_obra').select('id,estado')
      .eq('semana_id', semana.id).eq('obra_id', obraId).single()
    if (!nom) {
      const { data } = await supabase.from('nominas_obra')
        .insert({ semana_id: semana.id, obra_id: obraId, residente_id: perfil.id })
        .select().single()
      nom = data
    }
    setNominasPorObra(prev => ({...prev, [obraId]: nom.id}))
    return nom.id
  }

  async function guardar() {
    if (!semana) return
    setGuardando(true)
    for (const t of (trabajadores||[])) {
      const obraId = obraSeleccionada[t.id]
      if (!obraId) continue
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
        prestamos: 0, bono_aplicado: 0, total_pagar: 0
      }, { onConflict: 'nomina_obra_id,trabajador_id' })
    }
    setGuardando(false)
    onGuardado()
  }

  const totalAsignados = (trabajadores||[]).filter(t => obraSeleccionada[t.id]).length
  const filtrados = (trabajadores||[]).filter(t => {
    if (filtro === 'asignados') return !!obraSeleccionada[t.id]
    if (filtro === 'sin-asignar') return !obraSeleccionada[t.id]
    return true
  })

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-medium text-sm text-gray-900">Personal sin asignar esta semana</span>
          <p className="text-xs text-gray-400 mt-0.5">Asigna obra y asistencia a los trabajadores que quedaron sin capturar</p>
        </div>
        <button onClick={guardar} disabled={guardando || totalAsignados===0}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : `💾 Guardar (${totalAsignados} trabajadores)`}
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {[['todos','Todos'],['asignados','Asignados'],['sin-asignar','Sin asignar']].map(([val,lbl]) => (
            <button key={val} onClick={() => setFiltro(val)}
              className={`px-3 py-1 rounded-full text-xs border font-medium ${filtro===val?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-500 border-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{totalAsignados} de {(trabajadores||[]).length} asignados</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table style={{borderCollapse:'collapse',fontSize:'12px',whiteSpace:'nowrap',width:'100%'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500}}>#</th>
                <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500,minWidth:'180px'}}>Trabajador</th>
                <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500}}>Puesto</th>
                <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500,minWidth:'120px'}}>Obra</th>
                {DIAS_LABEL.map(d => <th key={d} style={{textAlign:'center',padding:'8px 3px',color:'#9ca3af',fontWeight:500,width:'48px'}}>{d}</th>)}
                <th style={{textAlign:'center',padding:'8px',color:'#9ca3af',fontWeight:500,width:'44px'}}>Días</th>
                <th style={{textAlign:'center',padding:'8px',color:'#9ca3af',fontWeight:500,width:'58px'}}>H.Extra</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.filter(t => t && t.nombre).map(t => {
                const a = asistencias[t.id] || {}
                const obraId = obraSeleccionada[t.id]
                const sinObra = !obraId
                const dias = calcularDias(a)
                const tieneFalta = dias < 6
                return (
                  <tr key={t.id} style={{borderBottom:'1px solid #f9fafb', background: sinObra?'#fafafa':tieneFalta?'#fff5f5':'white'}}>
                    <td style={{padding:'5px 8px',color:'#d1d5db',fontSize:'11px'}}>{String(t.num_empleado||'').padStart(4,'0')}</td>
                    <td style={{padding:'5px 8px',fontWeight:500,color:sinObra?'#9ca3af':'#111827'}}>{t.nombre}</td>
                    <td style={{padding:'5px 8px',color:'#6b7280',fontSize:'11px'}}>{t.puesto}</td>
                    <td style={{padding:'5px 8px'}}>
                      <select value={obraId||''} onChange={e => setObraSeleccionada(prev=>({...prev,[t.id]:e.target.value}))}
                        style={{fontSize:'11px',border:'1px solid',borderColor:obraId?'#93c5fd':'#e5e7eb',borderRadius:'6px',padding:'2px 4px',width:'115px',background:obraId?'#eff6ff':'white',color:obraId?'#1d4ed8':'#6b7280'}}>
                        <option value="">— Sin asignar —</option>
                        {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      </select>
                    </td>
                    {DIAS.map(d => (
                      <td key={d} style={{padding:'3px 2px',textAlign:'center'}}>
                        <select value={a[d]??1.1}
                          onChange={e => setAsistencias(prev=>({...prev,[t.id]:{...prev[t.id],[d]:parseFloat(e.target.value)}}))}
                          disabled={sinObra}
                          style={{fontSize:'11px',border:'1px solid',borderColor:parseFloat(a[d])===0?'#fca5a5':'#e5e7eb',borderRadius:'4px',padding:'2px 1px',width:'44px',textAlign:'center',background:parseFloat(a[d])===0?'#fef2f2':sinObra?'#f9fafb':'white',color:parseFloat(a[d])===0?'#ef4444':sinObra?'#d1d5db':'#374151'}}>
                          <option value={1.1}>✓</option>
                          <option value={0.5}>½</option>
                          <option value={0}>✗</option>
                        </select>
                      </td>
                    ))}
                    <td style={{padding:'5px 6px',textAlign:'center',fontWeight:600,color:sinObra?'#d1d5db':tieneFalta?'#ef4444':'#374151'}}>
                      {sinObra?'—':dias%1===0?dias:dias.toFixed(1)}
                    </td>
                    <td style={{padding:'3px 4px',textAlign:'center'}}>
                      <input type="number" min="0" step="0.5" value={a.horas_extra||''} placeholder="0"
                        disabled={sinObra}
                        onChange={e => setAsistencias(prev=>({...prev,[t.id]:{...prev[t.id],horas_extra:e.target.value}}))}
                        style={{width:'48px',fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'4px',padding:'2px 3px',textAlign:'center',background:sinObra?'#f9fafb':'white'}} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function SuperView({ perfil }) {
  const [semanas, setSemanas] = useState([])
  const [semanaActual, setSemanaActual] = useState(null)
  const [nominas, setNominas] = useState([])
  const [detalleNomina, setDetalleNomina] = useState(null)
  const [asistencias, setAsistencias] = useState([])
  const [cargando, setCargando] = useState(false)
  const [comentario, setComentario] = useState('')
  const [nuevaSemana, setNuevaSemana] = useState({ semana_num:'', fecha_inicio:'', fecha_fin:'' })
  const [showNuevaSemana, setShowNuevaSemana] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('nominas') // nominas | oficina | sin-obra | vacaciones | obras-inactivas
  // Datos adicionales
  const [trabajadoresSinObra, setTrabajadoresSinObra] = useState([])
  const [trabajadoresOficina, setTrabajadoresOficina] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [obrasInactivas, setObrasInactivas] = useState([])
  const [asistOficina, setAsistOficina] = useState({})
  const [nominaOficina, setNominaOficina] = useState(null)
  const [guardandoOficina, setGuardandoOficina] = useState(false)


  useEffect(() => { cargarTodo() }, [])
  useEffect(() => { if (semanaActual) { cargarNominas(); cargarIncidencias(); cargarOficina() } }, [semanaActual])

  async function cargarTodo() {
    const { data } = await supabase.from('semanas').select('*').order('fecha_inicio', { ascending: false })
    setSemanas(data || [])
    if (data && data.length > 0) setSemanaActual(data[0])

    // Obras inactivas
    const { data: inact } = await supabase.from('obras').select('*').eq('activa', false).order('nombre')
    setObrasInactivas(inact || [])

    // Trabajadores sin obra fija (obra_id null)
    const { data: sinObra } = await supabase.from('trabajadores')
      .select('*').is('obra_id', null).eq('activo', true)
    setTrabajadoresSinObra(sinObra || [])

    // Trabajadores de oficina
    const { data: oficina } = await supabase.from('obras').select('id').eq('nombre', 'OFICINA').single()
    if (oficina) {
      const { data: tOficina } = await supabase.from('trabajadores')
        .select('*').eq('obra_id', oficina.id).eq('activo', true).order('num_empleado')
      setTrabajadoresOficina(tOficina || [])
    }
  }

  async function cargarNominas() {
    const { data } = await supabase
      .from('nominas_obra')
      .select('*, obra:obras(nombre), residente:usuarios(nombre)')
      .eq('semana_id', semanaActual.id)
    setNominas((data || []).filter(n => n?.obra && n?.residente))

    // Calcular trabajadores no asignados esta semana
    const nominaIds = (data || []).map(n => n.id)
    let asignadosIds = []
    for (const nid of nominaIds) {
      const { data: asist } = await supabase
        .from('asistencias').select('trabajador_id').eq('nomina_obra_id', nid)
      asignadosIds = [...asignadosIds, ...(asist||[]).map(a => a.trabajador_id)]
    }
    // Todos los trabajadores activos excepto oficina
    const { data: oficina } = await supabase.from('obras').select('id').eq('nombre','OFICINA').single()
    const { data: todosTrab } = await supabase.from('trabajadores')
      .select('*').eq('activo', true).neq('obra_id', oficina?.id || '')
    const noAsignados = (todosTrab || []).filter(t => !asignadosIds.includes(t.id))
    setTrabajadoresSinObra(noAsignados)
  }

  async function cargarIncidencias() {
    const { data } = await supabase
      .from('incidencias')
      .select('*, trabajador:trabajadores(nombre, num_empleado, puesto), reportado:usuarios(nombre)')
      .eq('semana_id', semanaActual.id)
      .order('tipo')
    setIncidencias(data || [])
  }

  async function cargarOficina() {
    const { data: oficina } = await supabase.from('obras').select('id').eq('nombre', 'OFICINA').single()
    if (!oficina) return

    let { data: nom } = await supabase.from('nominas_obra').select('*')
      .eq('semana_id', semanaActual.id).eq('obra_id', oficina.id).single()

    if (!nom) {
      const { data: nueva } = await supabase.from('nominas_obra')
        .insert({ semana_id: semanaActual.id, obra_id: oficina.id, residente_id: perfil.id })
        .select().single()
      nom = nueva
    }
    setNominaOficina(nom)

    const { data: asist } = await supabase.from('asistencias').select('*').eq('nomina_obra_id', nom.id)
    const map = {}
    ;(asist || []).forEach(a => { map[a.trabajador_id] = a })

    const init = {}
    trabajadoresOficina.forEach(t => {
      init[t.id] = map[t.id] || {
        viernes:1.1, sabado:1.1, domingo:0, lunes:1.1, martes:1.1, miercoles:1.1, jueves:1.1,
        horas_extra:0, prestamos:0
      }
    })
    setAsistOficina(init)
  }

  async function guardarOficina() {
    if (!nominaOficina) return
    setGuardandoOficina(true)
    const rows = (trabajadoresOficina || []).filter(t => t && t.nombre).map(t => {
      const a = asistOficina[t.id] || {}
      const dias = DIAS.reduce((s,d) => s + (parseFloat(a[d])===1.1?1:parseFloat(a[d])||0), 0)
      return {
        nomina_obra_id: nominaOficina.id, trabajador_id: t.id,
        viernes: parseFloat(a.viernes)||0, sabado: parseFloat(a.sabado)||0,
        domingo: parseFloat(a.domingo)||0, lunes: parseFloat(a.lunes)||0,
        martes: parseFloat(a.martes)||0, miercoles: parseFloat(a.miercoles)||0,
        jueves: parseFloat(a.jueves)||0, dias_total: dias,
        horas_extra: parseFloat(a.horas_extra)||0,
        prestamos: parseFloat(a.prestamos)||0,
        bono_aplicado: 0, total_pagar: 0
      }
    })
    await supabase.from('asistencias').upsert(rows, { onConflict: 'nomina_obra_id,trabajador_id' })
    setGuardandoOficina(false)
    setMsg('✓ Oficina guardada')
    setTimeout(() => setMsg(''), 2000)
  }

  async function verDetalle(nomina) {
    setCargando(true); setDetalleNomina(nomina); setComentario('')
    const { data } = await supabase.from('asistencias')
      .select('*, trabajador:trabajadores(*)')
      .eq('nomina_obra_id', nomina.id)
    setAsistencias(data || [])
    setCargando(false)
  }

  async function aprobar() {
    await supabase.from('nominas_obra').update({ estado:'aprobada', aprobada_at: new Date().toISOString() }).eq('id', detalleNomina.id)
    setMsg('✓ Nómina aprobada'); setDetalleNomina(null); cargarNominas()
    setTimeout(() => setMsg(''), 3000)
  }

  async function rechazar() {
    if (!comentario) { alert('Escribe un comentario para el residente'); return }
    await supabase.from('nominas_obra').update({ estado:'rechazada', comentario_rechazo: comentario }).eq('id', detalleNomina.id)
    setMsg('Nómina regresada'); setDetalleNomina(null); cargarNominas()
    setTimeout(() => setMsg(''), 3000)
  }

  async function crearSemana() {
    await supabase.from('semanas').insert(nuevaSemana)
    setShowNuevaSemana(false)
    setNuevaSemana({ semana_num:'', fecha_inicio:'', fecha_fin:'' })
    cargarTodo()
  }

  async function cerrarSemana() {
    if (!confirm('¿Cerrar esta semana?')) return
    await supabase.from('semanas').update({ estado:'cerrada' }).eq('id', semanaActual.id)
    cargarTodo()
  }

  async function exportarExcel() {
    const { data: todasNominas } = await supabase.from('nominas_obra')
      .select('*, obra:obras(nombre)').eq('semana_id', semanaActual.id)
    const rows = []
    for (const nom of (todasNominas || [])) {
      const { data: asist } = await supabase.from('asistencias')
        .select('*, trabajador:trabajadores(*)').eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => {
        const t = a.trabajador
        rows.push({
          'No.': String(t.num_empleado).padStart(4,'0'),
          'Trabajador': t.nombre, 'Puesto': t.puesto,
          'Obra': nom.obra?.nombre, 'Forma Pago': t.forma_pago,
          'Vie':a.viernes,'Sáb':a.sabado,'Dom':a.domingo,
          'Lun':a.lunes,'Mar':a.martes,'Mié':a.miercoles,'Jue':a.jueves,
          'Días':a.dias_total, 'H.Extra':a.horas_extra,
          'Sueldo Semanal':t.sueldo_semanal,
          'Préstamos':a.prestamos, 'Bono':t.monto_bono||0,
          'Total':a.total_pagar
        })
      })
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, `Sem${semanaActual.semana_num}`)
    XLSX.writeFile(wb, `Nomina_Sem${semanaActual.semana_num}.xlsx`)
  }

  const listas = nominas.filter(n => n.estado === 'enviada' || n.estado === 'aprobada').length
  const vacaciones = incidencias.filter(i => i.tipo === 'vacaciones')
  const bajas = incidencias.filter(i => i.tipo === 'baja')

  const TABS = [
    { id:'nominas', label:'📋 Nóminas', badge: nominas.length },
    { id:'oficina', label:'🏢 Oficina', badge: null },
    { id:'vacaciones', label:'🏖 Vacaciones', badge: vacaciones.length || null },
    { id:'bajas', label:'🚫 Bajas', badge: bajas.length || null },
    { id:'sin-obra', label:'👷 Sin obra', badge: trabajadoresSinObra.length || null },
    { id:'obras-inactivas', label:'📁 Obras inactivas', badge: obrasInactivas.length || null },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Panel del Superintendente</h2>
          {semanaActual && (
            <p className="text-sm text-gray-500">
              Semana {semanaActual.semana_num} · {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${semanaActual.estado==='abierta'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                {semanaActual.estado}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {msg && <span className="text-green-600 text-sm">{msg}</span>}
          <button onClick={exportarExcel} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">📊 Excel</button>
          {semanaActual?.estado==='abierta' && <button onClick={cerrarSemana} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cerrar semana</button>}
          <button onClick={() => setShowNuevaSemana(true)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Nueva semana</button>
        </div>
      </div>

      {/* Selector de semanas */}
      {semanas.length > 1 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {semanas.filter(s => s && s.id).map(s => (
            <button key={s.id} onClick={() => setSemanaActual(s)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border ${semanaActual?.id===s.id?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-500 border-gray-200'}`}>
              Sem {s.semana_num}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab===t.id?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* TAB: NÓMINAS */}
      {tab === 'nominas' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {nominas.filter(n => n && n.obra && n.obra.nombre && n.residente && n.residente.nombre).map(n => (
              <div key={n.id} onClick={() => n.estado==='enviada' && verDetalle(n)}
                className={`bg-white rounded-xl border p-4 transition-all ${n.estado==='enviada'?'cursor-pointer hover:shadow-md border-blue-200':n.estado==='aprobada'?'border-green-200':n.estado==='rechazada'?'border-red-200':'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 text-sm">{n.obra?.nombre}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.estado==='aprobada'?'bg-green-100 text-green-700':n.estado==='enviada'?'bg-blue-100 text-blue-700':n.estado==='rechazada'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>
                    {n.estado==='borrador'?'Pendiente':n.estado==='enviada'?'Para revisar':n.estado==='aprobada'?'✓ Aprobada':'Regresada'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{n.residente?.nombre}</p>
                {n.estado==='enviada' && <p className="text-xs text-blue-500 mt-1 font-medium">Clic para revisar →</p>}
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Progreso semana</span>
              <span className="text-sm font-medium">{listas}/{nominas.length} obras</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full">
              <div className="h-2 bg-blue-500 rounded-full transition-all" style={{width:`${nominas.length?((listas/nominas.length)*100):0}%`}} />
            </div>
          </div>
        </div>
      )}

      {/* TAB: OFICINA */}
      {tab === 'oficina' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-medium text-sm text-gray-900">Asistencia — OFICINA</span>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {nominaOficina?.estado === 'aprobada' && <span style={{fontSize:'12px',background:'#dcfce7',color:'#16a34a',padding:'3px 10px',borderRadius:'20px',fontWeight:500}}>✓ Aprobada</span>}
              {nominaOficina?.estado !== 'aprobada' && (
                <>
                  <button onClick={guardarOficina} disabled={guardandoOficina}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {guardandoOficina ? 'Guardando...' : '💾 Guardar'}
                  </button>
                  <button onClick={async () => {
                    await guardarOficina()
                    await supabase.from('nominas_obra').update({estado:'aprobada', aprobada_at: new Date().toISOString()}).eq('id', nominaOficina.id)
                    setNominaOficina(prev => ({...prev, estado:'aprobada'}))
                    setMsg('✓ Oficina aprobada')
                    setTimeout(()=>setMsg(''),3000)
                  }} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">
                    ✓ Aprobar
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
              <thead>
                <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                  <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500}}>#</th>
                  <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500,minWidth:'200px'}}>Trabajador</th>
                  <th style={{textAlign:'left',padding:'8px',color:'#9ca3af',fontWeight:500}}>Puesto</th>
                  {DIAS_LABEL.map(d => <th key={d} style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500,width:'48px'}}>{d}</th>)}
                  <th style={{textAlign:'center',padding:'8px',color:'#9ca3af',fontWeight:500}}>Días</th>
                  <th style={{textAlign:'center',padding:'8px',color:'#9ca3af',fontWeight:500}}>H.Extra</th>
                  <th style={{textAlign:'center',padding:'8px',color:'#9ca3af',fontWeight:500}}>Préstamos</th>
                </tr>
              </thead>
              <tbody>
                {(trabajadoresOficina || []).filter(t => t && t.nombre && t.id).map(t => {
                  const a = asistOficina[t.id] || {}
                  const dias = DIAS.reduce((s,d) => s + (parseFloat(a[d])===1.1?1:parseFloat(a[d])||0), 0)
                  return (
                    <tr key={t.id} style={{borderBottom:'1px solid #f9fafb'}}>
                      <td style={{padding:'6px 8px',color:'#9ca3af'}}>{String(t.num_empleado).padStart(4,'0')}</td>
                      <td style={{padding:'6px 8px',fontWeight:500}}>{t.nombre}</td>
                      <td style={{padding:'6px 8px',color:'#6b7280',fontSize:'11px'}}>{t.puesto}</td>
                      {DIAS.map(d => (
                        <td key={d} style={{padding:'4px 2px',textAlign:'center'}}>
                          <select value={a[d]??1.1} onChange={e => setAsistOficina(prev => ({...prev,[t.id]:{...prev[t.id],[d]:parseFloat(e.target.value)}}))}
                            style={{fontSize:'11px',border:'1px solid',borderColor:parseFloat(a[d])===0?'#fca5a5':'#e5e7eb',borderRadius:'4px',padding:'2px',width:'44px',background:parseFloat(a[d])===0?'#fef2f2':'white',color:parseFloat(a[d])===0?'#ef4444':'#374151'}}>
                            <option value={1.1}>✓</option>
                            <option value={0.5}>½</option>
                            <option value={0}>✗</option>
                          </select>
                        </td>
                      ))}
                      <td style={{padding:'6px 8px',textAlign:'center',fontWeight:600,color:dias<6?'#ef4444':'#374151'}}>{dias}</td>
                      <td style={{padding:'4px 6px',textAlign:'center'}}>
                        <input type="number" min="0" step="0.5" value={a.horas_extra||0}
                          onChange={e => setAsistOficina(prev => ({...prev,[t.id]:{...prev[t.id],horas_extra:e.target.value}}))}
                          style={{width:'48px',fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'4px',padding:'2px 4px',textAlign:'center'}} />
                      </td>
                      <td style={{padding:'4px 6px',textAlign:'center'}}>
                        <input type="number" min="0" step="100" value={a.prestamos||0}
                          onChange={e => setAsistOficina(prev => ({...prev,[t.id]:{...prev[t.id],prestamos:e.target.value}}))}
                          style={{width:'60px',fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'4px',padding:'2px 4px',textAlign:'center'}} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: VACACIONES */}
      {tab === 'vacaciones' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <span className="font-medium text-sm text-gray-900">Personal de vacaciones esta semana</span>
          </div>
          {vacaciones.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No hay personal de vacaciones esta semana</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{background:'#f0f9ff',borderBottom:'1px solid #e0f2fe'}}>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#0369a1',fontWeight:500}}>#</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#0369a1',fontWeight:500}}>Trabajador</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#0369a1',fontWeight:500}}>Puesto</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#0369a1',fontWeight:500}}>Desde</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#0369a1',fontWeight:500}}>Reportado por</th>
                </tr>
              </thead>
              <tbody>
                {vacaciones.filter(i => i && i.trabajador).map(i => (
                  <tr key={i.id} style={{borderBottom:'1px solid #f0f9ff'}}>
                    <td style={{padding:'8px 12px',color:'#9ca3af'}}>{String(i.trabajador?.num_empleado||'').padStart(4,'0')}</td>
                    <td style={{padding:'8px 12px',fontWeight:500}}>{i.trabajador?.nombre}</td>
                    <td style={{padding:'8px 12px',color:'#6b7280',fontSize:'12px'}}>{i.trabajador?.puesto}</td>
                    <td style={{padding:'8px 12px',color:'#0369a1'}}>{i.fecha_inicio || '—'}</td>
                    <td style={{padding:'8px 12px',color:'#6b7280'}}>{i.reportado?.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: BAJAS */}
      {tab === 'bajas' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <span className="font-medium text-sm text-gray-900">Personal para dar de baja</span>
          </div>
          {bajas.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No hay bajas reportadas esta semana</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{background:'#fef2f2',borderBottom:'1px solid #fee2e2'}}>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>#</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>Trabajador</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>Puesto</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>Fecha de baja</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>Reportado por</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#dc2626',fontWeight:500}}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {bajas.filter(i => i && i.trabajador).map(i => (
                  <tr key={i.id} style={{borderBottom:'1px solid #fef2f2'}}>
                    <td style={{padding:'8px 12px',color:'#9ca3af'}}>{String(i.trabajador?.num_empleado||'').padStart(4,'0')}</td>
                    <td style={{padding:'8px 12px',fontWeight:500}}>{i.trabajador?.nombre}</td>
                    <td style={{padding:'8px 12px',color:'#6b7280',fontSize:'12px'}}>{i.trabajador?.puesto}</td>
                    <td style={{padding:'8px 12px',color:'#dc2626'}}>{i.fecha_inicio || '—'}</td>
                    <td style={{padding:'8px 12px',color:'#6b7280'}}>{i.reportado?.nombre}</td>
                    <td style={{padding:'8px 12px'}}>
                      <button onClick={async () => {
                        if (confirm(`¿Confirmar baja de ${i.trabajador?.nombre}?`)) {
                          await supabase.from('trabajadores').update({activo:false}).eq('id',i.trabajador_id)
                          cargarIncidencias()
                          setMsg('✓ Trabajador dado de baja')
                          setTimeout(()=>setMsg(''),3000)
                        }
                      }} className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700">
                        Confirmar baja
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: SIN OBRA */}
      {tab === 'sin-obra' && (
        <SinObraCaptura
          trabajadores={trabajadoresSinObra}
          semana={semanaActual}
          perfil={perfil}
          supabase={supabase}
          onGuardado={() => { cargarNominas(); setMsg('✓ Guardado'); setTimeout(()=>setMsg(''),2000) }}
        />
      )}

      {/* TAB: OBRAS INACTIVAS */}
      {tab === 'obras-inactivas' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <span className="font-medium text-sm text-gray-900">Obras inactivas</span>
          </div>
          {obrasInactivas.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No hay obras inactivas</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Obra</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Residente</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Fecha arranque</th>
                  <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {obrasInactivas.filter(o => o && o.nombre).map(o => (
                  <tr key={o.id} style={{borderBottom:'1px solid #f9fafb'}}>
                    <td style={{padding:'8px 12px',fontWeight:500,color:'#6b7280'}}>{o.nombre}</td>
                    <td style={{padding:'8px 12px'}}>
                      <input 
                        defaultValue={o.residente_responsable || ''}
                        onBlur={async e => {
                          await supabase.from('obras').update({residente_responsable: e.target.value}).eq('id',o.id)
                          cargarTodo()
                        }}
                        placeholder="Nombre residente"
                        style={{fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'6px',padding:'3px 6px',width:'130px',color:'#374151'}}
                      />
                    </td>
                    <td style={{padding:'8px 12px',color:'#9ca3af',fontSize:'12px'}}>{o.fecha_arranque || '—'}</td>
                    <td style={{padding:'8px 12px'}}>
                      <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                        <input type="date" 
                          placeholder="Fecha arranque"
                          onChange={async e => {
                            await supabase.from('obras').update({fecha_arranque: e.target.value}).eq('id',o.id)
                            cargarTodo()
                          }}
                          style={{fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'6px',padding:'3px 6px',color:'#374151'}}
                        />
                        <button onClick={async () => {
                          await supabase.from('obras').update({activa:true}).eq('id',o.id)
                          cargarTodo()
                          setMsg('✓ Obra reactivada')
                          setTimeout(()=>setMsg(''),3000)
                        }} className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700">
                          Activar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal nueva semana */}
      {showNuevaSemana && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-4">Abrir nueva semana</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Número (ej. 25-2026)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={nuevaSemana.semana_num} onChange={e => setNuevaSemana(p=>({...p,semana_num:e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha inicio</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={nuevaSemana.fecha_inicio} onChange={e => setNuevaSemana(p=>({...p,fecha_inicio:e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha fin</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={nuevaSemana.fecha_fin} onChange={e => setNuevaSemana(p=>({...p,fecha_fin:e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNuevaSemana(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={crearSemana} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal revisión nómina */}
      {detalleNomina && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Revisando: {detalleNomina.obra?.nombre}</h3>
                <p className="text-xs text-gray-500">Residente: {detalleNomina.residente?.nombre}</p>
              </div>
              <button onClick={() => setDetalleNomina(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-auto flex-1">
              {cargando ? (
                <div className="flex items-center justify-center py-12 text-gray-400">Cargando...</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px',whiteSpace:'nowrap'}}>
                  <thead style={{position:'sticky',top:0}}>
                    <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                      <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Trabajador</th>
                      <th style={{textAlign:'left',padding:'8px 6px',color:'#9ca3af',fontWeight:500}}>Puesto</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Vie</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Sáb</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Dom</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Lun</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Mar</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Mié</th>
                      <th style={{textAlign:'center',padding:'8px 4px',color:'#9ca3af',fontWeight:500}}>Jue</th>
                      <th style={{textAlign:'center',padding:'8px 6px',color:'#9ca3af',fontWeight:500}}>Días</th>
                      <th style={{textAlign:'center',padding:'8px 6px',color:'#9ca3af',fontWeight:500}}>H.Extra</th>
                      <th style={{textAlign:'right',padding:'8px 10px',color:'#7c3aed',fontWeight:500,background:'#f5f3ff'}}>Sueldo/Sem</th>
                      <th style={{textAlign:'right',padding:'8px 10px',color:'#7c3aed',fontWeight:500,background:'#f5f3ff'}}>Préstamos</th>
                      <th style={{textAlign:'right',padding:'8px 10px',color:'#7c3aed',fontWeight:500,background:'#f5f3ff'}}>Bono</th>
                      <th style={{textAlign:'right',padding:'8px 10px',color:'#7c3aed',fontWeight:500,background:'#f5f3ff'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asistencias.filter(a => a && a.trabajador).map(a => {
                      const t = a.trabajador
                      const tieneFalta = a.dias_total < 6
                      const bono = t?.tiene_bono && !tieneFalta ? (t?.monto_bono||0) : 0
                      return (
                        <tr key={a.id} style={{borderBottom:'1px solid #f9fafb',background:tieneFalta?'#fff5f5':'white'}}>
                          <td style={{padding:'6px 10px',fontWeight:500}}>{t?.nombre}</td>
                          <td style={{padding:'6px 6px',color:'#6b7280',fontSize:'11px'}}>{t?.puesto}</td>
                          {['viernes','sabado','domingo','lunes','martes','miercoles','jueves'].map(d => (
                            <td key={d} style={{padding:'6px 4px',textAlign:'center',color:parseFloat(a[d])===0?'#ef4444':'#374151',fontWeight:parseFloat(a[d])===0?600:400}}>
                              {parseFloat(a[d])===1.1?'✓':parseFloat(a[d])===0.5?'½':'✗'}
                            </td>
                          ))}
                          <td style={{padding:'6px',textAlign:'center',fontWeight:600,color:tieneFalta?'#ef4444':'#374151'}}>{a.dias_total}</td>
                          <td style={{padding:'6px',textAlign:'center'}}>{a.horas_extra}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',background:'#f5f3ff',color:'#6b7280'}}>${t?.sueldo_semanal?.toLocaleString('es-MX')}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',background:'#f5f3ff',color:'#6b7280'}}>${a.prestamos?.toLocaleString('es-MX')}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',background:'#f5f3ff',color:bono>0?'#16a34a':'#6b7280'}}>${bono?.toLocaleString('es-MX')}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',background:'#f5f3ff',fontWeight:600,color:'#7c3aed'}}>${a.total_pagar?.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid #e5e7eb',background:'#f5f3ff'}}>
                      <td colSpan={11} style={{padding:'10px',fontWeight:600,color:'#374151'}}>Total obra</td>
                      <td colSpan={4} style={{padding:'10px',textAlign:'right',fontWeight:700,color:'#7c3aed',fontSize:'14px'}}>
                        ${asistencias.reduce((s,a)=>s+(a.total_pagar||0),0).toLocaleString('es-MX',{minimumFractionDigits:2})}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 items-center">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Comentario si vas a regresar la nómina..."
                value={comentario} onChange={e => setComentario(e.target.value)} />
              <button onClick={rechazar} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Regresar</button>
              <button onClick={aprobar} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">✓ Aprobar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
