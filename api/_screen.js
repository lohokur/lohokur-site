import Anthropic from '@anthropic-ai/sdk';

/* Screens a candidate mugshot before it goes on the wall.

   Every upload is shown to Claude with one question: is this a plain
   photograph of one person's face, with nothing graphic, sexual, violent or
   otherwise off in it? Anything that is not a clean portrait is refused, and
   the reason comes back so the page can say why.

   Fails closed: if the check cannot run (no key, API down, refusal) the
   upload is refused rather than let through unseen. Needs ANTHROPIC_API_KEY. */

const MODEL = 'claude-opus-5';

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

Reject (face=false) if: no face; more than one person; the face is small, cut off, turned away, hidden or mostly covered; it is a screenshot, drawing, cartoon, AI render, meme, logo, text, object, animal, scenery, or a photo of a photo/screen that is not a straightforward portrait.

Reject (safe=false) if there is any nudity, underwear or swimwear, sexual content or suggestive pose, gore, blood, injury, violence, weapons, drugs, drug use, hate symbols, offensive gestures, or anything graphic, disturbing or degrading anywhere in the frame.

The photo is grayscale with the contrast stretched. That is expected and not a reason to reject.`;

export async function screen(buf) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('screen: ANTHROPIC_API_KEY missing');
    return { ok: false, message: 'The wall is closed for now.' };
  }
  const client = new Anthropic();
  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT } },
      system: INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
          { type: 'text', text: 'Screen this photo.' }
        ]
      }]
    });
  } catch (e) {
    console.error('screen: api error', e && e.status, e && e.message);
    return { ok: false, message: 'Could not check the photo. Try again.' };
  }
  if (res.stop_reason === 'refusal') {
    return { ok: false, message: 'Faces only.', reason: 'refused' };
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let v;
  try { v = JSON.parse(text); } catch (e) {
    console.error('screen: bad json', text.slice(0, 200));
    return { ok: false, message: 'Could not check the photo. Try again.' };
  }
  if (!v.face) return { ok: false, message: 'Faces only. One person, looking at the camera.', reason: v.reason };
  if (!v.safe) return { ok: false, message: 'Not that.', reason: v.reason };
  return { ok: true, reason: v.reason };
}
