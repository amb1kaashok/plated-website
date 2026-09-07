// Application state
const isResultsPage = document.body.dataset.page === 'results';
const submittedSearch = JSON.parse(sessionStorage.getItem('plated-search') || 'null');
let recipes = [];
let ingredients = isResultsPage ? (submittedSearch?.ingredients || []) : [];
let favourites = [];
let savedOnly = false;
let selectedRecipe = null;
let currentUser = null;
let authMode = 'login';

const elements = {
  input: document.querySelector('#ingredient-input'), chips: document.querySelector('#ingredient-chips'),
  category: document.querySelector('#category-filter'), area: document.querySelector('#area-filter'),
  minimum: document.querySelector('#minimum-filter'), results: document.querySelector('#results'),
  title: document.querySelector('#results-title'), grid: document.querySelector('#recipe-grid'),
  empty: document.querySelector('#empty-state'), saved: document.querySelector('#saved-button'),
  backdrop: document.querySelector('#modal-backdrop'), authBackdrop: document.querySelector('#auth-backdrop'),
  account: document.querySelector('#account-button'), logout: document.querySelector('#logout-button'),
  userEmail: document.querySelector('#user-email'), authMessage: document.querySelector('#auth-message')
};

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function ingredientMatches(available, required) {
  return available.has(normalize(required));
}

async function loadDatabase() {
  try {
    const response = await fetch('recipes.json');
    if (!response.ok) throw new Error('Database could not be loaded');
    const database = await response.json();
  const { data: communityRecipes, error: communityError } =
    await supabaseClient
        .from('user_recipes')
        .select('*')
        .order('created_at', { ascending: false });

if (communityError) {
    console.error('Could not load community recipes:', communityError);
}

const formattedCommunityRecipes = communityRecipes.map(recipe => ({
    ...recipe,
    name: recipe.recipe_name,
    cookingTime: recipe.cooking_time,
    mealType: recipe.meal_type,
    area: recipe.cuisine,
    category: recipe.meal_type,
    image: recipe.image_url,
    publisher: recipe.publisher_name,
    isCommunity: true,

    ingredients: recipe.ingredients.map(item => ({
        ...item,
        key: normalize(item.name),
        measure: item.quantity
    }))
}));

recipes = [...database.recipes, ...formattedCommunityRecipes];
    if (elements.category) fillSelect(elements.category, recipes.map(recipe => recipe.category));
    if (elements.area) fillSelect(elements.area, recipes.map(recipe => recipe.area));
    if (isResultsPage) {
      if (!submittedSearch && sessionStorage.getItem('plated-saved-only') !== 'true') {
        window.location.replace('index.html#finder');
        return;
      }
      if (submittedSearch) {
        elements.category.value = submittedSearch.category;
        elements.area.value = submittedSearch.area;
        elements.minimum.value = submittedSearch.minimum;
      }
      savedOnly = sessionStorage.getItem('plated-saved-only') === 'true';
      showResults(false);
    }
  } catch (error) {
    elements.grid.innerHTML = '<p>Could not load recipes.json. Run this folder through Live Server or a local web server.</p>';
    elements.results.hidden = false;
  }
}

function fillSelect(select, values) {
  [...new Set(values.filter(Boolean))].sort().forEach(value => select.add(new Option(value, value)));
}

function addIngredients() {
  const additions = elements.input.value.split(',').map(normalize).filter(Boolean);
  ingredients = [...new Set([...ingredients, ...additions])];
  elements.input.value = '';
  renderChips();
}

function renderChips() {
  elements.chips.innerHTML = '';
  ingredients.forEach(ingredient => {
    const button = document.createElement('button');
    button.innerHTML = `${escapeHtml(ingredient)} <span>×</span>`;
    button.setAttribute('aria-label', `Remove ${ingredient}`);
    button.addEventListener('click', () => { ingredients = ingredients.filter(item => item !== ingredient); renderChips(); });
    elements.chips.append(button);
  });
}

function getRankedRecipes() {
  const available = new Set(ingredients.map(normalize));
  return recipes
    .filter(recipe => elements.category.value === 'All' || recipe.category === elements.category.value)
    .filter(recipe => elements.area.value === 'All' || recipe.area === elements.area.value)
    .filter(recipe => !savedOnly || favourites.includes(recipe.id))
    .map(recipe => {
      const matched = recipe.ingredients.filter(item => ingredientMatches(available, item.key));
      const missing = recipe.ingredients.filter(item => !ingredientMatches(available, item.key));
      return { ...recipe, matched, missing, score: Math.round(matched.length / recipe.ingredients.length * 100) };
    })
    .filter(recipe => savedOnly || (recipe.matched.length && recipe.score >= Number(elements.minimum.value)))
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length || a.name.localeCompare(b.name));
}

