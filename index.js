const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const session = require("express-session");
const path = require("path");
const multer = require("multer");
const fs = require('fs');
const bcrypt = require("bcrypt");
const axios = require('axios');
const crypto = require('crypto');

// Setup multer untuk menangani unggahan file
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
require('dotenv').config();

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Perhatikan penggantian karakter \n
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
};
// Inisialisasi Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fbuses-3e232-default-rtdb.firebaseio.com/",
});


const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());


const cors = require("cors");
app.use(cors());

// Middleware untuk memproses JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Atur ke domain spesifik
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});


// Endpoint untuk user
app.post("/user", async (req, res) => {
  const { nama, usia, alamat, jenis_kelamin, edukasi, media } = req.body;

  if (!nama || !usia || !alamat || !jenis_kelamin || !edukasi) {
    return res.status(400).json({ error: "Semua field harus diisi!" });
  }

  try {
    const usersRef = db.ref("users");

    const newUserId = usersRef.push().key;

    const newUser = {
      id: newUserId,
      nama,
      usia,
      alamat,
      jenis_kelamin,
      edukasi,
      media: edukasi === 'Ya' ? media : [],
    };

    await usersRef.child(newUserId).set(newUser);
    res.status(201).json({ message: "Data berhasil di simpan", userId: newUserId });
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
//mengambil data user
app.get('/datauser', async (req, res) => {
  try {
      const usersRef = db.ref('users');
      const snapshot = await usersRef.once('value');

      if (snapshot.exists()) {
          const users = [];
          snapshot.forEach(childSnapshot => {
              users.push(childSnapshot.val());
          });

          res.status(200).json(users);
      } else {
          res.status(200).json([]);
      }
  } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

// endpoint questiom
app.post('/submit-quiz', async (req, res) => {
  console.log('Received data:', req.body);
  const { answers, userId} = req.body;

  // Validasi data
  if (!userId || !answers) {
      return res.status(400).json({ error: "Data tidak lengkap!" });
  }

  try {
    // Ambil data pengguna dari Firebase berdasarkan userId
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();

    if (!userData) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const name = userData.nama; // Ambil nama dari data pengguna

    const correctAnswers = {
        question1: 'B',
        question2: 'B',
        question3: 'C',
        question4: 'B',
        question5: 'B'
    };

    let correctCount = 0;

    // Hitung jumlah jawaban yang benar
    for (const [key, value] of Object.entries(answers)) {
        if (correctAnswers[key] === value) {
            correctCount++;
        }
    }

    const quizRef = db.ref('quizAnswers');
    const newQuizId = quizRef.push().key;

    const newQuizAnswer = {
        id: newQuizId,
        userId,
        name,
        answers,
        correctCount,
        submittedAt: new Date().toISOString()
    };

    await quizRef.child(newQuizId).set(newQuizAnswer);

    res.status(201).json({ message: 'Jawaban berhasil diterima', correctCount });
} catch (error) {
    console.error('Error saving quiz answers:', error);
    res.status(500).json({ message: 'Internal server error' });
}
});

app.get('/get-quiz-results', async (req, res) => {
  try {
      const snapshot = await db.ref('quizAnswers').once('value');
      const results = [];
      snapshot.forEach(childSnapshot => {
          results.push(childSnapshot.val());
      });
      res.status(200).json(results);
  } catch (error) {
      console.error('Error fetching quiz results:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const usersRef = db.ref("users");
    const snapshot = await usersRef.orderByChild("email").equalTo(email).once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "User not found." });
    }

    const userData = Object.values(snapshot.val())[0];

    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    res.status(200).json({ 
      message: "Login successful", 
      userId: userData.id,
      name: userData.username
    });
    
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});


// Endpoint untuk logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Gagal logout!" });
    }
    res.status(200).json({ message: "Logout berhasil!" });
  });
});


app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
  