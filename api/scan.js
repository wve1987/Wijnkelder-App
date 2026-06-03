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

    // Stap 1: lees het etiket (met foto, geen web search)
    const step1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Lees dit wijnetiket. Geef alleen wat letterlijk op het etiket staat: wijnaam, druif, jaar, land, regio, wijnmaker, alcohol. Kort en bondig.' }
          ]
        }]
      })
    });

    const step1Data = await step1.json();
    const etikettekst = step1Data.content?.[0]?.text || '';

    // Stap 2: web search + JSON output (server-side tool, geen stap 3 nodig)
    const step2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Wijnetiket info: "${etikettekst}". Zoek aanvullende info op en geef ALLEEN dit JSON terug: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} Opmerkingen maximaal 100 tekens. Alleen wat je zeker weet. ALLEEN JSON.`
        }]
      })
    });

    // Server-side web_search geeft altijd end_turn terug — geen stap 3 nodig
    const step2Data = await step2.json();
    const finalText = step2Data.content?.find(b => b.type === 'text')?.text || '{}';
    const clean = finalText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