function showResults(shouldScroll = true) {
  elements.results.hidden = false;
  const ranked = getRankedRecipes();
  const visibleCount = Math.min(ranked.length, 15);
  elements.title.textContent = savedOnly ? 'Saved recipes' : `${visibleCount} recipes worth trying`;
  elements.grid.innerHTML = '';
  elements.empty.hidden = ranked.length !== 0;
  ranked.slice(0, 15).forEach(recipe => elements.grid.append(createRecipeCard(recipe)));
  if (shouldScroll) elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createRecipeCard(recipe) {
  const card = document.createElement('article'); card.className = 'card';
  const isFavourite = favourites.includes(recipe.id);
 const heartButton = `<button class="heart ${isFavourite ? 'saved' : ''}" aria-label="${isFavourite ? 'Remove recipe from saved' : 'Save recipe'}"><img src="assets/${isFavourite ? 'heart-selected.svg' : 'heart-unselected.svg'}" alt=""></button>`;
card.innerHTML = `<div class="photo ${recipe.image ? '' : 'no-image'}">${recipe.image ? `<img src="${recipe.image}" alt="${escapeHtml(recipe.name)}" loading="lazy">` : ''}<span class="score ${recipe.score === 100 ? 'done' : ''}">${recipe.score}% match</span>${heartButton}</div><div class="card-body"><span class="meta">${escapeHtml(recipe.area || 'World')} · ${escapeHtml(recipe.category || 'Recipe')}</span><h3>${escapeHtml(recipe.name)}</h3><div class="progress"><span style="width:${recipe.score}%"></span></div><p><b>${recipe.matched.length}</b> ingredients ready · <b>${recipe.missing.length}</b> missing</p>${recipe.publisher ? `<p>Published by ${escapeHtml(recipe.publisher)}</p>` : ''}<button class="view">View recipe</button></div>`;
 if (!recipe.isCommunity) {
  card.querySelector('.heart').addEventListener('click', async () => {
    if (await toggleFavourite(recipe.id)) showResults(false);
  });
}
  card.querySelector('.view').addEventListener('click', () => {
  if (recipe.isCommunity) {
    openCommunityRecipe(recipe);
  } else {
    openRecipe(recipe);
  }
});
  return card;
}

async function toggleFavourite(id) {
  if (!currentUser) {
    openAuthModal('login', 'Log in to save recipes and view them on any device.');
    return false;
  }
  const isSaved = favourites.includes(id);
  const query = isSaved
    ? supabaseClient.from('saved_recipes').delete().eq('recipe_id', id)
    : supabaseClient.from('saved_recipes').insert({ user_id: currentUser.id, recipe_id: id });
  const { error } = await query;
  if (error) {
    alert(`That recipe could not be ${isSaved ? 'removed' : 'saved'}: ${error.message}`);
    return false;
  }
  favourites = isSaved ? favourites.filter(item => item !== id) : [...favourites, id];
  updateAccountUI();
  return true;
}

function openRecipe(recipe) {
  selectedRecipe = recipe;
  document.querySelector('#modal-photo').src = recipe.image;
  document.querySelector('#modal-meta').textContent = `${recipe.area || 'World'} · ${recipe.category || 'Recipe'}`;
  document.querySelector('#modal-title').textContent = recipe.name;
  document.querySelector('#modal-match').textContent = `${recipe.score}% match`;
  document.querySelector('#modal-missing').textContent = recipe.missing.length ? `${recipe.missing.length} ingredients missing` : 'You have everything listed';
  document.querySelector('#modal-ingredients').innerHTML = recipe.ingredients.map(item => {
    const ready = recipe.matched.some(match => match.key === item.key);
    return `<li class="${ready ? 'ready' : ''}"><span>${ready ? '✓' : '×'}</span><div>${escapeHtml(item.name)}<small>${escapeHtml(item.measure || 'As needed')}</small></div></li>`;
  }).join('');
  const steps = recipe.instructions.split(/\r?\n/).filter(Boolean);
  document.querySelector('#modal-instructions').innerHTML = steps.map((step, index) => `<p><span>${index + 1}</span>${escapeHtml(step)}</p>`).join('');
  document.querySelector('#modal-source').href = recipe.source || recipe.mealDbUrl;
  document.querySelector('#modal-save').textContent = favourites.includes(recipe.id) ? 'Remove from saved' : 'Save this recipe';
  elements.backdrop.hidden = false; document.body.style.overflow = 'hidden';
}

function closeRecipe() { elements.backdrop.hidden = true; document.body.style.overflow = ''; selectedRecipe = null; }
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }

