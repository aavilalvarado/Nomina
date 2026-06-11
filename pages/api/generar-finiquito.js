import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { trabajador_id, fecha_baja } = req.body

  // Obtener datos del trabajador
  const { data: t } = await supabase
    .from('trabajadores')
    .select('*, obra:obras(nombre)')
    .eq('id', trabajador_id)
    .single()

  if (!t) return res.status(404).json({ error: 'Trabajador no encontrado' })

  const ingreso = new Date(t.fecha_ingreso)
  const baja = new Date(fecha_baja)
  const diasTotales = Math.floor((baja - ingreso) / (24 * 60 * 60 * 1000))
  const sdi = (t.sueldo_semanal / 7).toFixed(4)

  // Fecha en texto español
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                 'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const fechaTexto = `${baja.getDate().toString().padStart(2,'0')} DE ${meses[baja.getMonth()]} DEL ${baja.getFullYear()}`

  // Crear Excel con XLSX
  const wb = XLSX.utils.book_new()
  
  // Hoja FINIQUITO - estructura exacta del template
  const ws_data = [
    [], [], [], [],
    [, `TIJUANA, BAJA CALIFORNIA A; ${fechaTexto}`],
    [],
    [, 'YO : ', t.nombre],
    [],
    [, 'DECLARO HABER PRESTADO MIS SERVICIOS PERSONALES A LA EMPRESA ESPACIOS Y EDIFICACIONES ESCALANTE,  CON DOMICILIO EN BLVD. DE LAS AMERICAS #3565-40, COLONIA 20 E NOVIEMBRE, TIJUANA BAJA CALIFORNIA. RECIBIENDO DE LA EMPRESA:'],
    [],
    [],
    [],
    [, 'LA CANTIDAD DE:', null, null, null, null, null, null],
    [],
    [],
    [, 'POR CONCEPTO DE FINIQUITO, CON MOTIVO DE LA TERMINACION LABORAL POR ASÍ CONVENIR'],
    [, 'A MIS INTERESES CON FEHCA DE:', null, null, fechaTexto],
    [],
    [, 'S.D.I.', parseFloat(sdi), null, null, 'VACACIONES EN CURSO', 'AGUINALDO'],
    [, 'INGRESO', t.fecha_ingreso],
    [, 'BAJA', fecha_baja, null, null, `=F22*F21`, `=G22*G21`],
    [, null, null, null, null, `=12/365`, `=15/365`],
    [, 'ANTIGÜEDAD', `=C21-C20+1`, 'DÍAS', null, `=F22*F21`, `=G22*G21`],
    [],
    [],
    [, null, null, null, null, 'DÍAS', 'IMPORTE'],
    [, 'SUELDO', null, null, null, 1.1, `=F27*C19`],
    [, 'SÉPTIMO DÍA', null, null, null, `=F27*0.16666666`, `=G27*0.16666666`],
    [, 'AGUINALDO PROP', null, null, null, `=G23`, `=F29*C19`],
    [, 'VACACIONES DISPONIBLES', null, null, null, `=F23`, `=C19*F30`],
    [, 'PRIMA VACACIONAL', null, null, null, `=F30*0.25`, `=G30*0.25`],
    [, 'CREDITO INFONAVIT', null, null, null, null, -53],
    [],
    [, 'ASÍ MISMO MANIFIESTO QUE HASTA EL MOMENTO NO SE ME ADEUDA CANTIDAD ALGUNA POR NINGÚN CONCEPTO DERIVADO DE LA RELACIÓN LABORAL QUE SOSTUVE CON LA EMPRESA, POR LO QUE OTORGO EL MÁS AMPLIO FINIQUITO QUE EN DERECHO PROCEDA, LIBERANDO A LA EMPRESA DE CUALQUIER RESPONSABILIDAD PRESENTE O FUTURA.', null, null, null, 'PERCEPCION', `=G27`],
    [, null, null, null, null, 'GRATIFICACION', `=G36-G34`],
    [, null, null, null, null, 'TOTAL', `=SUM(G27:G32)`],
    [],
    [],
    [, null, t.nombre, null, null, null, 'HUELLA'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(ws_data)
  
  // Ajustar anchos de columna
  ws['!cols'] = [
    {wch: 3}, {wch: 45}, {wch: 15}, {wch: 8}, {wch: 25}, {wch: 20}, {wch: 15}
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'FINIQUITOS')

  // Generar buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=Finiquito_${t.nombre.replace(/ /g,'_')}_${fecha_baja}.xlsx`)
  res.send(buf)
}
