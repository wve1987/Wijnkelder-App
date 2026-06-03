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

    // Stap 2: één web search + JSON output (zonder foto)
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
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages: [
          {
            role: 'user',
            content: `Wijnetiket info: "${etikettekst}". Doe maximaal 1 zoekopdracht voor ontbrekende info. Geef daarna ALLEEN dit JSON terug: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} Opmerkingen maximaal 100 tekens. Alleen wat je zeker weet. ALLEEN JSON.`
          }
        ]
      })
    });

    const step2Data = await step2.json();

    // Als er tool_use was, doe de follow-up zonder foto
    let finalText = '';
    if (step2Data.stop_reason === 'tool_use') {
      const toolBlock = step2Data.content.find(b => b.type === 'tool_use');
      const step3 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [
            { role: 'user', content: `Wijnetiket info: "${etikettekst}". Doe maximaal 1 zoekopdracht voor ontbrekende info. Geef daarna ALLEEN dit JSON terug: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} Opmerkingen maximaal 100 tekens. Alleen wat je zeker weet. ALLEEN JSON.` },
            { role: 'assistant', content: step2Data.content },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolBlock.input ? JSON.stringify(toolBlock.input) : '' }] }
          ]
        })
      });
      const step3Data = await step3.json();
      finalText = step3Data.content?.find(b => b.type === 'text')?.text || '{}';
    } else {
      finalText = step2Data.content?.find(b => b.type === 'text')?.text || '{}';
    }

    const clean = finalText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
