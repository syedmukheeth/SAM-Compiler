const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { env } = require("./env");
const { callbackURLFor } = require("./oauthCallback");
const User = require("../modules/auth/user.model");

// These values are only the strategies' defaults. The routes pass the current
// callback URL per request, so a base corrected at startup (see
// config/oauthCallback) applies without rebuilding the strategies.
//
// Whatever this resolves to must also be registered in the GitHub/Google
// dashboards, e.g. https://your-api.onrender.com/api/auth/github/callback
const getCallbackURL = (provider) => callbackURLFor(provider);



passport.use(
  new GitHubStrategy(
    {
      clientID: env.GITHUB_CLIENT_ID || "placeholder",
      clientSecret: env.GITHUB_CLIENT_SECRET || "placeholder",
      callbackURL: getCallbackURL("github"),
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: "github", providerId: profile.id });
        
        if (!user) {
          // Check if email already exists from Google/Email signup
          const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
          user = await User.findOne({ email });
          
          if (!user) {
            user = await User.create({
              name: profile.displayName || profile.username,
              email: email,
              provider: "github",
              providerId: profile.id,
              avatar: profile.photos?.[0]?.value,
              githubToken: accessToken,
              githubUsername: profile.username
            });
          } else {
            // Link GitHub data to existing user
            user.githubToken = accessToken;
            user.githubUsername = profile.username;
            if (!user.avatar) user.avatar = profile.photos?.[0]?.value;
            await user.save();
          }
        } else {
          // Update existing user with new token and username
          user.githubToken = accessToken;
          user.githubUsername = profile.username;
          await user.save();
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "placeholder",
      callbackURL: getCallbackURL("google"),
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: "google", providerId: profile.id });
        
        if (!user) {
          // Check if email already exists from GitHub/Email signup to prevent E11000 unique error
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await User.findOne({ email });
          }
          
          if (!user) {
            user = await User.create({
              name: profile.displayName,
              email: profile.emails?.[0]?.value,
              provider: "google",
              providerId: profile.id,
              avatar: profile.photos?.[0]?.value
            });
          } else {
             // Link to existing user: just return them (maybe update avatar if missing)
             if (!user.avatar) {
               user.avatar = profile.photos?.[0]?.value;
               await user.save();
             }
          }
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);


passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

module.exports = passport;
