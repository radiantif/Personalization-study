'use strict';
const express = require('express');
const passport = require('passport');
const router = express.Router();

// ── Google OAuth login ────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// ── Google OAuth callback ─────────────────────────────
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: process.env.FRONTEND_URL + '/?error=auth_failed' }),
  function(req, res) {
    res.redirect(process.env.FRONTEND_URL + '/?login=success');
  }
);

// ── Get current user ──────────────────────────────────
router.get('/me', function(req, res) {
  if (req.isAuthenticated()) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

// ── Logout ────────────────────────────────────────────
router.post('/logout', function(req, res) {
  req.logout(function(err) {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy();
    res.json({ message: 'Logged out' });
  });
});

module.exports = router;