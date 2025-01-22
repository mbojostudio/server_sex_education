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

//mengambil data Admin
app.get('/dataadmin', async (req, res) => {
  try {
      const usersRef = db.ref('admin');
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
//enpoint delete
app.delete('/delete-quiz/:id', async (req, res) => {
  const quizId = req.params.id;

  try {
      // Cek apakah data dengan ID tersebut ada di database
      const quizSnapshot = await db.ref(`quizAnswers/${quizId}`).once('value');
      const quizData = quizSnapshot.val();

      if (!quizData) {
          return res.status(404).json({ error: 'Data quiz tidak ditemukan' });
      }

      // Hapus data dari database
      await db.ref(`quizAnswers/${quizId}`).remove();

      res.status(200).json({ message: 'Data quiz berhasil dihapus' });
  } catch (error) {
      console.error('Error deleting quiz data:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});



// Endpoint Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const usersRef = db.ref("admin");
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

// Endpoint untuk mengambil data profil pengguna dari Firebase
app.get("/getUserProfile/:username", async (req, res) => {
  const username = req.params.username;

  try {
    const userRef = db.ref(`admin/${username}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan" });
    }

    const userData = snapshot.val();
    res.json({
      success: true,
      username,
      imageUrl: userData.profileImageUrl || "",
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  }
});

// Setup GitHub API token dan repositori
const githubToken = process.env.GITHUB_PAT; // Ganti dengan token GitHub Anda

const githubApiUrl = (userId) => `https://api.github.com/repos/mbojostudio/data-profile-user/contents/${userId}.jpg`;

app.post('/users/:userId/edit-profile', upload.single('image'), async (req, res) => {
  const { userId } = req.params;
  const imageFile = req.file;

  try {
    const usersRef = db.ref(`admin/${userId}`);
    const snapshot = await usersRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "User not found." });
    }

    const userData = snapshot.val();
    let profilePictureUrl = userData.profilePicture;

    if (imageFile) {
      const fileBuffer = imageFile.buffer;
      const base64Content = fileBuffer.toString('base64');

      // Langkah 1: Dapatkan metadata file untuk mendapatkan "sha"
      const fileUrl = githubApiUrl(userId);
      let sha = null;
      try {
        const fileMetadata = await axios.get(fileUrl, {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        sha = fileMetadata.data.sha; // Dapatkan "sha" file yang ada
      } catch (error) {
        if (error.response?.status !== 404) {
          throw error; // Jika error bukan karena file tidak ditemukan, lempar error
        }
      }

      // Langkah 2: Upload file ke GitHub (dengan atau tanpa "sha")
      const response = await axios.put(fileUrl, {
        message: `Upload profile picture for ${userId}`,
        content: base64Content,
        ...(sha && { sha }), // Sertakan "sha" jika file sudah ada
      }, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.status === 200 || response.status === 201) {
        profilePictureUrl = `https://raw.githubusercontent.com/mbojostudio/data-profile-user/main/${userId}.jpg`;
      } else {
        return res.status(500).json({ message: "Failed to upload image to GitHub." });
      }
    }

    await usersRef.update({ profilePicture: profilePictureUrl });

    res.status(200).json({
      message: "Profile updated successfully.",
      profilePicture: profilePictureUrl,
      username: userData.username,
    });
  } catch (error) {
    console.error("Error updating profile:", error.response?.data || error.message);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Middleware untuk melayani file statis (gambar yang diunggah)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.get('/users/:userId/profile-picture', async (req, res) => {
  const userId = req.params.userId;

  try {
    const usersRef = db.ref("admin");
    const snapshot = await usersRef.child(userId).once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "User not found." });
    }

    const userData = snapshot.val();
    const profilePictureUrl = userData.profilePicture;

    if (!profilePictureUrl) {
      return res.status(404).json({ message: "Profile picture not found." });
    }

    // Redirect or proxy the image
    res.redirect(profilePictureUrl);
  } catch (error) {
    console.error("Error fetching profile picture:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.post('/updateadmin', async (req, res) => {
  try {
      const { id, username, email } = req.body;
      const usersRef = db.ref(`admin/${id}`);

      if (username) {
          await usersRef.update({ username });
      }

      if (email) {
          await usersRef.update({ email });
      }

      res.status(200).json({ message: 'Data updated successfully' });
  } catch (error) {
      console.error('Error updating data:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});


app.post("/editpassword", async (req, res) => {
  const { id, currentPassword, newPassword } = req.body;

  if (!id || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "ID, current password, and new password are required." });
  }

  try {
    // Referensi ke user admin berdasarkan ID
    const userRef = db.ref(`admin/${id}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "Admin not found." });
    }

    const userData = snapshot.val();

    // Verifikasi password saat ini
    const isPasswordValid = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    // Hash password baru
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password di database
    await userRef.update({ password: hashedNewPassword });

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});



app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
  