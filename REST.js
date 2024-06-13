// Import library
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const mqtt = require('mqtt');
const bcrypt = require('bcrypt');

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());


// Konfigurasi koneksi MySQL
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'akuaponik_iot'
});

// Inisialisasi koneksi MQTT
const mqttServer = mqtt.connect('mqtt://broker.emqx.io:1883');


mqttServer.on('connect', function () {
    console.log('Connected to MQTT server');
    mqttServer.subscribe('sensor/mac', function (err) {
        if (err) {
            console.error('Error subscribing to MQTT topic: ' + err.stack);
        } else {
            console.log('Subscribed to MQTT topic: sensor/mac');
        }
    });
});

mqttServer.on('error', function (err) {
    console.error('MQTT connection error: ' + err.message);
});

mqttServer.on('reconnect', function () {
    console.log('Reconnecting to MQTT server...');
});

mqttServer.on('close', function () {
    console.log('Disconnected from MQTT server');
});

mqttServer.on('offline', function () {
    console.log('MQTT server is offline');
});

mqttServer.on('message', function (topic, message) {
    console.log(`Message received on topic ${topic}: ${message}`);
    if (topic === 'sensor/mac') {
        try {
            const data = JSON.parse(message.toString());
            console.log('Data received from MQTT:', data);

            // Tambahkan timestamp saat ini ke data
            data.timestamp = new Date().toISOString(); // Menggunakan ISO 8601 format

            // Validasi data yang diterima
            if (data.idkolam && data.jenis_sensor && data.value && data.timestamp) {
                // Pastikan nilai-nilai tidak null atau undefined
                if (data.idkolam !== null && data.jenis_sensor !== null && data.value !== null && data.timestamp !== null) {
                    // Simpan data ke database
                    insertDataToDatabase(data);
                } else {
                    console.error('Received data contains null values');
                }
            } else {
                console.error('Received data missing required fields');
            }
        } catch (error) {
            console.error('Error parsing MQTT message: ' + error.message);
        }
    }
});

function insertDataToDatabase(data) {
    const { idkolam, jenis_sensor, value, timestamp } = data;

    const query = 'INSERT INTO sensor (idkolam, jenis_sensor, value, timestamp) VALUES (?, ?, ?, ?)';
    const values = [idkolam, jenis_sensor, value, timestamp];

    connection.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting data into MySQL: ' + err.stack);
            return;
        }
        console.log('Data inserted successfully into MySQL:', result);
    });
}

// Tambahkan handler untuk menutup koneksi MySQL dengan aman saat aplikasi dihentikan
process.on('SIGINT', () => {
    connection.end((err) => {
        if (err) {
            console.error('Error closing MySQL connection: ' + err.stack);
        } else {
            console.log('MySQL connection closed.');
        }
        process.exit();
    });
});
// Endpoint untuk register
app.post('/register', async (req, res) => {
    try {
        const { idusername, password } = req.body;
        if (!idusername || !password) {
            return res.status(400).send('Username and password are required');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        connection.query('INSERT INTO user (idusername, password) VALUES (?, ?)', [idusername, hashedPassword], (err, result) => {
            if (err) {
                console.error('Error registering user: ' + err.stack);
                return res.status(500).send('Error registering user');
            }
            return res.status(200).send('User registered successfully');
        });
    } catch (error) {
        console.error('Error registering user: ' + error.message);
        res.status(500).send('Error registering user');
    }
});

// Endpoint untuk login
app.post('/login', async (req, res) => {
    try {
        const { idusername, password } = req.body;
        if (!idusername || !password) {
            return res.status(400).send('Username and password are required');
        }
        connection.query('SELECT * FROM user WHERE idusername = ?', [idusername], async (err, results) => {
            if (err) {
                console.error('Error searching for user in MySQL: ' + err.stack);
                return res.status(500).send('Error searching for user');
            }
            if (results.length === 0) {
                return res.status(404).send('User not found');
            }
            const user = results[0];
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                return res.status(401).send('Invalid password');
            }
            req.user = { idusername }; // Inisialisasi objek user pada request dengan ID pengguna
            return res.status(200).send('Login successful');
        });
    } catch (error) {
        console.error('Error during login: ' + error.message);
        res.status(500).send('Error during login');
    }
});

// Endpoint untuk menampilkan semua username
app.get('/users', (req, res) => {
    connection.query('SELECT idusername FROM user', (err, results) => {
        if (err) {
            console.error('Error retrieving usernames from MySQL: ' + err.stack);
            res.status(500).send('Error retrieving usernames from MySQL');
            return;
        }
        const usernames = results.map(user => user.idusername);
        res.json(usernames);
    });
});



