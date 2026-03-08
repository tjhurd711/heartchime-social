export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_ugc_assets: {
        Row: {
          asset_type: string
          context: string | null
          created_at: string | null
          era: string | null
          id: string
          is_favorite: boolean | null
          loved_one_id: string | null
          persona_id: string | null
          prompt_used: string | null
          s3_url: string
          tags: string[] | null
          thumbnail_url: string | null
        }
        Insert: {
          asset_type: string
          context?: string | null
          created_at?: string | null
          era?: string | null
          id?: string
          is_favorite?: boolean | null
          loved_one_id?: string | null
          persona_id?: string | null
          prompt_used?: string | null
          s3_url: string
          tags?: string[] | null
          thumbnail_url?: string | null
        }
        Update: {
          asset_type?: string
          context?: string | null
          created_at?: string | null
          era?: string | null
          id?: string
          is_favorite?: boolean | null
          loved_one_id?: string | null
          persona_id?: string | null
          prompt_used?: string | null
          s3_url?: string
          tags?: string[] | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_ugc_assets_loved_one_id_fkey"
            columns: ["loved_one_id"]
            isOneToOne: false
            referencedRelation: "ai_ugc_loved_ones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_ugc_assets_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "ai_ugc_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_ugc_loved_ones: {
        Row: {
          age_at_death: number
          birth_year: number
          created_at: string | null
          death_year: number
          gender: string | null
          id: string
          keywords: string[] | null
          master_photo_url: string
          name: string
          persona_id: string | null
          personality_traits: string[] | null
          relationship: string
          updated_at: string | null
        }
        Insert: {
          age_at_death: number
          birth_year: number
          created_at?: string | null
          death_year: number
          gender?: string | null
          id?: string
          keywords?: string[] | null
          master_photo_url: string
          name: string
          persona_id?: string | null
          personality_traits?: string[] | null
          relationship: string
          updated_at?: string | null
        }
        Update: {
          age_at_death?: number
          birth_year?: number
          created_at?: string | null
          death_year?: number
          gender?: string | null
          id?: string
          keywords?: string[] | null
          master_photo_url?: string
          name?: string
          persona_id?: string | null
          personality_traits?: string[] | null
          relationship?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_ugc_loved_ones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "ai_ugc_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_ugc_personas: {
        Row: {
          age: number
          birth_year: number
          created_at: string | null
          elevenlabs_voice_id: string | null
          ethnicity: string | null
          gender: string | null
          id: string
          instagram_handle: string | null
          job: string | null
          location: string | null
          master_photo_url: string
          name: string
          tiktok_handle: string | null
          updated_at: string | null
          vibe: string | null
        }
        Insert: {
          age: number
          birth_year: number
          created_at?: string | null
          elevenlabs_voice_id?: string | null
          ethnicity?: string | null
          gender?: string | null
          id?: string
          instagram_handle?: string | null
          job?: string | null
          location?: string | null
          master_photo_url: string
          name: string
          tiktok_handle?: string | null
          updated_at?: string | null
          vibe?: string | null
        }
        Update: {
          age?: number
          birth_year?: number
          created_at?: string | null
          elevenlabs_voice_id?: string | null
          ethnicity?: string | null
          gender?: string | null
          id?: string
          instagram_handle?: string | null
          job?: string | null
          location?: string | null
          master_photo_url?: string
          name?: string
          tiktok_handle?: string | null
          updated_at?: string | null
          vibe?: string | null
        }
        Relationships: []
      }
      ai_ugc_posts: {
        Row: {
          caption: string | null
          card_message: string | null
          created_at: string | null
          hook_text: string | null
          id: string
          notes: string | null
          persona_id: string | null
          platform: string | null
          post_type: string | null
          post_url: string | null
          posted_at: string | null
          scheduled_for: string | null
          slides: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          caption?: string | null
          card_message?: string | null
          created_at?: string | null
          hook_text?: string | null
          id?: string
          notes?: string | null
          persona_id?: string | null
          platform?: string | null
          post_type?: string | null
          post_url?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          slides?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          caption?: string | null
          card_message?: string | null
          created_at?: string | null
          hook_text?: string | null
          id?: string
          notes?: string | null
          persona_id?: string | null
          platform?: string | null
          post_type?: string | null
          post_url?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          slides?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_ugc_posts_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "ai_ugc_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          batch_id: string | null
          created_at: string | null
          deceased_id: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          emails: string[] | null
          generated_email: string | null
          id: string
          location: string | null
          name: string | null
          outreach_date: string | null
          relationship: string | null
          response: string | null
          subject: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          deceased_id?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          emails?: string[] | null
          generated_email?: string | null
          id?: string
          location?: string | null
          name?: string | null
          outreach_date?: string | null
          relationship?: string | null
          response?: string | null
          subject?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          deceased_id?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          emails?: string[] | null
          generated_email?: string | null
          id?: string
          location?: string | null
          name?: string | null
          outreach_date?: string | null
          relationship?: string | null
          response?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_deceased_id_fkey"
            columns: ["deceased_id"]
            isOneToOne: false
            referencedRelation: "deceased"
            referencedColumns: ["id"]
          },
        ]
      }
      deceased: {
        Row: {
          age: number | null
          birth_date: string | null
          charity: string | null
          church_org: string | null
          city: string | null
          created_at: string | null
          death_date: string | null
          flag_no_family: boolean | null
          flag_tragic: boolean | null
          flag_under_40: boolean | null
          gender: string | null
          hobbies: string[] | null
          id: string
          military: string | null
          name: string | null
          obituary_text: string | null
          occupation: string | null
          personalization_fragment: string | null
          personalization_sentence: string | null
          personalization_source: string | null
          state: string | null
        }
        Insert: {
          age?: number | null
          birth_date?: string | null
          charity?: string | null
          church_org?: string | null
          city?: string | null
          created_at?: string | null
          death_date?: string | null
          flag_no_family?: boolean | null
          flag_tragic?: boolean | null
          flag_under_40?: boolean | null
          gender?: string | null
          hobbies?: string[] | null
          id?: string
          military?: string | null
          name?: string | null
          obituary_text?: string | null
          occupation?: string | null
          personalization_fragment?: string | null
          personalization_sentence?: string | null
          personalization_source?: string | null
          state?: string | null
        }
        Update: {
          age?: number | null
          birth_date?: string | null
          charity?: string | null
          church_org?: string | null
          city?: string | null
          created_at?: string | null
          death_date?: string | null
          flag_no_family?: boolean | null
          flag_tragic?: boolean | null
          flag_under_40?: boolean | null
          gender?: string | null
          hobbies?: string[] | null
          id?: string
          military?: string | null
          name?: string | null
          obituary_text?: string | null
          occupation?: string | null
          personalization_fragment?: string | null
          personalization_sentence?: string | null
          personalization_source?: string | null
          state?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string | null
          heartbeat_user_id: string | null
          id: string
          platform: string | null
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          heartbeat_user_id?: string | null
          id?: string
          platform?: string | null
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          heartbeat_user_id?: string | null
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      echoes: {
        Row: {
          content: string
          created_at: string | null
          heartbeat_profile_id: string | null
          heartbeat_user_id: string | null
          id: string
          summary: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          summary?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_shares: {
        Row: {
          created_at: string | null
          gem_id: string | null
          heartbeat_id: string | null
          id: string
          profile_id: string | null
          share_channel: string | null
          share_token: string | null
          shared_by_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          gem_id?: string | null
          heartbeat_id?: string | null
          id?: string
          profile_id?: string | null
          share_channel?: string | null
          share_token?: string | null
          shared_by_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          gem_id?: string | null
          heartbeat_id?: string | null
          id?: string
          profile_id?: string | null
          share_channel?: string | null
          share_token?: string | null
          shared_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_shares_gem_id_fkey"
            columns: ["gem_id"]
            isOneToOne: false
            referencedRelation: "gem_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_shares_heartbeat_id_fkey"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "heartbeats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_shares_shared_by_user_id_fkey"
            columns: ["shared_by_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      gem_deliveries: {
        Row: {
          added_to_page: boolean | null
          context_line: string | null
          created_at: string | null
          dismissed: boolean | null
          feedback: string | null
          gem_id: string | null
          heartbeat_user_id: string | null
          id: string
          profile_id: string | null
          reaction: string | null
          scheduled_for: string | null
          seen_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          added_to_page?: boolean | null
          context_line?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          feedback?: string | null
          gem_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          profile_id?: string | null
          reaction?: string | null
          scheduled_for?: string | null
          seen_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          added_to_page?: boolean | null
          context_line?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          feedback?: string | null
          gem_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          profile_id?: string | null
          reaction?: string | null
          scheduled_for?: string | null
          seen_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gem_deliveries_gem_id_fkey"
            columns: ["gem_id"]
            isOneToOne: false
            referencedRelation: "gem_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gem_deliveries_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gem_deliveries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gem_library: {
        Row: {
          approved_at: string | null
          context_template: string | null
          created_at: string | null
          creator_handle: string | null
          description: string | null
          id: string
          interest_tags: Json | null
          original_available: boolean | null
          original_url: string | null
          platform: string | null
          quality_score: number | null
          s3_url: string | null
          seasonal: string | null
          status: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          context_template?: string | null
          created_at?: string | null
          creator_handle?: string | null
          description?: string | null
          id?: string
          interest_tags?: Json | null
          original_available?: boolean | null
          original_url?: string | null
          platform?: string | null
          quality_score?: number | null
          s3_url?: string | null
          seasonal?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          context_template?: string | null
          created_at?: string | null
          creator_handle?: string | null
          description?: string | null
          id?: string
          interest_tags?: Json | null
          original_available?: boolean | null
          original_url?: string | null
          platform?: string | null
          quality_score?: number | null
          s3_url?: string | null
          seasonal?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      heartbeat_feedback: {
        Row: {
          created_at: string | null
          feedback_reason: string | null
          feedback_type: string
          heartbeat_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_reason?: string | null
          feedback_type: string
          heartbeat_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_reason?: string | null
          feedback_type?: string
          heartbeat_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heartbeat_feedback_heartbeat_id_fkey"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "heartbeats"
            referencedColumns: ["id"]
          },
        ]
      }
      heartbeat_profiles: {
        Row: {
          activation_notified_at: string | null
          amount_paid: number | null
          birth_date: string | null
          brother_names: string[] | null
          brothers_count: number | null
          children_count: number | null
          created_at: string | null
          customer_email: string | null
          famous_person_1: Json | null
          famous_person_2: Json | null
          famous_person_3: Json | null
          famous_person_4: Json | null
          famous_person_5: Json | null
          favorite_golf_course: string | null
          first_name: string | null
          gender: string | null
          grandchildren_count: number | null
          had_living_parents: boolean | null
          heartbeat_code: string | null
          id: string
          interests: Json | null
          is_golfer: boolean | null
          is_veteran: boolean | null
          key_dates: Json | null
          loved_one_name: string | null
          onboarding_completed: boolean | null
          parents_count: number | null
          passing_date: string | null
          peculiar_analyzed_at: string | null
          peculiar_keywords: Json | null
          personality_traits: Json | null
          photo_count: number | null
          purchased_at: string | null
          resting_place_id: string | null
          resting_place_location: string | null
          resting_place_type: string | null
          sibling_names: Json | null
          sister_names: string[] | null
          sisters_count: number | null
          spouse_living: boolean | null
          spouse_name: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          university_graduated: boolean | null
          university_name: string | null
          updated_at: string | null
          veteran_branch: string | null
          was_grandparent: boolean | null
          was_married: boolean | null
          was_parent: boolean | null
          wedding_anniversary: string | null
          wedding_city: string | null
        }
        Insert: {
          activation_notified_at?: string | null
          amount_paid?: number | null
          birth_date?: string | null
          brother_names?: string[] | null
          brothers_count?: number | null
          children_count?: number | null
          created_at?: string | null
          customer_email?: string | null
          famous_person_1?: Json | null
          famous_person_2?: Json | null
          famous_person_3?: Json | null
          famous_person_4?: Json | null
          famous_person_5?: Json | null
          favorite_golf_course?: string | null
          first_name?: string | null
          gender?: string | null
          grandchildren_count?: number | null
          had_living_parents?: boolean | null
          heartbeat_code?: string | null
          id?: string
          interests?: Json | null
          is_golfer?: boolean | null
          is_veteran?: boolean | null
          key_dates?: Json | null
          loved_one_name?: string | null
          onboarding_completed?: boolean | null
          parents_count?: number | null
          passing_date?: string | null
          peculiar_analyzed_at?: string | null
          peculiar_keywords?: Json | null
          personality_traits?: Json | null
          photo_count?: number | null
          purchased_at?: string | null
          resting_place_id?: string | null
          resting_place_location?: string | null
          resting_place_type?: string | null
          sibling_names?: Json | null
          sister_names?: string[] | null
          sisters_count?: number | null
          spouse_living?: boolean | null
          spouse_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          university_graduated?: boolean | null
          university_name?: string | null
          updated_at?: string | null
          veteran_branch?: string | null
          was_grandparent?: boolean | null
          was_married?: boolean | null
          was_parent?: boolean | null
          wedding_anniversary?: string | null
          wedding_city?: string | null
        }
        Update: {
          activation_notified_at?: string | null
          amount_paid?: number | null
          birth_date?: string | null
          brother_names?: string[] | null
          brothers_count?: number | null
          children_count?: number | null
          created_at?: string | null
          customer_email?: string | null
          famous_person_1?: Json | null
          famous_person_2?: Json | null
          famous_person_3?: Json | null
          famous_person_4?: Json | null
          famous_person_5?: Json | null
          favorite_golf_course?: string | null
          first_name?: string | null
          gender?: string | null
          grandchildren_count?: number | null
          had_living_parents?: boolean | null
          heartbeat_code?: string | null
          id?: string
          interests?: Json | null
          is_golfer?: boolean | null
          is_veteran?: boolean | null
          key_dates?: Json | null
          loved_one_name?: string | null
          onboarding_completed?: boolean | null
          parents_count?: number | null
          passing_date?: string | null
          peculiar_analyzed_at?: string | null
          peculiar_keywords?: Json | null
          personality_traits?: Json | null
          photo_count?: number | null
          purchased_at?: string | null
          resting_place_id?: string | null
          resting_place_location?: string | null
          resting_place_type?: string | null
          sibling_names?: Json | null
          sister_names?: string[] | null
          sisters_count?: number | null
          spouse_living?: boolean | null
          spouse_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          university_graduated?: boolean | null
          university_name?: string | null
          updated_at?: string | null
          veteran_branch?: string | null
          was_grandparent?: boolean | null
          was_married?: boolean | null
          was_parent?: boolean | null
          wedding_anniversary?: string | null
          wedding_city?: string | null
        }
        Relationships: []
      }
      heartbeat_reactions: {
        Row: {
          created_at: string | null
          heartbeat_id: string | null
          id: string
          reaction_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          heartbeat_id?: string | null
          id?: string
          reaction_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          heartbeat_id?: string | null
          id?: string
          reaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heartbeat_reactions_heartbeat_id_fkey"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "heartbeats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heartbeat_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      heartbeat_users: {
        Row: {
          activities_together: Json | null
          advice_quotes: Json | null
          birthday: string | null
          bowling_league: boolean | null
          career_memory: Json | null
          childhood_pastime: Json | null
          city_memory: Json | null
          clubs: string[] | null
          connection_notified_at: string | null
          created_at: string | null
          famous_person_1: Json | null
          famous_person_2: Json | null
          famous_person_3: Json | null
          famous_person_4: Json | null
          famous_person_5: Json | null
          favorite_artist_1: Json | null
          favorite_artist_2: Json | null
          favorite_artist_3: Json | null
          favorite_car: Json | null
          favorite_food: Json | null
          favorite_golf_course: string | null
          favorite_holiday: string | null
          favorite_holiday_2: string | null
          favorite_holiday_2_memory: string | null
          favorite_holiday_memory: string | null
          favorite_memory: string | null
          favorite_movie_1: Json | null
          favorite_movie_2: Json | null
          favorite_movie_3: Json | null
          favorite_movie_4: Json | null
          favorite_movie_5: Json | null
          favorite_movie_6: Json | null
          favorite_pet: Json | null
          favorite_restaurant: Json | null
          favorite_song_1: Json | null
          favorite_song_2: Json | null
          favorite_song_3: Json | null
          favorite_song_4: Json | null
          favorite_song_5: Json | null
          favorite_song_6: Json | null
          first_heartbeat_ready: boolean | null
          first_name: string | null
          hobbies: Json | null
          home_address_memory: Json | null
          id: string
          interests: Json | null
          is_golfer: boolean | null
          key_dates: Json | null
          last_active_at: string | null
          last_name: string | null
          nickname_for_deceased: string | null
          notification_preferences: Json | null
          notification_time_weekday: string | null
          notification_time_weekend: string | null
          notifications_enabled: boolean | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          personality_traits: Json | null
          pet_photo_url: string | null
          profile_id: string
          relationship_to_deceased: string | null
          reminders: Json | null
          selfie_s3_url: string | null
          special_moments: Json | null
          sports_team_college_basketball: string | null
          sports_team_college_football: string | null
          sports_team_mlb: string | null
          sports_team_nba: string | null
          sports_team_nfl: string | null
          text_screenshot_urls: string[] | null
          three_words: string[] | null
          timezone: string | null
          updated_at: string | null
          user_email: string
          user_name: string | null
          weekday_times: Json | null
          weekend_times: Json | null
          what_they_meant_to_you: string | null
        }
        Insert: {
          activities_together?: Json | null
          advice_quotes?: Json | null
          birthday?: string | null
          bowling_league?: boolean | null
          career_memory?: Json | null
          childhood_pastime?: Json | null
          city_memory?: Json | null
          clubs?: string[] | null
          connection_notified_at?: string | null
          created_at?: string | null
          famous_person_1?: Json | null
          famous_person_2?: Json | null
          famous_person_3?: Json | null
          famous_person_4?: Json | null
          famous_person_5?: Json | null
          favorite_artist_1?: Json | null
          favorite_artist_2?: Json | null
          favorite_artist_3?: Json | null
          favorite_car?: Json | null
          favorite_food?: Json | null
          favorite_golf_course?: string | null
          favorite_holiday?: string | null
          favorite_holiday_2?: string | null
          favorite_holiday_2_memory?: string | null
          favorite_holiday_memory?: string | null
          favorite_memory?: string | null
          favorite_movie_1?: Json | null
          favorite_movie_2?: Json | null
          favorite_movie_3?: Json | null
          favorite_movie_4?: Json | null
          favorite_movie_5?: Json | null
          favorite_movie_6?: Json | null
          favorite_pet?: Json | null
          favorite_restaurant?: Json | null
          favorite_song_1?: Json | null
          favorite_song_2?: Json | null
          favorite_song_3?: Json | null
          favorite_song_4?: Json | null
          favorite_song_5?: Json | null
          favorite_song_6?: Json | null
          first_heartbeat_ready?: boolean | null
          first_name?: string | null
          hobbies?: Json | null
          home_address_memory?: Json | null
          id?: string
          interests?: Json | null
          is_golfer?: boolean | null
          key_dates?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          nickname_for_deceased?: string | null
          notification_preferences?: Json | null
          notification_time_weekday?: string | null
          notification_time_weekend?: string | null
          notifications_enabled?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          personality_traits?: Json | null
          pet_photo_url?: string | null
          profile_id: string
          relationship_to_deceased?: string | null
          reminders?: Json | null
          selfie_s3_url?: string | null
          special_moments?: Json | null
          sports_team_college_basketball?: string | null
          sports_team_college_football?: string | null
          sports_team_mlb?: string | null
          sports_team_nba?: string | null
          sports_team_nfl?: string | null
          text_screenshot_urls?: string[] | null
          three_words?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          user_email: string
          user_name?: string | null
          weekday_times?: Json | null
          weekend_times?: Json | null
          what_they_meant_to_you?: string | null
        }
        Update: {
          activities_together?: Json | null
          advice_quotes?: Json | null
          birthday?: string | null
          bowling_league?: boolean | null
          career_memory?: Json | null
          childhood_pastime?: Json | null
          city_memory?: Json | null
          clubs?: string[] | null
          connection_notified_at?: string | null
          created_at?: string | null
          famous_person_1?: Json | null
          famous_person_2?: Json | null
          famous_person_3?: Json | null
          famous_person_4?: Json | null
          famous_person_5?: Json | null
          favorite_artist_1?: Json | null
          favorite_artist_2?: Json | null
          favorite_artist_3?: Json | null
          favorite_car?: Json | null
          favorite_food?: Json | null
          favorite_golf_course?: string | null
          favorite_holiday?: string | null
          favorite_holiday_2?: string | null
          favorite_holiday_2_memory?: string | null
          favorite_holiday_memory?: string | null
          favorite_memory?: string | null
          favorite_movie_1?: Json | null
          favorite_movie_2?: Json | null
          favorite_movie_3?: Json | null
          favorite_movie_4?: Json | null
          favorite_movie_5?: Json | null
          favorite_movie_6?: Json | null
          favorite_pet?: Json | null
          favorite_restaurant?: Json | null
          favorite_song_1?: Json | null
          favorite_song_2?: Json | null
          favorite_song_3?: Json | null
          favorite_song_4?: Json | null
          favorite_song_5?: Json | null
          favorite_song_6?: Json | null
          first_heartbeat_ready?: boolean | null
          first_name?: string | null
          hobbies?: Json | null
          home_address_memory?: Json | null
          id?: string
          interests?: Json | null
          is_golfer?: boolean | null
          key_dates?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          nickname_for_deceased?: string | null
          notification_preferences?: Json | null
          notification_time_weekday?: string | null
          notification_time_weekend?: string | null
          notifications_enabled?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          personality_traits?: Json | null
          pet_photo_url?: string | null
          profile_id?: string
          relationship_to_deceased?: string | null
          reminders?: Json | null
          selfie_s3_url?: string | null
          special_moments?: Json | null
          sports_team_college_basketball?: string | null
          sports_team_college_football?: string | null
          sports_team_mlb?: string | null
          sports_team_nba?: string | null
          sports_team_nfl?: string | null
          text_screenshot_urls?: string[] | null
          three_words?: string[] | null
          timezone?: string | null
          updated_at?: string | null
          user_email?: string
          user_name?: string | null
          weekday_times?: Json | null
          weekend_times?: Json | null
          what_they_meant_to_you?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heartbeat_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      heartbeats: {
        Row: {
          audio_url: string | null
          category: string | null
          cover_image_url: string | null
          created_at: string | null
          delivered_at: string | null
          has_pulse: boolean | null
          heartbeat_profile_id: string | null
          heartbeat_user_id: string | null
          id: string
          is_delivered: boolean | null
          is_hidden: boolean | null
          is_interchangeable: boolean | null
          is_kept: boolean | null
          kept_at: string | null
          manually_reviewed: boolean | null
          message: string | null
          message_type: string | null
          photo_id: string | null
          pulse_question: string | null
          scheduled_for: string | null
          share_token: string | null
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          delivered_at?: string | null
          has_pulse?: boolean | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          is_delivered?: boolean | null
          is_hidden?: boolean | null
          is_interchangeable?: boolean | null
          is_kept?: boolean | null
          kept_at?: string | null
          manually_reviewed?: boolean | null
          message?: string | null
          message_type?: string | null
          photo_id?: string | null
          pulse_question?: string | null
          scheduled_for?: string | null
          share_token?: string | null
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          delivered_at?: string | null
          has_pulse?: boolean | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          is_delivered?: boolean | null
          is_hidden?: boolean | null
          is_interchangeable?: boolean | null
          is_kept?: boolean | null
          kept_at?: string | null
          manually_reviewed?: boolean | null
          message?: string | null
          message_type?: string | null
          photo_id?: string | null
          pulse_question?: string | null
          scheduled_for?: string | null
          share_token?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heartbeats_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heartbeats_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heartbeats_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      heartchime_bank: {
        Row: {
          category: string | null
          created_at: string | null
          draft_data: Json | null
          has_pulse: boolean | null
          heartbeat_profile_id: string | null
          heartbeat_user_id: string
          id: string
          message: string | null
          opportunity_data: Json | null
          opportunity_type: string | null
          original_heartbeat_id: string | null
          photo_id: string | null
          pulse_question: string | null
          saved_at: string | null
          scheduled_for: string | null
          source: string | null
          trashed_at: string | null
          used_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          draft_data?: Json | null
          has_pulse?: boolean | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id: string
          id?: string
          message?: string | null
          opportunity_data?: Json | null
          opportunity_type?: string | null
          original_heartbeat_id?: string | null
          photo_id?: string | null
          pulse_question?: string | null
          saved_at?: string | null
          scheduled_for?: string | null
          source?: string | null
          trashed_at?: string | null
          used_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          draft_data?: Json | null
          has_pulse?: boolean | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string
          id?: string
          message?: string | null
          opportunity_data?: Json | null
          opportunity_type?: string | null
          original_heartbeat_id?: string | null
          photo_id?: string | null
          pulse_question?: string | null
          saved_at?: string | null
          scheduled_for?: string | null
          source?: string | null
          trashed_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heartchime_bank_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heartchime_bank_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_history: {
        Row: {
          body: string
          content_id: string | null
          created_at: string
          device_token: string | null
          error_message: string | null
          fcm_response: Json | null
          heartbeat_user_id: string | null
          id: string
          last_retry_at: string | null
          notification_type: string
          opened_at: string | null
          platform: string | null
          retry_count: number | null
          sent_at: string
          status: string
          title: string
        }
        Insert: {
          body: string
          content_id?: string | null
          created_at?: string
          device_token?: string | null
          error_message?: string | null
          fcm_response?: Json | null
          heartbeat_user_id?: string | null
          id?: string
          last_retry_at?: string | null
          notification_type: string
          opened_at?: string | null
          platform?: string | null
          retry_count?: number | null
          sent_at?: string
          status: string
          title: string
        }
        Update: {
          body?: string
          content_id?: string | null
          created_at?: string
          device_token?: string | null
          error_message?: string | null
          fcm_response?: Json | null
          heartbeat_user_id?: string | null
          id?: string
          last_retry_at?: string | null
          notification_type?: string
          opened_at?: string | null
          platform?: string | null
          retry_count?: number | null
          sent_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          body: string
          content_id: string
          created_at: string
          data: Json | null
          error: string | null
          heartbeat_user_id: string
          id: string
          max_attempts: number
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
          title: string
        }
        Insert: {
          attempts?: number
          body: string
          content_id: string
          created_at?: string
          data?: Json | null
          error?: string | null
          heartbeat_user_id: string
          id?: string
          max_attempts?: number
          notification_type: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          title: string
        }
        Update: {
          attempts?: number
          body?: string
          content_id?: string
          created_at?: string
          data?: Json | null
          error?: string | null
          heartbeat_user_id?: string
          id?: string
          max_attempts?: number
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          expires_at: string | null
          heartbeat_profile_id: string
          id: string
          invited_at: string | null
          invited_by_user_id: string
          invitee_email: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          expires_at?: string | null
          heartbeat_profile_id: string
          id?: string
          invited_at?: string | null
          invited_by_user_id: string
          invitee_email: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          expires_at?: string | null
          heartbeat_profile_id?: string
          id?: string
          invited_at?: string | null
          invited_by_user_id?: string
          invitee_email?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          estimated_era: string | null
          exif_date: string | null
          exif_latitude: number | null
          exif_location: string | null
          exif_longitude: number | null
          faces_detected: Json | null
          gemini_keywords: string[] | null
          google_description: string | null
          google_vision_labels: Json | null
          heartbeat_profile_id: string
          id: string
          is_hidden: boolean | null
          is_user_in_photo: boolean | null
          last_error: string | null
          last_used_at: string | null
          processed_at: string | null
          processing_attempts: number | null
          processing_status: string | null
          quality_score: number | null
          rekognition_labels: Json | null
          s3_key: string
          s3_url: string
          upload_source: string
          uploaded_at: string | null
          uploaded_by_email: string | null
          uploaded_by_user_id: string | null
          used_count: number | null
          user_face_similarity: number | null
        }
        Insert: {
          estimated_era?: string | null
          exif_date?: string | null
          exif_latitude?: number | null
          exif_location?: string | null
          exif_longitude?: number | null
          faces_detected?: Json | null
          gemini_keywords?: string[] | null
          google_description?: string | null
          google_vision_labels?: Json | null
          heartbeat_profile_id: string
          id?: string
          is_hidden?: boolean | null
          is_user_in_photo?: boolean | null
          last_error?: string | null
          last_used_at?: string | null
          processed_at?: string | null
          processing_attempts?: number | null
          processing_status?: string | null
          quality_score?: number | null
          rekognition_labels?: Json | null
          s3_key: string
          s3_url: string
          upload_source: string
          uploaded_at?: string | null
          uploaded_by_email?: string | null
          uploaded_by_user_id?: string | null
          used_count?: number | null
          user_face_similarity?: number | null
        }
        Update: {
          estimated_era?: string | null
          exif_date?: string | null
          exif_latitude?: number | null
          exif_location?: string | null
          exif_longitude?: number | null
          faces_detected?: Json | null
          gemini_keywords?: string[] | null
          google_description?: string | null
          google_vision_labels?: Json | null
          heartbeat_profile_id?: string
          id?: string
          is_hidden?: boolean | null
          is_user_in_photo?: boolean | null
          last_error?: string | null
          last_used_at?: string | null
          processed_at?: string | null
          processing_attempts?: number | null
          processing_status?: string | null
          quality_score?: number | null
          rekognition_labels?: Json | null
          s3_key?: string
          s3_url?: string
          upload_source?: string
          uploaded_at?: string | null
          uploaded_by_email?: string | null
          uploaded_by_user_id?: string | null
          used_count?: number | null
          user_face_similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          created_at: string
          current_step: string
          customer_email: string | null
          customer_first_name: string | null
          customer_last_name: string | null
          id: number
          is_paid: boolean
          photo_manifest: Json
          photos_uploaded: number
          resume_token: string | null
          resume_token_expires_at: string | null
          s3_config_written: boolean
          s3_settings_written: boolean
          session_id: string
          stripe_session_id: string | null
          updated_at: string
          wizard_state: Json
        }
        Insert: {
          created_at?: string
          current_step?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          id?: number
          is_paid?: boolean
          photo_manifest?: Json
          photos_uploaded?: number
          resume_token?: string | null
          resume_token_expires_at?: string | null
          s3_config_written?: boolean
          s3_settings_written?: boolean
          session_id?: string
          stripe_session_id?: string | null
          updated_at?: string
          wizard_state?: Json
        }
        Update: {
          created_at?: string
          current_step?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          id?: number
          is_paid?: boolean
          photo_manifest?: Json
          photos_uploaded?: number
          resume_token?: string | null
          resume_token_expires_at?: string | null
          s3_config_written?: boolean
          s3_settings_written?: boolean
          session_id?: string
          stripe_session_id?: string | null
          updated_at?: string
          wizard_state?: Json
        }
        Relationships: []
      }
      pulse_responses: {
        Row: {
          created_at: string | null
          heartbeat_id: string | null
          id: string
          memory_summary: string | null
          mood: string | null
          question_asked: string | null
          raw_response: string | null
          themes: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          heartbeat_id?: string | null
          id?: string
          memory_summary?: string | null
          mood?: string | null
          question_asked?: string | null
          raw_response?: string | null
          themes?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          heartbeat_id?: string | null
          id?: string
          memory_summary?: string | null
          mood?: string | null
          question_asked?: string | null
          raw_response?: string | null
          themes?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pulse_responses_heartbeat_id_fkey"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "heartbeats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_heartbeats: {
        Row: {
          created_at: string | null
          gem_delivery_id: string | null
          heartbeat_id: string | null
          id: string
          message: string | null
          profile_id: string | null
          recipient_id: string
          seen: boolean | null
          sender_id: string
        }
        Insert: {
          created_at?: string | null
          gem_delivery_id?: string | null
          heartbeat_id?: string | null
          id?: string
          message?: string | null
          profile_id?: string | null
          recipient_id: string
          seen?: boolean | null
          sender_id: string
        }
        Update: {
          created_at?: string | null
          gem_delivery_id?: string | null
          heartbeat_id?: string | null
          id?: string
          message?: string | null
          profile_id?: string | null
          recipient_id?: string
          seen?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_heartbeat"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "heartbeats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_recipient"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sender"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_heartbeats_gem_delivery_id_fkey"
            columns: ["gem_delivery_id"]
            isOneToOne: false
            referencedRelation: "gem_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_heartbeats_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_cultural_moments: {
        Row: {
          category: string
          context_prompt: string | null
          created_at: string | null
          date_occurred: string | null
          id: string
          is_recurring: boolean | null
          last_used_at: string | null
          media_artist: string | null
          media_thumbnail_url: string | null
          media_title: string | null
          slide_3_type: string | null
          suggested_hook: string | null
          times_used: number | null
          title: string
        }
        Insert: {
          category: string
          context_prompt?: string | null
          created_at?: string | null
          date_occurred?: string | null
          id?: string
          is_recurring?: boolean | null
          last_used_at?: string | null
          media_artist?: string | null
          media_thumbnail_url?: string | null
          media_title?: string | null
          slide_3_type?: string | null
          suggested_hook?: string | null
          times_used?: number | null
          title: string
        }
        Update: {
          category?: string
          context_prompt?: string | null
          created_at?: string | null
          date_occurred?: string | null
          id?: string
          is_recurring?: boolean | null
          last_used_at?: string | null
          media_artist?: string | null
          media_thumbnail_url?: string | null
          media_title?: string | null
          slide_3_type?: string | null
          suggested_hook?: string | null
          times_used?: number | null
          title?: string
        }
        Relationships: []
      }
      social_hooks: {
        Row: {
          avg_engagement: number | null
          category: string
          created_at: string | null
          id: string
          text: string
          text_style: string
          times_used: number | null
          total_likes: number | null
          total_shares: number | null
          total_views: number | null
        }
        Insert: {
          avg_engagement?: number | null
          category: string
          created_at?: string | null
          id?: string
          text: string
          text_style?: string
          times_used?: number | null
          total_likes?: number | null
          total_shares?: number | null
          total_views?: number | null
        }
        Update: {
          avg_engagement?: number | null
          category?: string
          created_at?: string | null
          id?: string
          text?: string
          text_style?: string
          times_used?: number | null
          total_likes?: number | null
          total_shares?: number | null
          total_views?: number | null
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          caption: string | null
          card_message: string | null
          comments: number | null
          created_at: string | null
          cultural_moment_id: string | null
          deceased_gender: string | null
          deceased_nickname: string | null
          deceased_relationship: string
          gemini_image_url: string | null
          gemini_prompt: string | null
          generated_photo_url: string | null
          generation_attempts: number | null
          generation_error: string | null
          hook_id: string | null
          hook_text: string | null
          id: string
          instagram_post_id: string | null
          instagram_status: string | null
          likes: number | null
          media_artist: string | null
          media_thumbnail_url: string | null
          media_title: string | null
          media_type: string | null
          media_year: string | null
          notified_at: string | null
          pipeline: string | null
          platform: string
          post_type: string
          posted_at: string | null
          recipient_id: string | null
          saves: number | null
          scheduled_time: string | null
          shares: number | null
          slide_1_url: string | null
          slide_2_url: string | null
          slide_3_url: string | null
          slide_count: number
          status: string
          text_style: string
          tiktok_post_id: string | null
          tiktok_status: string | null
          time_period: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          caption?: string | null
          card_message?: string | null
          comments?: number | null
          created_at?: string | null
          cultural_moment_id?: string | null
          deceased_gender?: string | null
          deceased_nickname?: string | null
          deceased_relationship: string
          gemini_image_url?: string | null
          gemini_prompt?: string | null
          generated_photo_url?: string | null
          generation_attempts?: number | null
          generation_error?: string | null
          hook_id?: string | null
          hook_text?: string | null
          id?: string
          instagram_post_id?: string | null
          instagram_status?: string | null
          likes?: number | null
          media_artist?: string | null
          media_thumbnail_url?: string | null
          media_title?: string | null
          media_type?: string | null
          media_year?: string | null
          notified_at?: string | null
          pipeline?: string | null
          platform: string
          post_type: string
          posted_at?: string | null
          recipient_id?: string | null
          saves?: number | null
          scheduled_time?: string | null
          shares?: number | null
          slide_1_url?: string | null
          slide_2_url?: string | null
          slide_3_url?: string | null
          slide_count?: number
          status?: string
          text_style?: string
          tiktok_post_id?: string | null
          tiktok_status?: string | null
          time_period: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          caption?: string | null
          card_message?: string | null
          comments?: number | null
          created_at?: string | null
          cultural_moment_id?: string | null
          deceased_gender?: string | null
          deceased_nickname?: string | null
          deceased_relationship?: string
          gemini_image_url?: string | null
          gemini_prompt?: string | null
          generated_photo_url?: string | null
          generation_attempts?: number | null
          generation_error?: string | null
          hook_id?: string | null
          hook_text?: string | null
          id?: string
          instagram_post_id?: string | null
          instagram_status?: string | null
          likes?: number | null
          media_artist?: string | null
          media_thumbnail_url?: string | null
          media_title?: string | null
          media_type?: string | null
          media_year?: string | null
          notified_at?: string | null
          pipeline?: string | null
          platform?: string
          post_type?: string
          posted_at?: string | null
          recipient_id?: string | null
          saves?: number | null
          scheduled_time?: string | null
          shares?: number | null
          slide_1_url?: string | null
          slide_2_url?: string | null
          slide_3_url?: string | null
          slide_count?: number
          status?: string
          text_style?: string
          tiktok_post_id?: string | null
          tiktok_status?: string | null
          time_period?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_cultural_moment_id_fkey"
            columns: ["cultural_moment_id"]
            isOneToOne: false
            referencedRelation: "social_cultural_moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_hook_id_fkey"
            columns: ["hook_id"]
            isOneToOne: false
            referencedRelation: "social_hooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "social_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_recipients: {
        Row: {
          age_range: string
          created_at: string | null
          ethnicity: string | null
          gender: string
          id: string
          image_clean_url: string
          image_with_text_url: string | null
          last_used_at: string | null
          name: string
          people: Json | null
          person_count: number | null
          times_used: number | null
          updated_at: string | null
        }
        Insert: {
          age_range: string
          created_at?: string | null
          ethnicity?: string | null
          gender: string
          id?: string
          image_clean_url: string
          image_with_text_url?: string | null
          last_used_at?: string | null
          name: string
          people?: Json | null
          person_count?: number | null
          times_used?: number | null
          updated_at?: string | null
        }
        Update: {
          age_range?: string
          created_at?: string | null
          ethnicity?: string | null
          gender?: string
          id?: string
          image_clean_url?: string
          image_with_text_url?: string | null
          last_used_at?: string | null
          name?: string
          people?: Json | null
          person_count?: number | null
          times_used?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trends: {
        Row: {
          batch_id: string | null
          created_at: string | null
          fit_reasoning: string | null
          google_trends_url: string | null
          heartchime_fit: string | null
          id: string
          keyword: string
          related_topics: string[] | null
          suggested_angle: string | null
          traffic_estimate: string | null
          trending_date: string
          why_trending: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          fit_reasoning?: string | null
          google_trends_url?: string | null
          heartchime_fit?: string | null
          id?: string
          keyword: string
          related_topics?: string[] | null
          suggested_angle?: string | null
          traffic_estimate?: string | null
          trending_date?: string
          why_trending?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          fit_reasoning?: string | null
          google_trends_url?: string | null
          heartchime_fit?: string | null
          id?: string
          keyword?: string
          related_topics?: string[] | null
          suggested_angle?: string | null
          traffic_estimate?: string | null
          trending_date?: string
          why_trending?: string | null
        }
        Relationships: []
      }
      user_heartbeat_access: {
        Row: {
          can_invite: boolean | null
          heartbeat_profile_id: string
          id: string
          joined_at: string | null
          relationship: string | null
          role: string
          user_id: string
        }
        Insert: {
          can_invite?: boolean | null
          heartbeat_profile_id: string
          id?: string
          joined_at?: string | null
          relationship?: string | null
          role?: string
          user_id: string
        }
        Update: {
          can_invite?: boolean | null
          heartbeat_profile_id?: string
          id?: string
          joined_at?: string | null
          relationship?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_heartbeat_access_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_settings: {
        Row: {
          created_at: string | null
          heartbeat_profile_id: string | null
          id: string
          notifications_enabled: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          heartbeat_profile_id?: string | null
          id?: string
          notifications_enabled?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          heartbeat_profile_id?: string | null
          id?: string
          notifications_enabled?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_settings_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          fcm_token: string | null
          id: string
          name: string
          password_hash: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          fcm_token?: string | null
          id?: string
          name: string
          password_hash: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          fcm_token?: string | null
          id?: string
          name?: string
          password_hash?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      video_gems: {
        Row: {
          active: boolean | null
          context_line: string | null
          created_at: string | null
          id: string
          interest_tags: Json | null
          platform: string
          thumbnail_url: string | null
          title: string | null
          url: string
        }
        Insert: {
          active?: boolean | null
          context_line?: string | null
          created_at?: string | null
          id?: string
          interest_tags?: Json | null
          platform: string
          thumbnail_url?: string | null
          title?: string | null
          url: string
        }
        Update: {
          active?: boolean | null
          context_line?: string | null
          created_at?: string | null
          id?: string
          interest_tags?: Json | null
          platform?: string
          thumbnail_url?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          filename: string | null
          heartbeat_profile_id: string | null
          heartbeat_user_id: string | null
          id: string
          s3_key: string
          thumbnail_s3_key: string | null
          video_analysis: Json | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          filename?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          s3_key: string
          thumbnail_s3_key?: string | null
          video_analysis?: Json | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          filename?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          s3_key?: string
          thumbnail_s3_key?: string | null
          video_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_files: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          filename: string | null
          heartbeat_profile_id: string | null
          heartbeat_user_id: string | null
          id: string
          s3_key: string
          voice_analysis: Json | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          filename?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          s3_key: string
          voice_analysis?: Json | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          filename?: string | null
          heartbeat_profile_id?: string | null
          heartbeat_user_id?: string | null
          id?: string
          s3_key?: string
          voice_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_files_heartbeat_profile_id_fkey"
            columns: ["heartbeat_profile_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_files_heartbeat_user_id_fkey"
            columns: ["heartbeat_user_id"]
            isOneToOne: false
            referencedRelation: "heartbeat_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      trends_dashboard: {
        Row: {
          fit_order: number | null
          fit_reasoning: string | null
          google_trends_url: string | null
          heartchime_fit: string | null
          id: string | null
          keyword: string | null
          suggested_angle: string | null
          trending_date: string | null
          why_trending: string | null
        }
        Insert: {
          fit_order?: never
          fit_reasoning?: string | null
          google_trends_url?: string | null
          heartchime_fit?: string | null
          id?: string | null
          keyword?: string | null
          suggested_angle?: string | null
          trending_date?: string | null
          why_trending?: string | null
        }
        Update: {
          fit_order?: never
          fit_reasoning?: string | null
          google_trends_url?: string | null
          heartchime_fit?: string | null
          id?: string | null
          keyword?: string | null
          suggested_angle?: string | null
          trending_date?: string | null
          why_trending?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_trends: { Args: never; Returns: undefined }
      get_due_gems: {
        Args: { batch_limit?: number }
        Returns: {
          context_line: string
          gem_id: string
          heartbeat_user_id: string
          id: string
          scheduled_for: string
        }[]
      }
      get_due_heartbeats: {
        Args: { batch_limit?: number }
        Returns: {
          category: string
          heartbeat_profile_id: string
          heartbeat_user_id: string
          id: string
          message: string
          photo_id: string
          profile_first_name: string
          scheduled_for: string
        }[]
      }
      get_pending_notifications: {
        Args: { batch_limit?: number }
        Returns: {
          attempts: number
          body: string
          content_id: string
          data: Json
          heartbeat_user_id: string
          id: string
          notification_type: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