function validateNameField(shouldReport = false) {
  const input = document.querySelector('#auth-name');
  const value = input.value.trim();
  const validName = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
  input.setCustomValidity(value && !validName.test(value)
    ? 'Enter a valid full name using letters, spaces, apostrophes, and hyphens only.'
    : '');
  input.setAttribute('aria-invalid', String(!input.validity.valid));
  if (shouldReport && !input.validity.valid) input.reportValidity();
  return input.validity.valid;
}

function validateEmailField(shouldReport = false) {
  const input = document.querySelector('#auth-email');
  const value = input.value.trim();
  const validEmail = /^[A-Z0-9]+(?:[._+\-][A-Z0-9]+)*@[A-Z0-9]+(?:-[A-Z0-9]+)*(?:\.[A-Z0-9]+(?:-[A-Z0-9]+)*)+$/i;
  input.setCustomValidity(value && !validEmail.test(value)
    ? 'Enter a valid email address, for example name@example.com.'
    : '');
  input.setAttribute('aria-invalid', String(!input.validity.valid));
  if (shouldReport && !input.validity.valid) input.reportValidity();
  return input.validity.valid;
}

async function loadSavedRecipes() {
  if (!currentUser) { favourites = []; updateAccountUI(); return; }
  const { data, error } = await supabaseClient.from('saved_recipes').select('recipe_id').order('created_at', { ascending: false });
  if (error) { console.error('Could not load saved recipes:', error.message); return; }
  favourites = data.map(row => row.recipe_id);
  updateAccountUI();
}

async function migrateLocalFavourites() {
  if (!currentUser) return;
  const local = JSON.parse(localStorage.getItem('whats-cooking-favourites') || '[]');
  if (!local.length) return;
  const rows = local.map(recipeId => ({ user_id: currentUser.id, recipe_id: recipeId }));
  const { error } = await supabaseClient.from('saved_recipes').upsert(rows, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
  if (!error) localStorage.removeItem('whats-cooking-favourites');
}

function updateAccountUI() {
  elements.account.hidden = Boolean(currentUser);
  elements.userEmail.hidden = !currentUser;
  elements.logout.hidden = !currentUser;
  elements.saved.hidden = isResultsPage && savedOnly;
  const savedName = (currentUser?.user_metadata?.first_name || currentUser?.user_metadata?.full_name)?.trim();
  const fallbackName = currentUser?.email?.split('@')[0] || '';
  const firstName = (savedName || fallbackName).split(/\s+/)[0];
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : '';
  elements.userEmail.textContent = displayName ? `Hi, ${displayName}.` : '';
  elements.saved.textContent = `Saved (${favourites.length})`;
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  document.querySelector('#login-tab').classList.toggle('active', !signingUp);
  document.querySelector('#signup-tab').classList.toggle('active', signingUp);
  document.querySelector('#auth-title').textContent = signingUp ? 'Create your account' : 'Welcome back';
  document.querySelector('#full-name-row').childNodes[0].nodeValue = 'Full name';
  document.querySelector('#auth-name').placeholder = 'Your full name';
  document.querySelector('#auth-intro').textContent = signingUp ? 'Create an account to save recipes you want to cook.' : 'Log in to view all your saved recipes.';
  document.querySelector('#full-name-row').hidden = !signingUp;
  document.querySelector('#auth-name').required = signingUp;
  document.querySelector('#confirm-password-row').hidden = !signingUp;
  document.querySelector('#remember-row').hidden = signingUp;
  document.querySelector('#auth-confirm-password').required = signingUp;
  document.querySelector('#auth-password').autocomplete = signingUp ? 'new-password' : 'current-password';
  document.querySelector('#auth-submit').textContent = signingUp ? 'Create account' : 'Log in';
  document.querySelector('#auth-switch').innerHTML = signingUp
    ? 'Already have an account? <button type="button" data-mode="login">Log in</button>'
    : 'Don’t have an account? <button type="button" data-mode="signup">Create account</button>';
  elements.authMessage.textContent = '';
  elements.authMessage.classList.remove('success');
}

function openAuthModal(mode = 'login', message = '') {
  setAuthMode(mode);
  elements.authMessage.textContent = message;
  elements.authBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.querySelector('#auth-email').focus(), 0);
}

