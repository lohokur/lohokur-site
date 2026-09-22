/* Screens a candidate mugshot before it goes on the wall. Two passes, both
   through OpenAI with OPENAI_API_KEY:

   1. Moderation (omni-moderation-latest, free): flags sexual, violent, gory,
      self-harm, hateful or otherwise graphic images.
   2. A vision model with a fixed JSON verdict: is this a plain photograph of
      exactly one person's face, and is anything else off about it.

   Anything that is not a clean single-face portrait is refused, and the
   reason comes back so the page can say why.

   Fails closed: if the check cannot run (no key, API down) the upload is
   refused rather than let through unseen. Refused photos are never stored. */

const VISION_MODEL = 'gpt-5.4-mini';

const VERDICT = {
  type: 'object',
  properties: {
    face: { type: 'boolean', description: 'True only if this is a real photograph of exactly one person, head and shoulders, face clearly visible and filling most of the frame.' },
    safe: { type: 'boolean', description: 'True only if there is no nudity, underwear, sexual content, gore, blood, injury, violence, weapons, drugs, hate symbols, offensive gestures, or anything graphic or disturbing anywhere in the image.' },
    reason: { type: 'string', description: 'One short plain sentence, lower case, no more than twelve words.' }
  },
  required: ['face', 'safe', 'reason'],
  additionalProperties: false
};

const INSTRUCTIONS = `You screen photos for a public wall of visitor self-portraits. Every accepted image must be a plain, clean portrait of one real person's face, like a passport photo or a mugshot. Be strict.

Reject (face=false) if: no face; more than one person; the face is small, cut off, turned away, hidden or mostly covered; it is a drawing, cartoon, AI render, meme, logo, text, object, animal or scenery rather than a photograph of a person.

Reject (safe=false) if there is any nudity, underwear or swimwear, sexual content or suggestive pose, gore, blood, injury, violence, weapons, drugs, drug use, hate symbols, offensive gestures, or anything graphic, disturbing or degrading anywhere in the frame.

Expected and NOT a reason to reject: grayscale, hard contrast, posterised flat tones, film grain, a dark vignette, blur, low quality, webcam or phone-camera look, a scanned or photographed ID photo or printed portrait, security microprint over the face. The wall deliberately styles photos like old mugshots; that treatment is applied to real photographs and does not make them drawings or renders.`;

const CANT = { ok: false, message: 'Could not check the photo. Try again.' };

async function call(path, body, key) {
  const r = await fetch('https://api.openai.com/v1/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (j.error && j.error.message || ''));
  return j;
}

export async function screen(buf) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('screen: OPENAI_API_KEY missing');
    return { ok: false, message: 'The wall is closed for now.' };
  }
  const url = 'data:image/jpeg;base64,' + buf.toString('base64');

  // Pass 1: the moderation endpoint.
  let mod;
  try {
    mod = await call('moderations', { model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url } }] }, key);
  } catch (e) {
    console.error('screen: moderation failed', e.message);
    return CANT;
  }
  const m = mod.results && mod.results[0];
  if (m && m.flagged) {
    const cats = Object.keys(m.categories || {}).filter((c) => m.categories[c]).join(',');
    return { ok: false, message: 'Not that.', reason: 'moderation: ' + cats };
  }

  // Pass 2: one face, nothing else.
  let out;
  try {
    out = await call('chat/completions', {
      model: VISION_MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: 400,
      response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema: VERDICT } },
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url, detail: 'low' } },
          { type: 'text', text: 'Screen this photo.' }
        ] }
      ]
    }, key);
  } catch (e) {
    console.error('screen: vision failed', e.message);
    return CANT;
  }
  const choice = out.choices && out.choices[0];
  if (!choice || choice.message.refusal) return { ok: false, message: 'Faces only.', reason: 'refused' };
  let v;
  try { v = JSON.parse(choice.message.content); } catch (e) {
    console.error('screen: bad json', String(choice.message.content).slice(0, 200));
    return CANT;
  }
  if (!v.face) return { ok: false, message: 'Faces only. One person, looking at the camera.', reason: v.reason };
  if (!v.safe) return { ok: false, message: 'Not that.', reason: v.reason };
  return { ok: true, reason: v.reason };
}

/* The alias under a mugshot goes through the same moderation endpoint as text. */
export async function screenText(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!text) return { ok: true };
  if (!key) return { ok: false, message: 'The wall is closed for now.' };
  let mod;
  try {
    mod = await call('moderations', { model: 'omni-moderation-latest', input: text }, key);
  } catch (e) {
    console.error('screenText failed', e.message);
    return { ok: false, message: 'Could not check the alias. Try again.' };
  }
  const m = mod.results && mod.results[0];
  if (m && m.flagged) {
    const cats = Object.keys(m.categories || {}).filter((c) => m.categories[c]).join(',');
    return { ok: false, message: 'Not that alias.', reason: 'moderation: ' + cats };
  }
  return { ok: true };
}
