-- Run this once in Supabase Dashboard > SQL Editor.
-- It stores only recipe IDs. The complete recipe information remains in recipes.json.

create table if not exists public.saved_recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table public.saved_recipes enable row level security;

drop policy if exists "Users can view their own saved recipes" on public.saved_recipes;
create policy "Users can view their own saved recipes"
on public.saved_recipes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can save their own recipes" on public.saved_recipes;
create policy "Users can save their own recipes"
on public.saved_recipes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own saved recipes" on public.saved_recipes;
create policy "Users can remove their own saved recipes"
on public.saved_recipes for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, delete on public.saved_recipes to authenticated;

-- =========================
-- DIETARY AND ALLERGY PROFILES
-- =========================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_diet text not null default 'none'
    check (primary_diet in ('none', 'vegetarian', 'vegan', 'pescatarian')),
  dietary_requirements text[] not null default '{}',
  allergens text[] not null default '{}',
  excluded_ingredients text[] not null default '{}',
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can view their own preferences" on public.user_preferences;
create policy "Users can view their own preferences"
on public.user_preferences for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own preferences" on public.user_preferences;
create policy "Users can create their own preferences"
on public.user_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences"
on public.user_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.user_preferences to authenticated;


-- =========================
-- USER CREATED RECIPES
-- =========================

create table if not exists public.user_recipes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    recipe_name text not null,
    ingredients jsonb not null,
    cooking_time text not null,
    cuisine text not null,
    meal_type text not null,
    instructions text not null,
    image_url text,
    publisher_name text,
    created_at timestamptz not null default now()
);

-- Add newer optional fields when upgrading an existing table.
alter table public.user_recipes add column if not exists image_url text;
alter table public.user_recipes add column if not exists publisher_name text;

-- Enable Row Level Security
alter table public.user_recipes enable row level security;

-- Users can view recipes
drop policy if exists "Users can view user recipes" on public.user_recipes;

create policy "Users can view user recipes"
on public.user_recipes
for select
to anon, authenticated
using (true);

-- Users can add their own recipes
drop policy if exists "Users can add their own recipes" on public.user_recipes;

create policy "Users can add their own recipes"
on public.user_recipes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Users can delete their own recipes
drop policy if exists "Users can delete their own recipes" on public.user_recipes;

create policy "Users can delete their own recipes"
on public.user_recipes
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Users can edit only recipes they created.
drop policy if exists "Users can update their own recipes" on public.user_recipes;

create policy "Users can update their own recipes"
on public.user_recipes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.user_recipes to anon;
grant select, insert, update, delete on public.user_recipes to authenticated;

-- Public recipe photos. Uploads are restricted to each signed-in user's folder.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view recipe images" on storage.objects;
create policy "Public can view recipe images"
on storage.objects for select
to public
using (bucket_id = 'recipe-images');

drop policy if exists "Users can upload recipe images" on storage.objects;
create policy "Users can upload recipe images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
