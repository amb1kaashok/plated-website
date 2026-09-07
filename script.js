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
let communityRecipesCache = [];

function mysteryStorageKey() {
  return `plated-mystery-${currentUser?.id || 'guest'}`;
}

function getMysteryState() {
  try {
    return JSON.parse(localStorage.getItem(mysteryStorageKey()) || 'null');
  } catch (_) {
    return null;
  }
}

function saveMysteryState(state) {
  localStorage.setItem(mysteryStorageKey(), JSON.stringify(state));
}

function getMysteryBadges() {
  if (!currentUser) return [];
  try {
    return JSON.parse(localStorage.getItem(`plated-mystery-badges-${currentUser.id}`) || '[]');
  } catch (_) {
    return [];
  }
}

function saveMysteryBadges(badges) {
  if (!currentUser) return;
  localStorage.setItem(`plated-mystery-badges-${currentUser.id}`, JSON.stringify(badges));
}

const mysteryBadgeNames = [
  'Cuisine Explorer', 'Ingredient Tactician', 'Best Match', 'Category Breaker',
  'Curious Cook', 'Green Plate', 'Passport Pioneer', 'Precision Cook',
  'Off-Menu Chef', 'Nothing Wasted'
];

function getMysteryBadgeForRecipe(recipeId) {
  if (!currentUser) return null;
  const badges = getMysteryBadges();
  return badges.find(badge => String(badge.recipeId) === String(recipeId)) || null;
}

function scoreRecipe(recipe) {
  const available = new Set(ingredients.map(normalize));
  const matched = recipe.ingredients.filter(item => ingredientMatches(available, item.key));
  const missing = recipe.ingredients.filter(item => !ingredientMatches(available, item.key));
  return { ...recipe, matched, missing, score: recipe.ingredients.length ? Math.round(matched.length / recipe.ingredients.length * 100) : 0 };
}

function chooseMysteryRecipe(challengeIndex) {
  const ranked = getRankedRecipes();
  const pool = ranked.length ? ranked : recipes.map(scoreRecipe).filter(Boolean);
  if (!pool.length) return null;
  const cooked = getCookedIds();
  const cookedAreas = new Set(cooked.map(id => recipes.find(r => String(r.id) === String(id))?.area).filter(Boolean));
  let candidates = pool;
  if (challengeIndex === 0 || challengeIndex === 6) {
    candidates = pool.filter(recipe => !cookedAreas.has(recipe.area));
  } else if (challengeIndex === 1) {
    candidates = pool.filter(recipe => recipe.matched.length >= 3);
  } else if (challengeIndex === 4) {
    candidates = pool.filter(recipe => recipe.matched.length >= 1);
  } else if (challengeIndex === 5) {
    candidates = pool.filter(recipe => /vegetarian/i.test(`${recipe.category || ''} ${recipe.name || ''} ${recipe.tags || ''}`));
  } else if (challengeIndex === 7) {
    candidates = pool.filter(recipe => recipe.missing.length === 1);
  } else if (challengeIndex === 9) {
    candidates = pool.filter(recipe => recipe.score === 100);
  }
  if (!candidates.length) candidates = pool;
  if (challengeIndex === 2) return candidates[0];
  return candidates[Math.floor(Math.random() * Math.min(candidates.length, 8))];
}

function renderMysteryUI() {
  const state = getMysteryState();
  const challengeNode = document.querySelector('#mystery-challenge');
  const detailNode = document.querySelector('#mystery-detail');
  const completeButton = document.querySelector('#mystery-complete');
  const goButton = document.querySelector('#mystery-go-recipe');
  if (!challengeNode || !detailNode || !completeButton) return;
  if (!state || state.completed) {
    completeButton.hidden = true;
    if (goButton) goButton.hidden = true;
    return;
  }
  completeButton.hidden = false;
  const ready = Boolean(state.recipeId && hasCooked(state.recipeId));
  completeButton.disabled = !ready;
  completeButton.textContent = ready ? 'I completed it' : 'I completed it';
  if (goButton) goButton.hidden = !state.recipeId;
}

function showMysteryBadge(recipe) {
  const node = document.querySelector('#modal-badge');
  if (!node) return;
  const badge = getMysteryBadgeForRecipe(recipe.id);
  if (badge) {
    node.hidden = false;
    node.textContent = `Badge · ${badge.name}`;
  } else {
    node.hidden = true;
    node.textContent = '';
  }
}

function updateChallengeButton(recipe) {
  const button = document.querySelector('#modal-challenge');
  if (!button) return;
  const state = getMysteryState();
  const selected = state && state.recipeId && String(state.recipeId) === String(recipe.id) && !state.completed;
  button.textContent = selected ? 'Challenge selected' : 'Challenge';
  button.classList.toggle('is-selected', Boolean(selected));
  button.disabled = Boolean(state?.completed && String(state.recipeId) === String(recipe.id));
}

