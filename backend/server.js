const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const db = new sqlite3.Database('database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    
    
    db.run(`CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recording-' + uniqueSuffix + '.webm');
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 
  }
});




app.post('/api/recordings', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, path: filepath, size: filesize } = req.file;
    
   
    const sql = `INSERT INTO recordings (filename, filepath, filesize) VALUES (?, ?, ?)`;
    db.run(sql, [filename, filepath, filesize], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to save recording metadata' });
      }
      
      res.status(201).json({ 
        message: 'Recording uploaded successfully', 
        recording: {
          id: this.lastID,
          filename,
          filepath,
          filesize,
          createdAt: new Date().toISOString()
        }
      });
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/recordings', (req, res) => {
  const sql = `SELECT * FROM recordings ORDER BY createdAt DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
    
    res.json(rows);
  });
});


app.get('/api/recordings/:id', (req, res) => {
  const { id } = req.params;
  const sql = `SELECT * FROM recordings WHERE id = ?`;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch recording' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    
    if (!fs.existsSync(row.filepath)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }
    
    
    const stat = fs.statSync(row.filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(row.filepath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/webm',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/webm',
      };
      res.writeHead(200, head);
      fs.createReadStream(row.filepath).pipe(res);
    }
  });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});