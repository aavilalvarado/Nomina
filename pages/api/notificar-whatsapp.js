// pages/api/notificar-whatsapp.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { tipo, obra, residente, semana } = req.body

  // Mensajes según el tipo de evento
  const mensajes = {
    enviada: `📋 *Nómina lista para revisar*\n\n🏗 Obra: ${obra}\n👷 Residente: ${residente}\n📅 Semana: ${semana}\n\nEntra al sistema para aprobarla.`,
    aprobada: `✅ *Nómina aprobada*\n\n🏗 Obra: ${obra}\n📅 Semana: ${semana}\n\nLa nómina fue aprobada por el superintendente y está lista para procesar.`
  }

  const mensaje = mensajes[tipo]
  if (!mensaje) return res.status(400).json({ error: 'Tipo inválido' })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM  // whatsapp:+14155238886
  const to         = process.env.TWILIO_WHATSAPP_TO    // whatsapp:+5216642439623

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: from, To: to, Body: mensaje })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Twilio error:', data)
      return res.status(500).json({ error: data.message })
    }

    return res.status(200).json({ ok: true, sid: data.sid })
  } catch (err) {
    console.error('Error enviando WhatsApp:', err)
    return res.status(500).json({ error: err.message })
  }
}
