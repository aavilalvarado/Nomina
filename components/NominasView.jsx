import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function NominasView({ perfil }) {
  const [semanas, setSemanas] = useState([])
  const [semanaActual, setSemanaActual] = useState(null)
  const [nominas, setNominas] = useState([])
  const [resumen, setResumen] = useState({})

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

    // Calcular resumen por obra
    const res = {}
    for (const nom of (data || [])) {
      const { data: asist } = await supabase
        .from('asistencias')
        .select('total_pagar, dias_total, horas_extra, trabajador:trabajadores(sueldo_semanal)')
        .eq('nomina_obra_id', nom.id)
      const total = (asist || []).reduce((s, a) => s + (a.total_pagar || 0), 0)
      res[nom.obra.nombre] = { total, trabajadores: (asist || []).length, estado: nom.estado }
    }
    setResumen(res)
  }

  async function exportarExcel() {
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
        const salDia = Math.round((t.sueldo_semanal / diasSemana) * 100) / 100
        const tieneFalta = a.dias_total < diasSemana
        const bono = t.tiene_bono && !tieneFalta ? (t.monto_bono || 0) : 0
        rows.push({
          'No.': t.num_empleado,
          'Trabajador': t.nombre,
          'Puesto': t.puesto,
          'Obra': nom.obra.nombre,
          'Forma Pago': t.forma_pago,
          'Vie': a.viernes, 'Sáb': a.sabado, 'Dom': a.domingo,
          'Lun': a.lunes, 'Mar': a.martes, 'Mié': a.miercoles, 'Jue': a.jueves,
          'Días': a.dias_total,
          'H. Extra': a.horas_extra,
          'Sueldo Semanal': t.sueldo_semanal,
          'Salario/Día': salDia,
          'Bono': bono,
          'Préstamos': a.prestamos,
          'Total a Pagar': a.total_pagar,
        })
      })
    }

    // Hoja 1: Detalle completo
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:6},{wch:35},{wch:25},{wch:18},{wch:14},
      {wch:5},{wch:5},{wch:5},{wch:5},{wch:5},{wch:5},{wch:5},
      {wch:6},{wch:8},{wch:14},{wch:12},{wch:8},{wch:10},{wch:14}
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Completo')

    // Hoja 2: Resumen por obra
    const resumenRows = Object.entries(resumen).map(([obra, r]) => ({
      'Obra': obra,
      'Trabajadores': r.trabajadores,
      'Total a Pagar': r.total,
      'Estado': r.estado
    }))
    const ws2 = XLSX.utils.json_to_sheet(resumenRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por Obra')

    XLSX.writeFile(wb, `Nomina_Sem${semanaActual.semana_num}_${semanaActual.fecha_inicio}.xlsx`)
  }

  const totalGeneral = Object.values(resumen).reduce((s, r) => s + r.total, 0)
  const aprobadas = nominas.filter(n => n.estado === 'aprobada').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Encargada de Nóminas</h2>
          {semanaActual && (
            <p className="text-sm text-gray-500">Semana {semanaActual.semana_num} · {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}</p>
          )}
        </div>
        <button
          onClick={exportarExcel}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
        >
          📊 Exportar Excel
        </button>
      </div>

      {/* Selector semanas */}
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

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-semibold text-gray-900">{aprobadas}/{nominas.length}</div>
          <div className="text-xs text-gray-500 mt-1">Obras aprobadas</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-semibold text-gray-900">
            {Object.values(resumen).reduce((s, r) => s + r.trabajadores, 0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Trabajadores</div>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
          <div className="text-2xl font-semibold text-purple-900">
            ${totalGeneral.toLocaleString('es-MX', {minimumFractionDigits:2})}
          </div>
          <div className="text-xs text-purple-600 mt-1">Total a pagar</div>
        </div>
      </div>

      {/* Tabla por obra */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Obra</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Residente</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Trabajadores</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Estado</th>
              <th className="text-right px-4 py-3 text-purple-600 font-medium text-xs">Total Obra</th>
            </tr>
          </thead>
          <tbody>
            {nominas.map(n => (
              <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{n.obra.nombre}</td>
                <td className="px-4 py-3 text-gray-500">{n.residente?.nombre}</td>
                <td className="px-4 py-3 text-center text-gray-600">{resumen[n.obra.nombre]?.trabajadores || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    n.estado === 'aprobada' ? 'bg-green-100 text-green-700' :
                    n.estado === 'enviada' ? 'bg-blue-100 text-blue-700' :
                    n.estado === 'rechazada' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {n.estado === 'borrador' ? 'Pendiente' :
                     n.estado === 'enviada' ? 'En revisión' :
                     n.estado === 'aprobada' ? '✓ Aprobada' : 'Regresada'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-purple-900">
                  ${(resumen[n.obra.nombre]?.total || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-purple-50 border-t-2 border-purple-100">
              <td colSpan={4} className="px-4 py-3 font-semibold text-purple-800">Total general</td>
              <td className="px-4 py-3 text-right font-bold text-purple-900 text-base">
                ${totalGeneral.toLocaleString('es-MX', {minimumFractionDigits:2})}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