function selectChallengeRecipe(recipe) {
  const state = getMysteryState();
  if (!state || state.completed) {
    alert('Reveal a Mystery Challenge first.');
    return;
  }
  saveMysteryState({ ...state, recipeId: String(recipe.id), challengeSelected: true, completed: false });
  updateChallengeButton(recipe);
  renderMysteryUI();
}

function goToMysteryRecipe() {
  const state = getMysteryState();
  if (!state?.recipeId) return;
  const raw = recipes.find(recipe => String(recipe.id) === String(state.recipeId));
  if (!raw) return;
  openRecipe(scoreRecipe(raw));
}

const mysteryChallenges = [
  { title: 'Cook a cuisine you have never tried.', detail: 'Choose a cuisine you have not cooked before and find a recipe using ingredients you already have.' },
  { title: 'Find a recipe using at least three ingredients you have.', detail: 'Add three or more ingredients to PLATED and choose a recipe that makes good use of them.' },
  { title: 'Cook your highest-match recipe.', detail: 'Find the recipe with the strongest ingredient match and give it a go.' },
  { title: 'Cook outside your usual meal category.', detail: 'Use PLATED to choose a recipe from a meal category you do not usually make.' },
  { title: 'Cook a recipe with an ingredient you rarely use.', detail: 'Pick one less-familiar ingredient from your kitchen and see what PLATED can turn it into.' },
  { title: 'Cook a vegetarian recipe.', detail: 'Find a vegetarian recipe that works with the ingredients you already have.' },
  { title: 'Try a recipe from a cuisine you have not unlocked.', detail: 'Choose a cuisine outside your current Passport collection and cook one recipe from it.' },
  { title: 'Find a recipe where you are missing only one ingredient.', detail: 'Aim for a strong match and choose a recipe that needs just one extra ingredient.' },
  { title: 'Cook a different kind of meal than you usually make.', detail: 'Use PLATED’s meal category to choose something outside your normal routine.' },
  { title: 'Make dinner using only what you already have.', detail: 'Aim for a 100% ingredient match and cook a recipe without adding anything new.' }
];

