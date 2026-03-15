'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@studyflow.com';

function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** Tự động xóa phòng nếu không còn thành viên */
async function autoCleanRoom(roomId) {
  try {
    const members = await pool.query(
      'SELECT COUNT(*) as cnt FROM room_members WHERE room_id=$1', [roomId]
    );
    if (parseInt(members.rows[0].cnt) === 0) {
      await pool.query('DELETE FROM study_rooms WHERE id=$1', [roomId]);
      console.log('Auto-deleted empty room:', roomId);
    }
  } catch (err) {
    console.error('Auto-clean error:', err.message);
  }
}

// GET my rooms (admin sees all rooms)
router.get('/', async function(req, res) {
  try {
    const user = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const isAdmin = user.rows[0]?.email === ADMIN_EMAIL;
    const whereClause = isAdmin
      ? ''
      : 'WHERE r.owner_id=$1 OR r.id IN (SELECT room_id FROM room_members WHERE user_id=$1)';
    const params = isAdmin ? [] : [req.user.id];
    const result = await pool.query(
      `SELECT r.id, r.name, r.subject, r.owner_id, r.invite_code, r.is_private, r.created_at, r.updated_at,
       CASE WHEN r.password_hash IS NOT NULL THEN true ELSE false END as has_password,
       u.name as owner_name,
       (SELECT COUNT(*) FROM room_members WHERE room_id=r.id) as member_count
       FROM study_rooms r
       JOIN users u ON r.owner_id=u.id
       WHERE r.owner_id=$1 OR r.id IN (SELECT room_id FROM room_members WHERE user_id=$1)
       ORDER BY r.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create room
router.post('/', async function(req, res) {
  const { name, subject, is_private, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần tên phòng' });
  try {
    const code = genCode();
    const passwordHash = password ? String(password).substring(0, 6) : null;
    const room = await pool.query(
      `INSERT INTO study_rooms (name, subject, owner_id, invite_code, is_private, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, subject||'Chung', req.user.id, code, is_private||false, passwordHash]
    );
    // Owner tự join
    await pool.query(
      'INSERT INTO room_members (room_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [room.rows[0].id, req.user.id, 'studying']
    );
    res.status(201).json(room.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST join room by code
router.post('/join', async function(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Cần mã phòng' });
  const { password } = req.body;
  try {
    const room = await pool.query('SELECT * FROM study_rooms WHERE invite_code=$1', [code.toUpperCase()]);
    if (!room.rows.length) return res.status(404).json({ error: 'Mã phòng không tồn tại' });
    // Check password if room has one
    if (room.rows[0].password_hash) {
      if (!password) return res.status(403).json({ error: 'Phòng này có mật khẩu', needs_password: true });
      if (String(password) !== String(room.rows[0].password_hash)) {
        return res.status(403).json({ error: 'Mật khẩu không đúng' });
      }
    }
    await pool.query(
      'INSERT INTO room_members (room_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [room.rows[0].id, req.user.id, 'studying']
    );
    res.json(room.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET room detail + members
router.get('/:id', async function(req, res) {
  try {
    const room = await pool.query('SELECT * FROM study_rooms WHERE id=$1', [req.params.id]);
    if (!room.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    const members = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.custom_avatar, u.level, rm.status, rm.study_subject, rm.updated_at
       FROM room_members rm JOIN users u ON rm.user_id=u.id
       WHERE rm.room_id=$1 ORDER BY rm.updated_at DESC`,
      [req.params.id]
    );
    const messages = await pool.query(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM room_messages m JOIN users u ON m.user_id=u.id
       WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ ...room.rows[0], members: members.rows, messages: messages.rows.reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST update my status in room
router.patch('/:id/status', async function(req, res) {
  const { status, study_subject } = req.body;
  try {
    await pool.query(
      `UPDATE room_members SET status=$1, study_subject=$2, updated_at=NOW()
       WHERE room_id=$3 AND user_id=$4`,
      [status||'studying', study_subject||null, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST send message
router.post('/:id/message', async function(req, res) {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Tin nhắn trống' });
  try {
    const msg = await pool.query(
      'INSERT INTO room_messages (room_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, content.trim()]
    );
    const withUser = await pool.query(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM room_messages m JOIN users u ON m.user_id=u.id WHERE m.id=$1`,
      [msg.rows[0].id]
    );
    await pool.query('UPDATE study_rooms SET updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.status(201).json(withUser.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE leave room — tự xóa phòng nếu trống
router.delete('/:id/leave', async function(req, res) {
  try {
    await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã rời phòng' });
    // Kiểm tra và xóa phòng nếu trống (async, không block response)
    autoCleanRoom(req.params.id);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE room (owner hoặc admin)
router.delete('/:id', async function(req, res) {
  try {
    const user = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const isAdmin = user.rows[0]?.email === ADMIN_EMAIL;
    let result;
    if (isAdmin) {
      result = await pool.query('DELETE FROM study_rooms WHERE id=$1 RETURNING id', [req.params.id]);
    } else {
      result = await pool.query('DELETE FROM study_rooms WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]);
    }
    if (!result.rows.length) return res.status(403).json({ error: 'Không có quyền xóa phòng này' });
    res.json({ message: 'Đã xóa phòng' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET admin check
router.get('/admin/check', async function(req, res) {
  try {
    const user = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    res.json({ isAdmin: user.rows[0]?.email === ADMIN_EMAIL });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;