// Endpoint untuk menampilkan data berdasarkan username
app.get('/data/:username', (req, res) => {
    const { username } = req.params;
    connection.query('SELECT * FROM akuaponik WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Error retrieving data: ' + err.stack);
            res.status(500).send('Error retrieving data');
            return;
        }
        res.json(results);
    });
});

// Endpoint untuk menampilkan data akuaponik berdasarkan idakuaponik
app.get('/akuaponik/:idakuaponik', (req, res) => {
    const { idakuaponik } = req.params;
    connection.query('SELECT * FROM akuaponik WHERE idakuaponik = ?', [idakuaponik], (err, results) => {
        if (err) {
            console.error('Error retrieving akuaponik data: ' + err.stack);
            res.status(500).send('Error retrieving akuaponik data');
            return;
        }
        res.json(results);
    });
});

// Endpoint untuk menampilkan data kolam berdasarkan idakuaponik
app.get('/kolam/:idakuaponik', (req, res) => {
    const idakuaponik = req.params.idakuaponik;

    connection.query('SELECT * FROM kolam WHERE idakuaponik = ?', [idakuaponik], (err, results) => {
        if (err) {
            console.error('Error retrieving data from MySQL: ' + err.stack);
            res.status(500).send('Error retrieving data from MySQL');
            return;
        }
        res.json(results);
    });
});



// Endpoint untuk menampilkan data sensor berdasarkan idkolam
app.get('/sensor/:idkolam', (req, res) => {
    const idkolam = req.params.idkolam;
    connection.query('SELECT * FROM sensor WHERE idkolam = ?', [idkolam], (err, results) => {
        if (err) {
            console.error('Error retrieving data from MySQL: ' + err.stack);
            res.status(500).send('Error retrieving data from MySQL');
            return;
        }
        res.json(results);
    });
});


// Endpoint untuk menambahkan data akuaponik baru
app.post('/akuaponik', (req, res) => {
    const { nama_farm, Username } = req.body; // Menangkap nama_farm dan Username dari body request
    if (!nama_farm || !Username) { // Memastikan kedua bidang tersebut tidak kosong
        res.status(400).send('Nama farm dan ID Username harus diisi');
        return;
    }

    // Memeriksa apakah ID Username ada dalam tabel user
    connection.query('SELECT idusername FROM user WHERE idusername = ?', [Username], (err, results) => {
        if (err) {
            console.error('Error checking username existence in MySQL: ' + err.stack);
            res.status(500).send('Error checking username existence in MySQL');
            return;
        }
        if (results.length === 0) {
            return res.status(404).send('ID Username tidak ditemukan');
        }

        // Jika ID Username ada, lakukan penambahan data akuaponik baru
        connection.query('INSERT INTO akuaponik (nama_farm, Username) VALUES (?, ?)', [nama_farm, Username], (err, result) => {
            if (err) {
                console.error('Error adding akuaponik data to MySQL: ' + err.stack);
                res.status(500).send('Error adding akuaponik data to MySQL');
                return;
            }
            const newAkuaponik = { idakuaponik: result.insertId, nama_farm, Username };
            res.status(201).json(newAkuaponik);
        });
    });
});

app.get('/solenoid/:idkolam', (req, res) => {
    const idkolam = req.params.idkolam;
    connection.query('SELECT * FROM solenoid WHERE idkolam = ?', [idkolam], (err, results) => {
        if (err) {
            console.error('Error fetching solenoid data from MySQL: ' + err.stack);
            res.status(500).send('Error fetching solenoid data from MySQL');
            return;
        }
        if (results.length === 0) {
            res.status(404).send('No solenoid data found for the specified idkolam');
            return;
        }
        res.status(200).json(results);
    });
});

app.get('/aerator/:idkolam', (req, res) => {
    const idkolam = req.params.idkolam;
    connection.query('SELECT * FROM aerator WHERE idkolam = ?', [idkolam], (err, results) => {
        if (err) {
            console.error('Error fetching aerator data from MySQL: ' + err.stack);
            res.status(500).send('Error fetching aerator data from MySQL');
            return;
        }
        if (results.length === 0) {
            res.status(404).send('No aerator data found for the specified idkolam');
            return;
        }
        res.status(200).json(results);
    });
});

app.post('/kolam', (req, res) => {
    const { idakuaponik, nama_kolam } = req.body; // Mengambil data kolam dari body request
    if (!idakuaponik || !nama_kolam) { // Memastikan data kolam tidak kosong
        res.status(400).send('Data kolam harus disertakan');
        return;
    }

    // Menambahkan data kolam baru ke dalam database
    connection.query('INSERT INTO kolam (idakuaponik, nama_kolam) VALUES (?, ?)', [idakuaponik, nama_kolam], (err, result) => {
        if (err) {
            console.error('Error adding data to MySQL: ' + err.stack);
            res.status(500).send('Error adding data to MySQL');
            return;
        }
        const newKolamId = result.insertId; // Mendapatkan ID kolam yang baru ditambahkan
        res.status(201).json({ addedKolamId: newKolamId }); // Mengirimkan respons dengan ID kolam yang baru ditambahkan
    });
});

