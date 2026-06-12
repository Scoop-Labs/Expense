import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'scooplabs_secret_key_123!@#';

app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Middleware: Authenticate JWT Token
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token missing' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = decoded as { id: number; email: string };
    next();
  });
};

// --- AUTHENTICATION ROUTES ---

// POST /api/auth/login
// We support passwordless or auto-signup on first login for demo purposes
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    // Check if user exists
    const [users]: any = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;

    if (users.length === 0) {
      // Auto-signup on first login
      const username = email.split('@')[0];
      const defaultPassword = password || 'default_password';
      const [result]: any = await pool.query(
        'INSERT INTO users (email, username, password, role) VALUES (?, ?, ?, ?)',
        [email, username, defaultPassword, 'user']
      );
      
      const userId = result.insertId;
      
      // Auto-create default settings
      await pool.query(
        'INSERT IGNORE INTO settings (user_id, global_gst_rate, selected_entity) VALUES (?, ?, ?)',
        [userId, 18, 'Entity ABC']
      );

      user = { id: userId, email, username, role: 'user' };
    } else {
      user = users[0];
      // Note: In a production app, we would verify password hashing here (e.g. bcrypt).
      // Since this is for demo, we match the existing mock login simplicity.
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        uid: String(user.id), // map id to uid for compatibility with frontend User interface
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error during authentication: ' + error.message });
  }
});

// --- TRANSACTIONS ROUTES ---

// GET /api/transactions
app.get('/api/transactions', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const transactions = rows.map((row: any) => ({
      id: String(row.id),
      date: row.date,
      description: row.description || '',
      amount: Number(row.amount),
      gst: Number(row.gst || 0),
      total: Number(row.total),
      type: row.type,
      userId: String(row.user_id),
      createdAt: row.created_at
    }));

    res.json(transactions);
  } catch (error: any) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions
app.post('/api/transactions', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { date, description, amount, gst, total, type, entity_id } = req.body;

  try {
    const [result]: any = await pool.query(
      'INSERT INTO transactions (date, description, amount, gst, total, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        date,
        description || '',
        Number(amount) || 0,
        Number(gst) || 0,
        Number(total) || 0,
        type,
        userId,
        entity_id || 'Entity ABC'
      ]
    );

    res.json({
      id: String(result.insertId),
      date,
      description: description || '',
      amount: Number(amount) || 0,
      gst: Number(gst) || 0,
      total: Number(total) || 0,
      type,
      userId: String(userId),
    });
  } catch (error: any) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction: ' + error.message });
  }
});

// PUT /api/transactions/:id
app.put('/api/transactions/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { date, description, amount, gst, total, type, entity_id } = req.body;

  try {
    const [result]: any = await pool.query(
      'UPDATE transactions SET date = ?, description = ?, amount = ?, gst = ?, total = ?, type = ?, entity_id = ? WHERE id = ? AND user_id = ?',
      [
        date,
        description || '',
        Number(amount) || 0,
        Number(gst) || 0,
        Number(total) || 0,
        type,
        entity_id || 'Entity ABC',
        id,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Transaction not found or unauthorized' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction: ' + error.message });
  }
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;

  try {
    const [result]: any = await pool.query(
      'DELETE FROM transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Transaction not found or unauthorized' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// --- LIABILITIES ROUTES ---

// GET /api/liabilities
app.get('/api/liabilities', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM liabilities WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const liabilities = rows.map((row: any) => ({
      id: String(row.id),
      date: row.date,
      account: row.account,
      description: row.description || '',
      amount: Number(row.amount),
      type: row.type,
      userId: String(row.user_id),
      createdAt: row.created_at
    }));

    res.json(liabilities);
  } catch (error: any) {
    console.error('Get liabilities error:', error);
    res.status(500).json({ error: 'Failed to fetch liabilities' });
  }
});

// POST /api/liabilities
app.post('/api/liabilities', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { date, account, description, amount, type, entity_id } = req.body;

  try {
    const [result]: any = await pool.query(
      'INSERT INTO liabilities (date, account, description, amount, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        date,
        account,
        description || '',
        Number(amount) || 0,
        type,
        userId,
        entity_id || 'Entity ABC'
      ]
    );

    res.json({
      id: String(result.insertId),
      date,
      account,
      description: description || '',
      amount: Number(amount) || 0,
      type,
      userId: String(userId),
    });
  } catch (error: any) {
    console.error('Create liability error:', error);
    res.status(500).json({ error: 'Failed to create liability: ' + error.message });
  }
});

// PUT /api/liabilities/:id
app.put('/api/liabilities/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { date, account, description, amount, type, entity_id } = req.body;

  try {
    const [result]: any = await pool.query(
      'UPDATE liabilities SET date = ?, account = ?, description = ?, amount = ?, type = ?, entity_id = ? WHERE id = ? AND user_id = ?',
      [
        date,
        account,
        description || '',
        Number(amount) || 0,
        type,
        entity_id || 'Entity ABC',
        id,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Liability not found or unauthorized' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update liability error:', error);
    res.status(500).json({ error: 'Failed to update liability: ' + error.message });
  }
});

