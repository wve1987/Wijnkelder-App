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
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Stap 1: Lees het wijnetiket en noteer wat je ziet. Stap 2: Zoek op internet naar meer informatie over deze wijn om ontbrekende velden aan te vullen. Stap 3: Geef ALLEEN een JSON object terug, geen uitleg, geen markdown. Formaat: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} druif is een array van strings. Vul alleen in wat je zeker weet van het etiket of gevonden hebt via zoeken. Geef ALLEEN de JSON terug.' }
          ]
        }]
      })
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(500).json({ error: 'Anthropic error', detail: rawText });
    }

    const data = JSON.parse(rawText);
    
    // Als er tool_use blocks zijn, moet er een tweede call komen met de resultaten
    if (data.stop_reason === 'tool_use') {
      const toolUseBlock = data.content.find(b => b.type === 'tool_use');
      // Zoekresultaten zijn al verwerkt door de API, haal de tekst uit de laatste response
      const secondResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [
            { role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Stap 1: Lees het wijnetiket en noteer wat je ziet. Stap 2: Zoek op internet naar meer informatie over deze wijn om ontbrekende velden aan te vullen. Stap 3: Geef ALLEEN een JSON object terug, geen uitleg, geen markdown. Formaat: {"naam":"","categorie":"Rood|Wit|Rosé|Mousseux|Dessert|Fortified","jaar":"","alcohol":"","land":"","regio":"","subregio":"","appellatie":"","wijnmaker":"","druif":[],"opmerkingen":""} druif is een array van strings. Vul alleen in wat je zeker weet. Geef ALLEEN de JSON terug.' }
            ]},
            { role: 'assistant', content: data.content },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: '' }] }
          ]
        })
      });
      const secondData = await secondResponse.json();
      const text2 = secondData.content?.find(b => b.type === 'text')?.text || '{}';
      const clean2 = text2.replace(/```json|```/g, '').trim();
      const parsed2 = JSON.parse(clean2);
      return res.status(200).json(parsed2);
    }

    const text = data.content?.find(b => b.type === 'text')?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
