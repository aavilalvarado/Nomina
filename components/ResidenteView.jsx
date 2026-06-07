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
  const [obras, setObras] = useState([])
  const [semana, setSemana] = useState(null)
  const [trabajadores, setTrabajadores] = useState([])
  const [asistencias, setAsistencias] = useState({})
  const [obrasTrabajador, setObrasTrabajador] = useState({}) // obra seleccionada por trabajador
  const [nominasPorObra, setNominasPorObra] = useState({}) // nomina_id por obra
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    // Cargar obras — excluir OFICINA del menú
    const { data: obrasData } = await supabase
      .from('obras')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')
    const obrasSinOficina = (obrasData || []).filter(o => o.nombre !== 'OFICINA')
    setObras(obrasSinOficina)
    const oficinaId = (obrasData || []).find(o => o.nombre === 'OFICINA')?.id

    // Cargar semana abierta
    const { data: semanas } = await supabase
      .from('semanas')
      .select('*')
      .eq('estado', 'abierta')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
    if (!semanas || semanas.length === 0) return
    const sem = semanas[0]
    setSemana(sem)

    // Cargar trabajadores — excluir personal de OFICINA
    let trabQuery = supabase
      .from('trabajadores')
      .select('id, num_empleado, nombre, puesto, tiene_bono, obra_id')
      .eq('activo', true)
      .order('num_empleado', { ascending: true })
    if (oficinaId) trabQuery = trabQuery.neq('obra_id', oficinaId)
    const { data: trab } = await trabQuery
    setTrabajadores(trab || [])

    // Inicializar obra por defecto de cada trabajador
    const obrasInit = {}
    ;(trab || []).forEach(t => { obrasInit[t.id] = t.obra_id })
    setObrasTrabajador(obrasInit)

    // Cargar asistencias existentes de todas las nóminas de esta semana
    const { data: nominas } = await supabase
      .from('nominas_obra')
      .select('id, obra_id, estado')
      .eq('semana_id', sem.id)

    const nominasMap = {}
    ;(nominas || []).forEach(n => { nominasMap[n.obra_id] = n })
    setNominasPorObra(nominasMap)

    // Cargar asistencias existentes
    const asistMap = {}
    for (const nom of (nominas || [])) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('*')
        .eq('nomina_obra_id', nom.id)
      ;(asist || []).forEach(a => { asistMap[a.trabajador_id] = a })
    }

    // Inicializar asistencias
    const asistInit = {}
    ;(trab || []).forEach(t => {
      asistInit[t.id] = asistMap[t.id] || {
        trabajador_id: t.id,
        viernes: 1.1, sabado: 1.1, domingo: 0,
        lunes: 1.1, martes: 1.1, miercoles: 1.1, jueves: 1.1,
        horas_extra: 0, prestamos: 0
      }
    })
    setAsistencias(asistInit)
  }

  function updateAsistencia(trabajadorId, campo, valor) {
    setAsistencias(prev => ({
      ...prev,
      [trabajadorId]: { ...prev[trabajadorId], [campo]: valor }
    }))
  }

  function updateObra(trabajadorId, obraId) {
    setObrasTrabajador(prev => ({ ...prev, [trabajadorId]: obraId }))
  }

  async function getNominaId(obraId) {
    if (nominasPorObra[obraId]) return nominasPorObra[obraId].id
    // Crear nómina si no existe
    const { data } = await supabase
      .from('nominas_obra')
      .insert({ semana_id: semana.id, obra_id: obraId, residente_id: perfil.id })
      .select()
      .single()
    setNominasPorObra(prev => ({ ...prev, [obraId]: data }))
    return data.id
  }

  async function guardar() {
    if (!semana) return
    setGuardando(true)
    setMsg('')

    for (const t of trabajadores) {
      const a = asistencias[t.id] || {}
      const obraId = obrasTrabajador[t.id]
      if (!obraId) continue

      // Verificar que la nómina no esté bloqueada
      const nom = nominasPorObra[obraId]
      if (nom && nom.estado !== 'borrador') continue

      const nominaId = await getNominaId(obraId)
      const dias = calcularDias(a)
      const tieneFalta = dias < 6

      await supabase.from('asistencias').upsert({
        nomina_obra_id: nominaId,
        trabajador_id: t.id,
        viernes: parseFloat(a.viernes) || 0,
        sabado: parseFloat(a.sabado) || 0,
        domingo: parseFloat(a.domingo) || 0,
        lunes: parseFloat(a.lunes) || 0,
        martes: parseFloat(a.martes) || 0,
        miercoles: parseFloat(a.miercoles) || 0,
        jueves: parseFloat(a.jueves) || 0,
        dias_total: dias,
        horas_extra: parseFloat(a.horas_extra) || 0,
        prestamos: parseFloat(a.prestamos) || 0,
        bono_aplicado: (t.tiene_bono && !tieneFalta) ? 1 : 0,
        total_pagar: 0
      }, { onConflict: 'nomina_obra_id,trabajador_id' })
    }

    setGuardando(false)
    setMsg('✓ Guardado')
    setTimeout(() => setMsg(''), 2000)
  }

  async function enviar() {
    await guardar()
    setEnviando(true)
    // Marcar todas las nóminas creadas como enviadas
    const obraIds = [...new Set(Object.values(obrasTrabajador))]
    for (const obraId of obraIds) {
      const nom = nominasPorObra[obraId]
      if (nom && nom.estado === 'borrador') {
        await supabase.from('nominas_obra')
          .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
          .eq('id', nom.id)
      }
    }
    await cargarDatos()
    setEnviando(false)
  }

  if (!semana) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="text-4xl mb-3">📅</div>
        <p>No hay semana de nómina abierta.<br/>El superintendente debe abrir la semana.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Captura de Asistencia</h2>
          <p className="text-sm text-gray-500">
            Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-green-600 text-sm font-medium">{msg}</span>}
          <button onClick={guardar} disabled={guardando}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {guardando ? 'Guardando...' : '💾 Guardar borrador'}
          </button>
          <button
            onClick={() => { if (confirm('¿Enviar nómina? Ya no podrás modificarla.')) enviar() }}
            disabled={enviando}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {enviando ? 'Enviando...' : 'Enviar nómina →'}
          </button>
        </div>
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
              {trabajadores.map(t => {
                const a = asistencias[t.id] || {}
                const dias = calcularDias(a)
                const tieneFalta = dias < 6
                const bonoAplica = t.tiene_bono && !tieneFalta
                const obraId = obrasTrabajador[t.id]
                const nom = nominasPorObra[obraId]
                const bloqueado = nom && nom.estado !== 'borrador'

                return (
                  <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 ${tieneFalta ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{String(t.num_empleado).padStart(4,'0')}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.nombre}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{t.puesto}</td>
                    <td className="px-3 py-2">
                      <select
                        value={obraId || ''}
                        onChange={e => updateObra(t.id, e.target.value)}
                        disabled={bloqueado}
                        className="text-xs border border-gray-200 rounded px-1 py-1 w-32 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">— Seleccionar —</option>
                        {obras.map(o => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                      </select>
                    </td>
                    {DIAS.map(d => (
                      <td key={d} className="px-1 py-2 text-center">
                        <select
                          value={a[d] ?? 1.1}
                          onChange={e => updateAsistencia(t.id, d, parseFloat(e.target.value))}
                          disabled={bloqueado}
                          className={`text-xs border rounded px-1 py-0.5 w-12 text-center ${
                            bloqueado ? 'bg-gray-50 text-gray-400' :
                            parseFloat(a[d]) === 0 ? 'border-red-300 bg-red-50 text-red-600' :
                            'border-gray-200'
                          }`}
                        >
                          <option value={1.1}>✓</option>
                          <option value={0.5}>½</option>
                          <option value={0}>✗</option>
                        </select>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-medium ${tieneFalta ? 'text-red-500' : 'text-gray-700'}`}>
                        {dias.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input type="number" min="0" step="0.5"
                        value={a.horas_extra || 0}
                        onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                        disabled={bloqueado}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 w-12 text-center disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input type="number" min="0" step="100"
                        value={a.prestamos || 0}
                        onChange={e => updateAsistencia(t.id, 'prestamos', e.target.value)}
                        disabled={bloqueado}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 w-16 text-center disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {t.tiene_bono ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bonoAplica ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                          {bonoAplica ? '✓' : '✗'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          💡 Falta = bono cancelado automáticamente · Selecciona la obra correcta para cada trabajador
        </div>
      </div>
    </div>
  )
}
