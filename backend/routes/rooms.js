'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function hashRoomPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

async function isAdmin(userId) {
  if (!ADMIN_EMAIL) return false;
  const r = await pool.query('SELECT email FROM users WHERE id=$1', [userId]);
  return r.rows[0]?.email === ADMIN_EMAIL;
}

async function autoCleanRoom(roomId) {
  try {
    const members = await pool.query('SELECT COUNT(*) as cnt FROM room_members WHERE room_id=$1', [roomId]);
    if (parseInt(members.rows[0].cnt) === 0) {
      await pool.query('DELETE FROM study_rooms WHERE id=$1', [roomId]);
      console.log('Auto-deleted empty room:', roomId);
    }
  } catch (err) {
    console.error('Auto-clean error:', err.message);
  }
}

// GET rooms — admin sees all, user sees own
router.get('/', async function(req, res) {
  try {
    const admin = await isAdmin(req.user.id);
    let query, params;
    if (admin) {
      query = `SELECT r.id, r.name, r.subject, r.owner_id, r.invite_code, r.is_private,
               r.created_at, r.updated_at,
               (r.password_hash IS NOT NULL) as has_password,
               u.name as owner_name,
               (SELECT COUNT(*) FROM room_members WHERE room_id=r.id) as member_count
               FROM study_rooms r JOIN users u ON r.owner_id=u.id
               ORDER BY r.updated_at DESC`;
      params = [];
    } else {
      query = `SELECT r.id, r.name, r.subject, r.owner_id, r.invite_code, r.is_private,
               r.created_at, r.updated_at,
               (r.password_hash IS NOT NULL) as has_password,
               u.name as owner_name,
               (SELECT COUNT(*) FROM room_members WHERE room_id=r.id) as member_count
               FROM study_rooms r JOIN users u ON r.owner_id=u.id
               WHERE r.owner_id=$1 OR r.id IN (SELECT room_id FROM room_members WHERE user_id=$1)
               ORDER BY r.updated_at DESC`;
      params = [req.user.id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create room
router.post('/', async function(req, res) {
  const { name, subject, is_private, password } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1)
    return res.status(400).json({ error: 'Cần tên phòng' });
  if (name.length > 100) return res.status(400).json({ error: 'Tên phòng tối đa 100 ký tự' });
  // Validate password: 1–6 digits only
  if (password !== undefined && password !== null && password !== '') {
    const pwStr = String(password);
    if (!/^\d{1,6}$/.test(pwStr))
      return res.status(400).json({ error: 'Mật khẩu phải là 1–6 chữ số' });
  }
  try {
    const code = genCode();
    const passwordHash = (password !== undefined && password !== null && password !== '')
      ? hashRoomPassword(password) : null;
    const room = await pool.query(
      `INSERT INTO study_rooms (name, subject, owner_id, invite_code, is_private, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,subject,owner_id,invite_code,is_private,created_at,updated_at`,
      [name.trim(), subject || 'Chung', req.user.id, code, is_private || false, passwordHash]
    );
    await pool.query(
      'INSERT INTO room_members (room_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [room.rows[0].id, req.user.id, 'studying']
    );
    res.status(201).json(room.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST join room
router.post('/join', async function(req, res) {
  const { code, password } = req.body;
  if (!code) return res.status(400).json({ error: 'Cần mã phòng' });
  try {
    const room = await pool.query('SELECT * FROM study_rooms WHERE invite_code=$1', [code.toUpperCase()]);
    if (!room.rows.length) return res.status(404).json({ error: 'Mã phòng không tồn tại' });
    const r = room.rows[0];
    if (r.password_hash) {
      if (!password) return res.status(403).json({ error: 'Phòng này có mật khẩu', needs_password: true });
      if (hashRoomPassword(password) !== r.password_hash)
        return res.status(403).json({ error: 'Mật khẩu không đúng' });
    }
    await pool.query(
      'INSERT INTO room_members (room_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [r.id, req.user.id, 'studying']
    );
    res.json({ id: r.id, name: r.name, subject: r.subject, invite_code: r.invite_code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET admin check
router.get('/admin/check', async function(req, res) {
  try {
    res.json({ isAdmin: await isAdmin(req.user.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET room detail — membership required
router.get('/:id', async function(req, res) {
  try {
    const roomId = parseInt(req.params.id);
    if (!roomId) return res.status(400).json({ error: 'ID không hợp lệ' });

    // Membership check (admin bypasses)
    const admin = await isAdmin(req.user.id);
    if (!admin) {
      const member = await pool.query(
        'SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2',
        [roomId, req.user.id]
      );
      if (!member.rows.length)
        return res.status(403).json({ error: 'Bạn không phải thành viên phòng này' });
    }

    const [roomR, membersR, messagesR] = await Promise.all([
      pool.query('SELECT id,name,subject,owner_id,invite_code,is_private,created_at,updated_at FROM study_rooms WHERE id=$1', [roomId]),
      pool.query(
        `SELECT u.id, u.name, u.avatar, u.custom_avatar, u.level, rm.status, rm.study_subject, rm.updated_at
         FROM room_members rm JOIN users u ON rm.user_id=u.id
         WHERE rm.room_id=$1 ORDER BY rm.updated_at DESC`,
        [roomId]
      ),
      pool.query(
        `SELECT m.id, m.content, m.created_at, m.user_id, u.name as sender_name, u.avatar as sender_avatar
         FROM room_messages m JOIN users u ON m.user_id=u.id
         WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT 50`,
        [roomId]
      )
    ]);

    if (!roomR.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ ...roomR.rows[0], members: membersR.rows, messages: messagesR.rows.reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH status
router.patch('/:id/status', async function(req, res) {
  const { status, study_subject } = req.body;
  const VALID_STATUSES = ['studying', 'speaking', 'away', 'break'];
  const safeStatus = VALID_STATUSES.includes(status) ? status : 'studying';
  try {
    await pool.query(
      'UPDATE room_members SET status=$1, study_subject=$2, updated_at=NOW() WHERE room_id=$3 AND user_id=$4',
      [safeStatus, study_subject ? String(study_subject).substring(0, 50) : null, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST message
router.post('/:id/message', async function(req, res) {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Tin nhắn trống' });
  if (content.length > 1000) return res.status(400).json({ error: 'Tin nhắn tối đa 1000 ký tự' });
  try {
    // Verify membership
    const member = await pool.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!member.rows.length) return res.status(403).json({ error: 'Không có quyền gửi tin nhắn' });

    const [msgR] = await Promise.all([
      pool.query('INSERT INTO room_messages (room_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
        [req.params.id, req.user.id, content.trim()]),
      pool.query('UPDATE study_rooms SET updated_at=NOW() WHERE id=$1', [req.params.id])
    ]);
    const withUser = await pool.query(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM room_messages m JOIN users u ON m.user_id=u.id WHERE m.id=$1`,
      [msgR.rows[0].id]
    );
    res.status(201).json(withUser.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE leave
router.delete('/:id/leave', async function(req, res) {
  try {
    await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã rời phòng' });
    autoCleanRoom(req.params.id);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE room (owner or admin)
router.delete('/:id', async function(req, res) {
  try {
    const admin = await isAdmin(req.user.id);
    const result = admin
      ? await pool.query('DELETE FROM study_rooms WHERE id=$1 RETURNING id', [req.params.id])
      : await pool.query('DELETE FROM study_rooms WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(403).json({ error: 'Không có quyền xóa phòng này' });
    res.json({ message: 'Đã xóa phòng' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;