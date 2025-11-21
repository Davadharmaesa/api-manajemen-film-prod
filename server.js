require('dotenv').config();
// import modul express yang sudah diinstall 
const express = require('express');
const cors = require('cors');
const db = require('./db.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { authenticateToken, authorizeRole } = require('./middleware/auth.js');

// membuat sebuah instance app express. variable 'app'
const app = express();

// mendefinisikan port dimana server akan berjalan. port 3000 umum digunakan untuk pengembangan local
const PORT = process.env.PORT || 3300;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());


// === AUTH ROUTES ===

// Endpoint untuk cek status film api
app.get('/status', (req, res) => {
    res.json({ ok: true, service: 'film-api' });
});

// AUTH ROUTES (Refactored for pg) ====
app.post('/auth/register', async (req, res, next) => {
    const { username, password } = req.body;
    if (!username || !password || password.lenght < 6) {
        return res.status(400).json({ error: `Username dan Password (min 6 char) harus diisi` });
    }
    try{
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const sql = `INSERT INTO users (username, password, role) VALUES
        ($1, $2, $3) RETURNING id, username`;
        const result = await db.query(sql, [username.toLowerCase(),
            hashedPassword, 'user']);
        res.status(201).json(result.rows[0]);
    }catch(err){
        if (err.code === '23505') {
            return res.status(409).json({error: `Username sudah digunakan`});
        }
        next(err);
    }
});

app.post('/auth/register-admin', async (req, res, next) => {
    const { username, password } = req.body;
    if (!username || !password || password.lenght < 6) {
        return res.status(400).json({ error: `Username dan Password (min 6 char) harus diisi` });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const sql = `INSERT INTO users (username, password, role) VALUES 
        ($1, $2, $3) RETURNING id, username`;
        const result = await db.query(sql [username.toLowerCase(),
            hashedPassword, 'admin']);
            res.status(201).json(result.rows[0]);
    }catch (err){
        if (err.code === '23505') {
            return res.status(409).json({error: 'Username sudah digunakan'});
        }
        next(err);
    }
});

// Login Route (Refactored for Postgres)
app.post('/auth/login', async (req, res, next) => {
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan Password harus diisi' });
    }

    try {
        // 1. Cek apakah user ada di database
        // Perbedaan: Menggunakan $1 dan await db.query
        const sql = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(sql, [username.toLowerCase()]);

        // Jika tidak ada user ditemukan
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Kredensial tidak valid' });
        }

        const user = result.rows[0];

        // 2. Cek password menggunakan bcrypt
        // Perbedaan: Menggunakan await bcrypt.compare (bukan callback)
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Kredensial tidak valid' });
        }

        // 3. Buat Token JWT
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        };

        // jwt.sign tetap menggunakan callback standar (atau bisa dipromisify, tapi ini sudah cukup)
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) {
                console.error("Error signing token:", err);
                return res.status(500).json({ error: 'Gagal membuat token' });
            }
            res.json({ message: 'Login berhasil', token: token });
        });

    } catch (err) {
        next(err);
    }
});


// MOVIE ROUTES (refactor for pg)
app.get('/movies', async (req, res, next) => {
    const sql = `SELECT m.id, m.tittle, m.year, d.id as director_id, d.name as director_name
    FROM movies m
    LEFT JOIN directors d ON m.directors_id = d.id
    ORDER BY m.id ACS`;
    try{
        const result = await db.query(sql);
        res.json(result.rows);
    } catch (err){
        next(err);
    }
});


// Endpoint untuk mendapatkan film berdasarkan id
app.get('/movies/:id', async (req, res, next) => {
    const sql = `
    SELECT m.id, m.title, m.year, d.id as director_id, d.name as director_name
    FROM movies m
    LEFT JOIN directors d ON m.director_id = d.id
    WHERE  m.id = $1`;
    try {
        const result = await db.query(sql, [req.params.id]);
        if(result.rows.length === 0 ){
            return res.status(404).json({ error: 'Film tidak ditemukan'});
        }
        res.json(result.rows[0]);
    } catch (err){
        next(err);
    }
});


