# Plated — HTML, CSS and JavaScript version

This is the framework-free version of the recipe matching app. It uses only:

- `index.html` for page structure
- `style.css` for appearance and responsive layouts
- `script.js` for database loading, ingredient matching, filtering, cards, favourites and recipe details
- `auth.js` for the browser-safe Supabase connection
- `recipes.json` as the local recipe database
- `supabase-setup.sql` for the protected cloud favourites table

## Run it in VS Code

The easiest option is the **Live Server** VS Code extension:

1. Open this folder in VS Code.
2. Install Live Server from the Extensions panel if necessary.
3. Right-click `index.html` and choose **Open with Live Server**.

Alternatively, open a terminal in this folder and run:

```text
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Do not double-click `index.html` and use a `file://` address. Browsers commonly block `fetch('recipes.json')` from local file addresses.

## Matching approach

The script normalizes the user's ingredient names and compares them with each recipe's normalized ingredient keys. It calculates:

```text
match percentage = matched ingredients / total recipe ingredients × 100
```

Recipes are sorted by match percentage, then by the number of missing ingredients, and finally by name.

Recipe data is provided by [TheMealDB](https://www.themealdb.com/).

## Enable accounts and cloud-saved recipes

1. Open your Supabase project.
2. Select **SQL Editor**, create a new query, paste the complete contents of `supabase-setup.sql`, and click **Run** once.
3. Open **Authentication → URL Configuration**.
4. Set the Site URL to the address you use for development, such as `http://127.0.0.1:5500`.
5. Add `http://127.0.0.1:5500/**` under Redirect URLs. If Live Server uses another port, add that address too.
6. Keep email confirmation enabled. New users will receive a confirmation email before their first login.

The app stores only the logged-in user's recipe IDs in Supabase. Row Level Security policies in `supabase-setup.sql` prevent users from viewing or changing another user's saved recipes. Never replace the publishable key in `auth.js` with a secret or service-role key.
