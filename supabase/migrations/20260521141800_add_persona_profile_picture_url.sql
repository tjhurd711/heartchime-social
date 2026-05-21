alter table ai_ugc_personas
  add column if not exists profile_picture_url text;

update ai_ugc_personas
set profile_picture_url = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/ai-ugc-personas/Camille-profile.jpg'
where name = 'Camille Beaumont';

update ai_ugc_personas
set profile_picture_url = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/ai-ugc-personas/Mike-profile.jpg'
where name = 'Mike';

update ai_ugc_personas
set profile_picture_url = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/ai-ugc-personas/Eleanor-profile.jpg'
where name = 'Eleanor Louverette';