app.post('/solenoid/:idkolam', (req, res) => {
    const idkolam = req.params.idkolam;
    const value = req.body.value; // Expecting a boolean value directly from client
    const currentDate = new Date();
    const booleanValue = value ? 1 : 0;

    console.log(`Received POST request for idkolam: ${idkolam}, value: ${value}`);

    // Insert new solenoid data
    connection.query('INSERT INTO solenoid (idkolam, Date, boolean) VALUES (?, ?, ?)', [idkolam, currentDate, booleanValue], (err, result) => {
        if (err) {
            console.error('Error adding solenoid data to MySQL:', err.stack);
            res.status(500).send('Error adding solenoid data to MySQL');
            return;
        }

        const newSolenoidData = { idSolenoid: result.insertId, idkolam, Date: currentDate, boolean: value };
        res.status(201).json(newSolenoidData);

        // Publish MQTT message
        const message = JSON.stringify({ "message": `Solenoid pada kolam ${idkolam} ${value ? 'on' : 'off'}` });
        mqttServer.publish('solenoid_info', message, function (err) {
            if (err) {
                console.error('Error publishing to MQTT:', err);
            } else {
                console.log('Pesan berhasil diterbitkan ke topik solenoid_info:', message);
            }
        });
    });
});
// Endpoint untuk mengupdate data akuaponik berdasarkan idakuaponik
app.put('/akuaponik/:idakuaponik', (req, res) => {
    const { idakuaponik } = req.params;
    const { nama_farm } = req.body;
    connection.query('UPDATE akuaponik SET nama_farm = ? WHERE idakuaponik = ?', [nama_farm, idakuaponik], (err, result) => {
        if (err) {
            console.error('Error updating akuaponik data in MySQL: ' + err.stack);
            res.status(500).send('Error updating akuaponik data in MySQL');
            return;
        }
        res.status(200).send('Akuaponik data updated successfully');
    });
});


app.post('/aerator/:idkolam', (req, res) => {
    const idkolam = req.params.idkolam;
    const value = req.body.value; // Expecting a boolean value directly from client
    const currentDate = new Date();
    const booleanValue = value ? 1 : 0;

    console.log(`Received POST request for idkolam: ${idkolam}, value: ${value}`);

    // Insert new aerator data
    connection.query('INSERT INTO aerator (idkolam, Date, boolean) VALUES (?, ?, ?)', [idkolam, currentDate, booleanValue], (err, result) => {
        if (err) {
            console.error('Error adding aerator data to MySQL:', err.stack);
            res.status(500).send('Error adding aerator data to MySQL');
            return;
        }

        const newAeratorData = { idaerator: result.insertId, idkolam, Date: currentDate, boolean: value };
        res.status(201).json(newAeratorData);

        // Properly form the message based on the value received from the client
        const message = JSON.stringify({ "message": `Aerator pada kolam ${idkolam} ${value ? 'on' : 'off'}` });
        mqttServer.publish('aerator_info', message, function (err) {
            if (err) {
                console.error('Error publishing to MQTT:', err);
            } else {
                console.log('Pesan berhasil diterbitkan ke topik aerator_info:', message);
            }
        });
    });
});




