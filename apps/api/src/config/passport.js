const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { env } = require("./env");
const User = require("../modules/auth/user.model");

passport.use(
  new GitHubStrategy(
    {
      clientID: env.GITHUB_CLIENT_ID || "placeholder",
      clientSecret: env.GITHUB_CLIENT_SECRET || "placeholder",
      callbackURL: `${env.CALLBACK_URL_BASE}/github/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: "github", providerId: profile.id });
        if (!user) {
          user = await User.create({
            name: profile.displayName || profile.username,
            email: profile.emails?.[0]?.value || `${profile.username}@github.com`,
            provider: "github",
            providerId: profile.id,
            avatar: profile.photos?.[0]?.value,
            githubToken: accessToken,
            githubUsername: profile.username
          });
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
      callbackURL: `${env.CALLBACK_URL_BASE}/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: "google", providerId: profile.id });
        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            provider: "google",
            providerId: profile.id,
            avatar: profile.photos?.[0]?.value
          });
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
