// pages/api/notificar-baja.js

const TWILIO_SID = process.env.TWILIO_SID
const TWILIO_TOKEN = process.env.TWILIO_TOKEN
const TWILIO_WA = 'whatsapp:+15054615232'

const DESTINATARIOS = [
  { nombre: 'Super', numero: 'whatsapp:+526643865247' },
  { nombre: 'Admin', numero: 'whatsapp:+526642439623' },
  { nombre: 'Aux Admin', numero: 'whatsapp:+526644283344' },
]

async function enviarWA(para, mensaje) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
  const body = new URLSearchParams({
    From: TWILIO_WA,
    To: para,
    Body: mensaje,
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  return res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { trabajador, fecha, obra, residente } = req.body

  if (!trabajador || !fecha || !obra || !residente) {
    return res.status(400).json({ error: 'Faltan datos' })
  }

  const fechaFormato = new Date(fecha).toLocaleDateString('es-MX')

  const mensaje = 
`🚨 *BAJA REGISTRADA*

Favor de verificar si cumple con todos los requisitos para su baja.

👷 *Trabajador:* ${trabajador}
📅 *Fecha de baja:* ${fechaFormato}
🏗 *Obra:* ${obra}
👤 *Residente:* ${residente}`

  const resultados = await Promise.all(
    DESTINATARIOS.map(d => enviarWA(d.numero, mensaje))
  )

  const errores = resultados.filter(r => r.error_code)
  if (errores.length > 0) {
    console.error('Errores Twilio:', errores)
    return res.status(500).json({ error: 'Algunos mensajes fallaron', detalle: errores })
  }

  return res.status(200).json({ ok: true, enviados: DESTINATARIOS.length })
}