const elements = {
  input: document.querySelector('#ingredient-input'), chips: document.querySelector('#ingredient-chips'),
  category: document.querySelector('#category-filter'), area: document.querySelector('#area-filter'),
  minimum: document.querySelector('#minimum-filter'), results: document.querySelector('#results'),
  title: document.querySelector('#results-title'), grid: document.querySelector('#recipe-grid'),
  empty: document.querySelector('#empty-state'), saved: document.querySelector('#saved-button'),
  passport: document.querySelector('#passport-button'),
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
    let communityRecipes = [];
    const { data, error: communityError } = await supabaseClient
        .from('user_recipes')
        .select('*')
        .order('created_at', { ascending: false });

    if (communityError) {
      console.warn('Community recipes are not available yet:', communityError.message);
    } else {
      communityRecipes = data || [];
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
      ingredients: (recipe.ingredients || []).map(item => ({
        ...item,
        key: normalize(item.name),
        measure: item.quantity
      }))
    }));

    communityRecipesCache = formattedCommunityRecipes;
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
  const isCommunity = Boolean(recipe.isCommunity);
  const mysteryBadge = isCommunity ? null : getMysteryBadgeForRecipe(recipe.id);
  const badgeMarkup = mysteryBadge ? `<span class="recipe-achievement-badge" title="Mystery Challenge badge: ${escapeHtml(mysteryBadge.name)}"><span class="badge-mark" aria-hidden="true">✦</span><span class="badge-copy"><small>Mystery achievement</small><b>${escapeHtml(mysteryBadge.name)}</b></span></span>` : '';
  const heartButton = isCommunity ? '' : `<button class="heart ${isFavourite ? 'saved' : ''}" aria-label="${isFavourite ? 'Remove recipe from saved' : 'Save recipe'}"><img src="assets/${isFavourite ? 'heart-selected.svg' : 'heart-unselected.svg'}" alt=""></button>`;
  card.innerHTML = `<div class="photo ${recipe.image ? '' : 'no-image'}">${recipe.image ? `<img src="${recipe.image}" alt="${escapeHtml(recipe.name)}" loading="lazy">` : ''}${badgeMarkup}<span class="score ${recipe.score === 100 ? 'done' : ''}">${recipe.score}% match</span>${heartButton}</div><div class="card-body"><span class="meta">${escapeHtml(recipe.area || 'World')} · ${escapeHtml(recipe.category || 'Recipe')}</span><h3>${escapeHtml(recipe.name)}</h3><div class="progress"><span style="width:${recipe.score}%"></span></div><p><b>${recipe.matched.length}</b> ingredients ready · <b>${recipe.missing.length}</b> missing</p>${recipe.publisher ? `<p>Published by ${escapeHtml(recipe.publisher)}</p>` : ''}<button class="view">View recipe</button></div>`;
  if (!isCommunity) {
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

function splitInstructions(instructions) {
  const cleaned = String(instructions || '').replace(/\s+/g, ' ').trim();
  const marked = cleaned.split(/(?=step\s*\d+\s+)/i).map(step => step.trim()).filter(Boolean);
  return marked.length ? marked : String(instructions || '').split(/\r?\n/).map(step => step.trim()).filter(Boolean);
}

function getCookedIds() {
  if (!currentUser) return [];
  try { return JSON.parse(localStorage.getItem(`plated-cooked-${currentUser.id}`) || '[]'); } catch (_) { return []; }
}

function saveCookedIds(ids) {
  if (!currentUser) return;
  localStorage.setItem(`plated-cooked-${currentUser.id}`, JSON.stringify([...new Set(ids)]));
}

function hasCooked(recipeId) {
  return getCookedIds().includes(String(recipeId));
}

function getReviewKey(recipeId) { return `plated-review-${currentUser?.id || 'guest'}-${recipeId}`; }
function getRecipeReview(recipeId) {
  if (!currentUser) return null;
  return localStorage.getItem(getReviewKey(recipeId));
}
function saveRecipeReview(recipeId, review) {
  if (!currentUser) return;
  if (review) localStorage.setItem(getReviewKey(recipeId), review);
  else localStorage.removeItem(getReviewKey(recipeId));
}
function renderCookedPlate(recipe) {
  const plate = document.querySelector('#cooked-plate');
  if (!plate) return;
  const cooked = hasCooked(recipe.id);
  plate.hidden = !cooked;
  if (!cooked) return;
  const review = getRecipeReview(recipe.id);
  document.querySelectorAll('.review-option').forEach(button => {
    button.classList.toggle('selected', button.dataset.review === review);
    button.setAttribute('aria-pressed', button.dataset.review === review ? 'true' : 'false');
  });
  const saved = document.querySelector('#review-saved');
  if (saved) {
    saved.textContent = review ? ({
      loved: 'Saved to your Cooked Plate.',
      okay: 'Saved to your Cooked Plate.',
      never: 'Saved to your Cooked Plate.'
    }[review] || '') : '';
  }
  const feedback = document.querySelector('#review-feedback');
  if (feedback) feedback.textContent = '';
  const savePrompt = document.querySelector('#review-save-prompt');
  if (savePrompt) savePrompt.hidden = review !== 'loved';
  const saveQuestion = document.querySelector('#review-save-question');
  if (saveQuestion) saveQuestion.hidden = review !== 'loved';
  const saveChoice = document.querySelector('#review-save-choice');
  if (saveChoice) saveChoice.hidden = review !== 'loved';
}

function showReviewResponse(review, recipe) {
  const feedback = document.querySelector('#review-feedback');
  if (!feedback) return;
  const messages = {
    loved: 'Wow, that’s wonderful, Chef! You found a dish worth keeping.',
    okay: 'It always gets better with practice, Chef. Keep cooking and keep experimenting.',
    never: 'Uh oh, Chef! Better luck next time — not every recipe can be a winner.'
  };
  feedback.textContent = messages[review] || '';
  feedback.className = `review-feedback ${review}`;

  const savePrompt = document.querySelector('#review-save-prompt');
  const saveQuestion = document.querySelector('#review-save-question');
  const saveChoice = document.querySelector('#review-save-choice');
  if (review === 'loved') {
    if (savePrompt) savePrompt.hidden = false;
    if (saveQuestion) saveQuestion.hidden = false;
    if (saveChoice) saveChoice.hidden = false;
  } else {
    if (savePrompt) savePrompt.hidden = true;
    if (saveQuestion) saveQuestion.hidden = true;
    if (saveChoice) saveChoice.hidden = true;
  }
}

function chooseReview(review) {
  if (!selectedRecipe || !currentUser || !hasCooked(selectedRecipe.id)) return;
  saveRecipeReview(selectedRecipe.id, review);
  document.querySelectorAll('.review-option').forEach(button => {
    const selected = button.dataset.review === review;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  showReviewResponse(review, selectedRecipe);
}

async function handleReviewSaveChoice(save) {
  if (!selectedRecipe || !currentUser) return;
  const feedback = document.querySelector('#review-feedback');
  const choice = document.querySelector('#review-save-choice');
  const question = document.querySelector('#review-save-question');
  const saved = document.querySelector('#review-saved');
  if (save) {
    const alreadySaved = favourites.includes(selectedRecipe.id);
    const success = alreadySaved ? true : await toggleFavourite(selectedRecipe.id);
    if (success) {
      if (question) question.hidden = true;
      if (choice) choice.hidden = true;
      if (feedback) feedback.textContent = alreadySaved
        ? 'It’s already saved, Chef. Good choice.'
        : 'Great choice, Chef! It’s safely tucked into your Saved recipes.';
      if (saved) saved.textContent = 'Saved to your Saved recipes.';
    }
  } else {
    if (question) question.hidden = true;
    if (choice) choice.hidden = true;
    if (feedback) feedback.textContent = 'That’s okay, maybe later, Chef.';
  }
}

function toggleRecipeCooked(recipe) {
  if (!currentUser) {
    openAuthModal('login', 'Log in to record cooked recipes and build your passport.');
    return false;
  }

  const recipeId = String(recipe.id);
  const ids = getCookedIds();
  const index = ids.indexOf(recipeId);

  if (index >= 0) {
    // Removing the cooked mark also removes its Cooked Plate review.
    ids.splice(index, 1);
    saveRecipeReview(recipeId, null);
  } else {
    ids.push(recipeId);
  }

  saveCookedIds(ids);
  updateCookedButton(recipe);
  renderCookedPlate(recipe);
  renderPassport();
  renderMysteryUI();
  updateChallengeButton(recipe);
  return true;
}

function updateCookedButton(recipe) {
  const button = document.querySelector('#modal-cooked');
  if (!button) return;
  const cooked = hasCooked(recipe.id);
  button.textContent = cooked ? 'Remove cooked mark' : 'Mark as cooked';
  button.classList.toggle('is-cooked', cooked);
  button.setAttribute('aria-pressed', cooked ? 'true' : 'false');
}

function openPassport() {
  if (!currentUser) {
    openAuthModal('login', 'Log in to build your recipe passport.');
    return;
  }
  renderPassport();
  document.querySelector('#passport-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closePassport() {
  document.querySelector('#passport-backdrop').hidden = true;
  document.body.style.overflow = '';
}

const passportStyles = {
  'Algerian': ['#0b7a3b', '#d8b24c', 'ALG'],
  'Argentina': ['#4b9fd8', '#d6b45b', 'ARG'],
  'Australian': ['#173f8a', '#d8b24c', 'AUS'],
  'Brazilian': ['#1d7d4b', '#d4aa3a', 'BRA'],
  'British': ['#b13a3a', '#234b83', 'GBR'],
  'Canadian': ['#b52b32', '#d9d1c2', 'CAN'],
  'Chinese': ['#c62828', '#d8aa3d', 'CHN'],
  'Croatian': ['#b7373f', '#234b83', 'CRO'],
  'Egyptian': ['#c28a2c', '#202020', 'EGY'],
  'Filipino': ['#2d65a4', '#c83d42', 'PHL'],
  'French': ['#244f8f', '#b73b46', 'FRA'],
  'Greek': ['#2e6ea5', '#d9d1c2', 'GRC'],
  'Indian': ['#d97825', '#2f7d4f', 'IND'],
  'Irish': ['#2f7b4f', '#d8a832', 'IRL'],
  'Italian': ['#2e7b51', '#b83b42', 'ITA'],
  'Jamaican': ['#2f7d4f', '#d5b13f', 'JAM'],
  'Japanese': ['#bd3b45', '#d9d1c2', 'JPN'],
  'Kenyan': ['#1e1e1e', '#b73b43', 'KEN'],
  'Malaysian': ['#b63a42', '#d9bd42', 'MYS'],
  'Mexican': ['#2f7d4f', '#b63a42', 'MEX'],
  'Moroccan': ['#b5363e', '#d3ad45', 'MAR'],
  'Norway': ['#b63b45', '#234b83', 'NOR'],
  'Polish': ['#b63b45', '#d9d1c2', 'POL'],
  'Portuguese': ['#2f7d4f', '#b83b43', 'PRT'],
  'Russian': ['#2c5d8e', '#b63b45', 'RUS'],
  'Saudi Arabian': ['#2f7d4f', '#d9d1c2', 'SAU'],
  'Slovakia': ['#2f5c8c', '#b83b45', 'SVK'],
  'Spanish': ['#bd3d3d', '#d7ad38', 'ESP'],
  'Syrian': ['#2f7d4f', '#b83b45', 'SYR'],
  'Thai': ['#4f3f86', '#b83b45', 'THA'],
  'Tunisian': ['#b83b43', '#d9d1c2', 'TUN'],
  'Turkish': ['#b83b43', '#d9d1c2', 'TUR'],
  'Ukrainian': ['#d5ad36', '#2e68a0', 'UKR'],
  'United States': ['#b63b43', '#2f5f92', 'USA'],
  'Uruguayan': ['#4f94c5', '#d7b43d', 'URY'],
  'Venezuelan': ['#d6ad3b', '#2d6e9f', 'VEN'],
  'Vietnamese': ['#b83b43', '#d7b03d', 'VNM'],
  'Dutch': ['#b83b43', '#e0a738', 'NLD'],
  'Netherlands': ['#b83b43', '#e0a738', 'NLD'],
  'Russian': ['#2e5f90', '#b83b43', 'RUS'],
  'Japanese': ['#bd3b45', '#d9d1c2', 'JPN'],
};

function getPassportStyle(cuisine) {
  const style = passportStyles[cuisine] || ['#1f3d19', '#8b7d64', cuisine.slice(0,3).toUpperCase()];
  return `--stamp-ink:${style[0]};--stamp-accent:${style[1]};`;
}

function renderPassport() {
  const cookedIds = getCookedIds();
  const cookedRecipes = cookedIds.map(id => recipes.find(recipe => String(recipe.id) === String(id))).filter(Boolean);
  const counts = cookedRecipes.reduce((map, recipe) => {
    const area = recipe.area || 'Other';
    map[area] = (map[area] || 0) + 1;
    return map;
  }, {});
  const cuisines = [...new Set(recipes.map(recipe => recipe.area).filter(Boolean))].sort();
  const unlocked = cuisines.filter(cuisine => (counts[cuisine] || 0) >= 3).length;
  const unlockedNode = document.querySelector('#passport-unlocked');
  const cookedNode = document.querySelector('#passport-cooked');
  const noteNode = document.querySelector('#passport-progress-note');
  const stamps = document.querySelector('#passport-stamps');
  if (!stamps) return;
  unlockedNode.textContent = unlocked;
  cookedNode.textContent = cookedRecipes.length;
  if (noteNode) noteNode.textContent = unlocked ? `${unlocked} ${unlocked === 1 ? 'cuisine' : 'cuisines'} stamped. Keep exploring.` : 'Cook three recipes from a cuisine to earn its stamp.';
  stamps.innerHTML = cuisines.map((cuisine, index) => {
    const count = counts[cuisine] || 0;
    const isUnlocked = count >= 3;
    const progress = Math.min(count, 3);
    const stampClass = isUnlocked ? 'unlocked' : 'locked';
    const stampStyle = getPassportStyle(cuisine);
    const tilt = [-1.8, 1.2, -0.8, 1.7, -1.1][index % 5];
    const countryCode = passportStyles[cuisine]?.[2] || cuisine.slice(0,3).toUpperCase();
    return `<article class="passport-stamp ${stampClass}" style="${stampStyle}--stamp-tilt:${tilt}deg"><div class="stamp-border"><div class="stamp-top"><span class="stamp-country">${escapeHtml(cuisine)}</span><span class="stamp-count">${count}/3</span></div><div class="stamp-seal"><span>${escapeHtml(countryCode)}</span></div><div class="stamp-location">PLATED · ${escapeHtml(cuisine.toUpperCase())}</div><div class="stamp-rule"></div><span class="stamp-status">${isUnlocked ? 'STAMPED · CUISINE UNLOCKED' : `${3 - progress} more recipe${3 - progress === 1 ? '' : 's'} to unlock`}</span></div></article>`;
  }).join('');
}

function revealMysteryChallenge() {
  const challengeNode = document.querySelector('#mystery-challenge');
  const detailNode = document.querySelector('#mystery-detail');
  const result = document.querySelector('#mystery-result');
  if (!challengeNode || !detailNode) return;
  const previous = Number(localStorage.getItem('plated-last-mystery-challenge'));
  let next = Math.floor(Math.random() * mysteryChallenges.length);
  if (mysteryChallenges.length > 1 && Number.isInteger(previous) && next === previous) {
    next = (next + 1 + Math.floor(Math.random() * (mysteryChallenges.length - 1))) % mysteryChallenges.length;
  }
  localStorage.setItem('plated-last-mystery-challenge', String(next));
  const challenge = mysteryChallenges[next];
  const recipe = chooseMysteryRecipe(next);
  const state = { challengeIndex: next, recipeId: recipe ? String(recipe.id) : null, challengeSelected: false, completed: false, createdAt: Date.now() };
  saveMysteryState(state);
  challengeNode.textContent = challenge.title;
  detailNode.textContent = challenge.detail;
  if (result) result.classList.add('has-challenge');
  const goButton = document.querySelector('#mystery-go-recipe');
  if (goButton) goButton.hidden = !recipe;
  renderMysteryUI();
}

function completeMysteryChallenge() {
  if (!currentUser) {
    openAuthModal('login', 'Log in to complete a Mystery Challenge and earn your badge.');
    return;
  }
  const state = getMysteryState();
  const challengeNode = document.querySelector('#mystery-challenge');
  const detailNode = document.querySelector('#mystery-detail');
  const completeButton = document.querySelector('#mystery-complete');
  if (!state || state.completed || !state.recipeId || !state.challengeSelected) return;
  if (!hasCooked(state.recipeId)) {
    renderMysteryUI();
    return;
  }
  const rawRecipe = recipes.find(recipe => String(recipe.id) === String(state.recipeId));
  if (!rawRecipe) return;
  const badges = getMysteryBadges();
  const badgeName = mysteryBadgeNames[state.challengeIndex] || 'Mystery Chef';
  if (!badges.some(badge => String(badge.recipeId) === String(state.recipeId) && badge.challengeIndex === state.challengeIndex)) {
    badges.push({ recipeId: String(state.recipeId), challengeIndex: state.challengeIndex, name: badgeName, earnedAt: Date.now() });
    saveMysteryBadges(badges);
  }
  saveMysteryState({ ...state, completed: true, completedAt: Date.now() });
  if (completeButton) {
    completeButton.hidden = false;
    completeButton.disabled = true;
    completeButton.textContent = 'Challenge completed';
  }
  if (challengeNode) challengeNode.textContent = 'Challenge complete!';
  if (detailNode) detailNode.textContent = `Excellent work, Chef. You earned the “${badgeName}” badge on ${rawRecipe.name}.`;
}

function openRecipe(recipe) {
  selectedRecipe = recipe;
  closeSubstitution();
  document.querySelector('#modal-photo').src = recipe.image;
  document.querySelector('#modal-meta').textContent = `${recipe.area || 'World'} · ${recipe.category || 'Recipe'}`;
  document.querySelector('#modal-title').textContent = recipe.name;
  document.querySelector('#modal-match').textContent = `${recipe.score}% match`;
  document.querySelector('#modal-missing').textContent = recipe.missing.length ? `${recipe.missing.length} ingredients missing` : 'You have everything listed';
  document.querySelector('#modal-ingredients').innerHTML = recipe.ingredients.map(item => {
    const ready = recipe.matched.some(match => match.key === item.key);
    return `<li class="${ready ? 'ready' : ''}"><span>${ready ? '✓' : '×'}</span><div class="ingredient-copy">${escapeHtml(item.name)}<small>${escapeHtml(item.measure || 'As needed')}</small>${ready ? '' : `<button class="substitute-button" type="button" data-ingredient="${escapeHtml(item.key)}">Suggest substitute</button>`}</div></li>`;
  }).join('');
  const steps = splitInstructions(recipe.instructions);
  document.querySelector('#modal-instructions').innerHTML = steps.map((step, index) =>
    `<div class="instruction-row"><p class="instruction-copy"><span class="step-number">${index + 1}</span>${escapeHtml(step.replace(/^step\s*\d+\s*/i, ''))}</p></div>`
  ).join('');
  document.querySelector('#modal-source').href = recipe.source || recipe.mealDbUrl;
  showMysteryBadge(recipe);
  updateChallengeButton(recipe);
  const cookedButton = document.querySelector('#modal-cooked');
  const cooked = hasCooked(recipe.id);
  cookedButton.textContent = cooked ? 'Remove cooked mark' : 'Mark as cooked';
  cookedButton.classList.toggle('is-cooked', cooked);
  cookedButton.setAttribute('aria-pressed', cooked ? 'true' : 'false');
  renderCookedPlate(recipe);
  document.querySelector('#modal-save').textContent = favourites.includes(recipe.id) ? 'Remove from saved' : 'Save this recipe';
  elements.backdrop.hidden = false; document.body.style.overflow = 'hidden';
}

function closeRecipe() { elements.backdrop.hidden = true; document.body.style.overflow = ''; selectedRecipe = null; }
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }

function closeSubstitution() {
  const panel = document.querySelector('#ai-substitution-panel');
  if (!panel) return;
  panel.hidden = true;
  document.querySelector('#ai-substitution-result').innerHTML = '';
}

function renderSubstitution(data) {
  const result = document.querySelector('#ai-substitution-result');
  result.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = data.substitute;
  result.append(title);
  [
    ['Quantity', data.quantity],
    ['How to use it', data.instructions],
    ['Suitability', data.suitability],
    ['Important', data.warning]
  ].forEach(([label, value]) => {
    const paragraph = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(value));
    result.append(paragraph);
  });
}

async function requestSubstitution(ingredientKey, button) {
  if (!currentUser) {
    openAuthModal('login', 'Log in to request AI ingredient substitutions.');
    return;
  }
  const ingredient = selectedRecipe?.ingredients.find(item => item.key === ingredientKey);
  if (!ingredient || !selectedRecipe) return;
  const panel = document.querySelector('#ai-substitution-panel');
  const result = document.querySelector('#ai-substitution-result');
  panel.hidden = false;
  result.innerHTML = '<p class="ai-loading">Finding a suitable substitute…</p>';
  button.disabled = true;
  button.textContent = 'Thinking…';
  try {
    const { data, error } = await supabaseClient.functions.invoke('suggest-substitution', {
      body: {
        recipeName: selectedRecipe.name,
        missingIngredient: ingredient.name,
        measure: ingredient.measure || 'As needed',
        recipeIngredients: selectedRecipe.ingredients.map(item => item.name).slice(0, 30),
        dietaryPreferences: [],
        allergens: []
      }
    });
    if (error) throw error;
    if (!data?.substitute || !data?.quantity || !data?.instructions || !data?.suitability || !data?.warning) {
      throw new Error('The substitution response was incomplete.');
    }
    renderSubstitution(data);
  } catch (error) {
    console.error('Could not generate a substitution:', error);
    result.innerHTML = '<p class="ai-error">A substitution could not be generated right now. Please try again shortly.</p>';
  } finally {
    button.disabled = false;
    button.textContent = 'Suggest substitute';
  }
}

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
  if (elements.passport) elements.passport.hidden = !currentUser;
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
  if (currentUser) {
    await migrateLocalFavourites();
    const guestMystery = localStorage.getItem('plated-mystery-guest');
    if (guestMystery && !localStorage.getItem(mysteryStorageKey())) {
      localStorage.setItem(mysteryStorageKey(), guestMystery);
      localStorage.removeItem('plated-mystery-guest');
    }
  }
  await loadSavedRecipes();
  updateAccountUI();
  renderMysteryUI();
  await displayCommunityRecipes();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      if (currentUser) await migrateLocalFavourites();
      await loadSavedRecipes();
      updateAccountUI();
      renderMysteryUI();
      await displayCommunityRecipes();
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
document.querySelectorAll('.review-option').forEach(button => {
  button.addEventListener('click', () => chooseReview(button.dataset.review));
});
document.querySelector('#review-save-yes')?.addEventListener('click', () => handleReviewSaveChoice(true));
document.querySelector('#review-save-no')?.addEventListener('click', () => handleReviewSaveChoice(false));
document.querySelector('#mystery-button')?.addEventListener('click', revealMysteryChallenge);
document.querySelector('#mystery-complete')?.addEventListener('click', completeMysteryChallenge);
document.querySelector('#mystery-go-recipe')?.addEventListener('click', goToMysteryRecipe);
document.querySelector('#modal-challenge')?.addEventListener('click', () => { if (selectedRecipe) selectChallengeRecipe(selectedRecipe); });
document.querySelector('#close-modal').addEventListener('click', closeRecipe);
elements.backdrop.addEventListener('click', event => { if (event.target === elements.backdrop) closeRecipe(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !elements.backdrop.hidden) closeRecipe(); });
document.querySelector('#modal-save').addEventListener('click', async () => {
  if (selectedRecipe && await toggleFavourite(selectedRecipe.id)) {
    document.querySelector('#modal-save').textContent = favourites.includes(selectedRecipe.id) ? 'Remove from saved' : 'Save this recipe';
  }
});
document.querySelector('#modal-ingredients').addEventListener('click', event => {
  const button = event.target.closest('.substitute-button');
  if (button) requestSubstitution(button.dataset.ingredient, button);
});
document.querySelector('#close-substitution').addEventListener('click', closeSubstitution);
document.querySelector('#modal-cooked').addEventListener('click', () => { if (selectedRecipe) toggleRecipeCooked(selectedRecipe); });
if (elements.passport) elements.passport.addEventListener('click', openPassport);
document.querySelector('#close-passport').addEventListener('click', closePassport);
document.querySelector('#passport-backdrop').addEventListener('click', event => { if (event.target === document.querySelector('#passport-backdrop')) closePassport(); });
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
renderMysteryUI();
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
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Recipe images must be smaller than 5 MB.');

    const fileExtension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `${currentUser.id}/${Date.now()}.${fileExtension}`;

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
        event.preventDefault();
        if (!currentUser) {
            openAuthModal('login', 'Log in to share a recipe with the Plated community.');
            return;
        }

        const recipeName = document.querySelector('#recipe-name').value.trim();
        const recipeImageFile = recipeImageInput.files[0];
        const cookingTime = document.querySelector('#cooking-time').value;
        const cuisine = document.querySelector('#recipe-cuisine').value;
        const mealType = document.querySelector('#meal-type').value;
        const instructions = document.querySelector('#recipe-instructions').value.trim();
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        const ingredients = [];
        ingredientRows.forEach((row) => {
            const name = row.querySelector('.ingredient-name').value.trim();
            const quantity = row.querySelector('.ingredient-quantity').value.trim();
            if (name && quantity) {
                ingredients.push({ name, quantity });
            }
        });

        if (ingredients.length === 0) {
            alert('Please add at least one ingredient.');
            return;
        }

        const submitButton = addRecipeForm.querySelector('[type="submit"]');
        const wasEditing = Boolean(editingRecipeId);
        submitButton.disabled = true;
        submitButton.textContent = wasEditing ? 'Updating recipe…' : 'Adding recipe…';

        try {
            const recipeImage = await uploadRecipeImage(recipeImageFile);
            const publisher = currentUser.user_metadata?.first_name ||
                currentUser.user_metadata?.full_name ||
                currentUser.email?.split('@')[0] ||
                'Plated cook';
            const recipeValues = {
                recipe_name: recipeName,
                ingredients,
                cooking_time: cookingTime,
                cuisine,
                meal_type: mealType,
                instructions,
                publisher_name: publisher
            };

            if (recipeImage) recipeValues.image_url = recipeImage;

            const query = wasEditing
                ? supabaseClient.from('user_recipes').update(recipeValues).eq('id', editingRecipeId).eq('user_id', currentUser.id)
                : supabaseClient.from('user_recipes').insert({ ...recipeValues, user_id: currentUser.id });
            const { error } = await query;

            if (error) throw error;

            editingRecipeId = null;
            alert(`"${recipeName}" has been ${wasEditing ? 'updated' : 'added'} successfully!`);
            addRecipeForm.reset();
            document.querySelectorAll('.ingredient-row').forEach((row, index) => {
                if (index > 0) row.remove();
            });
            await loadDatabase();
            await displayCommunityRecipes();
        } catch (error) {
            console.error('Recipe save error:', error);
            alert(error.message || 'Could not save the recipe. Please try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Add recipe';
        };
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

    const { data, error } = await supabaseClient
        .from('user_recipes')
        .select('*')
        .order('created_at', { ascending: false });

    recipesGrid.innerHTML = '';

    if (error) {
        console.warn('Could not load community recipes:', error.message);
        recipesGrid.innerHTML = '<p class="community-empty">Community recipes will appear after the Supabase setup is completed.</p>';
        return;
    }

    communityRecipesCache = (data || []).map(recipe => ({
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

    if (communityRecipesCache.length === 0) {
        recipesGrid.innerHTML = `
            <p class="community-empty">
                No community recipes yet. Be the first to share one!
            </p>
        `;
        return;
    }

    communityRecipesCache.forEach((recipe) => {
        const card = document.createElement('article');
        card.className = 'community-recipe-card';
        const isOwner = currentUser && String(recipe.user_id) === String(currentUser.id);
        const isSaved = favourites.includes(String(recipe.id));
        card.innerHTML = `
            ${recipe.image ? `<img src="${escapeHtml(recipe.image)}" class="community-recipe-image" alt="${escapeHtml(recipe.name)}">` : ''}
            <h3>${escapeHtml(recipe.name)}</h3>
            <div class="community-recipe-meta">
                <span>${escapeHtml(recipe.cuisine || 'Other')}</span>
                <span>${escapeHtml(recipe.mealType || 'Recipe')}</span>
                <span>${escapeHtml(recipe.cookingTime || '')}</span>
            </div>
            <p>${(recipe.ingredients || []).length} ingredients${recipe.publisher ? ` · Published by ${escapeHtml(recipe.publisher)}` : ''}</p>
            <button type="button" class="view-recipe-button" data-recipe-id="${recipe.id}">View recipe</button>
            <button type="button" class="save-community-recipe-button" data-recipe-id="${recipe.id}">${isSaved ? 'Saved ✓' : 'Save recipe'}</button>
            ${isOwner ? `<div class="community-recipe-actions"><button type="button" class="edit-recipe-button" data-recipe-id="${recipe.id}">Edit</button><button type="button" class="delete-recipe-button" data-recipe-id="${recipe.id}">Delete</button></div>` : ''}
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
        <span>${escapeHtml(recipe.cuisine || 'Other')}</span>
        <span>${escapeHtml(recipe.mealType || 'Recipe')}</span>
        <span>${escapeHtml(recipe.cookingTime || '')}</span>
    `;

    communityRecipeIngredients.innerHTML = '';

    recipe.ingredients.forEach((ingredient) => {

        const ingredientElement = document.createElement('div');

        ingredientElement.className = 'community-recipe-ingredient';

        ingredientElement.innerHTML = `
            <span>${escapeHtml(ingredient.name)}</span>
            <span>${escapeHtml(ingredient.quantity)}</span>
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

    const recipe = communityRecipesCache.find(item => String(item.id) === String(recipeId));

    if (recipe) {
        openCommunityRecipe(recipe);
    }

});
// Handle Delete Recipe buttons
document.addEventListener('click', async (event) => {

    const button = event.target.closest('.delete-recipe-button');

    if (!button) return;
    if (!currentUser) {
        openAuthModal('login', 'Log in to manage your community recipes.');
        return;
    }

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

    await loadDatabase();
    await displayCommunityRecipes();

    alert(`"${recipeName}" has been deleted successfully!`);
});
// ==============================
// EDIT COMMUNITY RECIPE
// ==============================

document.addEventListener('click', async (event) => {

    const editButton = event.target.closest('.edit-recipe-button');

    if (!editButton) return;
    if (!currentUser) {
        openAuthModal('login', 'Log in to manage your community recipes.');
        return;
    }

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
    document.querySelector('#meal-type').value = recipe.meal_type;

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

document.addEventListener('click', async (event) => {

    const button = event.target.closest('.save-community-recipe-button');

    if (!button) return;

    const recipeId = button.dataset.recipeId;

    if (!currentUser) {
        openAuthModal('login', 'Log in to save community recipes.');
        return;
    }

    if (await toggleFavourite(recipeId)) {
        button.textContent = favourites.includes(recipeId) ? 'Saved ✓' : 'Save recipe';
    }
});
