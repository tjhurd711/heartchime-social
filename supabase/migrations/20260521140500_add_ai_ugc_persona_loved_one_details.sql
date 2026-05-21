alter table ai_ugc_personas
  add column if not exists ethnicity text;

alter table ai_ugc_loved_ones
  add column if not exists gender text,
  add column if not exists ethnicity text,
  add column if not exists cause_of_death text,
  add column if not exists occupation text,
  add column if not exists personality text,
  add column if not exists roles text[],
  add column if not exists hometown text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_ugc_personas_ethnicity_check'
  ) then
    alter table ai_ugc_personas
      add constraint ai_ugc_personas_ethnicity_check
      check (
        ethnicity is null
        or ethnicity in ('white', 'black', 'hispanic', 'asian', 'middle_eastern', 'mixed')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_ugc_loved_ones_gender_check'
  ) then
    alter table ai_ugc_loved_ones
      add constraint ai_ugc_loved_ones_gender_check
      check (gender is null or gender in ('male', 'female'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_ugc_loved_ones_ethnicity_check'
  ) then
    alter table ai_ugc_loved_ones
      add constraint ai_ugc_loved_ones_ethnicity_check
      check (
        ethnicity is null
        or ethnicity in ('white', 'black', 'hispanic', 'asian', 'middle_eastern', 'mixed')
      );
  end if;
end $$;

update ai_ugc_personas
set ethnicity = 'white'
where name in ('Camille Beaumont', 'Mike', 'Eleanor Louverette');

update ai_ugc_loved_ones
set
  gender = 'male',
  ethnicity = 'white',
  cause_of_death = 'heart attack',
  occupation = 'high school history teacher',
  personality = 'music lover, weekend hiker, terrible dad jokes that always landed, road-trip dad',
  roles = array['father', 'husband'],
  hometown = null
where name = 'David'
  and relationship in ('father', 'dad');

update ai_ugc_loved_ones
set
  gender = 'male',
  ethnicity = 'white',
  cause_of_death = 'cancer',
  occupation = 'retired auto mechanic',
  personality = 'garage tinkerer, weekend golfer, lifelong Eagles fan, Saturday morning fishing',
  roles = array['father', 'grandfather', 'husband'],
  hometown = null
where name = 'Robert'
  and relationship in ('father', 'dad');

update ai_ugc_loved_ones
set
  gender = 'female',
  ethnicity = 'white',
  cause_of_death = 'stroke',
  occupation = 'retired elementary school librarian',
  personality = 'kitchen always smelled like baking, holidays were her Olympics, kept recipe cards in a shoebox',
  roles = array['mother', 'grandmother', 'wife'],
  hometown = null
where name = 'Carol'
  and relationship in ('mother', 'mom');
