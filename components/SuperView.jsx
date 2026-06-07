import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function SuperView({ perfil }) {
  const [semanas, setSemanas] = useState([])
  const [semanaActual, setSemanaActual] = useState(null)
  const [nominas, setNominas] = useState([])
  const [detalleNomina, setDetalleNomina] = useState(null)
  const [asistencias, setAsistencias] = useState([])
  const [trabajadores, setTrabajadores] = useState({})
  const [cargando, setCargando] = useState(false)
  const [comentario, setComentario] = useState('')
  const [nuevaSemana, setNuevaSemana] = useState({ semana_num:'', fecha_inicio:'', fecha_fin:'' })
  const [showNuevaSemana, setShowNuevaSemana] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { cargarSemanas() }, [])
  useEffect(() => { if (semanaActual) cargarNominas() }, [semanaActual])

  async function cargarSemanas() {
    const { data } = await supabase.from('semanas').select('*').order('fecha_inicio', { ascending: false })
    setSemanas(data || [])
    if (data && data.length > 0) setSemanaActual(data[0])
  }

  async function cargarNominas() {
    const { data } = await supabase
      .from('nominas_obra')
      .select('*, obra:obras(nombre), residente:usuarios(nombre)')
      .eq('semana_id', semanaActual.id)
    setNominas(data || [])
  }

  async function verDetalle(nomina) {
    setCargando(true)
    setDetalleNomina(nomina)
    setComentario('')

    const { data: asist } = await supabase
      .from('asistencias')
      .select('*, trabajador:trabajadores(*)')
      .eq('nomina_obra_id', nomina.id)

    setAsistencias(asist || [])
    setCargando(false)
  }

  async function aprobar() {
    await supabase.from('nominas_obra').update({
      estado: 'aprobada', aprobada_at: new Date().toISOString()
    }).eq('id', detalleNomina.id)
    setMsg('✓ Nómina aprobada')
    setDetalleNomina(null)
    cargarNominas()
    setTimeout(() => setMsg(''), 3000)
  }

  async function rechazar() {
    if (!comentario) { alert('Escribe un comentario para el residente'); return }
    await supabase.from('nominas_obra').update({
      estado: 'rechazada', comentario_rechazo: comentario
    }).eq('id', detalleNomina.id)
    setMsg('Nómina regresada al residente')
    setDetalleNomina(null)
    cargarNominas()
    setTimeout(() => setMsg(''), 3000)
  }

  async function crearSemana() {
    const { error } = await supabase.from('semanas').insert(nuevaSemana)
    if (error) { alert('Error al crear semana'); return }
    setShowNuevaSemana(false)
    setNuevaSemana({ semana_num:'', fecha_inicio:'', fecha_fin:'' })
    cargarSemanas()
  }

  async function cerrarSemana() {
    if (!confirm('¿Cerrar esta semana? Ya no se podrán capturar nóminas.')) return
    await supabase.from('semanas').update({ estado: 'cerrada' }).eq('id', semanaActual.id)
    cargarSemanas()
  }

  async function exportarExcel() {
    // Obtener todas las nóminas aprobadas de la semana con detalle
    const { data: todasNominas } = await supabase
      .from('nominas_obra')
      .select('*, obra:obras(nombre)')
      .eq('semana_id', semanaActual.id)

    const rows = []
    for (const nom of (todasNominas || [])) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('*, trabajador:trabajadores(*)')
        .eq('nomina_obra_id', nom.id)

      ;(asist || []).forEach(a => {
        const t = a.trabajador
        const diasSemana = 6
        const salDia = t.sueldo_semanal / diasSemana
        const tieneFalta = a.dias_total < diasSemana
        const bono = t.tiene_bono && !tieneFalta ? (t.monto_bono || 0) : 0
        rows.push({
          'No.': t.num_empleado,
          'Trabajador': t.nombre,
          'Puesto': t.puesto,
          'Obra': nom.obra.nombre,
          'Forma Pago': t.forma_pago,
          'Vie': a.viernes,
          'Sáb': a.sabado,
          'Dom': a.domingo,
          'Lun': a.lunes,
          'Mar': a.martes,
          'Mié': a.miercoles,
          'Jue': a.jueves,
          'Días': a.dias_total,
          'H. Extra': a.horas_extra,
          'Préstamos': a.prestamos,
          'Sueldo Semanal': t.sueldo_semanal,
          'Salario/Día': Math.round(salDia * 100) / 100,
          'Subtotal': Math.round(a.dias_total * salDia * 100) / 100,
          'Bono': bono,
          'Total a Pagar': a.total_pagar,
        })
      })
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:6},{wch:35},{wch:25},{wch:18},{wch:14},
      {wch:5},{wch:5},{wch:5},{wch:5},{wch:5},{wch:5},{wch:5},
      {wch:6},{wch:8},{wch:10},
      {wch:14},{wch:12},{wch:12},{wch:8},{wch:14}
    ]
    XLSX.utils.book_append_sheet(wb, ws, `Semana ${semanaActual.semana_num}`)
    XLSX.writeFile(wb, `Nomina_Sem${semanaActual.semana_num}_${semanaActual.fecha_inicio}.xlsx`)
  }

  const listas = nominas.filter(n => n.estado === 'enviada' || n.estado === 'aprobada').length
  const total = nominas.length
  const todasAprobadas = nominas.length > 0 && nominas.every(n => n.estado === 'aprobada')

  return (
    <div>
      {/* Header con selector de semana */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Panel del Superintendente</h2>
          {semanaActual && (
            <p className="text-sm text-gray-500">
              Semana {semanaActual.semana_num} · {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${semanaActual.estado === 'abierta' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {semanaActual.estado}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-green-600 text-sm">{msg}</span>}
          {todasAprobadas && (
            <button onClick={exportarExcel} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              📊 Exportar Excel
            </button>
          )}
          {semanaActual?.estado === 'abierta' && (
            <button onClick={cerrarSemana} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              Cerrar semana
            </button>
          )}
          <button onClick={() => setShowNuevaSemana(true)} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Nueva semana
          </button>
        </div>
      </div>

      {/* Selector de semana pasadas */}
      {semanas.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {semanas.map(s => (
            <button key={s.id} onClick={() => setSemanaActual(s)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border ${semanaActual?.id === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
              Sem {s.semana_num}
            </button>
          ))}
        </div>
      )}

      {/* Modal nueva semana */}
      {showNuevaSemana && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-4">Abrir nueva semana</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Número de semana (ej. 22-2026)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="22-2026"
                  value={nuevaSemana.semana_num} onChange={e => setNuevaSemana(p => ({...p, semana_num: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha inicio</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={nuevaSemana.fecha_inicio} onChange={e => setNuevaSemana(p => ({...p, fecha_inicio: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha fin</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={nuevaSemana.fecha_fin} onChange={e => setNuevaSemana(p => ({...p, fecha_fin: e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNuevaSemana(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={crearSemana} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Estado de obras */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {nominas.map(n => (
          <div key={n.id} className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all ${
            n.estado === 'aprobada' ? 'border-green-200' :
            n.estado === 'enviada' ? 'border-blue-200' :
            n.estado === 'rechazada' ? 'border-red-200' : 'border-gray-100'
          }`} onClick={() => n.estado === 'enviada' && verDetalle(n)}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900 text-sm">{n.obra.nombre}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                n.estado === 'aprobada' ? 'bg-green-100 text-green-700' :
                n.estado === 'enviada' ? 'bg-blue-100 text-blue-700' :
                n.estado === 'rechazada' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {n.estado === 'borrador' ? 'Pendiente' :
                 n.estado === 'enviada' ? 'Para revisar' :
                 n.estado === 'aprobada' ? '✓ Aprobada' : 'Regresada'}
              </span>
            </div>
            <p className="text-xs text-gray-400">{n.residente?.nombre}</p>
            {n.estado === 'enviada' && (
              <p className="text-xs text-blue-500 mt-1 font-medium">Clic para revisar →</p>
            )}
          </div>
        ))}
      </div>

      {/* Progreso */}
      {nominas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Progreso semana</span>
            <span className="text-sm font-medium">{listas}/{total} obras</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full">
            <div className="h-2 bg-blue-500 rounded-full transition-all" style={{width: `${(listas/total)*100}%`}} />
          </div>
        </div>
      )}

      {/* Panel de revisión */}
      {detalleNomina && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Revisando: {detalleNomina.obra.nombre}</h3>
                <p className="text-xs text-gray-500">Residente: {detalleNomina.residente?.nombre}</p>
              </div>
              <button onClick={() => setDetalleNomina(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="overflow-auto flex-1">
              {cargando ? (
                <div className="flex items-center justify-center py-12 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Trabajador</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Puesto</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Vie</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Sáb</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Dom</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Lun</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Mar</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Mié</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Jue</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">Días</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-medium">H.Extra</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Sueldo</th>
                      <th className="text-right px-3 py-2 font-medium text-purple-600 bg-purple-50">Sal/Día</th>
                      <th className="text-right px-3 py-2 font-medium text-purple-600 bg-purple-50">Bono</th>
                      <th className="text-right px-3 py-2 font-medium text-purple-600 bg-purple-50">Préstamos</th>
                      <th className="text-right px-3 py-2 font-medium text-purple-600 bg-purple-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asistencias.map(a => {
                      const t = a.trabajador
                      const diasSemana = 6
                      const salDia = Math.round((t.sueldo_semanal / diasSemana) * 100) / 100
                      const tieneFalta = a.dias_total < diasSemana
                      const bono = t.tiene_bono && !tieneFalta ? (t.monto_bono || 0) : 0
                      return (
                        <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50 ${tieneFalta ? 'bg-red-50/20' : ''}`}>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.nombre}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.puesto}</td>
                          {['viernes','sabado','domingo','lunes','martes','miercoles','jueves'].map(d => (
                            <td key={d} className={`px-2 py-2 text-center ${parseFloat(a[d]) === 0 ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                              {parseFloat(a[d]) === 1.1 ? '✓' : parseFloat(a[d]) === 0.5 ? '½' : '✗'}
                            </td>
                          ))}
                          <td className={`px-2 py-2 text-center font-medium ${tieneFalta ? 'text-red-500' : 'text-gray-700'}`}>{a.dias_total}</td>
                          <td className="px-2 py-2 text-center text-gray-600">{a.horas_extra}</td>
                          <td className="px-3 py-2 text-right text-gray-600">${t.sueldo_semanal.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-right bg-purple-50 text-purple-700">${salDia.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-right bg-purple-50 text-purple-700">${bono.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-right bg-purple-50 text-purple-700">${a.prestamos.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-right bg-purple-50 font-semibold text-purple-900">${a.total_pagar.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={12} className="px-3 py-3 font-semibold text-gray-700">Total obra</td>
                      <td colSpan={4} className="px-3 py-3 text-right font-bold text-gray-900 bg-purple-50">
                        ${asistencias.reduce((s,a) => s + a.total_pagar, 0).toLocaleString('es-MX', {minimumFractionDigits:2})}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Acciones */}
            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="flex gap-2 items-center">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Comentario si vas a regresar la nómina..."
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
                <button onClick={rechazar} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  Regresar
                </button>
                <button onClick={aprobar} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  ✓ Aprobar nómina
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
