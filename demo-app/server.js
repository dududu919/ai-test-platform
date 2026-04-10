import express from "express";
import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const dbPath = path.join(__dirname, "test.db");

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let db;

// Initialize SQLite database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log("Loaded existing database");
  } else {
    db = new SQL.Database();
    console.log("Created new database");

    // Create tables
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'viewer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Insert default users
    db.run(`INSERT INTO users (username, password, email, role) VALUES ('admin', 'password', 'admin@example.com', 'admin')`);
    db.run(`INSERT INTO users (username, password, email, role) VALUES ('viewer', 'password', 'viewer@example.com', 'viewer')`);

    // Insert default products
    db.run(`INSERT INTO products (name, price, stock) VALUES ('Laptop', 999.99, 10)`);
    db.run(`INSERT INTO products (name, price, stock) VALUES ('Mouse', 29.99, 50)`);
    db.run(`INSERT INTO products (name, price, stock) VALUES ('Keyboard', 79.99, 30)`);

    saveDatabase();
    console.log("Database initialized with default data");
  }
}

function saveDatabase() {
  const data = db.export();
  writeFileSync(dbPath, data);
}

// API Routes

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const stmt = db.prepare("SELECT id, username, role FROM users WHERE username = ? AND password = ?");
    stmt.bind([username, password]);

    if (stmt.step()) {
      const user = stmt.getAsObject();
      stmt.free();
      res.json({ success: true, user });
    } else {
      stmt.free();
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get all users
app.get("/api/users", (req, res) => {
  try {
    const stmt = db.prepare("SELECT id, username, email, role, created_at FROM users");
    const users = [];
    while (stmt.step()) {
      users.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Create user
app.post("/api/users", (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    db.run("INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)",
      [username, password, email || null, role || "viewer"]);

    const stmt = db.prepare("SELECT last_insert_rowid() as id");
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    saveDatabase();

    res.status(201).json({
      success: true,
      id: result.id,
      username,
      role: role || "viewer"
    });
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Database error" });
  }
});

// Get all products
app.get("/api/products", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM products");
    const products = [];
    while (stmt.step()) {
      products.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Create order
app.post("/api/orders", (req, res) => {
  const { user_id, product_id, quantity } = req.body;

  if (!user_id || !product_id || !quantity) {
    return res.status(400).json({ error: "user_id, product_id, and quantity required" });
  }

  if (quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be positive" });
  }

  try {
    // Check product stock
    const productStmt = db.prepare("SELECT price, stock FROM products WHERE id = ?");
    productStmt.bind([product_id]);

    if (!productStmt.step()) {
      productStmt.free();
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productStmt.getAsObject();
    productStmt.free();

    if (product.stock < quantity) {
      return res.status(400).json({ error: "Insufficient stock" });
    }

    // Calculate total price
    const total_price = product.price * quantity;

    // Create order
    db.run("INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES (?, ?, ?, ?, 'pending')",
      [user_id, product_id, quantity, total_price]);

    // Update product stock
    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, product_id]);

    const stmt = db.prepare("SELECT last_insert_rowid() as id");
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    saveDatabase();

    res.status(201).json({
      success: true,
      order_id: result.id,
      total_price,
      status: "pending"
    });
  } catch (error) {
    res.status(500).json({ error: "Database error: " + error.message });
  }
});

// Get orders
app.get("/api/orders", (req, res) => {
  const { user_id } = req.query;

  try {
    let query = `
      SELECT o.*, u.username, p.name as product_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN products p ON o.product_id = p.id
    `;

    if (user_id) {
      query += " WHERE o.user_id = ?";
    }

    query += " ORDER BY o.created_at DESC";

    const stmt = user_id ? db.prepare(query) : db.prepare(query);
    if (user_id) {
      stmt.bind([user_id]);
    }

    const orders = [];
    while (stmt.step()) {
      orders.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Cancel order
app.post("/api/orders/:id/cancel", (req, res) => {
  const { id } = req.params;

  try {
    // Get order details
    const orderStmt = db.prepare("SELECT * FROM orders WHERE id = ?");
    orderStmt.bind([id]);

    if (!orderStmt.step()) {
      orderStmt.free();
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderStmt.getAsObject();
    orderStmt.free();

    if (order.status === "cancelled") {
      return res.status(400).json({ error: "Order already cancelled" });
    }

    // Restore product stock
    db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [order.quantity, order.product_id]);

    // Update order status
    db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);

    saveDatabase();

    res.json({ success: true, message: "Order cancelled" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Serve HTML pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/users", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "users.html"));
});

app.get("/users/new", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "user-create.html"));
});

// Start server
initDatabase().then(() => {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Demo app running at http://127.0.0.1:${port}`);
    console.log(`Database: ${dbPath}`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