// DELETE /api/liabilities/:id
app.delete('/api/liabilities/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;

  try {
    const [result]: any = await pool.query(
      'DELETE FROM liabilities WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Liability not found or unauthorized' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete liability error:', error);
    res.status(500).json({ error: 'Failed to delete liability' });
  }
});

// --- ACCOUNTS ROUTES ---

// GET /api/accounts
app.get('/api/accounts', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const accounts = rows.map((row: any) => ({
      id: String(row.id),
      name: row.name,
      userId: String(row.user_id),
      createdAt: row.created_at
    }));

    res.json(accounts);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST /api/accounts
app.post('/api/accounts', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { name } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Account name is required' });
    return;
  }

  try {
    const [result]: any = await pool.query(
      'INSERT INTO accounts (name, user_id) VALUES (?, ?)',
      [name, userId]
    );

    res.json({
      id: String(result.insertId),
      name,
      userId: String(userId),
    });
  } catch (error: any) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account: ' + error.message });
  }
});

// DELETE /api/accounts/:id
app.delete('/api/accounts/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;

  try {
    const [result]: any = await pool.query(
      'DELETE FROM accounts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Account not found or unauthorized' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// --- SYNC ROUTE ---

// POST /api/sync
// Sync offline localStorage data to database.
// To avoid duplication, we check if the user already has data. If they don't, we insert the batch.
app.post('/api/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { transactions, liabilities, accounts } = req.body;

  try {
    // 1. Sync accounts
    const [existingAccounts]: any = await pool.query('SELECT COUNT(*) as count FROM accounts WHERE user_id = ?', [userId]);
    if (existingAccounts[0].count === 0 && Array.isArray(accounts)) {
      for (const acc of accounts) {
        if (acc.name) {
          await pool.query('INSERT IGNORE INTO accounts (name, user_id) VALUES (?, ?)', [acc.name, userId]);
        }
      }
    }

    // 2. Sync transactions
    const [existingTx]: any = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?', [userId]);
    if (existingTx[0].count === 0 && Array.isArray(transactions)) {
      for (const tx of transactions) {
        await pool.query(
          'INSERT INTO transactions (date, description, amount, gst, total, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            tx.date || '',
            tx.description || '',
            Number(tx.amount) || 0,
            Number(tx.gst) || 0,
            Number(tx.total) || 0,
            tx.type === 'income' ? 'income' : 'expense',
            userId,
            'Entity ABC'
          ]
        );
      }
    }

    // 3. Sync liabilities
    const [existingLiab]: any = await pool.query('SELECT COUNT(*) as count FROM liabilities WHERE user_id = ?', [userId]);
    if (existingLiab[0].count === 0 && Array.isArray(liabilities)) {
      for (const liab of liabilities) {
        await pool.query(
          'INSERT INTO liabilities (date, account, description, amount, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            liab.date || '',
            liab.account || '',
            liab.description || '',
            Number(liab.amount) || 0,
            liab.type === 'credit' ? 'credit' : 'debit',
            userId,
            'Entity ABC'
          ]
        );
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync data: ' + error.message });
  }
});

// POST /api/sync/overwrite
// Overwrites all user's transactions and liabilities with the provided lists (used for Undo/Redo DB sync).
app.post('/api/sync/overwrite', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { transactions, liabilities } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (Array.isArray(transactions)) {
      // Delete old transactions
      await connection.query('DELETE FROM transactions WHERE user_id = ?', [userId]);
      // Insert new transactions
      for (const tx of transactions) {
        await connection.query(
          'INSERT INTO transactions (date, description, amount, gst, total, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            tx.date || '',
            tx.description || '',
            Number(tx.amount) || 0,
            Number(tx.gst) || 0,
            Number(tx.total) || 0,
            tx.type === 'income' ? 'income' : 'expense',
            userId,
            'Entity ABC'
          ]
        );
      }
    }

    if (Array.isArray(liabilities)) {
      // Delete old liabilities
      await connection.query('DELETE FROM liabilities WHERE user_id = ?', [userId]);
      // Insert new liabilities
      for (const liab of liabilities) {
        await connection.query(
          'INSERT INTO liabilities (date, account, description, amount, type, user_id, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            liab.date || '',
            liab.account || '',
            liab.description || '',
            Number(liab.amount) || 0,
            liab.type === 'credit' ? 'credit' : 'debit',
            userId,
            'Entity ABC'
          ]
        );
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error: any) {
    await connection.rollback();
    console.error('Overwrite error:', error);
    res.status(500).json({ error: 'Failed to overwrite data: ' + error.message });
  } finally {
    connection.release();
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
