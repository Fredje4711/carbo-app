export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio');

    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: (() => {
        const fd = new FormData();
        fd.append('file', audioFile);
        fd.append('model', 'whisper-1');
        return fd;
      })()
    });

    const data = await openaiResponse.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Whisper-fout:', error);
    res.status(500).json({ error: error.message });
  }
}
