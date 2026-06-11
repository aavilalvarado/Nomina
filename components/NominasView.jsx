import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function NominasView({ perfil }) {
  const [semanas, setSemanas] = useState([])
  const [semanaActual, setSemanaActual] = useState(null)
  const [nominas, setNominas] = useState([])
  const [resumen, setResumen] = useState({})
  const [tab, setTab] = useState('nominas')
  const [trabajadores, setTrabajadores] = useState([])
  const [trabajadorSeleccionado, setTrabajadorSeleccionado] = useState(null)
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0])
  const [finiquito, setFiniquito] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { cargarDatos() }, [])
  useEffect(() => { if (semanaActual) cargarNominas() }, [semanaActual])

  async function cargarDatos() {
    const { data: sems } = await supabase.from('semanas').select('*').order('fecha_inicio', { ascending: false })
    setSemanas(sems || [])
    if (sems && sems.length > 0) setSemanaActual(sems[0])

    const { data: trab } = await supabase.from('trabajadores')
      .select('*, obra:obras(nombre)')
      .eq('activo', true)
      .order('num_empleado')
    setTrabajadores(trab || [])
  }

  async function cargarNominas() {
    const { data } = await supabase.from('nominas_obra')
      .select('*, obra:obras(nombre), residente:usuarios(nombre)')
      .eq('semana_id', semanaActual.id)
    setNominas((data || []).filter(n => n?.obra && n?.residente))

    const res = {}
    for (const nom of (data || [])) {
      const { data: asist } = await supabase.from('asistencias')
        .select('total_pagar, dias_total, horas_extra')
        .eq('nomina_obra_id', nom.id)
      const total = (asist || []).reduce((s, a) => s + (a.total_pagar || 0), 0)
      if (nom.obra) res[nom.obra.nombre] = { total, trabajadores: (asist || []).length, estado: nom.estado }
    }
    setResumen(res)
  }

  // Calcular días de vacaciones según ley (art 76 LFT)
  function diasVacaciones(fechaIngreso, fechaBajaStr) {
    if (!fechaIngreso) return 0
    const ingreso = new Date(fechaIngreso)
    const baja = new Date(fechaBajaStr)
    const años = (baja - ingreso) / (365.25 * 24 * 60 * 60 * 1000)
    if (años < 1) return Math.floor(años * 12) // proporcional primer año
    if (años < 2) return 12
    if (años < 3) return 14
    if (años < 4) return 16
    if (años < 5) return 18
    if (años < 6) return 20
    // A partir del 6to año, 2 días más cada 5 años
    return 20 + Math.floor((años - 5) / 5) * 2
  }

  // Calcular finiquito completo
  function calcularFiniquito(trabajador, fechaBajaStr) {
    const ingreso = new Date(trabajador.fecha_ingreso)
    const baja = new Date(fechaBajaStr)
    const diasTotales = (baja - ingreso) / (24 * 60 * 60 * 1000)
    const añosTrabajados = diasTotales / 365.25

    const salarioDiario = (trabajador.sueldo_semanal || 0) / 7
    // SDI simplificado (sin integracion completa)
    const sdi = salarioDiario * 1.0452 // factor integración básico

    // Días en la semana actual
    const inicioSemana = new Date(semanaActual?.fecha_inicio || fechaBajaStr)
    const diasSemanaActual = Math.max(0, (baja - inicioSemana) / (24 * 60 * 60 * 1000))

    // Aguinaldo proporcional (15 días por año)
    const diasAguinaldo = (diasTotales / 365.25) * 15
    const importeAguinaldo = diasAguinaldo * salarioDiario

    // Vacaciones proporcionales
    const diasVac = diasVacaciones(trabajador.fecha_ingreso, fechaBajaStr)
    const vacProporcional = (diasTotales % 365.25) / 365.25 * diasVac
    const importeVacaciones = vacProporcional * salarioDiario

    // Prima vacacional (25% de vacaciones)
    const importePrima = importeVacaciones * 0.25

    // Séptimo día
    const septimoFactor = 1 / 6
    const importeSeptimo = diasSemanaActual * salarioDiario * septimoFactor

    // Sueldo días trabajados semana actual
    const importeSueldo = diasSemanaActual * salarioDiario * 1.1 // 1.1 por valor día

    const total = importeSueldo + importeSeptimo + importeAguinaldo + importeVacaciones + importePrima

    return {
      trabajador: trabajador.nombre,
      fecha_ingreso: trabajador.fecha_ingreso,
      fecha_baja: fechaBajaStr,
      antiguedad_dias: Math.floor(diasTotales),
      antiguedad_años: añosTrabajados.toFixed(2),
      salario_diario: salarioDiario.toFixed(2),
      sdi: sdi.toFixed(2),
      dias_semana: diasSemanaActual.toFixed(1),
      importe_sueldo: importeSueldo.toFixed(2),
      septimo_dias: (diasSemanaActual * septimoFactor).toFixed(4),
      importe_septimo: importeSeptimo.toFixed(2),
      aguinaldo_dias: diasAguinaldo.toFixed(4),
      importe_aguinaldo: importeAguinaldo.toFixed(2),
      vacaciones_dias: vacProporcional.toFixed(4),
      importe_vacaciones: importeVacaciones.toFixed(2),
      prima_dias: (vacProporcional * 0.25).toFixed(4),
      importe_prima: importePrima.toFixed(2),
      total: total.toFixed(2),
      infonavit: 0,
    }
  }

  async function generarFiniquito() {
    if (!trabajadorSeleccionado || !fechaBaja) return
    setGenerando(true)
    const calc = calcularFiniquito(trabajadorSeleccionado, fechaBaja)
    setFiniquito(calc)
    setGenerando(false)
  }

  async function exportarFiniquitoExcel() {
    if (!finiquito) return
    const wb = XLSX.utils.book_new()
    const fecha = new Date(finiquito.fecha_baja).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' }).toUpperCase()

    const data = [
      ['TIJUANA, BAJA CALIFORNIA A:', fecha],
      [],
      ['YO:', finiquito.trabajador],
      [],
      ['DECLARO HABER PRESTADO MIS SERVICIOS PERSONALES A LA EMPRESA ESPACIOS Y EDIFICACIONES ESCALANTE,'],
      ['CON DOMICILIO EN BLVD. DE LAS AMERICAS #3565-40, COLONIA 20 DE NOVIEMBRE, TIJUANA BAJA CALIFORNIA.'],
      ['RECIBIENDO DE LA EMPRESA:'],
      [],
      ['LA CANTIDAD DE:', `$${Number(finiquito.total).toLocaleString('es-MX', {minimumFractionDigits:2})}`, `(MONTO EN MN)`],
      [],
      ['POR CONCEPTO DE FINIQUITO, CON MOTIVO DE LA TERMINACION LABORAL POR ASÍ CONVENIR'],
      ['A MIS INTERESES CON FECHA DE:', fecha],
      [],
      ['S.D.I.', finiquito.sdi, '', 'VACACIONES EN CURSO', 'AGUINALDO'],
      ['INGRESO', finiquito.fecha_ingreso],
      ['BAJA', finiquito.fecha_baja, '', finiquito.vacaciones_dias, finiquito.aguinaldo_dias],
      [],
      ['ANTIGÜEDAD', finiquito.antiguedad_dias, 'DÍAS'],
      [],
      ['', '', '', 'DÍAS', 'IMPORTE'],
      ['SUELDO', '', '', finiquito.dias_semana, `$${finiquito.importe_sueldo}`],
      ['SÉPTIMO DÍA', '', '', finiquito.septimo_dias, `$${finiquito.importe_septimo}`],
      ['AGUINALDO PROP', '', '', finiquito.aguinaldo_dias, `$${finiquito.importe_aguinaldo}`],
      ['VACACIONES DISPONIBLES', '', '', finiquito.vacaciones_dias, `$${finiquito.importe_vacaciones}`],
      ['PRIMA VACACIONAL', '', '', finiquito.prima_dias, `$${finiquito.importe_prima}`],
      ['CREDITO INFONAVIT', '', '', '', `-$${finiquito.infonavit}`],
      [],
      ['ASÍ MISMO MANIFIESTO QUE HASTA EL MOMENTO NO SE ME ADEUDA CANTIDAD ALGUNA POR NINGÚN CONCEPTO'],
      ['DERIVADO DE LA RELACIÓN LABORAL QUE SOSTUVE CON LA EMPRESA.'],
      [],
      ['', '', '', '', 'PERCEPCION', `$${finiquito.importe_sueldo}`],
      ['', '', '', '', 'GRATIFICACION', `$${(parseFloat(finiquito.importe_septimo)+parseFloat(finiquito.importe_aguinaldo)+parseFloat(finiquito.importe_vacaciones)+parseFloat(finiquito.importe_prima)).toFixed(2)}`],
      ['', '', '', '', 'TOTAL', `$${finiquito.total}`],
      [],
      ['', finiquito.trabajador, '', '', '', 'HUELLA'],
    ]

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{wch:30},{wch:25},{wch:10},{wch:20},{wch:20}]
    XLSX.utils.book_append_sheet(wb, ws, 'FINIQUITO')
    XLSX.writeFile(wb, `Finiquito_${finiquito.trabajador.split(' ')[0]}_${finiquito.fecha_baja}.xlsx`)
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
        if (!t) return
        rows.push({
          'No.': t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0'),
          'Trabajador': t.nombre, 'Puesto': t.puesto,
          'Obra': nom.obra?.nombre, 'Forma Pago': t.forma_pago,
          'Vie': a.viernes, 'Sáb': a.sabado, 'Dom': a.domingo,
          'Lun': a.lunes, 'Mar': a.martes, 'Mié': a.miercoles, 'Jue': a.jueves,
          'Días': a.dias_total, 'H.Extra': a.horas_extra,
          'Sueldo Semanal': t.sueldo_semanal,
          'Préstamos': a.prestamos, 'Bono': t.monto_bono || 0,
          'Total': a.total_pagar
        })
      })
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, `Sem${semanaActual.semana_num}`)
    XLSX.writeFile(wb, `Nomina_Sem${semanaActual.semana_num}.xlsx`)
  }

  const totalGeneral = Object.values(resumen).reduce((s, r) => s + r.total, 0)
  const aprobadas = nominas.filter(n => n.estado === 'aprobada').length

  const TABS = [
    { id:'nominas', label:'📋 Nómina' },
    { id:'finiquito', label:'📄 Finiquito' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Administración de Nóminas</h2>
          {semanaActual && <p className="text-sm text-gray-500">Semana {semanaActual.semana_num} · {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}</p>}
        </div>
        <button onClick={exportarExcel} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
          📊 Exportar Excel
        </button>
      </div>

      {/* Selector semanas */}
      {semanas.length > 1 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {semanas.map(s => (
            <button key={s.id} onClick={() => setSemanaActual(s)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border ${semanaActual?.id===s.id?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-500 border-gray-200'}`}>
              Sem {s.semana_num}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab===t.id?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: NÓMINA */}
      {tab === 'nominas' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-semibold">{aprobadas}/{nominas.length}</div>
              <div className="text-xs text-gray-500 mt-1">Obras aprobadas</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-semibold">{Object.values(resumen).reduce((s,r)=>s+r.trabajadores,0)}</div>
              <div className="text-xs text-gray-500 mt-1">Trabajadores</div>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
              <div className="text-2xl font-semibold text-purple-900">${totalGeneral.toLocaleString('es-MX',{minimumFractionDigits:2})}</div>
              <div className="text-xs text-purple-600 mt-1">Total a pagar</div>
            </div>
          </div>

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
                    <td className="px-4 py-3 font-medium">{n.obra?.nombre}</td>
                    <td className="px-4 py-3 text-gray-500">{n.residente?.nombre}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{resumen[n.obra?.nombre]?.trabajadores || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.estado==='aprobada'?'bg-green-100 text-green-700':n.estado==='enviada'?'bg-blue-100 text-blue-700':n.estado==='rechazada'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>
                        {n.estado==='borrador'?'Pendiente':n.estado==='enviada'?'En revisión':n.estado==='aprobada'?'✓ Aprobada':'Regresada'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-purple-900">
                      ${(resumen[n.obra?.nombre]?.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-purple-50 border-t-2 border-purple-100">
                  <td colSpan={4} className="px-4 py-3 font-semibold text-purple-800">Total general</td>
                  <td className="px-4 py-3 text-right font-bold text-purple-900 text-base">
                    ${totalGeneral.toLocaleString('es-MX',{minimumFractionDigits:2})}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB: FINIQUITO */}
      {tab === 'finiquito' && (
        <div>
          {/* Formulario */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <h3 className="font-semibold text-gray-900 mb-4">Generar finiquito</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Trabajador</label>
                <input type="text" placeholder="Buscar por nombre o número..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2" />
                <select size={5}
                  onChange={e => {
                    const t = trabajadores.find(t => t.id === e.target.value)
                    setTrabajadorSeleccionado(t)
                    setFiniquito(null)
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1 text-sm">
                  {trabajadores
                    .filter(t => !busqueda || t.nombre.toLowerCase().includes(busqueda.toLowerCase()) || String(t.num_empleado||'').includes(busqueda))
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.num_empleado == null ? 'NA' : String(t.num_empleado).padStart(4,'0')} — {t.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha de baja</label>
                <input type="date" value={fechaBaja}
                  onChange={e => { setFechaBaja(e.target.value); setFiniquito(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3" />
                {trabajadorSeleccionado && (
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1 mb-3">
                    <div><strong>Empleado:</strong> {trabajadorSeleccionado.nombre}</div>
                    <div><strong>Obra:</strong> {trabajadorSeleccionado.obra?.nombre}</div>
                    <div><strong>Ingreso:</strong> {trabajadorSeleccionado.fecha_ingreso || 'Sin fecha'}</div>
                    <div><strong>Sueldo/sem:</strong> ${trabajadorSeleccionado.sueldo_semanal?.toLocaleString('es-MX')}</div>
                  </div>
                )}
                <button onClick={generarFiniquito}
                  disabled={!trabajadorSeleccionado || !trabajadorSeleccionado.fecha_ingreso || generando}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {generando ? 'Calculando...' : '📄 Calcular finiquito'}
                </button>
                {trabajadorSeleccionado && !trabajadorSeleccionado.fecha_ingreso && (
                  <p className="text-xs text-red-500 mt-1">Este trabajador no tiene fecha de ingreso registrada</p>
                )}
              </div>
            </div>
          </div>

          {/* Resultado */}
          {finiquito && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Finiquito — {finiquito.trabajador}</h3>
                  <p className="text-xs text-gray-400">Ingreso: {finiquito.fecha_ingreso} · Baja: {finiquito.fecha_baja} · Antigüedad: {finiquito.antiguedad_dias} días ({finiquito.antiguedad_años} años)</p>
                </div>
                <button onClick={exportarFiniquitoExcel}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium">
                  📥 Descargar Excel
                </button>
              </div>

              <div className="p-4">
                {/* Datos generales */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-semibold text-gray-900">${finiquito.sdi}</div>
                    <div className="text-xs text-gray-500">SDI</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-semibold text-gray-900">{finiquito.dias_semana}</div>
                    <div className="text-xs text-gray-500">Días trabajados</div>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-semibold text-purple-900">${Number(finiquito.total).toLocaleString('es-MX',{minimumFractionDigits:2})}</div>
                    <div className="text-xs text-purple-600">TOTAL FINIQUITO</div>
                  </div>
                </div>

                {/* Desglose */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Concepto</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Días</th>
                      <th className="text-right px-4 py-2 text-xs text-purple-600 font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Sueldo', finiquito.dias_semana, finiquito.importe_sueldo],
                      ['Séptimo día', finiquito.septimo_dias, finiquito.importe_septimo],
                      ['Aguinaldo proporcional', finiquito.aguinaldo_dias, finiquito.importe_aguinaldo],
                      ['Vacaciones disponibles', finiquito.vacaciones_dias, finiquito.importe_vacaciones],
                      ['Prima vacacional', finiquito.prima_dias, finiquito.importe_prima],
                    ].map(([concepto, dias, importe]) => (
                      <tr key={concepto} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">{concepto}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{dias}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">${Number(importe).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                      </tr>
                    ))}
                    {finiquito.infonavit > 0 && (
                      <tr className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">Crédito INFONAVIT</td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 text-right font-medium text-red-600">-${finiquito.infonavit}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-purple-50 border-t-2 border-purple-100">
                      <td colSpan={2} className="px-4 py-3 font-bold text-purple-800">TOTAL FINIQUITO</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-900 text-base">
                        ${Number(finiquito.total).toLocaleString('es-MX',{minimumFractionDigits:2})}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
