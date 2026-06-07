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
  const [obraActual, setObraActual] = useState(null)
  const [semana, setSemana] = useState(null)
  const [nominaObra, setNominaObra] = useState(null)
  const [trabajadores, setTrabajadores] = useState([])
  const [asistencias, setAsistencias] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { cargarObras() }, [])
  useEffect(() => { if (obraActual && semana) cargarNomina() }, [obraActual, semana])

  async function cargarObras() {
    // Cargar TODAS las obras activas (no solo las asignadas)
    const { data } = await supabase
      .from('obras')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')
    if (data && data.length > 0) {
      setObras(data)
      setObraActual(data[0])
    }
    // Cargar semana abierta
    const { data: semanas } = await supabase
      .from('semanas')
      .select('*')
      .eq('estado', 'abierta')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
    if (semanas && semanas.length > 0) setSemana(semanas[0])
  }

  async function cargarNomina() {
    // Buscar o crear nómina
    let { data: nomina } = await supabase
      .from('nominas_obra')
      .select('*')
      .eq('semana_id', semana.id)
      .eq('obra_id', obraActual.id)
      .single()

    if (!nomina) {
      const { data: nueva } = await supabase
        .from('nominas_obra')
        .insert({ semana_id: semana.id, obra_id: obraActual.id, residente_id: perfil.id })
        .select()
        .single()
      nomina = nueva
    }
    setNominaObra(nomina)

    // Cargar trabajadores de esta obra
    const { data: trab } = await supabase
      .from('trabajadores')
      .select('id, num_empleado, nombre, puesto, tiene_bono')
      .eq('obra_id', obraActual.id)
      .eq('activo', true)
      .order('num_empleado')
    setTrabajadores(trab || [])

    // Cargar asistencias existentes
    const { data: asist } = await supabase
      .from('asistencias')
      .select('*')
      .eq('nomina_obra_id', nomina.id)

    const map = {}
    ;(asist || []).forEach(a => { map[a.trabajador_id] = a })

    const inicial = {}
    ;(trab || []).forEach(t => {
      inicial[t.id] = map[t.id] || {
        trabajador_id: t.id,
        nomina_obra_id: nomina.id,
        viernes: 1.1, sabado: 1.1, domingo: 0, lunes: 1.1, martes: 1.1, miercoles: 1.1, jueves: 1.1,
        horas_extra: 0, prestamos: 0
      }
    })
    setAsistencias(inicial)
  }

  function updateAsistencia(trabajadorId, campo, valor) {
    setAsistencias(prev => ({
      ...prev,
      [trabajadorId]: { ...prev[trabajadorId], [campo]: valor }
    }))
  }

  async function guardar() {
    if (!nominaObra || nominaObra.estado !== 'borrador') return
    setGuardando(true)
    setMsg('')

    const rows = trabajadores.map(t => {
      const a = asistencias[t.id] || {}
      const dias = calcularDias(a)
      const tieneFalta = dias < 6
      return {
        nomina_obra_id: nominaObra.id,
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
        total_pagar: 0 // el super/admin calcula el total real
      }
    })

    await supabase.from('asistencias').upsert(rows, { onConflict: 'nomina_obra_id,trabajador_id' })
    setGuardando(false)
    setMsg('✓ Guardado')
    setTimeout(() => setMsg(''), 2000)
  }

  async function enviar() {
    if (!nominaObra) return
    await guardar()
    setEnviando(true)
    await supabase
      .from('nominas_obra')
      .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
      .eq('id', nominaObra.id)
    setNominaObra(prev => ({ ...prev, estado: 'enviada' }))
    setEnviando(false)
  }

  const bloqueado = nominaObra?.estado !== 'borrador'

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
      {/* Selector de obra — todas las obras */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-2 font-medium">Selecciona la obra a capturar:</label>
        <div className="flex gap-2 flex-wrap">
          {obras.map(o => (
            <button
              key={o.id}
              onClick={() => setObraActual(o)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                obraActual?.id === o.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {o.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Header obra */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">{obraActual?.nombre}</h2>
          <p className="text-sm text-gray-500">
            Semana {semana.semana_num} · {semana.fecha_inicio} al {semana.fecha_fin}
          </p>
        </div>
        <span className={`text-xs font-medium px-3 py-1 rounded-full ${
          nominaObra?.estado === 'enviada' ? 'bg-green-100 text-green-700' :
          nominaObra?.estado === 'aprobada' ? 'bg-blue-100 text-blue-700' :
          nominaObra?.estado === 'rechazada' ? 'bg-red-100 text-red-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {nominaObra?.estado === 'borrador' ? 'Pendiente' :
           nominaObra?.estado === 'enviada' ? '✓ Enviada' :
           nominaObra?.estado === 'aprobada' ? '✓ Aprobada' : 'Regresada'}
        </span>
      </div>

      {nominaObra?.estado === 'rechazada' && nominaObra.comentario_rechazo && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          <strong>Regresada por el superintendente:</strong> {nominaObra.comentario_rechazo}
        </div>
      )}

      {bloqueado && nominaObra?.estado === 'enviada' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-700 flex items-center gap-2">
          🔒 Nómina enviada — esperando revisión del superintendente.
        </div>
      )}

      {/* Tabla — SIN sueldos */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {trabajadores.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">👷</div>
            <p>No hay trabajadores registrados en esta obra.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Trabajador</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Puesto</th>
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
                  return (
                    <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 ${tieneFalta ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2 text-gray-400 text-xs">{t.num_empleado}</td>
                      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{t.nombre}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{t.puesto}</td>
                      {DIAS.map(d => (
                        <td key={d} className="px-1 py-2 text-center">
                          <select
                            value={a[d] ?? 1.1}
                            onChange={e => updateAsistencia(t.id, d, parseFloat(e.target.value))}
                            disabled={bloqueado}
                            className={`text-xs border rounded px-1 py-0.5 w-14 text-center ${
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
                        <input
                          type="number" min="0" step="0.5"
                          value={a.horas_extra || 0}
                          onChange={e => updateAsistencia(t.id, 'horas_extra', e.target.value)}
                          disabled={bloqueado}
                          className="text-xs border border-gray-200 rounded px-1 py-0.5 w-14 text-center disabled:bg-gray-50"
                        />
                      </td>
                      <td className="px-1 py-2 text-center">
                        <input
                          type="number" min="0" step="100"
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
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={10} className="px-4 py-3 text-sm text-gray-500">
                    {trabajadores.length} trabajadores · {trabajadores.filter(t => {
                      const a = asistencias[t.id] || {}
                      return calcularDias(a) < 6
                    }).length} con falta
                  </td>
                  <td colSpan={3} className="px-4 py-3 text-right text-sm text-gray-500">
                    H. Extra total: {trabajadores.reduce((s,t) => s + (parseFloat((asistencias[t.id]||{}).horas_extra)||0), 0)}h
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!bloqueado && (
          <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              💡 Falta = bono cancelado automáticamente
            </p>
            <div className="flex items-center gap-3">
              {msg && <span className="text-green-600 text-sm">{msg}</span>}
              <button onClick={guardar} disabled={guardando}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar borrador'}
              </button>
              <button
                onClick={() => { if (confirm('¿Enviar nómina? Ya no podrás modificarla.')) enviar() }}
                disabled={enviando}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {enviando ? 'Enviando...' : 'Enviar nómina →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