// Menjalankan server pada port tertentu
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server REST berjalan pada port ${PORT}`);
});
app.delete('/akuaponik/:idakuaponik', (req, res) => {
    const { idakuaponik } = req.params;
    connection.query('DELETE FROM akuaponik WHERE idakuaponik = ?', [idakuaponik], (err, result) => {
        if (err) {
            console.error('Error deleting akuaponik data from MySQL: ' + err.stack);
            res.status(500).send('Error deleting akuaponik data from MySQL');
            return;
        }
        res.status(200).send('Akuaponik data deleted successfully');
    });
});

app.delete('/akuaponik/:nama_farm', (req, res) => {
    const { nama_farm } = req.params;
    connection.beginTransaction(err => {
        if (err) {
            console.error('Error starting transaction: ' + err.stack);
            res.status(500).send('Error starting transaction');
            return;
        }

        // First delete related records from other tables if any
        connection.query('DELETE FROM akuaponik WHERE nama_farm = ?', [nama_farm], (err, result) => {
            if (err) {
                return connection.rollback(() => {
                    console.error('Error deleting users data from MySQL: ' + err.stack);
                    res.status(500).send('Error deleting users data from MySQL');
                });
            }

            // Then delete the main record from akuaponik table
            connection.query('DELETE FROM akuaponik WHERE nama_farm = ?', [nama_farm], (err, result) => {
                if (err) {
                    return connection.rollback(() => {
                        console.error('Error deleting akuaponik data from MySQL: ' + err.stack);
                        res.status(500).send('Error deleting akuaponik data from MySQL');
                    });
                }

                connection.commit(err => {
                    if (err) {
                        return connection.rollback(() => {
                            console.error('Error committing transaction: ' + err.stack);
                            res.status(500).send('Error committing transaction');
                        });
                    }
                    res.status(200).send('Akuaponik data and related records deleted successfully');
                });
            });
        });
    });
});
// Endpoint untuk meminta akses
app.post('/request-access', (req, res) => {
    // Ambil informasi pengguna yang sedang masuk
    const requestingUser = req.user && req.user.idusername; // Cek apakah req.user terdefinisi
    // Ambil informasi akses yang diminta dari body request
    const { Username_req, Username_acc } = req.body; // Misalnya, ini adalah username pengguna yang meminta akses dan username pengguna yang diminta untuk diakses
    // Periksa apakah data yang diperlukan tersedia dalam permintaan
    if (!Username_req || !Username_acc) {
        return res.status(400).send('Requesting username and accepting username are required');
    }
    // Periksa apakah pengguna yang meminta akses sama dengan pengguna yang sedang masuk
    if (requestingUser === Username_acc) {
        return res.status(400).send('You cannot request access from yourself');
    }
    // Periksa apakah pengguna yang diminta akses terdaftar dalam tabel user
    connection.query('SELECT * FROM user WHERE idusername = ?', [Username_acc], (err, results) => {
        if (err) {
            console.error('Error checking accepting user existence in MySQL: ' + err.stack);
            res.status(500).send('Error checking accepting user existence in MySQL');
            return;
        }
        if (results.length === 0) {
            return res.status(404).send('Accepting user not found');
        }
        // Insert data permintaan akses ke dalam database
        connection.query('INSERT INTO access (Username_req, Username_acc, status) VALUES (?, ?, "pending")', [Username_req, Username_acc], (err, result) => {
            if (err) {
                console.error('Error requesting access: ' + err.stack);
                res.status(500).send('Error requesting access');
                return;
            }
            res.status(201).send('Access request sent successfully');
        });
    });
});

// Endpoint untuk memperbarui status akses
app.put('/update-access/:idaccess', (req, res) => {
    const idaccess = req.params.idaccess;
    const newStatus = req.body.new_status;
    const Username_acc = req.body.Username_acc; // Mendapatkan Username_acc dari body request
    if (!Username_acc) {
        return res.status(400).send('Username_acc is required');
    }
    if (newStatus !== 'accept' && newStatus !== 'decline') {
        return res.status(400).send('Invalid status');
    }
    // Periksa apakah pengguna yang memperbarui akses sama dengan Username_acc pada akses tersebut
    connection.query('SELECT * FROM access WHERE idaccess = ? AND Username_acc = ?', [idaccess, Username_acc], (err, results) => {
        if (err) {
            console.error('Error checking access existence in MySQL: ' + err.stack);
            res.status(500).send('Error checking access existence in MySQL');
            return;
        }
        if (results.length === 0) {
            return res.status(404).send('Access not found');
        }
        // Jika pengguna yang memperbarui akses sesuai, lanjutkan proses pembaruan status akses
        const access = results[0];
        connection.query('UPDATE access SET status = ? WHERE idaccess = ?', [newStatus, idaccess], (err, result) => {
            if (err) {
                console.error('Error updating access status in MySQL: ' + err.stack);
                res.status(500).send('Error updating access status in MySQL');
                return;
            }
            res.status(200).send('Access status updated successfully');
        });
    });
});

// Endpoint untuk mendapatkan daftar permintaan akses yang relevan untuk pengguna username_acc
app.get('/access-requests', (req, res) => {
    const Username_acc = req.query.Username_acc; // Mendapatkan username_acc dari query string
    if (!Username_acc) {
        return res.status(400).send('Username_acc is required');
    }

    // Query ke database untuk mendapatkan daftar permintaan akses yang relevan
    connection.query('SELECT * FROM access WHERE Username_acc = ?', [Username_acc], (err, results) => {
        if (err) {
            console.error('Error retrieving access requests: ' + err.stack);
            res.status(500).send('Error retrieving access requests');
            return;
        }
        res.json(results); // Mengirimkan daftar permintaan akses yang relevan sebagai respons
    });
});