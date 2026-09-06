# Enable AI ingredient substitutions

The website calls a Supabase Edge Function so the Gemini API key never appears in browser code or GitHub.

## 1. Create the API key

1. Open Google AI Studio and create a Gemini API key.
2. Treat the key like a password. Do not paste it into `script.js`, `auth.js`, GitHub, or screenshots.

## 2. Store the key in Supabase

From a terminal in this project folder, link the Supabase project if necessary, then store the secret:

```text
npx supabase login
npx supabase link --project-ref uqmbsstsehawfsfsgzdd
npx supabase secrets set GEMINI_API_KEY=YOUR_KEY_HERE
```

The function defaults to `gemini-3.8-flash`. To use a different compatible model without editing code:

```text
npx supabase secrets set GEMINI_MODEL=gemini-3.8-flash
```

## 3. Deploy the function

```text
npx supabase functions deploy suggest-substitution
```

## 4. Test

1. Run the website through Live Server.
2. Log in to a confirmed Plated account.
3. Search for ingredients and open a recipe with at least one missing ingredient.
4. Select **Suggest substitute** beside that ingredient.
5. Confirm that the result shows a substitute, quantity, instructions, suitability and warning.

The normal recipe matcher still works if Gemini is unavailable. Free-tier limits can change, and a temporary `429` response means the user should retry later.
