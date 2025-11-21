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


// Endpoint untuk mendapatkan semua film
app.get('/movies', (req, res) => {
    const sql = "SELECT * FROM movies ORDER BY id ASC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint untuk mendapatkan film berdasarkan id
app.get('/movies/:id', (req, res) => {
    const sql = "SELECT * FROM movies WHERE id = ?";
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Film tidak ditemukan' });
        }
        res.json(row);
    });
});


//POST/movies - Endpoint untuk membuat film baru.
//Klien akan mengirimkan data   
app.post('/movies', authenticateToken, (req, res) => {
    console.log('Request POST/ movie oleh user:', req.user.username);
    const { title, director, year } = req.body;

    // Validasi input
    if (!title || !director || !year) {
        return res.status(400).json({ error: '(title, director, year) wajib diisi ' });
    }

    const sql = `INSERT INTO movies (title, director, year) VALUES (?,?,?)`;
    db.run(sql, [title, director, year], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, title, director, year });
    });
});

//Put /movies/:id - End point untuk memperbarui data film berdasarkan id
app.put('/movies/:id', [authenticateToken, authorizeRole('admin')], (req, res) => {
    const { title, director, year } = req.body;
    const sql = `UPDATE movies SET title = ?, director = ?, year = ? WHERE id = ?`;
    db.run(sql, [title, director, year, req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ err: message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'film tidak ditemukan' });
        }
        res.json({ id: Number(req.params.id), title, director, year });
    })
});

//Delete /movie/:id -End point menghapus file berdasarkan id
app.delete('/movies/:id', [authenticateToken, authorizeRole('admin')], (req, res) => {
    const sql = `DELETE FROM movies WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) {
            return res.status(404).json({ error: 'Film tidak ditemukan' });
        }
        res.status(204).send();
    });
});


//------------------------- INI DIRECTOR--------------------------------------


// Endpoint untuk mendapatkan semua Director
app.get('/directors', (req, res) => {
    const sql = "SELECT * FROM directors ORDER BY id ASC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint untuk mendapatkan Director berdasarkan ID
app.get('/directors/:id', (req, res) => {
    const sql = "SELECT * FROM directors WHERE id = ?";
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Director tidak ditemukan' });
        }
        res.json(row);
    });
});


//POST/movies - Endpoint untuk membuat Director baru.
//Klien akan mengirimkan data   
app.post('/directors', authenticateToken, (req, res) => {
    const { name, birthYear } = req.body;

    // Validasi input
    if (!name || !birthYear) {
        return res.status(400).json({ error: '(name, birthYear) wajib diisi ' });
    }

    const sql = `INSERT INTO directors (name, birthYear) VALUES (?,?)`;
    db.run(sql, [name, birthYear], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, name, birthYear });
    });
});

//Put /directors/:id - End point untuk memperbarui data Director berdasarkan id
app.put('/directors/:id', [authenticateToken, authorizeRole('admin')], (req, res) => {
    const { name, birthYear } = req.body;
    const sql = `UPDATE directors SET name = ?, birthYear = ? WHERE id = ?`;
    db.run(sql, [name, birthYear, req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ err: message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Director tidak ditemukan' });
        }
        res.json({ id: Number(req.params.id), name, birthYear });
    })
});

//Delete /director/:id -End point menghapus Director berdasarkan id
app.delete('/directors/:id', [authenticateToken, authorizeRole('admin')], (req, res) => {
    const sql = `DELETE FROM directors WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) {
            // Jika ada error database, kirim 500
            console.error("Error deleting director:", err.message);
            return res.status(500).json({ error: 'Gagal menghapus sutradara' });
        }

        // Periksa apakah ada baris yang benar-benar dihapus
        if (this.changes === 0) {
            // Jika tidak ada, berarti film tidak ditemukan
            return res.status(404).json({ error: 'direktor tidak ditemukan' });
        }

        // Jika berhasil, kirim 204
        res.status(204).send();
    });
});


app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan Password harus diisi' });
    }
    const sql = 'SELECT * FROM users WHERE username = ?';

    db.get(sql, [username.toLowerCase()], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Kredensial tidak valid' });
        }
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Kredensial tidak valid' });
            }
            const payload = {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            };

            jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
                if (err) {
                    console.error("Error signing token:", err);
                    return res.status(500).json({ error: 'Gagal membuat token' });
                }
                res.json({ message: 'Login berhasil', token: token });
            });
        });
    });
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