export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mediaType } = req.body;

    if (!image) return res.status(400).json({ error: 'No image received' });
    if (!mediaType) return res.status(400).json({ error: 'No mediaType received' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not set' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Analyseer dit wijnetiket en geef ALLEEN een JSON object terug, geen uitleg, geen markdown. Formaat: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} Vul alleen in wat je zeker weet van het etiket. druif is een array van strings. Geef ALLEEN de JSON terug, niets anders.' }
          ]
        }]
      })
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(500).json({ error: 'Anthropic error', detail: rawText });
    }

    const data = JSON.parse(rawText);
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