function closeAuthModal() {
  elements.authBackdrop.hidden = true;
  document.body.style.overflow = '';
  document.querySelector('#auth-form').reset();
  document.querySelector('#auth-name').setCustomValidity('');
  document.querySelector('#auth-email').setCustomValidity('');
  document.querySelector('#auth-name').removeAttribute('aria-invalid');
  document.querySelector('#auth-email').removeAttribute('aria-invalid');
  elements.authMessage.textContent = '';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document.querySelector('#auth-email').value.trim();
  const password = document.querySelector('#auth-password').value;
  const confirmation = document.querySelector('#auth-confirm-password').value;
  const fullName = document.querySelector('#auth-name').value.trim();
  const submit = document.querySelector('#auth-submit');
  elements.authMessage.textContent = '';
  if (authMode === 'signup' && !validateNameField(true)) {
    elements.authMessage.textContent = 'Please correct the full name field.';
    return;
  }
  if (!validateEmailField(true)) {
    elements.authMessage.textContent = 'Please enter a valid email address.';
    return;
  }
  if (authMode === 'signup' && password !== confirmation) {
    elements.authMessage.textContent = 'The passwords do not match.';
    return;
  }
  submit.disabled = true;
  submit.textContent = authMode === 'signup' ? 'Creating account…' : 'Logging in…';
  const result = authMode === 'signup'
    ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}`, data: { first_name: fullName.split(/\s+/)[0], full_name: fullName } } })
    : await supabaseClient.auth.signInWithPassword({ email, password });
  submit.disabled = false;
  if (result.error) {
    elements.authMessage.textContent = result.error.message;
    submit.textContent = authMode === 'signup' ? 'Create account' : 'Log in';
    return;
  }
  if (authMode === 'signup' && !result.data.session) {
    elements.authMessage.textContent = 'Account created. Check your email and click the confirmation link, then log in.';
    elements.authMessage.classList.add('success');
    submit.textContent = 'Create account';
    return;
  }
  closeAuthModal();
}

async function initializeAuth() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) await migrateLocalFavourites();
  await loadSavedRecipes();
  updateAccountUI();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      if (currentUser) await migrateLocalFavourites();
      await loadSavedRecipes();
      if (elements.results && !elements.results.hidden) showResults(false);
    }, 0);
  });
}

if (!isResultsPage) {
  document.querySelector('#add-button').addEventListener('click', addIngredients);
  elements.input.addEventListener('keydown', event => { if (event.key === 'Enter') addIngredients(); });
  document.querySelector('#find-button').addEventListener('click', () => {
    const message = document.querySelector('#finder-message');
    if (!ingredients.length) {
      message.textContent = 'Add at least one ingredient before finding recipes.';
      elements.input.focus();
      return;
    }
    message.textContent = '';
    sessionStorage.setItem('plated-search', JSON.stringify({ ingredients, category: elements.category.value, area: elements.area.value, minimum: elements.minimum.value }));
    sessionStorage.removeItem('plated-saved-only');
    window.location.href = 'results.html';
  });
}
elements.saved.addEventListener('click', () => {
  if (!currentUser) { openAuthModal('login', 'Log in to view your saved recipes.'); return; }
  if (!isResultsPage) {
    sessionStorage.setItem('plated-saved-only', 'true');
    window.location.href = 'results.html';
    return;
  }
  savedOnly = !savedOnly;
  sessionStorage.setItem('plated-saved-only', String(savedOnly));
  updateAccountUI(); showResults();
});
document.querySelector('#close-modal').addEventListener('click', closeRecipe);
elements.backdrop.addEventListener('click', event => { if (event.target === elements.backdrop) closeRecipe(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !elements.backdrop.hidden) closeRecipe(); });
document.querySelector('#modal-save').addEventListener('click', async () => {
  if (selectedRecipe && await toggleFavourite(selectedRecipe.id)) {
    document.querySelector('#modal-save').textContent = favourites.includes(selectedRecipe.id) ? 'Remove from saved' : 'Save this recipe';
  }
});
elements.account.addEventListener('click', () => openAuthModal('login'));
elements.logout.addEventListener('click', async () => { await supabaseClient.auth.signOut(); savedOnly = false; });
document.querySelector('#login-tab').addEventListener('click', () => setAuthMode('login'));
document.querySelector('#signup-tab').addEventListener('click', () => setAuthMode('signup'));
document.querySelector('#auth-form').addEventListener('submit', handleAuthSubmit);
document.querySelector('#auth-name').setAttribute('maxlength', '60');
document.querySelector('#auth-email').setAttribute('maxlength', '254');
document.querySelector('#auth-name').addEventListener('input', () => {
  if (validateNameField() && elements.authMessage.textContent === 'Enter a valid full name using letters, spaces, apostrophes, and hyphens only.') {
    elements.authMessage.textContent = '';
  }
});
document.querySelector('#auth-name').addEventListener('blur', event => {
  if (event.target.value.trim() && !validateNameField()) {
    elements.authMessage.textContent = 'Enter a valid full name using letters, spaces, apostrophes, and hyphens only.';
  }
});
document.querySelector('#auth-email').addEventListener('input', () => {
  if (validateEmailField() && elements.authMessage.textContent === 'Enter a valid email address, for example name@example.com.') {
    elements.authMessage.textContent = '';
  }
});
document.querySelector('#auth-email').addEventListener('blur', event => {
  if (event.target.value.trim() && !validateEmailField()) {
    elements.authMessage.textContent = 'Enter a valid email address, for example name@example.com.';
  }
});
document.querySelector('#close-auth').addEventListener('click', closeAuthModal);
document.querySelector('#auth-switch').addEventListener('click', event => {
  const mode = event.target.dataset.mode;
  if (mode) setAuthMode(mode);
});
elements.authBackdrop.addEventListener('click', event => { if (event.target === elements.authBackdrop) closeAuthModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !elements.authBackdrop.hidden) closeAuthModal(); });

document.querySelector('#menu-toggle').addEventListener('click', () => {
  const menu = document.querySelector('#nav-actions');
  const open = menu.classList.toggle('open');
  document.querySelector('#menu-toggle').setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('#nav-actions a, #nav-actions button').forEach(item => item.addEventListener('click', () => {
  document.querySelector('#nav-actions').classList.remove('open');
  document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false');
}));

if (!isResultsPage) renderChips();
loadDatabase();
initializeAuth();
// =========================
// ADD RECIPE - INGREDIENTS
// =========================

const addIngredientButton = document.querySelector('#add-ingredient');
const ingredientsList = document.querySelector('#ingredients-list');

if (addIngredientButton && ingredientsList) {

    // Add a new ingredient row
    addIngredientButton.addEventListener('click', () => {

        const ingredientRow = document.createElement('div');

        ingredientRow.className = 'ingredient-row';

        ingredientRow.innerHTML = `
            <input
                type="text"
                class="ingredient-name"
                placeholder="Ingredient"
                required
            >

            <input
                type="text"
                class="ingredient-quantity"
                placeholder="Quantity"
                required
            >

            <button
                type="button"
                class="remove-ingredient"
            >
                ×
            </button>
        `;

        ingredientsList.appendChild(ingredientRow);
    });


    // Remove an ingredient row
    ingredientsList.addEventListener('click', (event) => {

        if (event.target.classList.contains('remove-ingredient')) {

            const ingredientRow = event.target.closest('.ingredient-row');

            // Keep at least one ingredient row
            if (ingredientsList.children.length > 1) {
                ingredientRow.remove();
            }
        }
    });
}

// =========================
// ADD RECIPE - FORM SUBMISSION
// =========================

const addRecipeForm = document.querySelector('#add-recipe-form');
const recipeImageInput = document.querySelector('#recipe-image');

function readImageAsDataURL(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);

        reader.readAsDataURL(file);
    });
}
async function uploadRecipeImage(file) {
    if (!file) return '';

    const fileExtension = file.name.split('.').pop();
    const fileName = `${currentUser.id}-${Date.now()}.${fileExtension}`;

    const { error } = await supabaseClient.storage
        .from('recipe-images')
        .upload(fileName, file);

    if (error) {
        console.error('Image upload error:', error);
        throw error;
    }

    const { data } = supabaseClient.storage
        .from('recipe-images')
        .getPublicUrl(fileName);

    return data.publicUrl;
}

if (addRecipeForm) {

    addRecipeForm.addEventListener('submit', async (event) => {

        // Stop the page from refreshing
        event.preventDefault();

        // Get recipe name
        const recipeName = document.querySelector('#recipe-name').value.trim();

        // Get recipe photo
const recipeImageFile = recipeImageInput.files[0];
const recipeImage = await uploadRecipeImage(recipeImageFile);

        // Get cooking time
        const cookingTime = document.querySelector('#cooking-time').value;

        // Get cuisine
        const cuisine = document.querySelector('#recipe-cuisine').value;

        // Get meal type
        const mealType = document.querySelector('#meal-type').value;

        // Get cooking instructions
        const instructions = document.querySelector('#recipe-instructions').value.trim();

        // Get all ingredient rows
        const ingredientRows = document.querySelectorAll('.ingredient-row');

        const ingredients = [];

        ingredientRows.forEach((row) => {

            const name = row.querySelector('.ingredient-name').value.trim();
            const quantity = row.querySelector('.ingredient-quantity').value.trim();

            if (name && quantity) {
                ingredients.push({
                    name: name,
                    quantity: quantity
                });
            }

        });

        // Make sure at least one ingredient was added
        if (ingredients.length === 0) {
            alert('Please add at least one ingredient.');
            return;
        }

        // Create the recipe object
        const newRecipe = {
            id: `user-${Date.now()}`,
            name: recipeName,
            ingredients: ingredients,
            cookingTime: cookingTime,
            cuisine: cuisine,
            mealType: mealType,
            instructions: instructions,
image: recipeImage,
publisher:
    currentUser?.user_metadata?.first_name ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email?.split('@')[0] ||
    'Vani'
        };
// Save the recipe to Supabase
if (!editingRecipeId) {

    // Add a new recipe
    const { error } = await supabaseClient
        .from('user_recipes')
        .insert({
            user_id: currentUser.id,
            recipe_name: recipeName,
            ingredients: ingredients,
            cooking_time: cookingTime,
            cuisine: cuisine,
            meal_type: mealType,
            instructions: instructions,
            image_url: recipeImage,
            publisher_name: newRecipe.publisher
        });

    if (error) {
        console.error('Recipe save error:', error);
        alert('Could not save recipe to Supabase.');
        return;
    }

} else {

    // Update the existing recipe
    const updatedRecipe = {
        recipe_name: recipeName,
        ingredients: ingredients,
        cooking_time: cookingTime,
        cuisine: cuisine,
        meal_type: mealType,
        instructions: instructions,
        publisher_name: newRecipe.publisher
    };

    // Only replace the image if a new image was selected
    if (recipeImageFile) {
        updatedRecipe.image_url = recipeImage;
    }

    const { error } = await supabaseClient
        .from('user_recipes')
        .update(updatedRecipe)
        .eq('id', editingRecipeId)
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Recipe update error:', error);
        alert('Could not update recipe in Supabase.');
        return;
    }
}
        // Save the recipe in the browser
const savedRecipes = JSON.parse(
    localStorage.getItem('plated-user-recipes') || '[]'
);
const wasEditing = editingRecipeId !== null;

if (editingRecipeId) {

    // Update the existing recipe
    const recipeIndex = savedRecipes.findIndex(
        (recipe) => recipe.id === editingRecipeId
    );

    if (recipeIndex !== -1) {

        // Keep the old image if no new image was selected
        if (!recipeImageFile) {
            newRecipe.image = savedRecipes[recipeIndex].image;
        }

        // Keep the same ID
        newRecipe.id = editingRecipeId;

        savedRecipes[recipeIndex] = newRecipe;
    }

    editingRecipeId = null;

} else {

    // Add a brand-new recipe
    savedRecipes.push(newRecipe);
}

localStorage.setItem(
    'plated-user-recipes',
    JSON.stringify(savedRecipes)
);

        console.log('New recipe:', newRecipe);
      

 if (wasEditing) {
    alert(`"${recipeName}" has been updated successfully!`);
} else {
    alert(`"${recipeName}" has been added successfully!`);
}

        // Clear the form
        addRecipeForm.reset();

        // Remove extra ingredient rows
        const allIngredientRows = document.querySelectorAll('.ingredient-row');

        allIngredientRows.forEach((row, index) => {
            if (index > 0) {
                row.remove();
            }
        });

    });

}
// Track which recipe is being edited
let editingRecipeId = null;

// =========================
// DISPLAY COMMUNITY RECIPES
// =========================

async function displayCommunityRecipes() {

    const recipesGrid = document.querySelector('#community-recipes-grid');

    if (!recipesGrid) return;

    const { data: savedRecipes, error } = await supabaseClient
    .from('user_recipes')
    .select('*')
    .order('created_at', { ascending: false });

if (error) {
    console.error('Could not load community recipes:', error);
    return;
}
const formattedRecipes = savedRecipes.map(recipe => ({
    ...recipe,
    name: recipe.recipe_name,
    cookingTime: recipe.cooking_time,
    mealType: recipe.meal_type,
    area: recipe.cuisine,
    category: recipe.meal_type,
    isCommunity: true,
    image: recipe.image_url,
    publisher: recipe.publisher_name
}));

    recipesGrid.innerHTML = '';

    if (formattedRecipes.length === 0) {
        recipesGrid.innerHTML = `
            <p class="community-empty">
                No community recipes yet. Be the first to share one!
            </p>
        `;
        return;
    }

    formattedRecipes.forEach((recipe) => {

        const card = document.createElement('article');

        card.className = 'community-recipe-card';

        card.innerHTML = `
    ${recipe.image ? `<img src="${recipe.image}" class="community-recipe-image" alt="${escapeHtml(recipe.name)}">` : ''}
    
    <h3>${recipe.name}</h3>

            <div class="community-recipe-meta">
                <span>${recipe.cuisine}</span>
                <span>${recipe.mealType}</span>
                <span>${recipe.cookingTime}</span>
            </div>

            <p>
                ${recipe.ingredients.length} ingredients
            </p>

            <button
                type="button"
                class="view-recipe-button"
                data-recipe-id="${recipe.id}"
            >
                View recipe
          </button>
