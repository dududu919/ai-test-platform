import mysql from "mysql2/promise";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("Enter MySQL root password (press Enter if no password): ", (password) => {
      rl.close();
      resolve(password || "");
    });
  });
}

async function initDatabase() {
  let connection;

  try {
    console.log("Connecting to MySQL server...");
    const password = await askPassword();

    // Connect to MySQL server (without database)
    connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: password,
      multipleStatements: true
    });

    console.log("Connected to MySQL server");

    // Read SQL file
    const sqlPath = path.join(__dirname, "init-db.sql");
    const sql = await readFile(sqlPath, "utf8");

    // Execute SQL statements
    await connection.query(sql);

    console.log("Database initialized successfully!");
    console.log("- Database 'demo_app' created");
    console.log("- Tables created: users, products, orders");
    console.log("- Default data inserted");

  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();
