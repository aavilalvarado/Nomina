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
                    <td style={{padding:'5px 8px',color:'#d1d5db',fontSize:'11px'}}>{(t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0'))}</td>
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


function IncidenciasPreview({ semana, supabase }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [fechas, setFechas] = useState([])

  useEffect(() => { if (semana) cargar() }, [semana])

  async function cargar() {
    setCargando(true)
    // Calcular fechas de la semana
    const inicio = new Date(semana.fecha_inicio)
    const dias = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      dias.push(d.toLocaleDateString('es-MX', {day:'2-digit',month:'2-digit'}))
    }
    setFechas(dias)

    // Obtener TODAS las nóminas de la semana (todas las obras)
    const { data: nominas } = await supabase
      .from('nominas_obra')
      .select('id, obra:obras(nombre)')
      .eq('semana_id', semana.id)
    
    const empleadosMap = {}
    for (const nom of (nominas || [])) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('*, trabajador:trabajadores(num_empleado, nombre)')
        .eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => {
        if (!a.trabajador) return
        const t = a.trabajador
        empleadosMap[t.num_empleado] = {
          codigo: String(t.num_empleado).padStart(3,'0'),
          nombre: t.nombre,
          vie: parseFloat(a.viernes)||0, sab: parseFloat(a.sabado)||0,
          lun: parseFloat(a.lunes)||0, mar: parseFloat(a.martes)||0,
          mie: parseFloat(a.miercoles)||0, jue: parseFloat(a.jueves)||0,
          he: parseFloat(a.horas_extra)||0,
        }
      })
    }

    const getClave = (val, he=0, esSab=false) => {
      if (he > 0) return { clave: `${Math.round(he)}HE2`, color: '#00B050' }
      if (val === 0) return { clave: '1FINJ', color: '#FF0000' }
      return { clave: '', color: '' }
    }
    
    // Calcular HE2 neto considerando faltas (9 horas = 1 día)
    const calcHeNeto = (emp) => {
      if (emp.he <= 0) return 0
      // Contar faltas
      const dias = [emp.vie, emp.sab, emp.lun, emp.mar, emp.mie, emp.jue]
      const faltas = dias.filter(d => d === 0).length
      const horasFalta = faltas * 9 // 9 horas por día
      const heNeto = emp.he - horasFalta
      return Math.max(0, heNeto)
    }

    const resultado = []
    Object.values(empleadosMap).sort((a,b) => a.codigo.localeCompare(b.codigo)).forEach(emp => {
      const claves = [
        getClave(emp.vie),
        emp.sab === 0 ? { clave:'1FINJ', color:'#FF0000' } : { clave:'', color:'' },
        { clave:'', color:'' },
        getClave(emp.lun),
        getClave(emp.mar),
        getClave(emp.mie),
        emp.he > 0 ? { clave:`${Math.round(emp.he)}HE2`, color:'#00B050' } : getClave(emp.jue),
      ]
      if (claves.some(c => c.clave)) {
        resultado.push({ ...emp, claves })
      }
    })
    setFilas(resultado)
    setCargando(false)
  }

  const DIAS_LABEL = ['VIERNES','SÁBADO','DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES']

  if (cargando) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
  if (filas.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">No hay incidencias registradas esta semana</div>

  return (
    <div className="overflow-x-auto">
      <table style={{borderCollapse:'collapse',fontSize:'12px',whiteSpace:'nowrap',width:'100%'}}>
        <thead>
          <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
            <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Código</th>
            <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500,minWidth:'200px'}}>Trabajador</th>
            {DIAS_LABEL.map((d,i) => (
              <th key={d} style={{textAlign:'center',padding:'8px 6px',color:'#9ca3af',fontWeight:500,minWidth:'80px'}}>
                <div>{fechas[i]}</div>
                <div style={{fontSize:'10px'}}>{d}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f,idx) => (
            <tr key={f.codigo} style={{borderBottom:'1px solid #f9fafb',background:idx%2===0?'white':'#f9fafb'}}>
              <td style={{padding:'7px 10px',fontWeight:600,color:'#374151'}}>{f.codigo}</td>
              <td style={{padding:'7px 10px',color:'#374151'}}>{f.nombre}</td>
              {f.claves.map((c,i) => (
                <td key={i} style={{padding:'7px 6px',textAlign:'center',fontWeight:c.clave?700:400,color:c.color||'#d1d5db',fontFamily:'monospace',fontSize:'11px'}}>
                  {c.clave || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{background:'#f0f4ff',borderTop:'2px solid #e5e7eb'}}>
            <td colSpan={2} style={{padding:'8px 10px',fontWeight:600,fontSize:'12px',color:'#374151'}}>
              {filas.length} trabajadores con incidencias
            </td>
            <td colSpan={7} style={{padding:'8px 10px',textAlign:'right',fontSize:'11px',color:'#9ca3af'}}>
              <span style={{color:'#FF0000',fontWeight:600}}>1FINJ</span> = Falta &nbsp;|&nbsp;
              <span style={{color:'#FF9900',fontWeight:600}}>5RET</span> = Retardo &nbsp;|&nbsp;
              <span style={{color:'#00B050',fontWeight:600}}>xHE2</span> = Horas Extra
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}


function VacacionesControl({ vacaciones, supabase, onUpdate }) {
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)
  const [diasAjuste, setDiasAjuste] = useState('')
  const hoy = new Date()

  // Clasificar vacaciones
  const clasificar = (v) => {
    const venc = new Date(v.fecha_vencimiento)
    const diasRestantes = Math.ceil((venc - hoy) / (1000*60*60*24))
    const disponibles = v.dias_disponibles - v.dias_tomados
    if (!v.activo || disponibles <= 0) return 'agotadas'
    if (diasRestantes <= 0) return 'vencidas'
    if (diasRestantes <= 30) return 'proximas'
    return 'disponibles'
  }

  const filtradas = vacaciones.filter(v => {
    const cat = clasificar(v)
    const matchFiltro = filtro === 'todos' || cat === filtro
    const matchBusqueda = !busqueda || 
      v.trabajador?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      String(v.trabajador?.num_empleado || '').includes(busqueda)
    return matchFiltro && matchBusqueda
  })

  // Resumen
  const total = vacaciones.length
  const disponibles = vacaciones.filter(v => clasificar(v) === 'disponibles').length
  const proximas = vacaciones.filter(v => clasificar(v) === 'proximas').length
  const vencidas = vacaciones.filter(v => clasificar(v) === 'vencidas').length

  async function marcarDiasTomados(vac, dias) {
    const nuevosTomados = Math.min(vac.dias_disponibles, vac.dias_tomados + parseInt(dias))
    await supabase.from('vacaciones').update({ 
      dias_tomados: nuevosTomados,
      activo: nuevosTomados < vac.dias_disponibles
    }).eq('id', vac.id)
    setEditando(null)
    setDiasAjuste('')
    onUpdate()
  }

  const colorClase = (cat) => {
    if (cat === 'vencidas') return { bg:'#fef2f2', border:'#fecaca', text:'#dc2626', badge:'bg-red-100 text-red-700' }
    if (cat === 'proximas') return { bg:'#fffbeb', border:'#fde68a', text:'#d97706', badge:'bg-yellow-100 text-yellow-700' }
    if (cat === 'disponibles') return { bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a', badge:'bg-green-100 text-green-700' }
    return { bg:'#f9fafb', border:'#e5e7eb', text:'#9ca3af', badge:'bg-gray-100 text-gray-500' }
  }

  return (
    <div>
      {/* Métricas */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center cursor-pointer hover:shadow-sm"
          onClick={() => setFiltro('todos')}>
          <div className="text-2xl font-semibold text-gray-900">{total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total períodos</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center cursor-pointer hover:shadow-sm"
          onClick={() => setFiltro('disponibles')}>
          <div className="text-2xl font-semibold text-green-700">{disponibles}</div>
          <div className="text-xs text-green-600 mt-0.5">Con días disponibles</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-3 text-center cursor-pointer hover:shadow-sm"
          onClick={() => setFiltro('proximas')}>
          <div className="text-2xl font-semibold text-yellow-700">{proximas}</div>
          <div className="text-xs text-yellow-600 mt-0.5">Vencen en 30 días ⚠️</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center cursor-pointer hover:shadow-sm"
          onClick={() => setFiltro('vencidas')}>
          <div className="text-2xl font-semibold text-red-700">{vencidas}</div>
          <div className="text-xs text-red-600 mt-0.5">Vencidas / Perdidas</div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1">
          {[['todos','Todos'],['disponibles','Disponibles'],['proximas','Próximas a vencer'],['vencidas','Vencidas']].map(([val,lbl]) => (
            <button key={val} onClick={() => setFiltro(val)}
              className={`px-3 py-1 rounded-full text-xs border font-medium ${filtro===val?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-500 border-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Buscar trabajador..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-52" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
          <thead>
            <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
              <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>#</th>
              <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500,minWidth:'180px'}}>Trabajador</th>
              <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Obra</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Año</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Otorgadas</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Tomadas</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#7c3aed',fontWeight:500}}>Disponibles</th>
              <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Vence</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Estado</th>
              <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={10} style={{textAlign:'center',padding:'30px',color:'#9ca3af'}}>No hay registros con este filtro</td></tr>
            ) : filtradas.map((v, idx) => {
              const cat = clasificar(v)
              const col = colorClase(cat)
              const disponiblesActual = v.dias_disponibles - v.dias_tomados
              const venc = new Date(v.fecha_vencimiento)
              const diasRestantes = Math.ceil((venc - hoy) / (1000*60*60*24))
              const pct = Math.round((v.dias_tomados / v.dias_disponibles) * 100)

              return (
                <tr key={v.id} style={{borderBottom:'1px solid #f9fafb', background: idx%2===0?'white':'#fafafa'}}>
                  <td style={{padding:'8px 12px',color:'#9ca3af',fontFamily:'monospace',fontSize:'11px'}}>
                    {v.trabajador?.num_empleado == null ? 'NA' : String(v.trabajador.num_empleado).padStart(4,'0')}
                  </td>
                  <td style={{padding:'8px 12px',fontWeight:500,color:'#111827'}}>{v.trabajador?.nombre}</td>
                  <td style={{padding:'8px 12px',fontSize:'11px',color:'#6b7280'}}>{v.trabajador?.obra?.nombre || '—'}</td>
                  <td style={{padding:'8px 12px',textAlign:'center',color:'#374151'}}>Año {v.anio_aniversario}</td>
                  <td style={{padding:'8px 12px',textAlign:'center',color:'#374151',fontWeight:600}}>{v.dias_disponibles}</td>
                  <td style={{padding:'8px 12px',textAlign:'center',color:'#6b7280'}}>{v.dias_tomados}</td>
                  <td style={{padding:'8px 12px',textAlign:'center'}}>
                    <span style={{fontWeight:700,color:disponiblesActual>0?'#7c3aed':'#9ca3af',fontSize:'14px'}}>{disponiblesActual}</span>
                    <div style={{height:'4px',background:'#e5e7eb',borderRadius:'2px',marginTop:'3px',width:'60px',margin:'3px auto 0'}}>
                      <div style={{height:'4px',background:cat==='vencidas'?'#ef4444':cat==='proximas'?'#f59e0b':'#8b5cf6',borderRadius:'2px',width:pct+'%'}} />
                    </div>
                  </td>
                  <td style={{padding:'8px 12px',fontSize:'11px',color:cat==='vencidas'?'#dc2626':cat==='proximas'?'#d97706':'#6b7280'}}>
                    <div>{v.fecha_vencimiento}</div>
                    {cat !== 'vencidas' && <div style={{fontSize:'10px',color:'#9ca3af'}}>{diasRestantes} días</div>}
                    {cat === 'vencidas' && <div style={{fontSize:'10px',color:'#dc2626'}}>VENCIDAS</div>}
                  </td>
                  <td style={{padding:'8px 12px',textAlign:'center'}}>
                    <span style={{fontSize:'10px',fontWeight:600,padding:'2px 8px',borderRadius:'10px',
                      background:cat==='disponibles'?'#dcfce7':cat==='proximas'?'#fef3c7':cat==='vencidas'?'#fee2e2':'#f3f4f6',
                      color:cat==='disponibles'?'#16a34a':cat==='proximas'?'#d97706':cat==='vencidas'?'#dc2626':'#6b7280'}}>
                      {cat==='disponibles'?'✓ Disponible':cat==='proximas'?'⚠ Por vencer':cat==='vencidas'?'✗ Vencida':'Agotada'}
                    </span>
                  </td>
                  <td style={{padding:'8px 12px',textAlign:'center'}}>
                    {editando === v.id ? (
                      <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                        <input type="number" min="1" max={disponiblesActual} value={diasAjuste}
                          onChange={e => setDiasAjuste(e.target.value)}
                          placeholder="días"
                          style={{width:'45px',fontSize:'11px',border:'1px solid #e5e7eb',borderRadius:'4px',padding:'2px 4px',textAlign:'center'}} />
                        <button onClick={() => marcarDiasTomados(v, diasAjuste)}
                          style={{fontSize:'10px',background:'#16a34a',color:'white',border:'none',borderRadius:'4px',padding:'2px 6px',cursor:'pointer'}}>✓</button>
                        <button onClick={() => {setEditando(null);setDiasAjuste('')}}
                          style={{fontSize:'10px',background:'#e5e7eb',color:'#6b7280',border:'none',borderRadius:'4px',padding:'2px 6px',cursor:'pointer'}}>✗</button>
                      </div>
                    ) : (
                      disponiblesActual > 0 && cat !== 'vencidas' ? (
                        <button onClick={() => setEditando(v.id)}
                          style={{fontSize:'11px',background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'3px 8px',cursor:'pointer'}}>
                          +Tomar días
                        </button>
                      ) : null
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Nota informativa */}
      <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
        <strong>📋 Reglas:</strong> Las vacaciones se otorgan al cumplir cada aniversario de ingreso · 
        Tienen 1 año para tomarse · Si no se toman, se pierden · 
        Los días se actualizan automáticamente cuando el residente registra vacaciones en la nómina
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
  const [todosObras, setTodosObras] = useState([])
  const [nuevoTrabajador, setNuevoTrabajador] = useState({
    num_empleado:'', nombre:'', puesto:'', obra_id:'', forma_pago:'TRANSFERENCIA', sueldo_semanal:'', tiene_bono:true
  })
  const [guardandoTrab, setGuardandoTrab] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [todosTrabajadores, setTodosTrabajadores] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [vacacionesData, setVacacionesData] = useState([])
  const [vacFiltro, setVacFiltro] = useState('todos') // todos | disponibles | vencidas | proximas
  const [showNuevoPrestamo, setShowNuevoPrestamo] = useState(false)
  const [nuevoPrestamo, setNuevoPrestamo] = useState({
    trabajador_id:'', monto_total:'', descuento_semanal:'', fecha_autorizacion: new Date().toISOString().split('T')[0], notas:''
  })
  const [guardandoPrestamo, setGuardandoPrestamo] = useState(false)
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

    // Todas las obras para formulario
    const { data: todasO } = await supabase.from('obras').select('id,nombre').order('nombre')
    setTodosObras(todasO || [])

    // Todos los trabajadores ordenados por num_empleado
    const { data: todosT } = await supabase.from('trabajadores')
      .select('*, obra:obras(nombre)').eq('activo', true).order('num_empleado')
    setTodosTrabajadores(todosT || [])

    // Vacaciones
    const { data: vacs } = await supabase
      .from('vacaciones')
      .select('*, trabajador:trabajadores(num_empleado, nombre, puesto, fecha_ingreso, obra:obras(nombre))')
      .order('fecha_vencimiento', { ascending: true })
    setVacacionesData(vacs || [])

    // Préstamos activos
    const { data: prests } = await supabase
      .from('prestamos')
      .select('*, trabajador:trabajadores(nombre, num_empleado, obra:obras(nombre))')
      .eq('activo', true)
      .order('fecha_autorizacion', { ascending: false })
    setPrestamos(prests || [])

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

  async function exportarCONTPAQi() {
    const { data: todasNominas } = await supabase
      .from('nominas_obra')
      .select('*, obra:obras(nombre)')
      .eq('semana_id', semanaActual.id)

    // Obtener todos los trabajadores con sus asistencias
    const empleadosMap = {}
    for (const nom of (todasNominas || [])) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('*, trabajador:trabajadores(num_empleado, nombre)')
        .eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => {
        const t = a.trabajador
        if (!t) return
        empleadosMap[t.num_empleado] = {
          codigo: String(t.num_empleado).padStart(3,'0'),
          nombre: t.nombre,
          vie: parseFloat(a.viernes) || 0,
          sab: parseFloat(a.sabado) || 0,
          lun: parseFloat(a.lunes) || 0,
          mar: parseFloat(a.martes) || 0,
          mie: parseFloat(a.miercoles) || 0,
          jue: parseFloat(a.jueves) || 0,
          he: parseFloat(a.horas_extra) || 0,
        }
      })
    }

    // Calcular incidencias
    const getClave = (val, he=0) => {
      if (he > 0) return `${Math.round(he)}HE2`
      if (val === 0) return '1FINJ'
      return ''
    }

    // Fechas de la semana
    const fechas = [
      semanaActual.fecha_inicio, // viernes
      '', '', '', '', '', ''      // sab, dom, lun, mar, mie, jue - calcular
    ]

    // Calcular fechas de la semana
    const fechaInicio = new Date(semanaActual.fecha_inicio)
    const diasSemana = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(fechaInicio)
      d.setDate(d.getDate() + i)
      diasSemana.push(d.toLocaleDateString('es-MX', {day:'2-digit',month:'2-digit',year:'numeric'}))
    }

    const rows = []
    // Encabezado
    rows.push(['Código', 'Nombre Empleado', diasSemana[0]+' VIERNES', diasSemana[1]+' SÁBADO', diasSemana[2]+' DOMINGO', diasSemana[3]+' LUNES', diasSemana[4]+' MARTES', diasSemana[5]+' MIÉRCOLES', diasSemana[6]+' JUEVES'])

    // Solo trabajadores con incidencias
    let conIncidencias = 0
    Object.values(empleadosMap).sort((a,b) => a.codigo.localeCompare(b.codigo)).forEach(emp => {
      const claves = [
        getClave(emp.vie),
        emp.sab === 0 ? '1FINJ' : '',
        '', // domingo
        getClave(emp.lun),
        getClave(emp.mar),
        getClave(emp.mie),
        (() => {
          const faltas = [emp.vie, emp.sab, emp.lun, emp.mar, emp.mie, emp.jue].filter(d=>d===0).length
          const heNeto = Math.max(0, emp.he - (faltas * 9))
          return heNeto > 0 ? `${Math.round(heNeto)}HE2` : getClave(emp.jue)
        })(),
      ]
      if (claves.some(c => c)) {
        rows.push([emp.codigo, emp.nombre, ...claves])
        conIncidencias++
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{wch:10},{wch:38},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:16},{wch:14}]
    XLSX.utils.book_append_sheet(wb, ws, `Incidencias Sem${semanaActual.semana_num}`)
    XLSX.writeFile(wb, `Incidencias_CONTPAQi_Sem${semanaActual.semana_num}.xlsx`)
    setMsg(`✓ ${conIncidencias} trabajadores con incidencias exportados`)
    setTimeout(() => setMsg(''), 3000)
  }

  async function cerrarSemana() {
    if (!confirm('¿Cerrar esta semana?')) return
    await supabase.from('semanas').update({ estado:'cerrada' }).eq('id', semanaActual.id)
    cargarTodo()
  }

  async function eliminarSemana() {
    if (!confirm(`¿Eliminar la semana ${semanaActual.semana_num} (${semanaActual.fecha_inicio} al ${semanaActual.fecha_fin})? Esto borrará la semana y toda su información.`)) return

    // Borrar en cascada: asistencias → nominas_obra → incidencias → semana
    const { data: noms } = await supabase
      .from('nominas_obra')
      .select('id')
      .eq('semana_id', semanaActual.id)

    for (const n of (noms || [])) {
      await supabase.from('asistencias').delete().eq('nomina_obra_id', n.id)
    }
    await supabase.from('nominas_obra').delete().eq('semana_id', semanaActual.id)
    await supabase.from('incidencias').delete().eq('semana_id', semanaActual.id)
    await supabase.from('semanas').delete().eq('id', semanaActual.id)

    // Ir a la semana más reciente
    const { data: restantes } = await supabase
      .from('semanas')
      .select('*')
      .order('fecha_inicio', { ascending: false })
    setSemanas(restantes || [])
    setSemanaActual(restantes?.[0] || null)
    setMsg('✓ Semana eliminada')
    setTimeout(() => setMsg(''), 3000)
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
          'No.': (t.num_empleado == null ? 'NA' : (t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0'))),
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
    { id:'contpaqi', label:'📊 CONTPAQi', badge: null },
    { id:'personal', label:'👷 Personal', badge: null },
    { id:'alta-trabajador', label:'➕ Alta', badge: null },
    { id:'prestamos', label:'💰 Préstamos', badge: null },
    { id:'vac-control', label:'🌴 Vacaciones', badge: null },
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
          {nominas.length === 0 && semanaActual && (
            <button onClick={eliminarSemana} className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">🗑 Eliminar semana</button>
          )}
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
                <button onClick={async (e) => {
                  e.stopPropagation()
                  if (!confirm(`¿Borrar la nómina de ${n.obra?.nombre}? Se eliminará la asistencia capturada.`)) return
                  await supabase.from('asistencias').delete().eq('nomina_obra_id', n.id)
                  await supabase.from('nominas_obra').delete().eq('id', n.id)
                  cargarNominas()
                  setMsg('✓ Nómina eliminada')
                  setTimeout(()=>setMsg(''),3000)
                }} style={{marginTop:'6px',fontSize:'10px',color:'#ef4444',background:'transparent',border:'none',cursor:'pointer',padding:0}}>
                  🗑 Eliminar nómina
                </button>
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
                      <td style={{padding:'6px 8px',color:'#9ca3af'}}>{(t.num_empleado == null ? 'NA' : (t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0')))}</td>
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

      {/* TAB: CONTPAQI */}
      {tab === 'contpaqi' && (
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
            <h3 className="font-semibold text-gray-900 mb-2">Exportar incidencias para CONTPAQi</h3>
            <p className="text-sm text-gray-500 mb-4">
              Genera el archivo Excel con las claves de incidencias listo para importar en CONTPAQi Nóminas → Prenómina → Capturar movimientos desde Excel.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm">
              <div className="font-medium text-gray-700 mb-2">Claves que se generan automáticamente:</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><span className="text-red-600 font-mono font-bold">1FINJ</span><span className="text-gray-500">— Falta injustificada (día con valor 0)</span></div>
                <div className="flex items-center gap-2"><span className="text-orange-500 font-mono font-bold">5RET</span><span className="text-gray-500">— Retardo / Medio día</span></div>
                <div className="flex items-center gap-2"><span className="text-green-600 font-mono font-bold">xHE2</span><span className="text-gray-500">— Horas extra dobles (x = número de horas)</span></div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={exportarCONTPAQi}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                📊 Generar archivo CONTPAQi
              </button>
              <span className="text-xs text-gray-400">Solo incluye trabajadores con al menos una incidencia</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <span className="font-medium text-sm text-gray-900">Vista previa de incidencias — Semana {semanaActual?.semana_num}</span>
            </div>
            <IncidenciasPreview semana={semanaActual} supabase={supabase} />
          </div>
        </div>
      )}

      {/* TAB: PERSONAL */}
      {tab === 'personal' && (
        <div>
          {/* Formulario alta trabajador */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">➕ Dar de alta nuevo trabajador</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">No. Empleado</label>
                <input type="number" placeholder="095"
                  value={nuevoTrabajador.num_empleado}
                  onChange={e => setNuevoTrabajador(p=>({...p,num_empleado:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Nombre completo</label>
                <input type="text" placeholder="APELLIDO APELLIDO NOMBRE"
                  value={nuevoTrabajador.nombre}
                  onChange={e => setNuevoTrabajador(p=>({...p,nombre:e.target.value.toUpperCase()}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Puesto</label>
                <input type="text" placeholder="OFICIAL ALBAÑIL"
                  value={nuevoTrabajador.puesto}
                  onChange={e => setNuevoTrabajador(p=>({...p,puesto:e.target.value.toUpperCase()}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Obra</label>
                <select value={nuevoTrabajador.obra_id}
                  onChange={e => setNuevoTrabajador(p=>({...p,obra_id:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">— Seleccionar —</option>
                  {todosObras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Forma de pago</label>
                <select value={nuevoTrabajador.forma_pago}
                  onChange={e => setNuevoTrabajador(p=>({...p,forma_pago:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option>TRANSFERENCIA</option>
                  <option>EFECTIVO</option>
                  <option>CHEQUE</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sueldo semanal</label>
                <input type="number" placeholder="3500"
                  value={nuevoTrabajador.sueldo_semanal}
                  onChange={e => setNuevoTrabajador(p=>({...p,sueldo_semanal:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-600 mb-2 cursor-pointer">
                  <input type="checkbox" checked={nuevoTrabajador.tiene_bono}
                    onChange={e => setNuevoTrabajador(p=>({...p,tiene_bono:e.target.checked}))}
                    className="w-4 h-4" />
                  Tiene bono
                </label>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button disabled={guardandoTrab || !nuevoTrabajador.nombre || !nuevoTrabajador.num_empleado}
                onClick={async () => {
                  setGuardandoTrab(true)
                  const { error } = await supabase.from('trabajadores').insert({
                    num_empleado: nuevoTrabajador.num_empleado === 'NA' ? 'NA' : nuevoTrabajador.num_empleado,
                    nombre: nuevoTrabajador.nombre.trim(),
                    puesto: nuevoTrabajador.puesto.trim(),
                    obra_id: nuevoTrabajador.obra_id || null,
                    forma_pago: nuevoTrabajador.forma_pago,
                    sueldo_semanal: parseFloat(nuevoTrabajador.sueldo_semanal) || 0,
                    tiene_bono: nuevoTrabajador.tiene_bono,
                    activo: true
                  })
                  if (error) { alert('Error: ' + error.message) }
                  else {
                    setMsg('✓ Trabajador dado de alta')
                    setNuevoTrabajador({num_empleado:'',nombre:'',puesto:'',obra_id:'',forma_pago:'TRANSFERENCIA',sueldo_semanal:'',tiene_bono:true})
                    const { data } = await supabase.from('trabajadores').select('*, obra:obras(nombre)').eq('activo', true).order('num_empleado')
                    setTodosTrabajadores(data || [])
                    setTimeout(()=>setMsg(''),3000)
                  }
                  setGuardandoTrab(false)
                }}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {guardandoTrab ? 'Guardando...' : '✓ Dar de alta'}
              </button>
            </div>
          </div>

          {/* Lista de trabajadores */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">
                Trabajadores activos ({todosTrabajadores.length})
              </span>
              <input type="text" placeholder="Buscar por nombre o número..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64" />
            </div>
            <div className="overflow-x-auto">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                <thead>
                  <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                    <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>#</th>
                    <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500,minWidth:'200px'}}>Nombre</th>
                    <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Puesto</th>
                    <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Obra</th>
                    <th style={{textAlign:'left',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Pago</th>
                    <th style={{textAlign:'right',padding:'8px 10px',color:'#7c3aed',fontWeight:500}}>Sueldo</th>
                    <th style={{textAlign:'center',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Bono</th>
                    <th style={{textAlign:'center',padding:'8px 10px',color:'#9ca3af',fontWeight:500}}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {todosTrabajadores
                    .filter(t => !busqueda || t.nombre.toLowerCase().includes(busqueda.toLowerCase()) || String(t.num_empleado).includes(busqueda))
                    .map((t,idx) => (
                    <tr key={t.id} style={{borderBottom:'1px solid #f9fafb',background:idx%2===0?'white':'#fafafa'}}>
                      <td style={{padding:'7px 10px',color:'#9ca3af',fontFamily:'monospace'}}>{(t.num_empleado == null ? 'NA' : (t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0')))}</td>
                      <td style={{padding:'7px 10px',fontWeight:500,color:'#111827'}}>{t.nombre}</td>
                      <td style={{padding:'7px 10px',color:'#6b7280',fontSize:'11px'}}>{t.puesto}</td>
                      <td style={{padding:'7px 10px'}}>
                        <span style={{fontSize:'11px',background:'#eff6ff',color:'#1d4ed8',padding:'2px 8px',borderRadius:'10px'}}>
                          {t.obra?.nombre || '—'}
                        </span>
                      </td>
                      <td style={{padding:'7px 10px',color:'#6b7280',fontSize:'11px'}}>{t.forma_pago}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:'#7c3aed'}}>${t.sueldo_semanal?.toLocaleString('es-MX')}</td>
                      <td style={{padding:'7px 10px',textAlign:'center'}}>
                        {t.tiene_bono ? <span style={{color:'#16a34a',fontSize:'13px'}}>✓</span> : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td style={{padding:'7px 10px',textAlign:'center'}}>
                        <button onClick={async () => {
                          if (!confirm(`¿Dar de baja a ${t.nombre}?`)) return
                          await supabase.from('trabajadores').update({activo:false}).eq('id',t.id)
                          setTodosTrabajadores(prev => prev.filter(x => x.id !== t.id))
                          setMsg('✓ Trabajador dado de baja')
                          setTimeout(()=>setMsg(''),3000)
                        }} style={{fontSize:'11px',color:'#ef4444',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'6px',padding:'2px 8px',cursor:'pointer'}}>
                          Baja
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ALTA TRABAJADOR */}
      {tab === 'alta-trabajador' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">➕ Dar de alta nuevo trabajador</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">No. Empleado</label>
              <input type="text" placeholder="095 o NA"
                value={nuevoTrabajador.num_empleado}
                onChange={e => setNuevoTrabajador(p=>({...p,num_empleado:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nombre completo</label>
              <input type="text" placeholder="APELLIDO APELLIDO NOMBRE"
                value={nuevoTrabajador.nombre}
                onChange={e => setNuevoTrabajador(p=>({...p,nombre:e.target.value.toUpperCase()}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Puesto</label>
              <input type="text" placeholder="OFICIAL ALBAÑIL"
                value={nuevoTrabajador.puesto}
                onChange={e => setNuevoTrabajador(p=>({...p,puesto:e.target.value.toUpperCase()}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Obra</label>
              <select value={nuevoTrabajador.obra_id}
                onChange={e => setNuevoTrabajador(p=>({...p,obra_id:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccionar —</option>
                {todosObras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Forma de pago</label>
              <select value={nuevoTrabajador.forma_pago}
                onChange={e => setNuevoTrabajador(p=>({...p,forma_pago:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option>TRANSFERENCIA</option>
                <option>EFECTIVO</option>
                <option>CHEQUE</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sueldo semanal</label>
              <input type="number" placeholder="3500"
                value={nuevoTrabajador.sueldo_semanal}
                onChange={e => setNuevoTrabajador(p=>({...p,sueldo_semanal:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha ingreso</label>
              <input type="date"
                value={nuevoTrabajador.fecha_ingreso || ''}
                onChange={e => setNuevoTrabajador(p=>({...p,fecha_ingreso:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={nuevoTrabajador.tiene_bono}
                  onChange={e => setNuevoTrabajador(p=>({...p,tiene_bono:e.target.checked}))}
                  className="w-4 h-4" />
                Tiene bono
              </label>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button disabled={guardandoTrab || !nuevoTrabajador.nombre || !nuevoTrabajador.num_empleado}
              onClick={async () => {
                setGuardandoTrab(true)
                const numEmp = nuevoTrabajador.num_empleado.toUpperCase() === 'NA' ? null : parseInt(nuevoTrabajador.num_empleado)
                const { error } = await supabase.from('trabajadores').insert({
                  num_empleado: numEmp,
                  nombre: nuevoTrabajador.nombre.trim(),
                  puesto: nuevoTrabajador.puesto.trim(),
                  obra_id: nuevoTrabajador.obra_id || null,
                  forma_pago: nuevoTrabajador.forma_pago,
                  sueldo_semanal: parseFloat(nuevoTrabajador.sueldo_semanal) || 0,
                  tiene_bono: nuevoTrabajador.tiene_bono,
                  fecha_ingreso: nuevoTrabajador.fecha_ingreso || null,
                  activo: true
                })
                if (error) { alert('Error: ' + error.message) }
                else {
                  setMsg('✓ Trabajador dado de alta')
                  setNuevoTrabajador({num_empleado:'',nombre:'',puesto:'',obra_id:'',forma_pago:'TRANSFERENCIA',sueldo_semanal:'',tiene_bono:true,fecha_ingreso:''})
                  const { data } = await supabase.from('trabajadores').select('*, obra:obras(nombre)').eq('activo', true).order('num_empleado')
                  setTodosTrabajadores(data || [])
                  setTimeout(()=>setMsg(''),3000)
                }
                setGuardandoTrab(false)
              }}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {guardandoTrab ? 'Guardando...' : '✓ Dar de alta'}
            </button>
          </div>
        </div>
      )}

      {/* TAB: PRÉSTAMOS */}
      {tab === 'prestamos' && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Préstamos activos</h3>
              <p className="text-xs text-gray-400 mt-0.5">{prestamos.length} préstamos activos · El descuento se aplica automáticamente cada semana</p>
            </div>
            <button onClick={() => setShowNuevoPrestamo(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              + Nuevo préstamo
            </button>
          </div>

          {/* Modal nuevo préstamo */}
          {showNuevoPrestamo && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                <h3 className="font-semibold mb-4">Autorizar préstamo</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Trabajador</label>
                    <select value={nuevoPrestamo.trabajador_id}
                      onChange={e => setNuevoPrestamo(p=>({...p, trabajador_id:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <option value="">— Seleccionar —</option>
                      {todosTrabajadores.map(t => (
                        <option key={t.id} value={t.id}>
                          {(t.num_empleado == null ? 'NA' : (t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0')))} — {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Monto total del préstamo</label>
                      <input type="number" placeholder="2000" value={nuevoPrestamo.monto_total}
                        onChange={e => setNuevoPrestamo(p=>({...p, monto_total:e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Descuento por semana</label>
                      <input type="number" placeholder="500" value={nuevoPrestamo.descuento_semanal}
                        onChange={e => setNuevoPrestamo(p=>({...p, descuento_semanal:e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fecha de autorización</label>
                    <input type="date" value={nuevoPrestamo.fecha_autorizacion}
                      onChange={e => setNuevoPrestamo(p=>({...p, fecha_autorizacion:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Notas (opcional)</label>
                    <input type="text" placeholder="Motivo del préstamo..."
                      value={nuevoPrestamo.notas}
                      onChange={e => setNuevoPrestamo(p=>({...p, notas:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  {nuevoPrestamo.monto_total && nuevoPrestamo.descuento_semanal && (
                    <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                      Semanas para liquidar: <strong>{Math.ceil(parseFloat(nuevoPrestamo.monto_total) / parseFloat(nuevoPrestamo.descuento_semanal))}</strong>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowNuevoPrestamo(false)}
                    className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancelar</button>
                  <button disabled={guardandoPrestamo || !nuevoPrestamo.trabajador_id || !nuevoPrestamo.monto_total || !nuevoPrestamo.descuento_semanal}
                    onClick={async () => {
                      setGuardandoPrestamo(true)
                      const semanas = Math.ceil(parseFloat(nuevoPrestamo.monto_total) / parseFloat(nuevoPrestamo.descuento_semanal))
                      const { error } = await supabase.from('prestamos').insert({
                        trabajador_id: nuevoPrestamo.trabajador_id,
                        monto_total: parseFloat(nuevoPrestamo.monto_total),
                        descuento_semanal: parseFloat(nuevoPrestamo.descuento_semanal),
                        fecha_autorizacion: nuevoPrestamo.fecha_autorizacion,
                        autorizado_por: perfil.id,
                        semanas_total: semanas,
                        semanas_pagadas: 0,
                        notas: nuevoPrestamo.notas,
                        activo: true
                      })
                      if (error) { alert('Error: ' + error.message) }
                      else {
                        setMsg('✓ Préstamo autorizado')
                        setShowNuevoPrestamo(false)
                        setNuevoPrestamo({trabajador_id:'',monto_total:'',descuento_semanal:'',fecha_autorizacion:new Date().toISOString().split('T')[0],notas:''})
                        const { data } = await supabase.from('prestamos')
                          .select('*, trabajador:trabajadores(nombre, num_empleado, obra:obras(nombre))')
                          .eq('activo', true).order('fecha_autorizacion', { ascending: false })
                        setPrestamos(data || [])
                        setTimeout(()=>setMsg(''),3000)
                      }
                      setGuardandoPrestamo(false)
                    }}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                    {guardandoPrestamo ? 'Guardando...' : 'Autorizar préstamo'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de préstamos */}
          {prestamos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-gray-400 text-sm">
              No hay préstamos activos
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                <thead>
                  <tr style={{background:'#f9fafb',borderBottom:'1px solid #f3f4f6'}}>
                    <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500,minWidth:'200px'}}>Trabajador</th>
                    <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Obra</th>
                    <th style={{textAlign:'left',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Fecha auth.</th>
                    <th style={{textAlign:'right',padding:'10px 12px',color:'#7c3aed',fontWeight:500}}>Monto total</th>
                    <th style={{textAlign:'right',padding:'10px 12px',color:'#7c3aed',fontWeight:500}}>Desc/semana</th>
                    <th style={{textAlign:'right',padding:'10px 12px',color:'#7c3aed',fontWeight:500}}>Pagado</th>
                    <th style={{textAlign:'right',padding:'10px 12px',color:'#7c3aed',fontWeight:500}}>Saldo</th>
                    <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Semanas</th>
                    <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Progreso</th>
                    <th style={{textAlign:'center',padding:'10px 12px',color:'#9ca3af',fontWeight:500}}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamos.map((p, idx) => {
                    const pagado = p.semanas_pagadas * p.descuento_semanal
                    const saldo = p.monto_total - pagado
                    const pct = Math.min(100, Math.round((p.semanas_pagadas / p.semanas_total) * 100))
                    const semanasRestantes = p.semanas_total - p.semanas_pagadas
                    return (
                      <tr key={p.id} style={{borderBottom:'1px solid #f9fafb',background:idx%2===0?'white':'#fafafa'}}>
                        <td style={{padding:'10px 12px',fontWeight:500,color:'#111827'}}>
                          {p.trabajador?.nombre}
                          {p.notas && <div style={{fontSize:'10px',color:'#9ca3af',marginTop:'2px'}}>{p.notas}</div>}
                        </td>
                        <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'11px'}}>{p.trabajador?.obra?.nombre}</td>
                        <td style={{padding:'10px 12px',color:'#6b7280'}}>{p.fecha_autorizacion}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',color:'#7c3aed',fontWeight:600}}>${p.monto_total?.toLocaleString('es-MX')}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',color:'#7c3aed'}}>${p.descuento_semanal?.toLocaleString('es-MX')}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',color:'#16a34a',fontWeight:600}}>${pagado.toLocaleString('es-MX')}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:saldo<=0?'#16a34a':'#ef4444'}}>${Math.max(0,saldo).toLocaleString('es-MX')}</td>
                        <td style={{padding:'10px 12px',textAlign:'center',color:'#374151'}}>
                          <div style={{fontSize:'11px',color:'#6b7280'}}>{p.semanas_pagadas}/{p.semanas_total}</div>
                          <div style={{fontSize:'10px',color:semanasRestantes<=2?'#ef4444':'#9ca3af'}}>{semanasRestantes} restantes</div>
                        </td>
                        <td style={{padding:'10px 12px',minWidth:'100px'}}>
                          <div style={{height:'6px',background:'#e5e7eb',borderRadius:'3px'}}>
                            <div style={{height:'6px',background:pct>=100?'#16a34a':'#3b82f6',borderRadius:'3px',width:pct+'%',transition:'width .3s'}} />
                          </div>
                          <div style={{fontSize:'10px',color:'#9ca3af',textAlign:'center',marginTop:'2px'}}>{pct}%</div>
                        </td>
                        <td style={{padding:'10px 12px',textAlign:'center'}}>
                          <div style={{display:'flex',gap:'4px',justifyContent:'center'}}>
                            <button onClick={async () => {
                              const nuevasSemanas = p.semanas_pagadas + 1
                              if (nuevasSemanas >= p.semanas_total) {
                                if (confirm('¿Marcar como liquidado? Se eliminará de la lista.')) {
                                  await supabase.from('prestamos').update({semanas_pagadas: nuevasSemanas, activo: false}).eq('id', p.id)
                                  setPrestamos(prev => prev.filter(x => x.id !== p.id))
                                  setMsg('✓ Préstamo liquidado')
                                  setTimeout(()=>setMsg(''),3000)
                                }
                              } else {
                                await supabase.from('prestamos').update({semanas_pagadas: nuevasSemanas}).eq('id', p.id)
                                setPrestamos(prev => prev.map(x => x.id===p.id ? {...x, semanas_pagadas: nuevasSemanas} : x))
                              }
                            }} style={{fontSize:'11px',background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:'6px',padding:'3px 8px',cursor:'pointer'}}>
                              +1 semana
                            </button>
                            <button onClick={async () => {
                              if (confirm('¿Cancelar este préstamo?')) {
                                await supabase.from('prestamos').update({activo:false}).eq('id',p.id)
                                setPrestamos(prev => prev.filter(x => x.id !== p.id))
                              }
                            }} style={{fontSize:'11px',background:'#fef2f2',color:'#ef4444',border:'1px solid #fecaca',borderRadius:'6px',padding:'3px 8px',cursor:'pointer'}}>
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#f5f3ff',borderTop:'2px solid #e5e7eb'}}>
                    <td colSpan={3} style={{padding:'10px 12px',fontWeight:600,color:'#374151'}}>Total préstamos activos</td>
                    <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#7c3aed'}}>${prestamos.reduce((s,p)=>s+p.monto_total,0).toLocaleString('es-MX')}</td>
                    <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#7c3aed'}}>${prestamos.reduce((s,p)=>s+p.descuento_semanal,0).toLocaleString('es-MX')}</td>
                    <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#16a34a'}}>${prestamos.reduce((s,p)=>s+(p.semanas_pagadas*p.descuento_semanal),0).toLocaleString('es-MX')}</td>
                    <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#ef4444'}}>${prestamos.reduce((s,p)=>s+Math.max(0,p.monto_total-(p.semanas_pagadas*p.descuento_semanal)),0).toLocaleString('es-MX')}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: VACACIONES CONTROL */}
      {tab === 'vac-control' && (
        <VacacionesControl
          vacaciones={vacacionesData}
          supabase={supabase}
          onUpdate={async () => {
            const { data } = await supabase
              .from('vacaciones')
              .select('*, trabajador:trabajadores(num_empleado, nombre, puesto, fecha_ingreso, obra:obras(nombre))')
              .order('fecha_vencimiento', { ascending: true })
            setVacacionesData(data || [])
          }}
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
