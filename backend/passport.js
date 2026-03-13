'use strict';
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.BACKEND_URL + '/api/auth/google/callback',
},
async function(accessToken, refreshToken, profile, done) {
  try {
    const email = profile.emails[0].value;
    const name = profile.displayName;
    const googleId = profile.id;
    const googleAvatar = profile.photos[0]?.value || null;

    // Upsert user
    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, google_avatar, avatar)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_id) DO UPDATE
       SET name = EXCLUDED.name,
           google_avatar = EXCLUDED.google_avatar,
           last_login = NOW()
       RETURNING *`,
      [googleId, email, name, googleAvatar, '🎓']
    );
    return done(null, result.rows[0]);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;