import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    substitute: { type: 'string', description: 'A concise ingredient substitute.' },
    quantity: { type: 'string', description: 'How much substitute to use.' },
    instructions: { type: 'string', description: 'Short preparation and usage instructions.' },
    suitability: { type: 'string', description: 'Dietary suitability without making a safety guarantee.' },
    warning: { type: 'string', description: 'A specific caution or verification reminder.' },
  },
  required: ['substitute', 'quantity', 'instructions', 'suitability', 'warning'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'Gemini is not configured.' }, 503)

  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!token || !supabaseUrl || !supabaseAnonKey) return json({ error: 'Authentication required.' }, 401)

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'Authentication required.' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const recipeName = String(body.recipeName || '').trim().slice(0, 160)
  const missingIngredient = String(body.missingIngredient || '').trim().slice(0, 100)
  const substitutionReason = String(body.substitutionReason || 'The user needs an alternative ingredient.').trim().slice(0, 180)
  const measure = String(body.measure || 'As needed').trim().slice(0, 80)
  const recipeIngredients = Array.isArray(body.recipeIngredients)
    ? body.recipeIngredients.map((item: unknown) => String(item).slice(0, 80)).slice(0, 30)
    : []
  const dietaryPreferences = Array.isArray(body.dietaryPreferences)
    ? body.dietaryPreferences.map((item: unknown) => String(item).slice(0, 50)).slice(0, 12)
    : []
  const allergens = Array.isArray(body.allergens)
    ? body.allergens.map((item: unknown) => String(item).slice(0, 50)).slice(0, 20)
    : []

  if (!recipeName || !missingIngredient || recipeIngredients.length === 0) {
    return json({ error: 'Recipe information is incomplete.' }, 400)
  }

  const prompt = `You are Plated's ingredient substitution assistant. Suggest one practical substitute for the missing ingredient.

Recipe: ${recipeName}
Ingredient to replace: ${missingIngredient}
Reason for replacement: ${substitutionReason}
Required amount: ${measure}
Other recipe ingredients: ${recipeIngredients.join(', ')}
Dietary preferences: ${dietaryPreferences.length ? dietaryPreferences.join(', ') : 'None supplied'}
Declared allergens: ${allergens.length ? allergens.join(', ') : 'None supplied'}

Rules:
- Give exactly one realistic substitute that suits the recipe's purpose.
- Respect the supplied dietary preferences and avoid every declared allergen.
- Never claim that a substitute is completely safe or allergen-free.
- Keep each field concise and useful to a home cook.
- The warning must tell the user to check labels and cross-contamination.`

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  let geminiResponse: Response
  try {
    geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: responseSchema,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    })
  } catch {
    return json({ error: 'The AI service could not be reached.' }, 502)
  }

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text()
    console.error('Gemini API error:', geminiResponse.status, details.slice(0, 500))
    return json({ error: geminiResponse.status === 429 ? 'The free AI limit is busy. Try again shortly.' : 'The AI service rejected the request.' }, 502)
  }

  const gemini = await geminiResponse.json()
  const output = gemini?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('')
  if (!output) return json({ error: 'The AI service returned no suggestion.' }, 502)

  try {
    const suggestion = JSON.parse(output)
    return json(suggestion)
  } catch {
    return json({ error: 'The AI response could not be read.' }, 502)
  }
})