<button
    type="button"
    class="save-community-recipe-button"
    data-recipe-id="${recipe.id}"
>
    Save recipe
</button>

<div class="community-recipe-actions">
    <button
        type="button"
        class="edit-recipe-button"
        data-recipe-id="${recipe.id}"
    >
        Edit
    </button>

    <button
        type="button"
        class="delete-recipe-button"
        data-recipe-id="${recipe.id}"
    >
        Delete
    </button>
</div>
`;

        recipesGrid.appendChild(card);
    });
}


// Display saved recipes when the page loads
displayCommunityRecipes();

// =========================
// COMMUNITY RECIPE VIEWER
// =========================

const communityRecipeBackdrop = document.querySelector(
    '#community-recipe-backdrop'
);

const communityRecipeClose = document.querySelector(
    '#community-recipe-close'
);

const communityRecipeTitle = document.querySelector(
    '#community-recipe-title'
);

const communityRecipeMeta = document.querySelector(
    '#community-recipe-meta'
);

const communityRecipeIngredients = document.querySelector(
    '#community-recipe-ingredients'
);

const communityRecipeInstructions = document.querySelector(
    '#community-recipe-instructions'
);


function openCommunityRecipe(recipe) {

    if (!communityRecipeBackdrop) return;

    communityRecipeTitle.textContent = recipe.name;
    const communityRecipeModal = document.querySelector('.community-recipe-modal');

let recipeImageElement = communityRecipeModal.querySelector('.community-recipe-modal-image');

if (!recipeImageElement) {
    recipeImageElement = document.createElement('img');
    recipeImageElement.className = 'community-recipe-modal-image';
    communityRecipeModal.prepend(recipeImageElement);
}

if (recipe.image) {
    recipeImageElement.src = recipe.image;
    recipeImageElement.alt = recipe.name;
    recipeImageElement.style.display = 'block';
} else {
    recipeImageElement.style.display = 'none';
}

    communityRecipeMeta.innerHTML = `
        <span>${recipe.cuisine}</span>
        <span>${recipe.mealType}</span>
        <span>${recipe.cookingTime}</span>
    `;

    communityRecipeIngredients.innerHTML = '';

    recipe.ingredients.forEach((ingredient) => {

        const ingredientElement = document.createElement('div');

        ingredientElement.className = 'community-recipe-ingredient';

        ingredientElement.innerHTML = `
            <span>${ingredient.name}</span>
            <span>${ingredient.quantity}</span>
        `;

        communityRecipeIngredients.appendChild(ingredientElement);
    });

    communityRecipeInstructions.textContent = recipe.instructions;

    communityRecipeBackdrop.hidden = false;
}


if (communityRecipeBackdrop) {

    communityRecipeBackdrop.addEventListener('click', (event) => {

        if (event.target === communityRecipeBackdrop) {
            communityRecipeBackdrop.hidden = true;
        }

    });
}


if (communityRecipeClose) {

    communityRecipeClose.addEventListener('click', () => {
        communityRecipeBackdrop.hidden = true;
    });

}


// Handle View Recipe buttons
document.addEventListener('click', (event) => {

    const button = event.target.closest('.view-recipe-button');

    if (!button) return;

    const recipeId = button.dataset.recipeId;

    const savedRecipes = JSON.parse(
        localStorage.getItem('plated-user-recipes') || '[]'
    );

    const recipe = savedRecipes.find(
        (item) => item.id === recipeId
    );

    if (recipe) {
        openCommunityRecipe(recipe);
    }

});
// Handle Delete Recipe buttons
document.addEventListener('click', async (event) => {

    const button = event.target.closest('.delete-recipe-button');

    if (!button) return;

    const recipeId = button.dataset.recipeId;

    const card = button.closest('.community-recipe-card');

    const recipeName =
        card?.querySelector('h3')?.textContent || 'this recipe';

    const confirmed = confirm(
        `Are you sure you want to delete "${recipeName}"?`
    );

    if (!confirmed) return;

    // Delete the recipe from Supabase
    const { error } = await supabaseClient
        .from('user_recipes')
        .delete()
        .eq('id', recipeId)
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Recipe delete error:', error);
        alert('Could not delete recipe from Supabase.');
        return;
    }

    // Also remove it from local browser storage
    const savedRecipes = JSON.parse(
        localStorage.getItem('plated-user-recipes') || '[]'
    );

    const updatedRecipes = savedRecipes.filter(
        item => item.id !== recipeId
    );

    localStorage.setItem(
        'plated-user-recipes',
        JSON.stringify(updatedRecipes)
    );

    // Refresh the Community section
    displayCommunityRecipes();

    alert(`"${recipeName}" has been deleted successfully!`);
});
// ==============================
// EDIT COMMUNITY RECIPE
// ==============================

document.addEventListener('click', async (event) => {

    const editButton = event.target.closest('.edit-recipe-button');

    if (!editButton) return;

    const recipeId = editButton.dataset.recipeId;

    const { data: recipe, error } = await supabaseClient
    .from('user_recipes')
    .select('*')
    .eq('id', recipeId)
    .single();

if (error || !recipe) {
    console.error('Could not load recipe for editing:', error);
    return;
}

    if (!recipe) return;

    // Remember which recipe we are editing
    editingRecipeId = recipeId;

    // Fill in the recipe name
    document.querySelector('#recipe-name').value = recipe.recipe_name;

    // Fill in cooking time
    document.querySelector('#cooking-time').value = recipe.cooking_time;

    // Fill in cuisine
    document.querySelector('#recipe-cuisine').value = recipe.cuisine;

    // Fill in meal type
    document.querySelector('#meal-type').value = recipe.mealType;

    // Fill in instructions
    document.querySelector('#recipe-instructions').value = recipe.instructions;

    // Remove existing ingredient rows except the first
    const ingredientsList = document.querySelector('#ingredients-list');

    const ingredientRows = ingredientsList.querySelectorAll('.ingredient-row');

    ingredientRows.forEach((row, index) => {
        if (index > 0) {
            row.remove();
        }
    });

    // Fill in ingredients
    const firstRow = ingredientsList.querySelector('.ingredient-row');

    if (recipe.ingredients.length > 0) {

        firstRow.querySelector('.ingredient-name').value =
            recipe.ingredients[0].name;

        firstRow.querySelector('.ingredient-quantity').value =
            recipe.ingredients[0].quantity;

        recipe.ingredients.slice(1).forEach((ingredient) => {

            const newRow = firstRow.cloneNode(true);

            newRow.querySelector('.ingredient-name').value =
                ingredient.name;

            newRow.querySelector('.ingredient-quantity').value =
                ingredient.quantity;

            ingredientsList.appendChild(newRow);
        });
    }

    // Scroll to Add Recipe section
    document.querySelector('#add-recipe').scrollIntoView({
        behavior: 'smooth'
    });
});


// =========================
// SAVE COMMUNITY RECIPE
// =========================

document.addEventListener('click', (event) => {

    const button = event.target.closest('.save-community-recipe-button');

    if (!button) return;

    const recipeId = button.dataset.recipeId;

    const communityRecipes = JSON.parse(
        localStorage.getItem('plated-user-recipes') || '[]'
    );

    const recipe = communityRecipes.find(
        (item) => item.id === recipeId
    );

    if (!recipe) return;

    const savedRecipes = JSON.parse(
        localStorage.getItem('plated-saved-recipes') || '[]'
    );

    const alreadySaved = savedRecipes.some(
        (item) => item.id === recipeId
    );

    if (alreadySaved) {
        alert('This recipe is already saved!');
        return;
    }

    savedRecipes.push(recipe);

    localStorage.setItem(
        'plated-saved-recipes',
        JSON.stringify(savedRecipes)
    );

    button.textContent = 'Saved ✓';
button.disabled = true;
});