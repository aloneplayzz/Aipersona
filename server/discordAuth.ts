import passport from "passport";
import { Strategy as DiscordStrategy, Profile as DiscordProfile, VerifyCallback } from "passport-discord";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

// Check for required environment variables
if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
  console.warn("Discord OAuth credentials missing. Discord authentication will not work properly.");
}

export function setupDiscordAuth(app: Express): void {
  // Configure Discord Strategy
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    // Determine the callback URL
    const callbackURL = process.env.NODE_ENV === "production" 
      ? process.env.RENDER_EXTERNAL_URL 
        ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/discord/callback` 
        : "/api/auth/discord/callback"
      : "/api/auth/discord/callback";
      
    // Log the callback URL for debugging
    console.log("Discord OAuth callback URL:", callbackURL);
    console.log("RENDER_EXTERNAL_URL:", process.env.RENDER_EXTERNAL_URL);
    
    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          callbackURL: callbackURL,
          scope: ["identify", "email"]
        },
        async (accessToken: string, refreshToken: string, profile: DiscordProfile, done: VerifyCallback) => {
          try {
            // First check if a user with this email already exists
            const email = profile.email || null;
            let existingUser = null;
            
            if (email) {
              // Try to find a user with the same email in the database
              const allUsers = await storage.getAllUsers();
              existingUser = allUsers.find(user => user.email === email);
            }
            
            if (existingUser) {
              // User with this email already exists, just return that user
              return done(null, existingUser);
            }
            
            // Create user object from Discord profile
            const userInfo = {
              id: profile.id,
              email: email,
              firstName: profile.username || null,
              lastName: null,
              profileImageUrl: profile.avatar 
                ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` 
                : null,
              provider: "discord"
            };

            // Upsert user in database
            const savedUser = await storage.upsertUser(userInfo);
            
            return done(null, savedUser);
          } catch (error) {
            console.error("Discord auth error:", error);
            return done(error as Error);
          }
        }
      )
    );
  }

  // Authentication routes
  app.get(
    "/api/auth/discord",
    passport.authenticate("discord", {
      scope: ["identify", "email"]
    })
  );

  app.get(
    "/api/auth/discord/callback",
    passport.authenticate("discord", {
      successRedirect: "/",
      failureRedirect: "/auth"
    })
  );
}