//POST/movies - Endpoint untuk membuat film baru.
//Klien akan mengirimkan data   
app.post('/movies', authenticateToken, async (req, res, next) => {
    const { title, director_id, year } = req.body;
    // Validasi input
    if (!title || !director_id || !year) {
        return res.status(400).json({ error: '(title, director_id, year) wajib diisi ' });
    }

    const sql = `INSERT INTO movies (title, director_id, year)
        VALUES  ($1, $2, $3) RETURNING *`;
    try{
        const result = await db.query(sql, [title, director_id, year]);
        res.status(201).json(result.rows[0]);
    }catch (err){
        next(err)
    }
});

//Put /movies/:id - End point untuk memperbarui data film berdasarkan id
app.put('/movies/:id', [authenticateToken, authorizeRole('admin')], async (req, res, next) => {
    const { title, director_id, year } = req.body;
    const sql = `UPDATE movies SET title = $1, director_id = $2, year = $3 WHERE id = $4 RETURNING *`;
    try{
        const result = await db.query(sql, [title, director_id, year, req.params.id]);
        if(result.rowCount === 0){
            return res.status(404).json({ error: `Film tidak ditemukan`});
        }
        res.json(result.rows[0]);
    }catch (err){
        next(err);
    }
});

//Delete /movie/:id -End point menghapus file berdasarkan id
app.delete('/movies/:id', [authenticateToken, authorizeRole('admin')], async (req, res, next) => {
    const sql = `DELETE FROM movies WHERE id = $1 RETURNING *?`;
    try{
        const result = await db.query(sql, [req.params.id]);
        if(result.rowCount === 0){
            return res.status(404).json({ error: `Film tidak ditemukan`});
        }
        res.status(204).send();
    }catch (err){
        next(err);
    }
});


//------------------------- INI DIRECTOR (Refactored for Postgres) --------------------------------------

// Endpoint untuk mendapatkan semua Director
app.get('/directors', async (req, res, next) => {
    const sql = "SELECT * FROM directors ORDER BY id ASC";
    try {
        const result = await db.query(sql);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// Endpoint untuk mendapatkan Director berdasarkan ID
app.get('/directors/:id', async (req, res, next) => {
    const sql = "SELECT * FROM directors WHERE id = $1";
    try {
        const result = await db.query(sql, [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Director tidak ditemukan' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});


// POST /directors - Endpoint untuk membuat Director baru.
app.post('/directors', authenticateToken, async (req, res, next) => {
    const { name, birthYear } = req.body;

    // Validasi input
    if (!name || !birthYear) {
        return res.status(400).json({ error: '(name, birthYear) wajib diisi ' });
    }

    // Perhatikan penggunaan RETURNING * agar data yang baru diinput langsung dikembalikan
    const sql = `INSERT INTO directors (name, "birthYear") VALUES ($1, $2) RETURNING *`;
    
    try {
        const result = await db.query(sql, [name, birthYear]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /directors/:id - Endpoint untuk memperbarui data Director berdasarkan id
app.put('/directors/:id', [authenticateToken, authorizeRole('admin')], async (req, res, next) => {
    const { name, birthYear } = req.body;
    
    // Validasi sederhana (opsional tapi disarankan)
    if (!name || !birthYear) {
        return res.status(400).json({ error: '(name, birthYear) wajib diisi ' });
    }

    const sql = `UPDATE directors SET name = $1, "birthYear" = $2 WHERE id = $3 RETURNING *`;
    
    try {
        const result = await db.query(sql, [name, birthYear, req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Director tidak ditemukan' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /directors/:id - Endpoint menghapus Director berdasarkan id
app.delete('/directors/:id', [authenticateToken, authorizeRole('admin')], async (req, res, next) => {
    const sql = `DELETE FROM directors WHERE id = $1 RETURNING *`;
    
    try {
        const result = await db.query(sql, [req.params.id]);
        
        // result.rowCount memberitahu berapa baris yang terhapus
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Director tidak ditemukan' });
        }

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});


app.use((req, res) => {
    res.status(404).json({ error: `Rute tidak ditemukan` });
});

app.use((req, res, next) => {
    console.error('[SERVER ERROR]', err.stack);
    res.status(500).json({ error: `Terjadi kesalahan pada server` });
});

// menjalankan server dan membuatnya "Mendengarkan" permintaan yang masuk pada port yang ditentukan
app.listen(PORT, '0.0.0.0',() => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});